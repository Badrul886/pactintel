import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { PublicDocumentController } from './public-document.controller';
import { DocumentService } from './document.service';
import { DocumentRepository } from './document.repository';
import { DocumentOutboxService } from './outbox/document-outbox.service';
import { PdfService } from './pdf/pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [DocumentController, PublicDocumentController],
  providers: [
    DocumentService,
    DocumentRepository,
    DocumentOutboxService,
    PdfService,
    PrismaService,
  ],
  exports: [DocumentService, DocumentRepository, DocumentOutboxService, PdfService],
})
export class DocumentModule {}
