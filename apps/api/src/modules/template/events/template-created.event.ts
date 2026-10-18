export class TemplateCreatedEvent {
  constructor(
    public readonly templateId: string,
    public readonly organizationId: string,
    public readonly workspaceId: string,
    public readonly title: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}
