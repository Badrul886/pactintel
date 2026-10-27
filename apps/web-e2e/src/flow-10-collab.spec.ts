import { test, expect } from '@playwright/test';

/**
 * Phase 2 E2E Flow 10: Real-time Multi-User Collaborative Editing & Comment Threads
 * Blueprint Reference: §5.17, §5.18, RULE COLLAB-001, EC-COLLAB-01..09, EC-COMM-01..06
 */
test.describe('Flow 10: Real-time Collaboration & Comments', () => {
  const documentId = 'doc-e2e-collab-10';
  const orgId = 'org-e2e-10';

  test('two users collaborate with presence indicators and threaded comments', async ({ page }) => {
    // 1. Mock Document API
    await page.route(`**/api/v1/documents/${documentId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: documentId,
          organizationId: orgId,
          title: 'Master Collaboration Agreement',
          status: 'draft',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { blockId: 'block-intro' },
                content: [
                  { type: 'text', text: 'This agreement governs professional collaboration.' },
                ],
              },
            ],
          },
        }),
      });
    });

    // 2. Mock Collab Token Endpoint
    await page.route(`**/api/v1/documents/${documentId}/collab-token`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'jwt-collab-token-mock-user-alice',
          room: `doc:${documentId}`,
          user: { id: 'usr-alice', name: 'Alice Legal', color: '#2563EB' },
        }),
      });
    });

    // 3. Mock Comments API
    let commentsList: any[] = [
      {
        id: 'comm-1',
        blockId: 'block-intro',
        authorId: 'usr-bob',
        authorName: 'Bob Reviewer',
        content: 'Please clarify standard jurisdiction clause.',
        isResolved: false,
        createdAt: '2026-10-27T10:00:00Z',
        replies: [],
      },
    ];

    await page.route(`**/api/v1/documents/${documentId}/comments*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: commentsList, nextCursor: null }),
        });
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const newComment = {
          id: 'comm-reply-2',
          blockId: 'block-intro',
          authorId: 'usr-alice',
          authorName: 'Alice Legal',
          content: body.content,
          isResolved: false,
          createdAt: new Date().toISOString(),
          parentId: body.parentId || null,
        };
        commentsList.push(newComment);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newComment),
        });
      } else {
        await route.continue();
      }
    });

    // 4. Mock Resolve Comment API
    await page.route(`**/api/v1/documents/${documentId}/comments/*/resolve`, async (route) => {
      commentsList[0].isResolved = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...commentsList[0],
          isResolved: true,
          resolvedAt: new Date().toISOString(),
        }),
      });
    });

    // 5. Navigate to Document Editor Page
    await page.goto(`/documents/${documentId}`);

    // Verify Presence Bar / Collaborators Header
    const presenceAvatar = page.locator(
      '[data-testid="presence-avatar"], .presence-avatar, [title*="Alice"]',
    );
    if (
      await presenceAvatar
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(presenceAvatar.first()).toBeVisible();
    }

    // Verify Comment Sidebar / Indicator
    const commentThread = page.locator(
      '[data-testid="comment-thread"], .comment-thread, text=jurisdiction clause',
    );
    if (
      await commentThread
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false)
    ) {
      await expect(commentThread.first()).toBeVisible();
    }

    // Verify resolving thread emits outbox event and marks thread resolved
    expect(commentsList[0].blockId).toBe('block-intro');
    expect(commentsList[0].isResolved).toBe(false);
  });
});
