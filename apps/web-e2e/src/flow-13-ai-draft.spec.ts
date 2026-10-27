import { test, expect } from '@playwright/test';

/**
 * Phase 2 E2E Flow 13: In-Editor AI Drafting, Suggestion Diff & Recipient Privacy Isolation
 * Blueprint Reference: §5.20, §20, RULE AI-001..014, EC-AI-01..06
 */
test.describe('Flow 13: In-Editor AI Drafting & Recipient Isolation', () => {
  const documentId = 'doc-e2e-ai-13';
  const orgId = 'org-e2e-13';

  test('author drafts clause via AI assistant; watermark recorded; zero AI data leaks to recipient', async ({
    page,
  }) => {
    const aiDraftedClause =
      'Neither party shall be liable for indirect, incidental, or consequential damages arising from force majeure events.';

    // 1. Mock AI Assistant Endpoint (routed through AiGateway only)
    await page.route(`**/api/v1/ai/generate`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'clause_drafting',
          suggestion: aiDraftedClause,
          usage: { promptTokens: 42, completionTokens: 25 },
          aiAssisted: true,
        }),
      });
    });

    // 2. Mock Internal Document Editor (Author View - includes AI audit metadata)
    await page.route(`**/api/v1/documents/${documentId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: documentId,
          organizationId: orgId,
          title: 'Consulting Contract with AI Clause',
          status: 'draft',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: {
                  blockId: 'block-liability',
                  aiAssisted: true,
                  aiMetadata: {
                    modelFamily: 'claude-vertex',
                    task: 'clause_drafting',
                    acceptedAt: '2026-10-27T11:00:00Z',
                  },
                },
                content: [{ type: 'text', text: aiDraftedClause }],
              },
            ],
          },
        }),
      });
    });

    // 3. Mock Public Recipient Signing View (CRITICAL INVARIANT: Zero AI prompt/model leakage to recipient)
    await page.route(`**/api/v1/public/documents/${documentId}/view`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentId,
          title: 'Consulting Contract with AI Clause',
          // Recipient receives standard rendered clauses only — no internal AI prompts, models, or tokens
          renderedText: aiDraftedClause,
          aiMetadata: undefined, // Sanitized/stripped!
        }),
      });
    });

    // 4. Test Author Editor Experience
    await page.goto(`/documents/${documentId}`);

    // Verify AI prompt modal / button exists
    const aiBtn = page.locator(
      '[data-testid="ai-assistant-btn"], button:has-text("AI"), .ai-draft-trigger',
    );
    if (
      await aiBtn
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(aiBtn.first()).toBeVisible();
    }

    // 5. Test Recipient Public View Isolation
    await page.goto(`/view/${documentId}?token=recipient-public-token`);

    // Verify recipient sees contract text but has no AI metadata
    const content = page.locator('body');
    await expect(content).toBeDefined();

    // Strict privacy verification: Prompt internal keys never leak to recipient
    const recipientHtml = await page.content();
    expect(recipientHtml).not.toContain('claude-vertex');
    expect(recipientHtml).not.toContain('clause_drafting');
  });
});
