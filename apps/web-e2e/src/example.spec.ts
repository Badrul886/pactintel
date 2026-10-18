import { test, expect } from '@playwright/test';

test.describe('PactIntel Critical Flows', () => {
  test('documents hub renders tabular list with status badges', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('h1')).toContainText('Documents');
    // Verify tabular data rendering (Design System invariant)
    const table = page.locator('table.pact-table');
    await expect(table).toBeVisible();
    await expect(page.locator('.status-badge')).toBeVisible();
  });

  test('recipient page renders document review canvas', async ({ page }) => {
    await page.goto('/d/sample-nda-2026');
    await expect(page.locator('h1')).toContainText('Document Review & Signature');
    await expect(page.getByRole('button', { name: 'Sign Document' })).toBeVisible();
  });
});
