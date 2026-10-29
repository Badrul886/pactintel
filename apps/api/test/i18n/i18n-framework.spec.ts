import {
  getMessages,
  resolveLocale,
  formatMessage,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from '@pactintel/i18n';
import { NotificationService } from '../../src/modules/notification/notification.service';

describe('i18n Multi-Language Framework (RULE I18N-001 & I18N-002)', () => {
  it('supports all 5 required Phase 3 locales with native names', () => {
    const codes = SUPPORTED_LOCALES.map((l: any) => l.code);
    expect(codes).toContain('en-US');
    expect(codes).toContain('fr-FR');
    expect(codes).toContain('de-DE');
    expect(codes).toContain('es-ES');
    expect(codes).toContain('pt-BR');
    expect(codes.length).toBe(5);
  });

  it('retrieves distinct translated strings for each supported locale', () => {
    const en = getMessages('en-US');
    const fr = getMessages('fr-FR');
    const de = getMessages('de-DE');
    const es = getMessages('es-ES');
    const pt = getMessages('pt-BR');

    expect(en['nav.documents']).toBe('Documents');
    expect(fr['nav.documents']).toBe('Documents');
    expect(de['nav.documents']).toBe('Dokumente');
    expect(es['nav.documents']).toBe('Documentos');
    expect(pt['nav.documents']).toBe('Documentos');

    expect(en['common.sign']).toBe('Sign Document');
    expect(fr['common.sign']).toBe('Signer le document');
    expect(de['common.sign']).toBe('Dokument signieren');
    expect(es['common.sign']).toBe('Firmar documento');
    expect(pt['common.sign']).toBe('Assinar Documento');
  });

  it('falls back to default en-US for unsupported locale', () => {
    const msgs = getMessages('ja-JP');
    expect(msgs).toEqual(getMessages(DEFAULT_LOCALE));
  });

  it('resolves Accept-Language headers to the closest supported locale', () => {
    expect(resolveLocale('fr-CH, fr;q=0.9, en;q=0.8')).toBe('fr-FR');
    expect(resolveLocale('de-DE, de;q=0.9')).toBe('de-DE');
    expect(resolveLocale('es-MX, es;q=0.8')).toBe('es-ES');
    expect(resolveLocale('pt-BR, pt;q=0.9')).toBe('pt-BR');
    expect(resolveLocale('en-GB, en;q=0.7')).toBe('en-US');
    expect(resolveLocale('zh-CN, zh;q=0.5')).toBe('en-US'); // Fallback
    expect(resolveLocale(undefined)).toBe('en-US');
  });

  it('interpolates variables into messages correctly', () => {
    const template = 'Hello {name}, your contract {docId} is ready for {action}.';
    const result = formatMessage(template, {
      name: 'Alice',
      docId: 'DOC-123',
      action: 'signature',
    });
    expect(result).toBe('Hello Alice, your contract DOC-123 is ready for signature.');
  });

  it('renders localized email content through NotificationService', () => {
    const notifService = new NotificationService({} as any, {} as any);

    const enEmail = notifService.renderEmailContent('signing-invitation', 'en-US', {
      documentTitle: 'MSA 2026',
      senderName: 'Acme Corp',
    });
    expect(enEmail.subject).toBe('Signature requested: MSA 2026');
    expect(enEmail.body).toContain('Acme Corp has invited you to sign MSA 2026.');

    const frEmail = notifService.renderEmailContent('signing-invitation', 'fr-FR', {
      documentTitle: 'Accord Cadre',
      senderName: 'Société Générale',
    });
    expect(frEmail.subject).toBe('Signature demandée : Accord Cadre');
    expect(frEmail.body).toContain('Société Générale vous a invité à signer Accord Cadre.');

    const deEmail = notifService.renderEmailContent('document-signed', 'de-DE', {
      documentTitle: 'Dienstleistungsvertrag',
    });
    expect(deEmail.subject).toBe('Dokument abgeschlossen: Dienstleistungsvertrag');
  });
});
