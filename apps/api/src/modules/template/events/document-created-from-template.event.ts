export class DocumentCreatedFromTemplateEvent {
  constructor(
    public readonly documentId: string,
    public readonly templateId: string,
    public readonly organizationId: string,
    public readonly workspaceId: string,
    public readonly ownerId: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}
