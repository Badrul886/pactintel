import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller';
import { PublicSigningController } from './public-signing.controller';
import { SigningService } from './signing.service';
import { SigningRepository } from './signing.repository';
import { SigningReconciliationService } from './signing-reconciliation.service';
import { DocumentModule } from '../document/document.module';
import { NotificationModule } from '../notification/notification.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SIGNING_PROVIDER_PORT } from './ports/signing-provider.port';
import { BoldSignAdapter } from './adapters/boldsign.adapter';
import { RISK_SCORING_PORT } from './ports/risk-scoring.port';
import { SiftRiskScoringAdapter } from './adapters/sift-risk.adapter';
import { VerificationReportService } from './verification-report.service';

@Module({
  imports: [DocumentModule, NotificationModule],
  controllers: [SigningController, PublicSigningController],
  providers: [
    SigningService,
    SigningRepository,
    SigningReconciliationService,
    VerificationReportService,
    PrismaService,
    {
      provide: SIGNING_PROVIDER_PORT,
      useClass: BoldSignAdapter,
    },
    BoldSignAdapter,
    {
      provide: RISK_SCORING_PORT,
      useClass: SiftRiskScoringAdapter,
    },
    SiftRiskScoringAdapter,
  ],
  exports: [
    SigningService,
    SigningRepository,
    SigningReconciliationService,
    VerificationReportService,
    SIGNING_PROVIDER_PORT,
    BoldSignAdapter,
    RISK_SCORING_PORT,
    SiftRiskScoringAdapter,
  ],
})
export class SigningModule {}
