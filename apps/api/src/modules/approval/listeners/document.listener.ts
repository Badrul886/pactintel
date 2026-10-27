import { Injectable, Logger } from '@nestjs/common';
import { ApprovalService } from '../approval.service';

@Injectable()
export class DocumentApprovalListener {
  private readonly logger = new Logger(DocumentApprovalListener.name);

  constructor(private readonly approvalService: ApprovalService) {}

  /**
   * Called when a document transitions to 'sent' or 'signed' to evaluate approval requirements.
   */
  async handleDocumentEvent(
    organizationId: string,
    documentId: string,
    eventType: 'document.sent' | 'document.signed',
    dealValue?: number | string | null,
  ) {
    try {
      const result = await this.approvalService.triggerApprovalForDocument(
        organizationId,
        documentId,
        eventType,
        dealValue,
      );

      if (result.triggered) {
        this.logger.log(
          `[DocumentApprovalListener] Approval chain triggered for document ${documentId} on ${eventType}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `[DocumentApprovalListener] Failed to evaluate approval for document ${documentId}: ${err.message}`,
      );
    }
  }
}
