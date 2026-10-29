import { FormsService } from '../forms.service';
import { FormsRepository } from '../forms.repository';

describe('FormsService Unit Tests (Sprint 3.11, Invariant I-09, EC-FORM-01, EC-FORM-02)', () => {
  let service: FormsService;
  let mockRepo: jest.Mocked<FormsRepository>;

  const orgId = 'org-test-uuid';
  const userId = 'user-test-uuid';
  const workspaceId = 'ws-test-uuid';

  beforeEach(() => {
    mockRepo = {
      createForm: jest.fn(),
      findFormById: jest.fn(),
      findFormBySlug: jest.fn(),
      findFormByOrgAndSlug: jest.fn(),
      listForms: jest.fn(),
      updateForm: jest.fn(),
      softDeleteForm: jest.fn(),
    } as unknown as jest.Mocked<FormsRepository>;

    service = new FormsService(mockRepo);
  });

  describe('createForm (EC-FORM-01)', () => {
    it('creates form with direct slug when no collision exists', async () => {
      mockRepo.findFormByOrgAndSlug.mockResolvedValue(null);
      mockRepo.createForm.mockResolvedValue({
        id: 'form-1',
        name: 'Client Intake',
        slug: 'client-intake',
        status: 'draft',
        version: 1,
      } as any);

      const result = await service.createForm(
        orgId,
        userId,
        { name: 'Client Intake', workspaceId },
        workspaceId,
      );

      expect(mockRepo.findFormByOrgAndSlug).toHaveBeenCalledWith(orgId, 'client-intake');
      expect(mockRepo.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Client Intake',
          slug: 'client-intake',
          organizationId: orgId,
          workspaceId,
          createdBy: userId,
        }),
      );
      expect(result!.slug).toBe('client-intake');
    });

    it('generates collision-safe slug with random suffix when slug already exists', async () => {
      mockRepo.findFormByOrgAndSlug.mockResolvedValueOnce({ id: 'existing-form' } as any);
      mockRepo.createForm.mockImplementation(async (params: any) => ({
        id: 'form-2',
        ...params,
        status: 'draft',
        version: 1,
      }));

      const result = await service.createForm(
        orgId,
        userId,
        { name: 'Client Intake', workspaceId },
        workspaceId,
      );

      expect(result!.slug).toMatch(/^client-intake-[a-f0-9]{6}$/);
      expect(mockRepo.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.stringMatching(/^client-intake-[a-f0-9]{6}$/),
        }),
      );
    });
  });

  describe('updateForm (EC-FORM-02 Copy-on-submit Versioning)', () => {
    it('preserves version 1 when updating a draft form', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: 'form-1',
        organizationId: orgId,
        status: 'draft',
        version: 1,
      } as any);

      mockRepo.updateForm.mockResolvedValue({
        id: 'form-1',
        name: 'Updated Name',
        version: 1,
      } as any);

      const result = await service.updateForm(orgId, 'form-1', { name: 'Updated Name' });

      expect(mockRepo.updateForm).toHaveBeenCalledWith(
        orgId,
        'form-1',
        expect.objectContaining({ version: 1 }),
      );
      expect(result?.version).toBe(1);
    });

    it('increments version from 1 to 2 when updating a published form (copy-on-submit)', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: 'form-1',
        organizationId: orgId,
        status: 'published',
        version: 1,
      } as any);

      mockRepo.updateForm.mockResolvedValue({
        id: 'form-1',
        name: 'Updated Published Name',
        version: 2,
      } as any);

      const result = await service.updateForm(orgId, 'form-1', { name: 'Updated Published Name' });

      expect(mockRepo.updateForm).toHaveBeenCalledWith(
        orgId,
        'form-1',
        expect.objectContaining({ version: 2 }),
      );
      expect(result?.version).toBe(2);
    });
  });

  describe('publishForm and closeForm', () => {
    it('transitions status to published', async () => {
      mockRepo.updateForm.mockResolvedValue({ id: 'form-1', status: 'published' } as any);
      const res = await service.publishForm(orgId, 'form-1');
      expect(mockRepo.updateForm).toHaveBeenCalledWith(orgId, 'form-1', { status: 'published' });
      expect(res.status).toBe('published');
    });

    it('transitions status to closed', async () => {
      mockRepo.updateForm.mockResolvedValue({ id: 'form-1', status: 'closed' } as any);
      const res = await service.closeForm(orgId, 'form-1');
      expect(mockRepo.updateForm).toHaveBeenCalledWith(orgId, 'form-1', { status: 'closed' });
      expect(res.status).toBe('closed');
    });
  });

  describe('getShareMetadata', () => {
    it('generates valid public URL, embed iframe snippet, and SVG QR code', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: 'form-123',
        slug: 'client-survey',
        workspace: { slug: 'acme-corp' },
      } as any);

      const meta = await service.getShareMetadata(orgId, 'form-123', 'https://app.pactintel.com');
      expect(meta.publicUrl).toBe('https://app.pactintel.com/f/acme-corp/client-survey');
      expect(meta.embedSnippet).toContain(
        '<iframe src="https://app.pactintel.com/f/acme-corp/client-survey?embed=true"',
      );
      expect(meta.qrCodeSvg).toContain('<svg');
    });
  });
});
