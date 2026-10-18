import { PaymentsService } from '../../src/modules/payments/payments.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RULE PAY-004: Pre-Send Currency Validation & Payment Link Placeholder Resolution', () => {
  let paymentsService: PaymentsService;
  let mockPrisma: any;
  let mockOutbox: Partial<DocumentOutboxService>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const connectionId = '22222222-2222-7222-8222-222222222222';
  const docId = '33333333-3333-7333-8333-333333333333';

  beforeEach(() => {
    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockPrisma = {
      paymentProviderConnection: {
        findFirst: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockPrisma)),
    };

    paymentsService = new PaymentsService(
      mockPrisma as PrismaService,
      mockOutbox as DocumentOutboxService,
    );
  });

  describe('Currency Support Verification (RULE PAY-004)', () => {
    it('approves transaction when currency is supported by the connection', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        displayName: 'Stripe BYOK',
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        isActive: true,
      });

      const connection = await paymentsService.validateCurrencySupport('USD', connectionId, orgId);
      expect(connection.id).toBe(connectionId);
    });

    it('approves transaction case-insensitively (e.g. "eur" normalized to "EUR")', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        displayName: 'Stripe BYOK',
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        isActive: true,
      });

      const connection = await paymentsService.validateCurrencySupport('eur', connectionId, orgId);
      expect(connection.id).toBe(connectionId);
    });

    it('rejects unsupported currency with 400 Bad Request and lists supported options', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        displayName: 'Stripe BYOK',
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        isActive: true,
      });

      await expect(
        paymentsService.validateCurrencySupport('JPY', connectionId, orgId),
      ).rejects.toThrow(
        new HttpException(
          {
            code: 'CURRENCY_NOT_SUPPORTED',
            message:
              "Currency 'JPY' is not supported by payment provider 'Stripe BYOK'. Supported: [USD, EUR, GBP]",
            details: { currency: 'JPY', supportedCurrencies: ['USD', 'EUR', 'GBP'] },
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('rejects when payment connection is inactive or not found', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue(null);

      await expect(
        paymentsService.validateCurrencySupport('USD', connectionId, orgId),
      ).rejects.toThrow(
        new HttpException(
          {
            code: 'PAYMENT_CONNECTION_NOT_FOUND',
            message: 'Active payment connection not found.',
          },
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });

  describe('Payment Link Template Variable Substitution', () => {
    it('correctly substitutes {{amount}}, {{currency}}, {{reference}}, and {{email}} into checkout url', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        displayName: 'QuickPay Links',
        paymentLinkUrlTemplate:
          'https://buy.stripe.com/test?amount={{amount}}&currency={{currency}}&client_ref={{reference}}&prefilled_email={{email}}',
        supportedCurrencies: ['USD', 'EUR'],
        isActive: true,
      });

      mockPrisma.payment.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'pay_created_1' }),
      );

      const result = await paymentsService.initiatePayment(orgId, {
        documentId: docId,
        amount: 2500,
        currency: 'USD',
        payerEmail: 'client+billing@acme.corp',
      });

      expect(result.checkoutUrl).toContain('amount=2500');
      expect(result.checkoutUrl).toContain('currency=USD');
      expect(result.checkoutUrl).toContain('client_ref=pi_');
      expect(result.checkoutUrl).toContain('prefilled_email=client%2Bbilling%40acme.corp');
    });
  });
});
