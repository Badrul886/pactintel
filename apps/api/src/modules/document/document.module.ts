import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { PublicDocumentController } from './public-document.controller';
import { EmbedController } from './embed.controller';
import { DocumentService } from './document.service';
import { DocumentRepository } from './document.repository';
import { DocumentOutboxService } from './outbox/document-outbox.service';
import { PdfService } from './pdf/pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

import { ExpiryCheckJob } from './jobs/expiry-check.job';
import { ReminderCheckJob } from './jobs/reminder-check.job';
import { FollowUpDigestJob } from './jobs/follow-up-digest.job';
import { ExpiryListener } from './listeners/expiry.listener';

@Module({
  imports: [NotificationModule],
  controllers: [DocumentController, PublicDocumentController, EmbedController],
  providers: [
    DocumentService,
    DocumentRepository,
    DocumentOutboxService,
    PdfService,
    PrismaService,
    ExpiryCheckJob,
    ReminderCheckJob,
    FollowUpDigestJob,
    ExpiryListener,
  ],
  exports: [
    DocumentService,
    DocumentRepository,
    DocumentOutboxService,
    PdfService,
    ExpiryCheckJob,
    ReminderCheckJob,
    FollowUpDigestJob,
  ],
})
export class DocumentModule {}
