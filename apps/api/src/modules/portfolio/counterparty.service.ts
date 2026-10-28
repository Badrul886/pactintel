import { Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CounterpartyService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cleans and normalizes entity name for comparison.
   * Strips legal suffixes like Inc., LLC, Corp, Ltd, etc.
   */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[,.]/g, '')
      .replace(
        /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|bv)\b/gi,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  async listCounterparties(
    organizationId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return this.repository.findCounterparties(organizationId, options);
  }

  async getCounterpartyById(id: string, organizationId: string) {
    const cp = await this.repository.findCounterpartyById(id, organizationId);
    if (!cp) {
      throw new NotFoundException(`Counterparty ${id} not found in organization`);
    }
    return cp;
  }

  /**
   * Find an existing counterparty by canonicalName/alias or create a new one.
   * Supports smart normalization and entity deduplication.
   */
  async findOrCreateByName(
    organizationId: string,
    rawName: string,
    domain?: string,
    aliases: string[] = [],
  ) {
    const trimmed = rawName.trim();
    if (!trimmed) {
      throw new Error('Counterparty name cannot be blank');
    }

    // 1. Direct exact or case-insensitive match
    const existing = await this.repository.findCounterpartyByName(organizationId, trimmed);
    if (existing) {
      return existing;
    }

    // 2. Normalized matching across all counterparties in the organization
    const { items: all } = await this.repository.findCounterparties(organizationId, { limit: 500 });
    const normalizedInput = this.normalizeName(trimmed);

    for (const cp of all) {
      const normalizedExisting = this.normalizeName(cp.canonicalName);
      const cpAliases = cp.aliases || [];

      if (
        normalizedExisting === normalizedInput ||
        cpAliases.some((alias) => this.normalizeName(alias) === normalizedInput)
      ) {
        // Matched existing counterparty via normalized comparison!
        // Append rawName as alias if not already present
        if (
          !cpAliases.includes(trimmed) &&
          cp.canonicalName.toLowerCase() !== trimmed.toLowerCase()
        ) {
          await this.repository.updateCounterparty(cp.id, organizationId, {
            aliases: [...cpAliases, trimmed],
          });
        }
        return cp;
      }
    }

    // 3. Create new counterparty
    const newAliases = aliases.filter((a) => a !== trimmed);
    return this.repository.createCounterparty({
      organizationId,
      canonicalName: trimmed,
      domain,
      aliases: newAliases,
    });
  }

  async linkDocumentToCounterparty(
    documentId: string,
    counterpartyId: string,
    organizationId: string,
  ) {
    await this.getCounterpartyById(counterpartyId, organizationId);

    return this.prisma.document.update({
      where: { id: documentId },
      data: { counterpartyId },
    });
  }

  async updateCounterparty(
    id: string,
    organizationId: string,
    data: {
      canonicalName?: string;
      domain?: string;
      aliases?: string[];
    },
  ) {
    await this.getCounterpartyById(id, organizationId);

    const updateData: Prisma.CounterpartyUpdateInput = {};
    if (data.canonicalName) updateData.canonicalName = data.canonicalName;
    if (data.domain !== undefined) updateData.domain = data.domain;
    if (data.aliases) {
      updateData.aliases = data.aliases;
    }

    return this.repository.updateCounterparty(id, organizationId, updateData);
  }
}
