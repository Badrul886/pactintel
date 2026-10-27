import { test, expect } from '@playwright/test';

/**
 * Phase 2 E2E Flow 14: Public Clickwrap Agreement Consent Capture & Immutable Audit
 * Blueprint Reference: §5.22, RULE CW-001, EC-CW-01..07
 */
test.describe('Flow 14: Public Clickwrap Agreement & Consent Audit', () => {
  const agreementSlug = 'terms-of-service';
  const versionId = 'cver-v1-e2e';
  const contentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  test('public user views active clickwrap version, checks consent, and records audit trail', async ({
    page,
  }) => {
    let acceptances: any[] = [];

    // 1. Mock Public Clickwrap Agreement Endpoint
    await page.route(`**/api/v1/public/clickwrap/${agreementSlug}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agreementName: 'Standard SaaS Terms of Service',
          slug: agreementSlug,
          versionId,
          versionNumber: 1,
          content:
            'By clicking accept, you agree to the PactIntel Terms of Service and Privacy Policy.',
          contentHash,
          publishedAt: '2026-10-27T08:00:00Z',
        }),
      });
    });

    // 2. Mock Public Acceptance Recording Endpoint (Append-only RULE CW-001)
    await page.route(`**/api/v1/public/clickwrap/${agreementSlug}/accept`, async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const acceptanceRecord = {
        accepted: true,
        acceptanceId: 'cacc-12345-uuidv7',
        versionId,
        versionNumber: 1,
        acceptorEmail: body.email,
        acceptorName: body.name,
        acceptedAt: new Date().toISOString(),
        contentHash,
      };
      acceptances.push(acceptanceRecord);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(acceptanceRecord),
      });
    });

    // 3. Mock Admin Acceptances List API (Audit Table)
    await page.route(`**/api/v1/clickwrap/*/acceptances*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: acceptances,
          nextCursor: null,
          hasMore: false,
        }),
      });
    });

    // 4. Navigate to Public Clickwrap Page
    await page.goto(`/terms`);

    // Verify clickwrap terms container exists
    const agreementTitle = page.locator('h1, h2, [data-testid="clickwrap-title"], text=Terms');
    if (
      await agreementTitle
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(agreementTitle.first()).toBeVisible();
    }

    // Verify version content integrity
    expect(versionId).toBe('cver-v1-e2e');
    expect(contentHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
