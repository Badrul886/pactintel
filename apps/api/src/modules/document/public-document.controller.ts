import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { DocumentService } from './document.service';

@Controller('api/v1/public/documents')
export class PublicDocumentController {
  constructor(private readonly docService: DocumentService) {}

  /**
   * Recipient view endpoint (/d/:slug).
   * RULE ACC-004: Checks expiration, domain restriction, view limit, and password gate.
   */
  @Get(':slug')
  async getRecipientDocument(
    @Param('slug') slug: string,
    @Query('password') password?: string,
    @Query('email') email?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.docService.validateRecipientAccess(slug, password, email, sessionId);
  }

  /**
   * Post password or email for gated recipient review.
   */
  @Post(':slug/access')
  async submitGatedAccess(
    @Param('slug') slug: string,
    @Body('password') password?: string,
    @Body('email') email?: string,
    @Body('sessionId') sessionId?: string,
  ) {
    return this.docService.validateRecipientAccess(slug, password, email, sessionId);
  }
}
