import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { ObligationService } from './obligation.service';
import { CounterpartyService } from './counterparty.service';
import { PortfolioRepository } from './portfolio.repository';
import { MeilisearchAdapter } from './adapters/search/meilisearch.adapter';
import { PostgresFtsAdapter } from './adapters/search/postgres-fts.adapter';
import { CloudVisionOcrAdapter } from './adapters/ocr/cloud-vision-ocr.adapter';
import { SEARCH_PORT } from './ports/search.port';
import { OCR_PORT } from './ports/ocr.port';
import { DocumentExtractionJob } from './jobs/document-extraction.job';
import { ObligationRemindersJob } from './jobs/obligation-reminders.job';
import { AiModule } from '../ai/ai.module';
import { OrganizationModule } from '../organization/organization.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AiModule, OrganizationModule, AuthModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioRepository,
    PortfolioService,
    ObligationService,
    CounterpartyService,
    MeilisearchAdapter,
    PostgresFtsAdapter,
    CloudVisionOcrAdapter,
    DocumentExtractionJob,
    ObligationRemindersJob,
    PrismaService,
    {
      provide: SEARCH_PORT,
      useClass: MeilisearchAdapter,
    },
    {
      provide: OCR_PORT,
      useClass: CloudVisionOcrAdapter,
    },
  ],
  exports: [
    PortfolioService,
    ObligationService,
    CounterpartyService,
    PortfolioRepository,
    DocumentExtractionJob,
    SEARCH_PORT,
    OCR_PORT,
  ],
})
export class PortfolioModule {}
