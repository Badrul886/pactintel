import { Injectable, NotFoundException } from '@nestjs/common';
import { CpqRepository } from './cpq.repository';
import { CatalogRepository } from './catalog.repository';
import { evaluateCpqRules } from './cpq-rules.engine';
import { ExecutePlaybookDto } from '@pactintel/shared-types';

export interface PlaybookExecutionResult {
  playbookId: string;
  playbookName: string;
  matchedCriteria: Record<string, any>;
  eligibleCatalogItems: any[];
  recommendedBundles: any[];
  applicableRules: any[];
  approvalWarnings: string[];
}

@Injectable()
export class CpqPlaybookService {
  constructor(
    private readonly cpqRepo: CpqRepository,
    private readonly catalogRepo: CatalogRepository,
  ) {}

  /**
   * Executes a guided-selling playbook for a specific deal context.
   * Filters the product catalog to eligible items, suggests bundles, and highlights approvals.
   */
  async executePlaybook(
    organizationId: string,
    playbookId: string,
    dto: ExecutePlaybookDto,
  ): Promise<PlaybookExecutionResult> {
    const playbook = await this.cpqRepo.findPlaybookById(playbookId, organizationId);
    if (!playbook) {
      throw new NotFoundException(`Playbook ${playbookId} not found`);
    }

    const dealAttrs = dto.dealAttributes || {};

    // 1. Fetch catalog items for the organization
    const allCatalogItems = await this.catalogRepo.findAll(organizationId, { isActive: true });

    // 2. Fetch bundles in workspace
    const bundlesPage = await this.cpqRepo.findBundles(organizationId, {
      workspaceId: playbook.workspaceId,
      limit: 100,
    });
    const activeBundles = bundlesPage.items.filter((b) => b.isActive);

    // 3. Fetch active pricing rules in workspace
    const activeRules = await this.cpqRepo.findPricingRules(organizationId, {
      workspaceId: playbook.workspaceId,
      isActive: true,
    });

    // 4. Evaluate playbook step filters against dealAttributes
    const steps = Array.isArray(playbook.steps) ? (playbook.steps as any[]) : [];
    let eligibleItems = [...allCatalogItems];
    const approvalWarnings: string[] = [];

    for (const step of steps) {
      // Step: filter_catalog
      if (step.action === 'filter_catalog' && step.criteria) {
        const { field, matchAttr } = step.criteria;
        const targetVal = dealAttrs[matchAttr];
        if (targetVal !== undefined && field) {
          eligibleItems = eligibleItems.filter((item) => {
            const meta = (item.metadata || {}) as Record<string, any>;
            const val = meta[field] || (item as any)[field];
            if (Array.isArray(val)) {
              return val.includes(targetVal);
            }
            return String(val).toLowerCase() === String(targetVal).toLowerCase();
          });
        }
      }

      // Step: flag_approval
      if (step.action === 'flag_approval' && step.condition) {
        const { attr, operator, threshold, reason } = step.condition;
        const actualVal = dealAttrs[attr];
        if (actualVal !== undefined) {
          let triggered = false;
          if (operator === 'gt' && Number(actualVal) > Number(threshold)) triggered = true;
          if (operator === 'gte' && Number(actualVal) >= Number(threshold)) triggered = true;
          if (operator === 'eq' && String(actualVal) === String(threshold)) triggered = true;

          if (triggered) {
            approvalWarnings.push(
              reason || `Deal attribute '${attr}' requires administrative approval.`,
            );
          }
        }
      }
    }

    // 5. Match bundles: bundles whose items are part of eligible catalog
    const eligibleItemIds = new Set(eligibleItems.map((i) => i.id));
    const recommendedBundles = activeBundles.filter((bundle) => {
      // Bundle is recommended if at least one item or all required items are in eligible set
      if (bundle.items.length === 0) return true;
      const requiredItems = bundle.items.filter((it) => it.isRequired);
      if (requiredItems.length > 0) {
        return requiredItems.some((it) => eligibleItemIds.has(it.productItemId));
      }
      return bundle.items.some((it) => eligibleItemIds.has(it.productItemId));
    });

    // 6. Test rule evaluation simulation
    const dummyLineItems = eligibleItems.slice(0, 3).map((item) => ({
      id: item.id,
      productItemId: item.id,
      name: item.name,
      quantity: 1,
      unitPrice: Number(item.unitPrice),
    }));

    const previewResult = evaluateCpqRules(
      {
        lineItems: dummyLineItems,
        dealAttributes: dealAttrs,
      },
      activeRules as any,
    );

    return {
      playbookId: playbook.id,
      playbookName: playbook.name,
      matchedCriteria: dealAttrs,
      eligibleCatalogItems: eligibleItems,
      recommendedBundles,
      applicableRules: previewResult.appliedRules,
      approvalWarnings,
    };
  }
}
