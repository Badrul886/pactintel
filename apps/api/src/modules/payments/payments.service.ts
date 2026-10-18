import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { generateId } from '@pactintel/shared-utils';
import { InitiatePaymentDto } from '@pactintel/shared-types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: DocumentOutboxService,
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
          message: 'No active payment provider connection configured for this organization.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // RULE PAY-004: Validate currency support
    await this.validateCurrencySupport(dto.currency, connection.id, organizationId);

    const paymentId = generateId();
    const reference = `pi_${paymentId.substring(0, 8)}`;

    // Template variable substitution: {{amount}}, {{currency}}, {{reference}}, {{email}}
    const checkoutUrl = connection.paymentLinkUrlTemplate
      .replace('{{amount}}', dto.amount.toString())
      .replace('{{currency}}', dto.currency.toUpperCase())
      .replace('{{reference}}', reference)
      .replace('{{email}}', encodeURIComponent(dto.payerEmail));

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          id: paymentId,
          organizationId,
          documentId: dto.documentId,
          providerConnectionId: connection.id,
          payerEmail: dto.payerEmail,
          payerName: dto.payerName,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          status: 'pending',
          externalCheckoutUrl: checkoutUrl,
          metadata: { reference },
        },
      });

      // Emit transactional outbox event (Invariant I-06)
      await this.outbox.emit(tx, organizationId, 'payment.initiated', payment.id, {
        paymentId: payment.id,
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
}
