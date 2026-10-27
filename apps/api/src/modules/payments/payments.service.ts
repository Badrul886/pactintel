import { Injectable, HttpException, HttpStatus, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { generateId } from '@pactintel/shared-utils';
import { InitiatePaymentDto, AddPaymentCredentialDto } from '@pactintel/shared-types';
import { KmsEnvelopeService } from './kms-envelope.service';
import { StripeAdapter } from './adapters/stripe.adapter';
import { PayPalAdapter } from './adapters/paypal.adapter';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: DocumentOutboxService,
    @Optional() private readonly kmsEnvelope: KmsEnvelopeService = new KmsEnvelopeService(),
    @Optional() private readonly stripeAdapter: StripeAdapter = new StripeAdapter(),
    @Optional() private readonly paypalAdapter: PayPalAdapter = new PayPalAdapter(),
  ) {}

  /**
   * Registers a payment link provider connection (Phase 0 Payment Link tier).
   */
  async registerPaymentLink(
    organizationId: string,
    displayName: string,
    paymentLinkUrlTemplate: string,
    supportedCurrencies: string[] = ['USD', 'EUR', 'GBP'],
  ) {
    return this.prisma.paymentProviderConnection.create({
      data: {
        id: generateId(),
        organizationId,
        providerType: 'payment_link',
        displayName,
        paymentLinkUrlTemplate,
        supportedCurrencies: supportedCurrencies.map((c) => c.toUpperCase()),
        isActive: true,
        isVerified: true,
        lastVerifiedAt: new Date(),
      },
    });
  }

  async listConnections(organizationId: string) {
    return this.prisma.paymentProviderConnection.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayName: true,
        providerType: true,
        supportedCurrencies: true,
        isActive: true,
        paymentLinkUrlTemplate: true,
        createdAt: true,
      },
    });
  }

  /**
   * RULE PAY-004: Validate currency before send, not at payment time.
   */
  async validateCurrencySupport(currency: string, connectionId: string, organizationId: string) {
    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: connectionId, organizationId, isActive: true, deletedAt: null },
    });

    if (!connection) {
      throw new HttpException(
        {
          code: 'PAYMENT_CONNECTION_NOT_FOUND',
          message: 'Active payment connection not found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const normCurrency = currency.toUpperCase();
    const isSupported = connection.supportedCurrencies.includes(normCurrency);

    if (!isSupported) {
      throw new HttpException(
        {
          code: 'CURRENCY_NOT_SUPPORTED',
          message: `Currency '${normCurrency}' is not supported by payment provider '${connection.displayName}'. Supported: [${connection.supportedCurrencies.join(', ')}]`,
          details: { currency: normCurrency, supportedCurrencies: connection.supportedCurrencies },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return connection;
  }

  /**
   * Initiates payment for a document by resolving URL template placeholders.
   */
  async initiatePayment(organizationId: string, dto: InitiatePaymentDto) {
    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: { organizationId, isActive: true, deletedAt: null },
    });

    if (!connection || !connection.paymentLinkUrlTemplate) {
      throw new HttpException(
        {
          code: 'PAYMENT_CONNECTION_NOT_FOUND',
          message: 'No active payment gateway or payment link connection configured.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const paymentId = generateId();
    const reference = `pi_${paymentId}`;
    const encodedEmail = dto.payerEmail ? encodeURIComponent(dto.payerEmail) : '';

    const checkoutUrl = connection.paymentLinkUrlTemplate
      .replace(/\{\{amount\}\}|\{amount\}/gi, dto.amount.toString())
      .replace(/\{\{currency\}\}|\{currency\}/gi, dto.currency.toUpperCase())
      .replace(/\{\{reference\}\}|\{reference\}/gi, reference)
      .replace(/\{\{email\}\}|\{email\}|\{\{payer_email\}\}|\{payer_email\}/gi, encodedEmail)
      .replace(/\{\{document_id\}\}|\{document_id\}/gi, dto.documentId)
      .replace(/\{\{payment_id\}\}|\{payment_id\}/gi, paymentId);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          id: paymentId,
          documentId: dto.documentId,
          organizationId,
          providerConnectionId: connection.id,
          payerEmail: dto.payerEmail,
          payerName: dto.payerName,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          status: 'pending',
          paymentType: 'full',
          externalCheckoutUrl: checkoutUrl,
        },
      });

      // Emit transactional outbox event (Invariant I-06)
      await this.outbox.emit(tx, organizationId, 'payment.initiated', paymentId, {
        paymentId,
        documentId: dto.documentId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
      });

      return { payment, checkoutUrl };
    });
  }

  /**
   * Manual confirmation of payment by sender or webhook.
   */
  async confirmPayment(organizationId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
    });

    if (!payment) {
      throw new HttpException(
        { code: 'PAYMENT_NOT_FOUND', message: 'Payment record not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'completed',
          paidAt: new Date(),
        },
      });

      // Emit transactional outbox event
      await this.outbox.emit(tx, organizationId, 'payment.completed', paymentId, {
        paymentId,
        documentId: payment.documentId,
        amount: payment.amount,
      });

      return updated;
    });
  }

  // =========================================================================
  // BYOK PAYMENT CREDENTIALS ENVELOPE ENCRYPTION (Sprint 2.7)
  // =========================================================================

  /**
   * Stores a new BYOK payment credential with envelope encryption (Blueprint §5.3, RULE PAY-001..003).
   */
  async storeCredential(organizationId: string, dto: AddPaymentCredentialDto, actorId?: string) {
    // 1. Envelope-encrypt credential with DEK + KMS CMK
    const { encryptedCredential, dekCiphertext, kmsKeyId } =
      await this.kmsEnvelope.encryptCredential({
        secretKey: dto.secretKey,
        publicKey: dto.publicKey,
        webhookSecret: dto.webhookSecret,
      });

    const connectionId = generateId();

    return this.prisma.$transaction(async (tx) => {
      const connection = await tx.paymentProviderConnection.create({
        data: {
          id: connectionId,
          organizationId,
          providerType: dto.providerType,
          displayName: dto.displayName,
          encryptedCredentials: new Uint8Array(encryptedCredential),
          dekCiphertext: new Uint8Array(dekCiphertext),
          kmsKeyId,
          supportedCurrencies: dto.supportedCurrencies.map((c) => c.toUpperCase()),
          isActive: true,
          isVerified: false,
        },
      });

      // RULE PAY-003: Append-only audit log entry
      await tx.paymentCredentialAuditLog.create({
        data: {
          id: generateId(),
          organizationId,
          providerConnectionId: connectionId,
          actorId: actorId || null,
          action: 'created',
          metadata: {
            providerType: dto.providerType,
            displayName: dto.displayName,
          },
        },
      });

      // Transactional outbox event (Invariant I-06)
      await this.outbox.emit(tx, organizationId, 'payment_credential.added', connectionId, {
        connectionId,
        providerType: dto.providerType,
        displayName: dto.displayName,
      });

      return {
        id: connection.id,
        organizationId: connection.organizationId,
        providerType: connection.providerType,
        displayName: connection.displayName,
        supportedCurrencies: connection.supportedCurrencies,
        isActive: connection.isActive,
        isVerified: connection.isVerified,
        createdAt: connection.createdAt,
      };
    });
  }

  async listCredentials(organizationId: string) {
    return this.prisma.paymentProviderConnection.findMany({
      where: {
        organizationId,
        providerType: { in: ['stripe', 'paypal'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        providerType: true,
        displayName: true,
        supportedCurrencies: true,
        isActive: true,
        isVerified: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  async revokeCredential(organizationId: string, credentialId: string, actorId?: string) {
    const cred = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: credentialId, organizationId, deletedAt: null },
    });
    if (!cred) {
      throw new NotFoundException(`Payment credential '${credentialId}' not found.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentProviderConnection.update({
        where: { id: credentialId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      // Append-only audit log (RULE PAY-003)
      await tx.paymentCredentialAuditLog.create({
        data: {
          id: generateId(),
          organizationId,
          providerConnectionId: credentialId,
          actorId: actorId || null,
          action: 'deleted',
        },
      });

      await this.outbox.emit(tx, organizationId, 'payment_credential.revoked', credentialId, {
        credentialId,
        providerType: cred.providerType,
      });

      return { status: 'revoked', id: credentialId };
    });
  }

  async testConnectivity(organizationId: string, credentialId: string, actorId?: string) {
    // RULE EC-BYOK-03: Revoked credential throws 404 (do NOT attempt decrypt)
    const cred = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: credentialId, organizationId, deletedAt: null },
    });
    if (!cred || !cred.encryptedCredentials || !cred.dekCiphertext || !cred.kmsKeyId) {
      throw new NotFoundException({
        code: 'CREDENTIAL_REVOKED',
        message: `Payment credential '${credentialId}' is revoked or not found.`,
      });
    }

    // Decrypt credentials in volatile memory
    const credentials = await this.kmsEnvelope.decryptCredential<{
      secretKey: string;
      publicKey?: string;
      webhookSecret?: string;
    }>(cred.encryptedCredentials, cred.dekCiphertext, cred.kmsKeyId);

    // Audit log decrypt/test action (RULE PAY-003)
    await this.prisma.paymentCredentialAuditLog.create({
      data: {
        id: generateId(),
        organizationId,
        providerConnectionId: credentialId,
        actorId: actorId || null,
        action: 'verified',
      },
    });

    const adapter = cred.providerType === 'paypal' ? this.paypalAdapter : this.stripeAdapter;
    const result = await adapter.testConnectivity(credentials);

    if (result.success) {
      await this.prisma.paymentProviderConnection.update({
        where: { id: credentialId },
        data: {
          isVerified: true,
          lastVerifiedAt: new Date(),
        },
      });
    }

    return result;
  }

  async getCredentialAuditLogs(organizationId: string, credentialId: string) {
    const cred = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: credentialId, organizationId },
    });
    if (!cred) {
      throw new NotFoundException(`Payment credential '${credentialId}' not found.`);
    }

    return this.prisma.paymentCredentialAuditLog.findMany({
      where: { providerConnectionId: credentialId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Helper for decrypting and executing an operation with volatile zeroing (RULE PAY-002, EC-BYOK-04).
   */
  async decryptAndUseCredential<T>(
    organizationId: string,
    credentialId: string,
    actorId: string,
    purpose: string,
    operation: (creds: {
      secretKey: string;
      publicKey?: string;
      webhookSecret?: string;
    }) => Promise<T>,
  ): Promise<T> {
    const cred = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: credentialId, organizationId, deletedAt: null },
    });
    if (!cred || !cred.encryptedCredentials || !cred.dekCiphertext || !cred.kmsKeyId) {
      throw new NotFoundException(`Payment credential '${credentialId}' is revoked or not found.`);
    }

    // Audit log BEFORE decryption (RULE PAY-003)
    await this.prisma.paymentCredentialAuditLog.create({
      data: {
        id: generateId(),
        organizationId,
        providerConnectionId: credentialId,
        actorId,
        action: 'used_for_payment',
        metadata: { purpose },
      },
    });

    const decrypted = await this.kmsEnvelope.decryptCredential<{
      secretKey: string;
      publicKey?: string;
      webhookSecret?: string;
    }>(cred.encryptedCredentials, cred.dekCiphertext, cred.kmsKeyId);

    return operation(decrypted);
  }
}
