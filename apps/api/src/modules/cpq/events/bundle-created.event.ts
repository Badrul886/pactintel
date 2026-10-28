export class BundleCreatedEvent {
  constructor(
    public readonly organizationId: string,
    public readonly bundleId: string,
    public readonly bundleName: string,
    public readonly version: number,
  ) {}
}
