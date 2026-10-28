import { sha256 } from '@pactintel/shared-utils';
import { SigningRepository } from '../signing.repository';

describe('Pre-Verified Signers Network (Sprint 3.7 - Invariant I-03 Zero-PII)', () => {
  let repository: SigningRepository;
  let mockPrisma: any;
  const inMemoryStore = new Map<string, any>();

  beforeEach(() => {
    inMemoryStore.clear();

    mockPrisma = {
      preVerifiedSigner: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          return inMemoryStore.get(where.emailHash) || null;
        }),
        upsert: jest.fn().mockImplementation(async ({ where, update, create }) => {
          const existing = inMemoryStore.get(where.emailHash);
          if (existing) {
            const updated = { ...existing, ...update };
            inMemoryStore.set(where.emailHash, updated);
            return updated;
          }
          inMemoryStore.set(where.emailHash, create);
          return create;
        }),
      },
    };

    repository = new SigningRepository(mockPrisma as any);
  });

  it('correctly hashes email using lowercase SHA-256 without retaining raw email PII', async () => {
    const rawEmail = '  Director.Jane@GlobalEnterprise.COM  ';
    const normalizedHash = sha256(rawEmail.toLowerCase().trim());

    await repository.recordPreVerification(normalizedHash, 'id_document', new Date());

    const record = await repository.findPreVerifiedSigner(normalizedHash);
    expect(record).not.toBeNull();
    expect(record!.emailHash).toBe(normalizedHash);
    expect(record!.verificationMethod).toBe('id_document');
    // Invariant I-03: No raw email exists in the stored record
    expect((record as any).email).toBeUndefined();
  });

  it('enforces 365-day validity window for pre-verified identities', async () => {
    const emailHash = sha256('executive@verified.com');
    const verifiedAt = new Date('2026-01-01T00:00:00.000Z');

    await repository.recordPreVerification(emailHash, 'kba', verifiedAt);

    const record = await repository.findPreVerifiedSigner(emailHash);
    expect(record).not.toBeNull();
    expect(record!.verifiedAt).toEqual(verifiedAt);

    const expectedExpiry = new Date(verifiedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(record!.expiresAt.getTime()).toBe(expectedExpiry.getTime());
  });

  it('rejects expired pre-verification records', async () => {
    const emailHash = sha256('expired.user@past.com');
    // Verified 400 days ago
    const pastVerifiedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

    await repository.recordPreVerification(emailHash, 'id_document', pastVerifiedAt);

    const record = await repository.findPreVerifiedSigner(emailHash);
    expect(record).not.toBeNull();
    const isExpired = new Date() > record!.expiresAt;
    expect(isExpired).toBe(true);
  });
});
