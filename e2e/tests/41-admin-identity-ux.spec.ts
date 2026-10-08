import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UserSummary = {
  readonly id: string;
  readonly email: string;
  readonly mfa: string;
  readonly policyPackKey: string | null;
  readonly policyPackSource: string;
  readonly policyPackDisabled: boolean;
};

type UnitNode = {
  readonly id: string;
  readonly children?: readonly UnitNode[];
};

type GroupListItem = {
  readonly id: string;
  readonly name: string;
  readonly routingRuleCount?: number;
};

function firstUnitId(tree: readonly UnitNode[]): string | null {
  const queue = [...tree];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    if (node.id.length > 0) return node.id;
    queue.push(...(node.children ?? []));
  }
  return null;
}

/**
 * Paket 5.3.2 (§4.3 + §4.4): the admin identity screens. The users summary has
 * to state MFA and policy-pack reality without leaking anything, and the group
 * card has to open its work (edit + members) in the right-hand drawer, closing
 * on Escape, with one confirmation for a deletion.
 */
test.describe('41 admin identity UX (5.3.2)', () => {
  test('user summary reports MFA and policy-pack state without secrets', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);

    const users = await admin.requestJson<readonly UserSummary[]>(
      `/users?q=${encodeURIComponent(env.superAdminEmail)}&take=10`,
    );
    const superAdmin = users.find(
      (user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase(),
    );
    if (superAdmin === undefined) {
      throw new Error('[e2e] configured SuperAdmin was not found in the users list.');
    }

    expect(['enabled', 'disabled', 'not_applicable']).toContain(superAdmin.mfa);
    expect(['organizational_unit', 'none']).toContain(superAdmin.policyPackSource);
    expect(typeof superAdmin.policyPackDisabled).toBe('boolean');
    // A pack can only be reported as inactive when a pack is reported at all.
    if (superAdmin.policyPackKey === null) {
      expect(superAdmin.policyPackDisabled).toBe(false);
    }
    // §4.4: state only — the summary must never carry an MFA secret.
    expect(JSON.stringify(superAdmin)).not.toMatch(/secret|otpauth|recoveryCode/i);
  });

  test('group drawer holds edit and members, and closes on Escape', async ({ page }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);

    const tree = await admin.requestJson<readonly UnitNode[]>('/organizational-units/tree');
    const unitId = firstUnitId(tree);
    if (unitId === null) {
      throw new Error('[e2e] no organizational unit is available for the group drawer test.');
    }
    const groups = await admin.requestJson<readonly GroupListItem[]>('/groups');
    const existing = groups[0];
    let createdGroupId: string | null = null;

    try {
      // Reuse a group when the installation has one; otherwise create a
      // disposable one and clean it up at the end.
      if (existing === undefined) {
        const created = await admin.requestJson<GroupListItem>('/groups', {
          method: 'POST',
          body: JSON.stringify({
            name: `E2E 5.3.2 drawer ${Date.now().toString(36)}`,
            organizationalUnitId: unitId,
          }),
        });
        createdGroupId = created.id;
      }
      const target = existing ?? { id: createdGroupId as string, name: '' };

      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto('/admin?tab=groups');

      const card = page.getByTestId(`group-card-${target.id}`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      // The card's own row button opens the drawer on the members tab; the
      // button labels are translated, so the spec stays on the test id.
      await card.locator('button').first().click();

      const drawer = page.getByTestId('group-detail-drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('tab')).toHaveCount(2);

      // D13/§4.3: Escape closes the drawer like every other floating surface.
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
    } finally {
      if (createdGroupId !== null) {
        const response = await admin.request(`/groups/${createdGroupId}`, {
          method: 'DELETE',
        });
        if (!response.ok && response.status !== 404) {
          console.warn(`[e2e] cleanup of group ${createdGroupId} returned HTTP ${response.status}`);
        }
      }
    }
  });
});
