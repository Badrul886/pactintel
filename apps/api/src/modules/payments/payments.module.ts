import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CredentialVaultService } from './credential-vault.service';
import { DocumentModule } from '../document/document.module';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [DocumentModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, CredentialVaultService, PrismaService],
  exports: [PaymentsService, CredentialVaultService],
})
export class PaymentsModule {}
