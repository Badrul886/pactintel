import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { Prisma } from '@prisma/client';

export interface ExtractedObligationItem {
  fieldName: string;
  fieldValue?: string | null;
  fieldValueNumeric?: number | Prisma.Decimal | null;
  fieldValueDate?: Date | null;
  fieldType?: string;
  confidenceScore?: number | Prisma.Decimal | null;
  sourceSnippet?: string;
  extractionMethod?: string;
  isCustomField?: boolean;
}

export interface PendingAmendmentUpdate {
  proposedValue?: string | null;
  proposedDueDate?: string | null;
  proposedValueNumeric?: number | null;
  confidenceScore?: number | null;
  sourceSnippet?: string | null;
  reason?: string;
  detectedAt?: string;
}

@Injectable()
export class ObligationService {
  private readonly logger = new Logger(ObligationService.name);

  constructor(private readonly repository: PortfolioRepository) {}

  async listObligations(
    organizationId: string,
    filters?: {
      documentId?: string;
      isVerified?: boolean;
      hasPendingUpdate?: boolean;
      fieldName?: string;
      dueBefore?: Date;
      dueAfter?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.repository.findObligations(organizationId, filters);
  }

  async getObligationById(id: string, organizationId: string) {
    const obligation = await this.repository.findObligationById(id, organizationId);
    if (!obligation) {
      throw new NotFoundException(`Obligation ${id} not found in organization`);
    }
    return obligation;
  }

  /**
   * Verify an obligation (marks AI extraction as human-verified).
   */
  async verify(
    id: string,
    organizationId: string,
    verifiedValues?: {
      fieldValue?: string;
      fieldValueNumeric?: number;
      fieldValueDate?: string;
    },
  ) {
    const obligation = await this.getObligationById(id, organizationId);
    if (obligation.pendingUpdate) {
      throw new BadRequestException(
        'Cannot verify an obligation with a pending amendment review. Confirm or dismiss the amendment first.',
      );
    }

    const updateData: Prisma.ObligationRecordUpdateInput = {
      isVerified: true,
    };

    if (verifiedValues?.fieldValue !== undefined) {
      updateData.fieldValue = verifiedValues.fieldValue;
    }
    if (verifiedValues?.fieldValueNumeric !== undefined) {
      updateData.fieldValueNumeric = verifiedValues.fieldValueNumeric;
    }
    if (verifiedValues?.fieldValueDate) {
      updateData.fieldValueDate = new Date(verifiedValues.fieldValueDate);
    }

    return this.repository.updateObligation(id, organizationId, updateData);
  }

  /**
   * RULE PORT-001: Record extracted obligations from document version.
   * Never auto-apply modified values if an existing obligation is active/verified.
   * Write solely to pending_update and alert owner.
   */
  async recordExtractedObligations(
    documentId: string,
    documentVersionId: string,
    organizationId: string,
    extractedItems: ExtractedObligationItem[],
    versionNumber?: number,
  ) {
    const existingObligations = await this.repository.findObligationsByDocument(
      documentId,
      organizationId,
    );

    const results = [];

    for (const item of extractedItems) {
      const existing = existingObligations.find(
        (e) => e.fieldName.toLowerCase() === item.fieldName.toLowerCase(),
      );

      if (!existing) {
        // Brand new obligation -> create directly
        const created = await this.repository.createObligation({
          organizationId,
          documentId,
          documentVersionId,
          fieldName: item.fieldName,
          fieldValue: item.fieldValue,
          fieldValueNumeric: item.fieldValueNumeric,
          fieldValueDate: item.fieldValueDate,
          fieldType: item.fieldType || 'text',
          confidenceScore: item.confidenceScore,
          extractionMethod: item.extractionMethod || 'ai_llm',
          isCustomField: item.isCustomField || false,
          isVerified: false,
        });
        results.push(created);
      } else {
        // Existing obligation found. Check if values differ.
        const isValueChanged =
          item.fieldValue !== undefined &&
          item.fieldValue !== null &&
          item.fieldValue.trim() !== (existing.fieldValue || '').trim();

        const isDueDateChanged =
          item.fieldValueDate &&
          (!existing.fieldValueDate ||
            item.fieldValueDate.toISOString().slice(0, 10) !==
              existing.fieldValueDate.toISOString().slice(0, 10));

        if (isValueChanged || isDueDateChanged) {
          // ─── RULE PORT-001 INVARIANT ───
          // NEVER overwrite active fieldValue or fieldValueDate!
          // AI writes ONLY to pending_update.
          this.logger.warn(
            `[RULE PORT-001] Extracted amendment diff detected for obligation ${existing.id} (field=${existing.fieldName}). Storing in pending_update without overwriting active value.`,
          );

          const pendingUpdate: PendingAmendmentUpdate = {
            proposedValue: item.fieldValue,
            proposedDueDate: item.fieldValueDate ? item.fieldValueDate.toISOString() : undefined,
            proposedValueNumeric:
              typeof item.fieldValueNumeric === 'number' ? item.fieldValueNumeric : undefined,
            confidenceScore:
              typeof item.confidenceScore === 'number' ? item.confidenceScore : undefined,
            sourceSnippet: item.sourceSnippet,
            detectedAt: new Date().toISOString(),
            reason: `Extracted from amended document v${versionNumber ?? 'latest'}`,
          };

          const updated = await this.repository.updateObligation(existing.id, organizationId, {
            pendingUpdate: pendingUpdate as unknown as Prisma.InputJsonValue,
          });

          results.push(updated);
        } else {
          // No meaningful change
          results.push(existing);
        }
      }
    }

    return results;
  }

  /**
   * RULE PORT-001: Confirm pending amendment update.
   * Copies proposedValue and proposedDueDate into active fields and clears pendingUpdate.
   */
  async confirmPendingUpdate(id: string, organizationId: string) {
    const obligation = await this.getObligationById(id, organizationId);
    if (!obligation.pendingUpdate) {
      throw new BadRequestException('Obligation does not have a pending amendment to confirm');
    }

    const pending = obligation.pendingUpdate as unknown as PendingAmendmentUpdate;

    const updateData: Prisma.ObligationRecordUpdateInput = {
      isVerified: true,
      pendingUpdate: Prisma.DbNull,
    };

    if (pending.proposedValue !== undefined) {
      updateData.fieldValue = pending.proposedValue;
    }
    if (pending.proposedDueDate) {
      updateData.fieldValueDate = new Date(pending.proposedDueDate);
    }
    if (pending.proposedValueNumeric !== undefined) {
      updateData.fieldValueNumeric = pending.proposedValueNumeric;
    }
    if (pending.confidenceScore !== undefined) {
      updateData.confidenceScore = pending.confidenceScore;
    }

    this.logger.log(
      `[RULE PORT-001] Pending amendment confirmed for obligation ${id}. Active value updated to "${pending.proposedValue}".`,
    );

    return this.repository.updateObligation(id, organizationId, updateData);
  }

  /**
   * RULE PORT-001: Dismiss pending amendment update.
   * Drops proposed amendment changes, clears pendingUpdate, restores active status.
   */
  async dismissPendingUpdate(id: string, organizationId: string) {
    const obligation = await this.getObligationById(id, organizationId);
    if (!obligation.pendingUpdate) {
      throw new BadRequestException('Obligation does not have a pending amendment to dismiss');
    }

    this.logger.log(
      `[RULE PORT-001] Pending amendment dismissed for obligation ${id}. Active values preserved.`,
    );

    return this.repository.updateObligation(id, organizationId, {
      pendingUpdate: Prisma.DbNull,
    });
  }
}
