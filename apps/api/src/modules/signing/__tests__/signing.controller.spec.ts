import { SigningController } from '../signing.controller';
import { SigningService } from '../signing.service';
import { SigningRepository } from '../signing.repository';
import { ClsService } from 'nestjs-cls';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('SigningController (Sprint 3.6 - Signer ID-Based REST Endpoints)', () => {
  let controller: SigningController;
  let mockSigningService: Partial<SigningService>;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockCls: Partial<ClsService>;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const signerId = '0192a000-0000-7000-8000-000000000002';
  const signingToken = 'test-signing-token-abc';

  beforeEach(() => {
    mockSigningService = {
      initiateKba: jest
        .fn()
        .mockResolvedValue({ sessionId: 'kba-123', questions: [], attemptsRemaining: 3 }),
      submitKbaAnswers: jest
        .fn()
        .mockResolvedValue({ passed: true, locked: false, attemptsRemaining: 3 }),
      initiateIdVerification: jest
        .fn()
        .mockResolvedValue({ sessionId: 'id-123', verificationUrl: 'https://test' }),
      checkIdVerificationResult: jest
        .fn()
        .mockResolvedValue({ status: 'passed', confidenceScore: 98 }),
      initiateQes: jest.fn().mockResolvedValue({ sessionId: 'qes-123', eidasLevel: 'QES' }),
    };

    mockSigningRepo = {
      findSignerById: jest.fn().mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        signingToken,
      }),
    };

    mockCls = {
      get: jest.fn().mockReturnValue(orgId),
    };

    controller = new SigningController(
      mockSigningService as SigningService,
      mockSigningRepo as SigningRepository,
      mockCls as ClsService,
    );
  });

  it('initiates KBA via signer ID', async () => {
    const res: any = await controller.initiateKbaBySignerId(signerId);
    expect(res.sessionId).toBe('kba-123');
    expect(mockSigningRepo.findSignerById).toHaveBeenCalledWith(orgId, signerId);
    expect(mockSigningService.initiateKba).toHaveBeenCalledWith(signingToken);
  });

  it('submits KBA answers via signer ID', async () => {
    const res: any = await controller.submitKbaAnswersBySignerId(signerId, {
      sessionId: 'kba-123',
      answers: { q1: 'ans1' },
    });
    expect(res.passed).toBe(true);
    expect(mockSigningService.submitKbaAnswers).toHaveBeenCalledWith(signingToken, {
      sessionId: 'kba-123',
      answers: { q1: 'ans1' },
    });
  });

  it('initiates ID verification via signer ID', async () => {
    const res: any = await controller.initiateIdVerifyBySignerId(signerId, {});
    expect(res.sessionId).toBe('id-123');
    expect(mockSigningService.initiateIdVerification).toHaveBeenCalledWith(signingToken, {});
  });

  it('queries ID verification result via signer ID', async () => {
    const res: any = await controller.getIdVerifyResultBySignerId(signerId, 'id-123');
    expect(res.status).toBe('passed');
    expect(mockSigningService.checkIdVerificationResult).toHaveBeenCalledWith(
      signingToken,
      'id-123',
    );
  });

  it('initiates QES via signer ID', async () => {
    const res: any = await controller.initiateQesBySignerId(signerId, { countryCode: 'DE' });
    expect(res.sessionId).toBe('qes-123');
    expect(mockSigningService.initiateQes).toHaveBeenCalledWith(signingToken, {
      countryCode: 'DE',
    });
  });

  it('throws 404 when signer ID is not found in organization', async () => {
    (mockSigningRepo.findSignerById as jest.Mock).mockResolvedValue(null);

    await expect(controller.initiateKbaBySignerId('non-existent')).rejects.toThrow(HttpException);

    try {
      await controller.initiateKbaBySignerId('non-existent');
    } catch (err: any) {
      expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(err.getResponse().code).toBe('SIGNER_NOT_FOUND');
    }
  });
});
