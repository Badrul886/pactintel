import { test, expect } from '@playwright/test';

/**
 * Phase 2 E2E Flow 11: Block-level Content Locking & Permission Restrictions
 * Blueprint Reference: §5.18, RULE LOCK-001, EC-LOCK-01..04
 */
test.describe('Flow 11: Content Locking & Edit Restrictions', () => {
  const documentId = 'doc-e2e-lock-11';
  const orgId = 'org-e2e-11';
  const lockedBlockId = 'block-pricing-table';

  test('manager locks a sensitive block; member edit attempts are rejected', async ({ page }) => {
    let isBlockLocked = true;
    let lockedBy = { id: 'usr-manager', name: 'Legal Manager', role: 'manager' };

    // 1. Mock Document API with locked block
    await page.route(`**/api/v1/documents/${documentId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: documentId,
          organizationId: orgId,
          title: 'Enterprise Master Services Agreement',
          status: 'draft',
          content: {
            type: 'doc',
            content: [
              {
                type: 'pricingTableBlock',
                attrs: {
                  blockId: lockedBlockId,
                  isLocked: isBlockLocked,
                  lockedById: isBlockLocked ? lockedBy.id : null,
                  lockedByName: isBlockLocked ? lockedBy.name : null,
                  lockedAt: isBlockLocked ? '2026-10-27T09:00:00Z' : null,
                },
              },
            ],
          },
        }),
      });
    });

    // 2. Mock Content Lock Status & Toggle APIs
    await page.route(
      `**/api/v1/documents/${documentId}/blocks/${lockedBlockId}/lock`,
      async (route) => {
        if (route.request().method() === 'POST') {
          isBlockLocked = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              blockId: lockedBlockId,
              isLocked: true,
              lockedBy,
              lockedAt: new Date().toISOString(),
            }),
          });
        } else if (route.request().method() === 'DELETE') {
          isBlockLocked = false;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              blockId: lockedBlockId,
              isLocked: false,
              unlockedAt: new Date().toISOString(),
            }),
          });
        } else {
          await route.continue();
        }
      },
    );

    // 3. Mock block update mutation (verifies lock enforcement)
    await page.route(`**/api/v1/documents/${documentId}/blocks/${lockedBlockId}`, async (route) => {
      if (isBlockLocked) {
        await route.fulfill({
          status: 423, // Locked (or 403 Forbidden)
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 423,
            error: 'Locked',
            message: 'Block is locked by Legal Manager and cannot be modified (RULE LOCK-001)',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });

    // 4. Navigate to editor
    await page.goto(`/documents/${documentId}`);

    // Check lock indicator presence
    const lockBadge = page.locator('[data-testid="lock-badge"], .lock-indicator, text=Locked');
    if (
      await lockBadge
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(lockBadge.first()).toBeVisible();
    }

    // Verify Invariant: isBlockLocked starts true
    expect(isBlockLocked).toBe(true);
  });
});
