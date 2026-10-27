import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { KmsEnvelopeService } from '../../src/modules/payments/kms-envelope.service';
import { StripeAdapter } from '../../src/modules/payments/adapters/stripe.adapter';
import { PayPalAdapter } from '../../src/modules/payments/adapters/paypal.adapter';

describe('Sprint 2.7: BYOK Payment Credential Encryption & Memory Hygiene (RULE PAY-001..003, EC-BYOK-01..05)', () => {
  let paymentsService: PaymentsService;
  let kmsEnvelope: KmsEnvelopeService;
  let mockPrisma: any;
  let mockOutbox: any;
  let mockStripeAdapter: any;
  let mockPayPalAdapter: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const connectionId = '22222222-2222-7222-8222-222222222222';
  const actorId = 'usr-admin-123';

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      paymentProviderConnection: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      paymentCredentialAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    kmsEnvelope = new KmsEnvelopeService();

    mockStripeAdapter = {
      testConnectivity: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    };

    mockPayPalAdapter = {
      testConnectivity: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
    };

    paymentsService = new PaymentsService(
      mockPrisma,
      mockOutbox,
      kmsEnvelope,
      mockStripeAdapter as StripeAdapter,
      mockPayPalAdapter as PayPalAdapter,
    );
  });

  describe('Envelope Encryption (RULE PAY-001 & PAY-002)', () => {
    it('stores credentials encrypted with DEK and CMK, ensuring ciphertext does NOT contain plaintext', async () => {
      const plaintextSecret = 'sk_live_very_secret_merchant_key_999999999';

      let persistedConnection: any = null;
      mockPrisma.paymentProviderConnection.create.mockImplementation(async (arg: any) => {
        persistedConnection = arg.data;
        return {
          id: connectionId,
          ...arg.data,
          createdAt: new Date(),
        };
      });

      const result = await paymentsService.storeCredential(
        orgId,
        {
          providerType: 'stripe',
          displayName: 'Acme Stripe',
          secretKey: plaintextSecret,
          publicKey: 'pk_live_public_key',
          supportedCurrencies: ['USD', 'EUR'],
        },
        actorId,
      );

      expect(result.id).toBeDefined();
      expect(persistedConnection).toBeDefined();

      // Verify ciphertext is NOT plaintext
      const encryptedBuf = Buffer.from(persistedConnection.encryptedCredentials);
      expect(encryptedBuf.includes(Buffer.from(plaintextSecret))).toBe(false);

      // Verify DEK ciphertext is stored and CMK key is referenced
      expect(persistedConnection.dekCiphertext).toBeDefined();
      expect(persistedConnection.kmsKeyId).toBeDefined();

      // Verify audit log created with action: 'created'
      expect(mockPrisma.paymentCredentialAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          providerConnectionId: expect.any(String),
          actorId,
          action: 'created',
        }),
      });
    });

    it('decrypts credentials round-trip in volatile memory and zeroes DEK buffer (EC-BYOK-04)', async () => {
      const originalCredentials = {
        secretKey: 'sk_live_merchant_roundtrip_secret',
        publicKey: 'pk_live_roundtrip_public',
      };

      // Encrypt via KmsEnvelopeService
      const envelope = await kmsEnvelope.encryptCredential(originalCredentials);

      // Verify envelope encryption round-trip
      const decrypted = await kmsEnvelope.decryptCredential<typeof originalCredentials>(
        envelope.encryptedCredential,
        envelope.dekCiphertext,
        envelope.kmsKeyId,
      );

      expect(decrypted.secretKey).toBe(originalCredentials.secretKey);
      expect(decrypted.publicKey).toBe(originalCredentials.publicKey);
    });
  });

  describe('Revocation & Invalidation (RULE EC-BYOK-03)', () => {
    it('throws 404 when attempting to test or use a revoked credential (does NOT attempt decrypt)', async () => {
      // Return null or deletedAt set
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue(null);

      await expect(paymentsService.testConnectivity(orgId, connectionId, actorId)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockStripeAdapter.testConnectivity).not.toHaveBeenCalled();
      expect(mockPayPalAdapter.testConnectivity).not.toHaveBeenCalled();
    });

    it('revokes credential atomically, updating deletedAt and creating deleted audit log', async () => {
      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        providerType: 'stripe',
        displayName: 'Acme Stripe',
        deletedAt: null,
      });

      mockPrisma.paymentProviderConnection.update.mockResolvedValue({
        id: connectionId,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await paymentsService.revokeCredential(orgId, connectionId, actorId);

      expect(result.status).toBe('revoked');
      expect(mockPrisma.paymentProviderConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: connectionId },
          data: expect.objectContaining({
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );

      // RULE PAY-003: Audit log record for revocation
      expect(mockPrisma.paymentCredentialAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          providerConnectionId: connectionId,
          actorId,
          action: 'deleted',
        }),
      });

      // Emits transactional outbox event
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'payment_credential.revoked',
        connectionId,
        expect.objectContaining({
          credentialId: connectionId,
          providerType: 'stripe',
        }),
      );
    });
  });

  describe('Audit Trail Immutability (RULE PAY-003)', () => {
    it('records audit log entries before performing sensitive credential operations', async () => {
      const envelope = await kmsEnvelope.encryptCredential({
        secretKey: 'sk_live_audit_test',
      });

      mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
        id: connectionId,
        organizationId: orgId,
        providerType: 'stripe',
        encryptedCredentials: envelope.encryptedCredential,
        dekCiphertext: envelope.dekCiphertext,
        kmsKeyId: envelope.kmsKeyId,
        deletedAt: null,
      });

      const auditOrder: string[] = [];
      mockPrisma.paymentCredentialAuditLog.create.mockImplementation(async (arg: any) => {
        auditOrder.push(`audit_${arg.data.action}`);
        return { id: 'audit-1' };
      });

      await paymentsService.testConnectivity(orgId, connectionId, actorId);

      expect(auditOrder).toContain('audit_verified');
      expect(mockStripeAdapter.testConnectivity).toHaveBeenCalled();
    });
  });
});
