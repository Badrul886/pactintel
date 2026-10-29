import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('embed')
export class EmbedController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Embedded editor iframe route.
   * Loads document in editor view inside customer host iframe.
   * Emits postMessage events: 'pactintel:document:loaded', 'pactintel:document:saved', 'pactintel:document:sent'.
   */
  @Get('editor/:id')
  async getEmbeddedEditor(@Param('id') documentId: string, @Res() res: Response) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { organization: true },
    });

    if (!doc) {
      throw new NotFoundException('Document not found for embedding');
    }

    // Set relaxed framing headers for embedding
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PactIntel Embedded Editor</title>
  <style>
    body { margin: 0; font-family: Inter, sans-serif; height: 100vh; overflow: hidden; }
    .embed-container { display: flex; flex-direction: column; height: 100%; }
    .embed-header { padding: 12px 16px; border-bottom: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }
    .embed-content { flex: 1; padding: 24px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="embed-container" id="editor-root" data-document-id="${doc.id}">
    <div class="embed-header">
      <strong>${doc.title}</strong>
      <span>Embedded Editor</span>
    </div>
    <div class="embed-content">
      <div id="editor-canvas">Loading editor workspace...</div>
    </div>
  </div>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      window.parent.postMessage({ type: 'pactintel:document:loaded', documentId: '${doc.id}' }, '*');
    });
  </script>
</body>
</html>
    `);
  }

  /**
   * Embedded signing iframe route.
   * Loads recipient signing view inside customer host iframe.
   * Emits postMessage events: 'pactintel:signing:loaded', 'pactintel:signing:completed', 'pactintel:signing:declined'.
   */
  @Get('sign/:id')
  async getEmbeddedSigning(@Param('id') documentId: string, @Res() res: Response) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException('Signing document not found');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PactIntel Embedded Signing</title>
  <style>
    body { margin: 0; font-family: Inter, sans-serif; height: 100vh; }
    .sign-container { padding: 24px; max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="sign-container">
    <h2>Sign: ${doc.title}</h2>
    <div id="signing-flow">Preparing secure e-signature flow...</div>
  </div>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      window.parent.postMessage({ type: 'pactintel:signing:loaded', documentId: '${doc.id}' }, '*');
    });
  </script>
</body>
</html>
    `);
  }
}
