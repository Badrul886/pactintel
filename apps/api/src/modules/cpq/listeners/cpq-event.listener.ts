import { Injectable, Logger } from '@nestjs/common';
import { BundleCreatedEvent } from '../events/bundle-created.event';
import { PricingRuleActivatedEvent } from '../events/pricing-rule-activated.event';

@Injectable()
export class CpqEventListener {
  private readonly logger = new Logger(CpqEventListener.name);

  handleBundleCreated(event: BundleCreatedEvent) {
    this.logger.log(
      `[CpqEventListener] Product bundle created: ${event.bundleName} (ID: ${event.bundleId}, v${event.version}) in org ${event.organizationId}`,
    );
  }

  handlePricingRuleActivated(event: PricingRuleActivatedEvent) {
    this.logger.log(
      `[CpqEventListener] Pricing rule activated: ${event.ruleName} (ID: ${event.ruleId}, type: ${event.ruleType}) in org ${event.organizationId}`,
    );
  }
}
