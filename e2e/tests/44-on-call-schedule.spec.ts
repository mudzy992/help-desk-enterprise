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

type GroupResponse = {
  readonly members: ReadonlyArray<{ readonly userId: string }>;
};

type UserSummary = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
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
 * rotation member, and the screen stays usable at a phone width. The test
 * only touches a group WITHOUT an existing schedule (a PUT would replace a
 * real rotation). Rotation members must be active staff members of the
 * group, so if the free group is empty the test adds the super admin to it
 * through the same API the UI uses and removes them again in `finally`.
 */
test.describe('44 on-call schedules (5.3.7)', () => {
  test('schedule is visible on the overview, in the week detail and on mobile', async ({ page }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(30_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);

    const { groupId, groupName, memberId, memberName, addedSuperAdminAsMember } = await test.step(
      'pick a free group and a rotation member',
      async () => {
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
        let member = detail.candidates[0];
        let added = false;
        if (member === undefined) {
          // An empty free group is normal; the super admin becomes a member
          // for the duration of the test (restored in `finally`).
          const users = await api.requestJson<readonly UserSummary[]>('/users');
          const me = users.find((user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase());
          if (me === undefined || !me.isActive) throw new Error('[e2e] the super admin must exist and be active.');
          const group = await api.requestJson<GroupResponse>(`/groups/${encodeURIComponent(free.groupId)}`);
          if (group.members.some((entry) => entry.userId === me.id)) {
            throw new Error('[e2e] the group reports no candidates but lists the super admin as a member — check their staff role.');
          }
          await api.requestJson(`/groups/${encodeURIComponent(free.groupId)}/members/${encodeURIComponent(me.id)}`, {
            method: 'POST',
          });
          member = { userId: me.id, displayName: me.displayName };
          added = true;
        }
        return {
          groupId: free.groupId,
          groupName: free.groupName,
          memberId: member.userId,
          memberName: member.displayName,
          addedSuperAdminAsMember: added,
        };
      },
    );

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
      if (addedSuperAdminAsMember) {
        // Undo the temporary membership so the group looks untouched.
        const removed = await api.request(
          `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
          { method: 'DELETE' },
        );
        if (!removed.ok && removed.status !== 404) {
          console.warn(`[e2e] cleanup of the temporary group membership returned HTTP ${removed.status}`);
        }
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
