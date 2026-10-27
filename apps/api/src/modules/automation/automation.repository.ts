import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import {
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
  AutomationRuleDto,
} from '@pactintel/shared-types';

@Injectable()
export class AutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    dto: CreateAutomationRuleDto,
    id: string = generateId(),
  ): Promise<AutomationRuleDto> {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.automationRule.create({
        data: {
          id,
          organizationId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          triggerEvent: dto.triggerEvent,
          conditions: dto.conditions as unknown as Prisma.InputJsonValue,
          actions: dto.actions as unknown as Prisma.InputJsonValue,
          isActive: true,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'automation.rule.created',
          aggregateType: 'AutomationRule',
          aggregateId: rule.id,
          payload: {
            ruleId: rule.id,
            workspaceId: rule.workspaceId,
            name: rule.name,
            triggerEvent: rule.triggerEvent,
          } as Prisma.InputJsonValue,
        },
      });

      return this.mapToDto(rule);
    });
  }

  async findById(id: string, organizationId?: string): Promise<AutomationRuleDto | null> {
    const rule = await this.prisma.automationRule.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    return rule ? this.mapToDto(rule) : null;
  }

  async list(organizationId: string, workspaceId?: string): Promise<AutomationRuleDto[]> {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return rules.map((r) => this.mapToDto(r));
  }

  async findActiveRulesByTrigger(
    organizationId: string,
    triggerEvent: string,
  ): Promise<AutomationRuleDto[]> {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        organizationId,
        triggerEvent,
        isActive: true,
        deletedAt: null,
      },
    });

    return rules.map((r) => this.mapToDto(r));
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateAutomationRuleDto,
  ): Promise<AutomationRuleDto> {
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      throw new Error(`Automation rule ${id} not found`);
    }

    const updated = await this.prisma.automationRule.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.conditions
          ? { conditions: dto.conditions as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.actions ? { actions: dto.actions as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      return;
    }

    await this.prisma.automationRule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async incrementExecutionCount(id: string): Promise<void> {
    await this.prisma.automationRule.update({
      where: { id },
      data: {
        executionCount: { increment: 1 },
        lastExecutedAt: new Date(),
      },
    });
  }

  private mapToDto(rule: any): AutomationRuleDto {
    return {
      id: rule.id,
      organizationId: rule.organizationId,
      workspaceId: rule.workspaceId,
      name: rule.name,
      triggerEvent: rule.triggerEvent,
      conditions: (rule.conditions as any) || [],
      actions: (rule.actions as any) || [],
      isActive: rule.isActive,
      executionCount: rule.executionCount,
      lastExecutedAt: rule.lastExecutedAt ? rule.lastExecutedAt.toISOString() : null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      deletedAt: rule.deletedAt ? rule.deletedAt.toISOString() : null,
    };
  }
}
