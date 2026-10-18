import { CredentialVaultService } from '../../src/modules/payments/credential-vault.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE PAY-001, RULE PAY-002 & RULE PAY-003: Credential Vault Redaction, Buffer Zeroing and Audit Trail', () => {
  let vaultService: CredentialVaultService;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const connectionId = '22222222-2222-7222-8222-222222222222';
  const actorId = 'user-admin-1';

  beforeEach(() => {
    mockPrisma = {
      paymentCredentialAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
      paymentProviderConnection: {
        findFirst: jest.fn(),
      },
    };

    vaultService = new CredentialVaultService(mockPrisma as PrismaService);
  });

  it('RULE PAY-003: creates audit log before decrypting credentials', async () => {
    mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
      id: connectionId,
      organizationId: orgId,
      encryptedCredentials: Buffer.from('sk_live_verysecret12345'),
    });

    const executionOrder: string[] = [];

    mockPrisma.paymentCredentialAuditLog.create.mockImplementation(() => {
      executionOrder.push('audit_logged');
      return Promise.resolve({ id: 'audit-log-1' });
    });

    await vaultService.useDecryptedCredential(
      {
        connectionId,
        organizationId: orgId,
        actorId,
        purpose: 'Execute customer payment',
        documentId: 'doc-1',
        paymentId: 'pay-1',
      },
      async (_buf) => {
        executionOrder.push('decrypted_and_used');
        return 'success';
      },
    );

    expect(executionOrder).toEqual(['audit_logged', 'decrypted_and_used']);
    expect(mockPrisma.paymentCredentialAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgId,
        providerConnectionId: connectionId,
        actorId,
        action: 'used_for_payment',
        metadata: expect.objectContaining({
          purpose: 'Execute customer payment',
          documentId: 'doc-1',
          paymentId: 'pay-1',
        }),
      }),
    });
  });

  it('RULE PAY-002: zeros out volatile memory Buffer after successful operation', async () => {
    const rawKey = 'sk_live_sample_key_9999';
    mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
      id: connectionId,
      organizationId: orgId,
      encryptedCredentials: Buffer.from(rawKey),
    });

    let bufferRef: Buffer | null = null;

    const result = await vaultService.useDecryptedCredential(
      {
        connectionId,
        organizationId: orgId,
        actorId,
        purpose: 'Process transaction',
      },
      async (buf) => {
        bufferRef = buf;
        // Verify that buffer contains the plaintext credential inside the operation
        expect(buf.toString()).toBe(rawKey);
        return 'processed_payment';
      },
    );

    expect(result).toBe('processed_payment');
    expect(bufferRef).not.toBeNull();
    // After operation finishes, buffer must be zeroed out (fill(0))!
    expect((bufferRef as unknown as Buffer).every((byte: number) => byte === 0)).toBe(true);
    expect((bufferRef as unknown as Buffer).toString().replace(/\0/g, '')).toBe('');
  });

  it('RULE PAY-002: zeros out volatile memory Buffer even if operation throws an error', async () => {
    const rawKey = 'sk_live_error_test_key';
    mockPrisma.paymentProviderConnection.findFirst.mockResolvedValue({
      id: connectionId,
      organizationId: orgId,
      encryptedCredentials: Buffer.from(rawKey),
    });

    let bufferRef: Buffer | null = null;

    await expect(
      vaultService.useDecryptedCredential(
        {
          connectionId,
          organizationId: orgId,
          actorId,
          purpose: 'Process transaction with simulated error',
        },
        async (buf) => {
          bufferRef = buf;
          throw new Error('Payment gateway timeout');
        },
      ),
    ).rejects.toThrow('Payment gateway timeout');

    expect(bufferRef).not.toBeNull();
    // After error throws, buffer must STILL be zeroed out!
    expect((bufferRef as unknown as Buffer).every((byte: number) => byte === 0)).toBe(true);
  });
});
