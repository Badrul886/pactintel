import { Test, TestingModule } from '@nestjs/testing';
import { ObligationRemindersJob } from '../jobs/obligation-reminders.job';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ObligationRemindersJob (Sprint 3.5 — Invariant I-06 & I-07)', () => {
  let job: ObligationRemindersJob;
  let prisma: any;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';
  const mockObligationId = '0192a000-0000-7000-8000-000000000002';

  beforeEach(async () => {
    const mockPrisma = {
      obligationRecord: {
        findMany: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ObligationRemindersJob, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    job = module.get<ObligationRemindersJob>(ObligationRemindersJob);
    prisma = module.get(PrismaService);
  });

  it('scans milestone windows and emits transactional outbox reminder events', async () => {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Mock finding 1 obligation in 30d window, 0 in 7d, 0 in 1d
    prisma.obligationRecord.findMany
      .mockResolvedValueOnce([
        {
          id: mockObligationId,
          organizationId: mockOrgId,
          documentId: 'doc-1',
          fieldName: 'annual_renewal',
          fieldValue: 'Automatic renewal unless 30 days notice',
          fieldValueDate: in30Days,
          document: {
            id: 'doc-1',
            title: 'Cloud Hosting Agreement',
            ownerId: 'user-owner',
            organizationId: mockOrgId,
          },
        } as any,
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    prisma.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' } as any);

    const count = await job.checkMilestones();

    expect(count).toBe(1);
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          eventType: 'portfolio.obligation.reminder',
          aggregateType: 'ObligationRecord',
          aggregateId: mockObligationId,
          payload: expect.objectContaining({
            obligationId: mockObligationId,
            daysRemaining: 30,
            documentTitle: 'Cloud Hosting Agreement',
            recipientId: 'user-owner',
          }),
        }),
      }),
    );
  });
});
