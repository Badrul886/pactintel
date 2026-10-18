import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSubscriptionByOrg(organizationId: string) {
    return this.prisma.subscription.findUnique({
      where: { organizationId },
    });
  }

  async findSubscriptionByPaddleId(paddleSubscriptionId: string) {
    return this.prisma.subscription.findUnique({
      where: { paddleSubscriptionId },
    });
  }

  async findBillingEvent(paddleEventId: string) {
    return this.prisma.billingEvent.findUnique({
      where: { paddleEventId },
    });
  }

  async recordBillingEvent(
    paddleEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    organizationId?: string,
    processed: boolean = true,
  ) {
    return this.prisma.billingEvent.create({
      data: {
        id: generateId(),
        organizationId: organizationId || null,
        paddleEventId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        processed,
      },
    });
  }

  async upsertSubscription(organizationId: string, data: Prisma.SubscriptionUncheckedUpdateInput) {
    return this.prisma.subscription.upsert({
      where: { organizationId },
      update: data,
      create: {
        id: generateId(),
        organizationId,
        planTier: (data.planTier as string) || 'starter',
        status: (data.status as string) || 'active',
        fullSeatLimit: (data.fullSeatLimit as number) || 5,
        fullSeatCount: 1,
        documentLimit: data.documentLimit as number | null,
        documentsUsedThisPeriod: 0,
        billingCycle: (data.billingCycle as string) || 'monthly',
        paddleSubscriptionId: data.paddleSubscriptionId as string | undefined,
        paddleCustomerId: data.paddleCustomerId as string | undefined,
        currentPeriodStart: data.currentPeriodStart as Date | undefined,
        currentPeriodEnd: data.currentPeriodEnd as Date | undefined,
      },
    });
  }

  async updateSubscription(organizationId: string, data: Prisma.SubscriptionUpdateInput) {
    return this.prisma.subscription.update({
      where: { organizationId },
      data,
    });
  }
}
