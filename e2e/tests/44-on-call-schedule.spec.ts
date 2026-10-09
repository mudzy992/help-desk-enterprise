import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type OverviewGroup = {
  readonly groupId: string;
  readonly groupName: string;
  readonly hasSchedule: boolean;
};

type GroupDetail = {
  readonly candidates: ReadonlyArray<{ readonly userId: string; readonly displayName: string }>;
};

type UnitNode = {
  readonly id: string;
  readonly children?: readonly UnitNode[];
};

function tomorrowDate(): string {
  const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/**
 * 5.3.7 (§4.7 — dežurstva): main flows — a rotation schedule exists, the
 * group card stops reading "without schedule", the week detail lists the
 * rotation member, and the screen stays usable at a phone width. The rotation
 * member must come from the group's own candidate list (active staff members
 * of that group — the server rejects everyone else), the group must be one
 * WITHOUT an existing schedule (a PUT would replace a real rotation), and the
 * created schedule is deleted again in `finally`.
 */
test.describe('44 on-call schedules (5.3.7)', () => {
  test('schedule is visible on the overview, in the week detail and on mobile', async ({ page }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);

    const { groupId, groupName, memberId, memberName } = await test.step('pick a free group and a rotation member', async () => {
      const overview = await api.requestJson<{ readonly groups: readonly OverviewGroup[] }>('/on-call/overview');
      const free = overview.groups.find((group) => !group.hasSchedule);
      if (free === undefined) {
        throw new Error(
          '[e2e] every group already has an on-call schedule; free one up or run this test against a clean group — the test refuses to overwrite real rotations.',
        );
      }
      const range = new URLSearchParams({
        from: new Date().toISOString(),
        to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).toString();
      const detail = await api.requestJson<GroupDetail>(`/on-call/groups/${encodeURIComponent(free.groupId)}?${range}`);
      const candidate = detail.candidates[0];
      if (candidate === undefined) {
        throw new Error(
          `[e2e] the group "${free.groupName}" has no eligible rotation members (active staff in the group); add one before running this test.`,
        );
      }
      return { groupId: free.groupId, groupName: free.groupName, memberId: candidate.userId, memberName: candidate.displayName };
    });

    await test.step('create a weekly rotation starting tomorrow', async () => {
      await api.requestJson<{ readonly id: string }>(`/on-call/groups/${encodeURIComponent(groupId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          timezone: 'Europe/Sarajevo',
          handoffTime: '09:00',
          rotationLength: 'WEEK',
          rotationStartDate: tomorrowDate(),
          isActive: true,
          autoAssignOutsideHours: false,
          ownerUserId: null,
          memberUserIds: [memberId],
          reason: 'E2E 5.3.7 on-call setup',
        }),
      });
    });

    try {
      await test.step('sign in and open the overview', async () => {
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/on-call');
        const card = page.getByTestId('on-call-group').filter({ hasText: groupName }).first();
        await expect(card).toBeVisible();
        await expect(card).not.toContainText(/Bez rasporeda|No schedule/i);
      });

      await test.step('the week detail lists the rotation member', async () => {
        await page.getByTestId('on-call-group').filter({ hasText: groupName }).first().click();
        const members = page.locator('section[aria-labelledby="on-call-rotation"]');
        await expect(members).toBeVisible();
        await expect(members).toContainText(memberName);
      });

      await test.step('the overview stays usable at a phone width', async () => {
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto('/on-call');
        await expect(page.getByTestId('on-call-group').filter({ hasText: groupName }).first()).toBeVisible();
      });
    } finally {
      const response = await api.request(`/on-call/groups/${encodeURIComponent(groupId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'E2E 5.3.7 cleanup' }),
      });
      if (!response.ok && response.status !== 404) {
        console.warn(`[e2e] cleanup of the on-call schedule returned HTTP ${response.status}`);
      }
    }
  });

  test('the organizational unit tree endpoint the overview relies on responds', async () => {
    test.setTimeout(60_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<readonly UnitNode[]>('/organizational-units/tree');
    expect(Array.isArray(tree)).toBe(true);
    const overview = await api.requestJson<{ readonly groups: readonly unknown[] }>('/on-call/overview');
    expect(Array.isArray(overview.groups)).toBe(true);
  });
});
