import { SigningService } from '../../src/modules/signing/signing.service';
import { SigningRepository } from '../../src/modules/signing/signing.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256 } from '@pactintel/shared-utils';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RULE AUTH-005: External Signer Gate and Passcode Challenge', () => {
  let signingService: SigningService;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockNotificationService: Partial<NotificationService>;
  let mockPrisma: any;
  let mockTx: any;

  const validToken = 'cryptotoken_valid_90d';
  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const signerId = '33333333-3333-7333-8333-333333333333';
  const rawPasscode = 'SuperSecretPass123';
  const passcodeHash = sha256(rawPasscode);

  beforeEach(() => {
    mockSigningRepo = {
      findSignerByToken: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockNotificationService = {
      enqueueEmail: jest.fn().mockResolvedValue(true),
    };

    mockTx = {
      signer: { update: jest.fn() },
      signatureEvent: { create: jest.fn() },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    signingService = new SigningService(
      mockSigningRepo as SigningRepository,
      mockOutbox as DocumentOutboxService,
      mockNotificationService as NotificationService,
      mockPrisma as PrismaService,
    );
  });

  describe('Token Expiration and Lifecycle (RULE AUTH-005)', () => {
    it('throws 410 GONE when signing token has passed its 90-day expiration', async () => {
      const expiredDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        tokenExpiresAt: expiredDate,
        signatureRequest: {
          document: { status: 'out_for_signature' },
          documentVersion: {},
        },
      });

      await expect(signingService.getSignerByToken(validToken)).rejects.toThrow(
        new HttpException(
          { code: 'TOKEN_EXPIRED', message: 'This signing link has expired.' },
          HttpStatus.GONE,
        ),
      );
    });

    it('throws 410 GONE when parent document has been voided by the sender', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        tokenExpiresAt: futureDate,
        signatureRequest: {
          document: { status: 'voided' },
          documentVersion: {},
        },
      });

      await expect(signingService.getSignerByToken(validToken)).rejects.toThrow(
        new HttpException(
          {
            code: 'DOCUMENT_VOIDED',
            message: 'This signature request has been voided by the sender.',
          },
          HttpStatus.GONE,
        ),
      );
    });
  });

  describe('Passcode Identity Challenge Verification', () => {
    it('rejects identity verification when passcode is missing', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        verificationMethod: 'passcode',
        passcodeHash,
      });

      await expect(signingService.verifySignerIdentity(validToken, undefined)).rejects.toThrow(
        new HttpException(
          { code: 'PASSCODE_REQUIRED', message: 'A passcode is required to access this document.' },
          HttpStatus.UNAUTHORIZED,
        ),
      );
    });

    it('rejects identity verification when incorrect passcode is provided', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        verificationMethod: 'passcode',
        passcodeHash,
      });

      await expect(
        signingService.verifySignerIdentity(validToken, 'WrongPassword999'),
      ).rejects.toThrow(
        new HttpException(
          { code: 'INVALID_PASSCODE', message: 'The provided passcode is incorrect.' },
          HttpStatus.UNAUTHORIZED,
        ),
      );
    });

    it('accepts correct passcode, transitions status to viewed, and records audit signature event', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        verificationMethod: 'passcode',
        passcodeHash,
        status: 'sent',
        email: 'signer@enterprise.com',
        signatureRequest: {
          documentId: docId,
        },
      });

      const result = await signingService.verifySignerIdentity(
        validToken,
        rawPasscode,
        '192.168.1.1',
        'Mozilla/5.0 Chrome',
      );

      expect(result).toEqual({ verified: true, message: 'Identity verified successfully.' });

      expect(mockTx.signer.update).toHaveBeenCalledWith({
        where: { id: signerId },
        data: { status: 'viewed' },
      });

      expect(mockTx.signatureEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          documentId: docId,
          signerId,
          eventType: 'viewed',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Chrome',
        }),
      });

      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockTx,
        orgId,
        'signer.viewed',
        signerId,
        expect.objectContaining({
          signerId,
          documentId: docId,
        }),
      );
    });
  });
});
