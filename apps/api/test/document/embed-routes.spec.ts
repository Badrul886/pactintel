import { EmbedController } from '../../src/modules/document/embed.controller';
import { NotFoundException } from '@nestjs/common';

describe('White-Label Embedded Routes (Sprint 3.12 /embed)', () => {
  let controller: EmbedController;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      document: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'doc_valid') {
            return Promise.resolve({
              id: 'doc_valid',
              title: 'Master Service Agreement',
              organization: { name: 'Acme Corp' },
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    controller = new EmbedController(mockPrisma);
  });

  it('renders embedded editor view with postMessage bridge and relaxed framing headers', async () => {
    const mockRes: any = {
      headers: {},
      setHeader: jest.fn((k: string, v: string) => {
        mockRes.headers[k] = v;
      }),
      send: jest.fn((html: string) => html),
    };

    const html = await controller.getEmbeddedEditor('doc_valid', mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'ALLOWALL');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(html).toContain('Master Service Agreement');
    expect(html).toContain('pactintel:document:loaded');
  });

  it('renders embedded signing view with postMessage bridge and relaxed framing headers', async () => {
    const mockRes: any = {
      headers: {},
      setHeader: jest.fn((k: string, v: string) => {
        mockRes.headers[k] = v;
      }),
      send: jest.fn((html: string) => html),
    };

    const html = await controller.getEmbeddedSigning('doc_valid', mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'ALLOWALL');
    expect(html).toContain('Sign: Master Service Agreement');
    expect(html).toContain('pactintel:signing:loaded');
  });

  it('throws NotFoundException when embedding non-existent document', async () => {
    const mockRes: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await expect(controller.getEmbeddedEditor('doc_missing', mockRes)).rejects.toThrow(
      NotFoundException,
    );
  });
});
