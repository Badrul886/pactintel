import { IntegrationRepository } from '../../src/modules/integration/integration.repository';
import { HubspotAdapter } from '../../src/modules/integration/adapters/hubspot/hubspot.adapter';
import { HubspotSyncJob } from '../../src/modules/integration/jobs/hubspot-sync.job';
import { DocumentSignedListener } from '../../src/modules/integration/listeners/document-signed.listener';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RetryableError } from '../../src/modules/integration/adapters/hubspot/hubspot.types';

describe('HubSpot Integration Module (Sprint 4.2)', () => {
  let repository: IntegrationRepository;
  let hubspotAdapter: HubspotAdapter;
  let syncJob: HubspotSyncJob;
  let signedListener: DocumentSignedListener;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = 'doc-signed-2222';

  let connectionsStore: any[] = [];
  let syncEventsStore: any[] = [];
  let documentsStore: any[] = [];

  beforeEach(() => {
    connectionsStore = [];
    syncEventsStore = [];
    documentsStore = [
      {
        id: docId,
        organizationId: orgId,
        title: 'Enterprise Master Services Agreement',
        totalValue: 50000,
        status: 'sent',
        signatories: [{ name: 'Jane Doe', email: 'jane@enterprise.com' }],
      },
    ];

    mockPrisma = {
      integrationConnection: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          connectionsStore.push(data);
          return data;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          return connectionsStore.filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.deletedAt === null && c.deletedAt) return false;
            return true;
          });
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          return (
            connectionsStore.find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.organizationId && c.organizationId !== where.organizationId) return false;
              return true;
            }) || null
          );
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const idx = connectionsStore.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            connectionsStore[idx] = { ...connectionsStore[idx], ...data };
            return connectionsStore[idx];
          }
          return null;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          connectionsStore.forEach((c) => {
            if (where.id && c.id !== where.id) return;
            if (where.organizationId && c.organizationId !== where.organizationId) return;
            Object.assign(c, data);
          });
          return { count: 1 };
        }),
      },
      crmSyncEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          syncEventsStore.push(data);
          return data;
        }),
        findMany: jest.fn().mockImplementation(async () => syncEventsStore),
        count: jest.fn().mockImplementation(async () => syncEventsStore.length),
        findFirst: jest
          .fn()
          .mockImplementation(async () => syncEventsStore[syncEventsStore.length - 1] || null),
      },
      document: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return documentsStore.find((d) => d.id === where.id) || null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const doc = documentsStore.find((d) => d.id === where.id);
          if (doc) Object.assign(doc, data);
          return doc;
        }),
      },
      outboxEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return Promise.all(callback);
      }),
    };

    repository = new IntegrationRepository(mockPrisma as PrismaService);
    hubspotAdapter = new HubspotAdapter();
    syncJob = new HubspotSyncJob(repository, hubspotAdapter, mockPrisma as PrismaService);
    signedListener = new DocumentSignedListener(repository, syncJob);
  });

  // Test 1 — Encrypted at rest
  it('Test 1 — encrypted at rest: stores tokens via envelope encryption and decrypts accurately', async () => {
    const rawAccessToken = 'pat-na1-12345678-secret-access-token';
    const rawRefreshToken = 'refresh-secret-token-abcdef';
    const futureDate = new Date(Date.now() + 3600 * 1000);

    const connection = await repository.createConnection(orgId, 'hubspot', {
      accessToken: rawAccessToken,
      refreshToken: rawRefreshToken,
      expiresAt: futureDate,
    });

    // 1. Verify stored payload is NOT plaintext
    expect(connection.encryptedOauthToken).toBeDefined();
    expect(connection.dekCiphertext).toBeDefined();
    expect(connection.kmsKeyId).toBeDefined();
    expect(connection.encryptedOauthToken?.toString()).not.toContain(rawAccessToken);
    expect(connection.encryptedOauthToken?.toString()).not.toContain(rawRefreshToken);

    // 2. Decrypt and verify matching original tokens
    const decrypted = await repository.decryptTokens(connection as any);
    expect(decrypted.accessToken).toBe(rawAccessToken);
    expect(decrypted.refreshToken).toBe(rawRefreshToken);
  });

  // Test 2 — Sync failure doesn't break signing (Architecture Invariant I-12)
  it('Test 2 — sync failure does not break signing: HubSpot 500 logs error but document remains signed', async () => {
    await repository.createConnection(orgId, 'hubspot', {
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    // Mock HubSpot endpoint failure (500)
    jest
      .spyOn(hubspotAdapter, 'upsertContact')
      .mockRejectedValue(new Error('HubSpot CRM Service 500 Down'));
    jest
      .spyOn(hubspotAdapter, 'upsertDeal')
      .mockRejectedValue(new Error('HubSpot CRM Service 500 Down'));

    // Execute document signing workflow
    documentsStore[0].status = 'signed';

    // Outbox listener receives signed event
    await expect(
      signedListener.handleDocumentSigned({
        documentId: docId,
        organizationId: orgId,
      }),
    ).resolves.not.toThrow();

    // Document state MUST remain signed!
    expect(documentsStore[0].status).toBe('signed');

    // Audit log MUST record error status in crm_sync_events
    expect(syncEventsStore.length).toBeGreaterThan(0);
    expect(syncEventsStore.some((evt) => evt.status === 'error')).toBe(true);
  });

  // Test 3 — Expired token refresh
  it('Test 3 — expired token refresh: automatically refreshes token before sync and updates database', async () => {
    const pastExpiration = new Date(Date.now() - 10000); // Expired 10 seconds ago
    const oldAccessToken = 'old-expired-access-token';
    const oldRefreshToken = 'valid-refresh-token';

    const conn = await repository.createConnection(orgId, 'hubspot', {
      accessToken: oldAccessToken,
      refreshToken: oldRefreshToken,
      expiresAt: pastExpiration,
    });

    const newAccessToken = 'freshly-refreshed-access-token';
    const refreshSpy = jest.spyOn(hubspotAdapter, 'refreshAccessToken').mockResolvedValue({
      accessToken: newAccessToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    const contactSpy = jest.spyOn(hubspotAdapter, 'upsertContact').mockResolvedValue({
      externalId: 'hubspot-contact-999',
    });

    const result = await syncJob.process({
      connectionId: conn.id,
      organizationId: orgId,
      entityType: 'contact',
      documentId: docId,
    });

    expect(result.success).toBe(true);
    expect(refreshSpy).toHaveBeenCalledWith(oldRefreshToken);
    expect(contactSpy).toHaveBeenCalledWith(newAccessToken, expect.any(Object));

    // Verify stored connection in DB was updated with new decrypted token
    const updatedConn = connectionsStore.find((c) => c.id === conn.id);
    const decryptedNew = await repository.decryptTokens(updatedConn);
    expect(decryptedNew.accessToken).toBe(newAccessToken);
  });

  // Test 4 — 429 retry
  it('Test 4 — 429 rate limit retry: throws RetryableError on 429 and succeeds on subsequent call', async () => {
    const conn = await repository.createConnection(orgId, 'hubspot', {
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    let attempts = 0;
    jest.spyOn(hubspotAdapter, 'upsertDeal').mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new RetryableError('Rate limit exceeded (429)', 500);
      }
      return { externalId: 'hubspot-deal-success-888' };
    });

    // First attempt fails with RetryableError for BullMQ exponential backoff
    await expect(
      syncJob.process({
        connectionId: conn.id,
        organizationId: orgId,
        entityType: 'deal',
        documentId: docId,
      }),
    ).rejects.toThrow(RetryableError);

    // Second attempt succeeds
    const secondAttempt = await syncJob.process({
      connectionId: conn.id,
      organizationId: orgId,
      entityType: 'deal',
      documentId: docId,
    });

    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.externalId).toBe('hubspot-deal-success-888');
  });
});
