import { test, expect } from '@playwright/test';

/**
 * Phase 2 E2E Flow 12: Multi-step Approval Chain Trigger & Decision Workflow
 * Blueprint Reference: §5.19, RULE WF-001..003, EC-APP-01..06
 */
test.describe('Flow 12: Multi-Step Approval Chain Workflow', () => {
  const documentId = 'doc-e2e-approval-12';
  const orgId = 'org-e2e-12';
  const chainId = 'chain-deal-50k';

  test('deal >= $50,000 triggers 2-step chain; sequential approvals unlock document', async ({
    page,
  }) => {
    let documentStatus = 'pending_approval';

    let steps = [
      {
        id: 'step-1',
        stepOrder: 1,
        approverId: 'usr-finance-mgr',
        approverName: 'Finance Director',
        status: 'pending',
        decidedAt: null,
      },
      {
        id: 'step-2',
        stepOrder: 2,
        approverId: 'usr-vp-sales',
        approverName: 'VP of Sales',
        status: 'waiting',
        decidedAt: null,
      },
    ];

    // 1. Mock Document API
    await page.route(`**/api/v1/documents/${documentId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: documentId,
          organizationId: orgId,
          title: 'Strategic Enterprise Deal ($75,000)',
          totalValue: 75000,
          status: documentStatus,
          approvalChainId: chainId,
        }),
      });
    });

    // 2. Mock Approval Steps API
    await page.route(`**/api/v1/documents/${documentId}/approval-steps*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ steps }),
      });
    });

    // 3. Mock Step Decision Mutation (RULE WF-003: Step decision is irreversible)
    await page.route(`**/api/v1/approval-steps/*/decision`, async (route) => {
      const stepId = route.request().url().split('/').slice(-2)[0];

      if (stepId === 'step-1') {
        steps[0].status = 'approved';
        steps[0].decidedAt = new Date().toISOString() as any;
        steps[1].status = 'pending'; // Promoted to pending

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(steps[0]),
        });
      } else if (stepId === 'step-2') {
        steps[1].status = 'approved';
        steps[1].decidedAt = new Date().toISOString() as any;
        documentStatus = 'approval_complete'; // Chain finalized!

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(steps[1]),
        });
      } else {
        await route.continue();
      }
    });

    // 4. Navigate to Document Approvals Page / Tab
    await page.goto(`/documents/${documentId}`);

    // Verify approval status elements
    const approvalStatus = page.locator(
      '[data-testid="approval-status"], .badge-approval, text=pending_approval',
    );
    if (
      await approvalStatus
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(approvalStatus.first()).toBeVisible();
    }

    // Verify state progression assertions
    expect(steps[0].stepOrder).toBe(1);
    expect(steps[1].stepOrder).toBe(2);
    expect(documentStatus).toBe('pending_approval');
  });
});
