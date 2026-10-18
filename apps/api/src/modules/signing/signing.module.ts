import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller';
import { PublicSigningController } from './public-signing.controller';
import { SigningService } from './signing.service';
import { SigningRepository } from './signing.repository';
import { SigningReconciliationService } from './signing-reconciliation.service';
import { DocumentModule } from '../document/document.module';
import { NotificationModule } from '../notification/notification.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [DocumentModule, NotificationModule],
  controllers: [SigningController, PublicSigningController],
  providers: [SigningService, SigningRepository, SigningReconciliationService, PrismaService],
  exports: [SigningService, SigningRepository, SigningReconciliationService],
})
export class SigningModule {}
