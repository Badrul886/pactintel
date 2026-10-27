import { Injectable, NotFoundException } from '@nestjs/common';
import { AutomationRepository } from './automation.repository';
import { AutomationExecutor } from './automation.executor';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
  TestAutomationRuleDto,
  AutomationRuleDto,
} from '@pactintel/shared-types';

@Injectable()
export class AutomationService {
  constructor(
    private readonly repo: AutomationRepository,
    private readonly executor: AutomationExecutor,
    private readonly prisma: PrismaService,
  ) {}

  async createRule(
    organizationId: string,
    dto: CreateAutomationRuleDto,
  ): Promise<AutomationRuleDto> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: dto.workspaceId, organizationId, deletedAt: null },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace ${dto.workspaceId} not found`);
    }

    return this.repo.create(organizationId, dto);
  }

  async getRule(organizationId: string, id: string): Promise<AutomationRuleDto> {
    const rule = await this.repo.findById(id, organizationId);
    if (!rule) {
      throw new NotFoundException(`Automation rule ${id} not found`);
    }
    return rule;
  }

  async listRules(organizationId: string, workspaceId?: string): Promise<AutomationRuleDto[]> {
    return this.repo.list(organizationId, workspaceId);
  }

  async updateRule(
    organizationId: string,
    id: string,
    dto: UpdateAutomationRuleDto,
  ): Promise<AutomationRuleDto> {
    await this.getRule(organizationId, id);
    return this.repo.update(id, organizationId, dto);
  }

  async deleteRule(organizationId: string, id: string): Promise<{ success: boolean }> {
    await this.getRule(organizationId, id);
    await this.repo.softDelete(id, organizationId);
    return { success: true };
  }

  /**
   * Performs a dry-run test of an automation rule against sample payload data.
   */
  async testRule(
    organizationId: string,
    id: string,
    dto: TestAutomationRuleDto,
  ): Promise<{
    conditionsMatch: boolean;
    simulatedActions: Array<{
      type: string;
      config: Record<string, unknown>;
      wouldExecute: boolean;
    }>;
  }> {
    const rule = await this.getRule(organizationId, id);

    const conditionsMatch = this.executor.evaluateConditions(rule.conditions, dto.samplePayload);

    const simulatedActions = rule.actions.map((act) => ({
      type: act.type,
      config: act.config,
      wouldExecute: conditionsMatch,
    }));

    return {
      conditionsMatch,
      simulatedActions,
    };
  }
}
