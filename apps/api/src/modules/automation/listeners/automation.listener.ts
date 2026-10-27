import { Injectable, Logger } from '@nestjs/common';
import { AutomationRepository } from '../automation.repository';
import { AutomationJob } from '../jobs/automation.job';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class AutomationEventListener {
  private readonly logger = new Logger(AutomationEventListener.name);

  constructor(
    private readonly repo: AutomationRepository,
    private readonly job: AutomationJob,
  ) {}

  /**
   * Dispatches outbox events to registered active automation rules.
   */
  async handleOutboxEvent(
    organizationId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const rules = await this.repo.findActiveRulesByTrigger(organizationId, eventType);
    if (!rules || rules.length === 0) {
      return 0;
    }

    this.logger.log(
      `[AutomationEventListener] Found ${rules.length} active rules for event '${eventType}' in org ${organizationId}`,
    );

    const chainId = generateId();

    for (const rule of rules) {
      await this.job.enqueue(rule, payload, {
        chainDepth: 0,
        chainId,
        organizationId,
      });
    }

    return rules.length;
  }
}
