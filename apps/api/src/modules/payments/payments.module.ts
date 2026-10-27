import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CredentialVaultService } from './credential-vault.service';
import { DocumentModule } from '../document/document.module';
import { PrismaService } from '../../prisma/prisma.service';
import { KmsEnvelopeService } from './kms-envelope.service';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PayPalAdapter } from './adapters/paypal.adapter';

@Module({
  imports: [DocumentModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    CredentialVaultService,
    PrismaService,
    KmsEnvelopeService,
    StripeAdapter,
    PayPalAdapter,
  ],
  exports: [PaymentsService, CredentialVaultService, KmsEnvelopeService],
})
export class PaymentsModule {}
