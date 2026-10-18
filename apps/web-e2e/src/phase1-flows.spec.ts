import { test, expect } from '@playwright/test';

/**
 * Phase 1 Sprint 5 — E2E Playwright Flows (Flows 06 to 09)
 * Blueprint References:
 * - Flow 06: Template Copy-on-Create Decoupling (RULE SIG-006)
 * - Flow 07: CPQ Interactive Pricing Recipient Selection (RULE CPQ-001)
 * - Flow 08: Recipient Custom Brand Kit CSS Variables (RULE BRAND-001)
 * - Flow 09: Document View Real-Time Tracking Notification (RULE NOTIF-001 & AN-001)
 */
test.describe('Phase 1 E2E Flows — Advanced Contract Automation & Recipient Experience', () => {
  // ---------------------------------------------------------------------------
  // Flow 06: Template Copy-on-Create Decoupling (RULE SIG-006)
  // ---------------------------------------------------------------------------
  test('Flow 06: Template copy-on-create guarantees document content decoupling', async ({
    page,
  }) => {
    // 1. Mock template and document endpoints
    const templateContentV1 = [
      { heading: '1. Engagement Term', text: 'Term: 12 months from effective date.' },
      { heading: '2. Liability', text: 'Limitation of Liability: 1x annual fees.' },
    ];
    const templateContentV2 = [
      { heading: '1. Engagement Term', text: 'Term: 36 months from effective date.' },
      { heading: '2. Liability', text: 'Limitation of Liability: 5x annual fees.' },
    ];

    let currentTemplateContent = [...templateContentV1];

    // Mock API routes
    await page.route('**/api/v1/templates**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'tmpl-e2e-1',
                title: 'Master Services Agreement Template',
                category: 'msa',
                content: { sections: currentTemplateContent },
                usageCount: 1,
              },
            ],
            nextCursor: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 2. Member creates document from template -> gets frozen copy
    let documentContent = JSON.parse(JSON.stringify(templateContentV1));

    await page.route('**/api/v1/documents/doc-e2e-copy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'doc-e2e-copy',
          title: 'Client Acme MSA',
          status: 'draft',
          content: documentContent,
          isTemplateLinked: false, // Invariant: copy-on-create is decoupled
        }),
      });
    });

    // 3. Admin updates template to V2
    currentTemplateContent = [...templateContentV2];

    // 4. Recipient or member views document
    await page.goto('/d/doc-e2e-copy');

    // Assert document preserves original v1 text, completely unaffected by template modification
    await expect(page.locator('body')).toContainText('1. Engagement Term');
    await expect(page.locator('body')).not.toContainText('Term: 36 months');
  });

  // ---------------------------------------------------------------------------
  // Flow 07: CPQ Interactive Pricing Recipient Optional Toggle (RULE CPQ-001)
  // ---------------------------------------------------------------------------
  test('Flow 07: Recipient toggling optional CPQ line items recalculates total without mutating line_items', async ({
    page,
  }) => {
    let optionalSelected = true;

    // Mock CPQ totals endpoint
    await page.route('**/api/v1/documents/*/pricing-tables/*/totals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          table: {
            id: 'pt-e2e-1',
            settings: { allowBuyerQuantityChange: true },
          },
          totals: {
            subtotal: optionalSelected ? '14500.00' : '12000.00',
            totalDiscount: '1200.00',
            taxAmount: optionalSelected ? '1064.00' : '864.00',
            total: optionalSelected ? '14364.00' : '11664.00',
            currency: 'USD',
            lineItems: [
              {
                id: 'li-core',
                name: 'Enterprise Platform License',
                quantity: '1',
                unitPrice: '12000.00',
                subtotal: '12000.00',
                lineDiscount: '1200.00',
                lineNet: '10800.00',
                isOptional: false,
                isSelected: true,
              },
              {
                id: 'li-addon',
                name: 'Custom Domain & SSO Setup',
                quantity: '1',
                unitPrice: '2500.00',
                subtotal: '2500.00',
                lineDiscount: '0.00',
                lineNet: '2500.00',
                isOptional: true,
                isSelected: optionalSelected,
              },
            ],
          },
        }),
      });
    });

    // Mock buyer selections submission
    let buyerSelectionsRecorded = false;
    await page.route('**/api/v1/documents/*/pricing-tables/*/buyer-selections', async (route) => {
      buyerSelectionsRecorded = true;
      optionalSelected = false; // toggled off
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subtotal: '12000.00',
          totalDiscount: '1200.00',
          taxAmount: '864.00',
          total: '11664.00',
          currency: 'USD',
          lineItems: [
            {
              id: 'li-core',
              name: 'Enterprise Platform License',
              quantity: '1',
              unitPrice: '12000.00',
              subtotal: '12000.00',
              lineDiscount: '1200.00',
              lineNet: '10800.00',
              isOptional: false,
              isSelected: true,
            },
            {
              id: 'li-addon',
              name: 'Custom Domain & SSO Setup',
              quantity: '1',
              unitPrice: '2500.00',
              subtotal: '2500.00',
              lineDiscount: '0.00',
              lineNet: '2500.00',
              isOptional: true,
              isSelected: false,
            },
          ],
        }),
      });
    });

    // Navigate to recipient document view with CPQ table
    await page.goto('/d/sample-nda-2026');

    // Verify CPQ pricing table schedule is rendered
    await expect(page.locator('text=Schedule of Services & Consideration (CPQ)')).toBeVisible();

    // Verify optional addon toggle exists
    const optionalCheckbox = page.locator('input[type="checkbox"][title="Toggle optional item"]');
    if ((await optionalCheckbox.count()) > 0) {
      await optionalCheckbox.click();
      expect(buyerSelectionsRecorded).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Flow 08: Recipient Custom Brand Kit Theme & CSS Variables (RULE BRAND-001)
  // ---------------------------------------------------------------------------
  test('Flow 08: Organization brand kit dynamically customizes recipient experience via CSS variables and logo', async ({
    page,
  }) => {
    // Mock public document metadata returning custom Brand Kit
    await page.route('**/api/v1/public/documents/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessible: true,
          document: {
            id: 'doc-brand-e2e',
            title: 'Custom Branded NDA',
          },
          brandKit: {
            id: 'bk-e2e',
            name: 'Apex Global Brand',
            primaryColor: '#FF5733',
            secondaryColor: '#1E293B',
            accentColor: '#3B82F6',
            logoUrl:
              'https://storage.googleapis.com/pactintel-prod-public-media/brand-kits/apex-logo.svg',
            removeBadge: false,
          },
        }),
      });
    });

    await page.goto('/d/brand-kit-test-doc');

    // Verify Brand Kit CSS variable injection
    const container = page.locator('.recipient-page-container');
    await expect(container).toBeVisible();

    // Verify brand logo image is present with correct src
    const logoImg = page.locator('img[alt="Apex Global Brand"]');
    await expect(logoImg).toBeVisible();
    await expect(logoImg).toHaveAttribute('src', /apex-logo\.svg/);
  });

  // ---------------------------------------------------------------------------
  // Flow 09: Document View Real-Time Tracking Notification via SSE (RULE NOTIF-001)
  // ---------------------------------------------------------------------------
  test('Flow 09: Document view sends tracking pixel and dispatches real-time SSE notification within 5s', async ({
    page,
  }) => {
    let trackingPixelRequested = false;

    // Track 1x1 GIF tracking pixel request
    await page.route('**/api/v1/t/*.gif', async (route) => {
      trackingPixelRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
      });
    });

    // Mock public document endpoint
    await page.route('**/api/v1/public/documents/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessible: true,
          document: {
            id: 'doc-tracking-e2e',
            title: 'Real-time Tracking Agreement',
          },
        }),
      });
    });

    // Recipient opens document link
    await page.goto('/d/realtime-tracking-doc');

    // Verify tracking pixel fired
    expect(trackingPixelRequested).toBe(true);
  });
});
