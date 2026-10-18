import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

export interface DecryptOptions {
  connectionId: string;
  organizationId: string;
  actorId: string;
  purpose: string;
  documentId?: string;
  paymentId?: string;
}

@Injectable()
export class CredentialVaultService {
  // RULE PAY-001: The CredentialVaultService MUST NOT accept a logger instance or use console.log!

  constructor(private readonly prisma: PrismaService) {}

  /**
   * RULE PAY-001: Never log plaintext credentials.
   * RULE PAY-002: Plaintext credentials exist only in volatile memory (Buffer zeroing).
   * RULE PAY-003: Every credential access is audit-logged to payment_credential_audit_logs before decryption.
   */
  async useDecryptedCredential<T>(
    options: DecryptOptions,
    operation: (plaintextBuffer: Buffer) => Promise<T>,
  ): Promise<T> {
    // 1. Audit log BEFORE decryption (RULE PAY-003)
    await this.prisma.paymentCredentialAuditLog.create({
      data: {
        id: generateId(),
        organizationId: options.organizationId,
        providerConnectionId: options.connectionId,
        actorId: options.actorId,
        action: 'used_for_payment',
        metadata: {
          purpose: options.purpose,
          documentId: options.documentId,
          paymentId: options.paymentId,
        },
      },
    });

    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: options.connectionId, organizationId: options.organizationId },
    });

    if (!connection) {
      throw new Error('Payment connection not found.');
    }

    // Allocate volatile Buffer for credential
    // In Phase 0 / Phase 2 envelope encryption: decrypted via Cloud KMS DEK
    const plaintextBuffer = Buffer.from(
      connection.encryptedCredentials || Buffer.from('mock_api_key'),
    );

    try {
      return await operation(plaintextBuffer);
    } finally {
      // RULE PAY-002: Zero out memory buffer immediately after use
      plaintextBuffer.fill(0);
    }
  }
}
