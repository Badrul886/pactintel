export class PricingRuleActivatedEvent {
  constructor(
    public readonly organizationId: string,
    public readonly ruleId: string,
    public readonly ruleName: string,
    public readonly ruleType: string,
  ) {}
}
