import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { assertDisposableTestAccount } from '../helpers/disposable-account';
import { readE2EEnvironment } from '../helpers/environment';

type UnitNode = {
  readonly id: string;
  readonly distinguishedName: string;
  readonly children?: readonly UnitNode[];
};

type UnitDetail = {
  readonly id: string;
  readonly distinguishedName: string;
  readonly children: readonly UnitDetail[];
  readonly users: readonly unknown[];
};

type UserSummary = {
  readonly id: string;
  readonly email: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly roleKey: string | null;
};
type CreatedUser = {
  readonly user: UserSummary;
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: 'ui' | 'email';
};
type UserRole = { readonly id: string; readonly roleKey: string };
type Group = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly organizationalUnitId?: string | null;
};
type ApiFailure = { readonly code?: string; readonly message?: string };
type AuditRecord = {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly requestId: string | null;
  readonly metadata: unknown;
};
type AuditPage = { readonly items: readonly AuditRecord[]; readonly nextCursor: string | null };

const newSuffix = () => `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
const disposableLocalUserPassword = 'N7!Kamen-Opseg-2026-Qx';

async function createLocalUser(
  admin: ApiClient,
  input: {
    readonly email: string;
    readonly displayName: string;
    readonly roleKey: string;
    readonly organizationalUnitId?: string;
    readonly password: string;
  },
): Promise<string> {
  assertDisposableTestAccount(input.email, 'create a local account');
  const created = await admin.requestJson<CreatedUser>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      roleKey: input.roleKey,
      organizationalUnitId: input.organizationalUnitId,
    }),
  });
  try {
    if (created.temporaryPassword === null) {
      throw new Error(
        `[e2e] temporary password for ${input.email} was delivered by email; ` +
          `this test requires a reserved e2e.*@example.com address (delivery=${created.temporaryPasswordDelivery}).`,
      );
    }
    const temporaryLogin = await new ApiClient().requestJson<{
      readonly status?: string;
      readonly passwordChangeToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: input.email, password: created.temporaryPassword }),
    });
    if (
      temporaryLogin.status !== 'MUST_CHANGE_PASSWORD' ||
      temporaryLogin.passwordChangeToken === undefined
    ) {
      throw new Error(`[e2e] expected forced password change for ${input.email}`);
    }
    const passwordChange = new ApiClient();
    passwordChange.setBearerToken(temporaryLogin.passwordChangeToken);
    await passwordChange.requestJson('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: input.password }),
    });
    return created.user.id;
  } catch (error) {
    await deleteIfPresent(admin, `/users/${created.user.id}`);
    throw error;
  }
}

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

async function deleteIfPresent(
  api: ApiClient,
  path: string | null,
): Promise<void> {
  if (path === null) return;
  try {
    const response = await api.request(path, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      console.warn(`[e2e] cleanup ${path} returned HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`[e2e] cleanup ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function responseFailure(response: Response): Promise<ApiFailure> {
  try {
    return (await response.json()) as ApiFailure;
  } catch {
    return {};
  }
}

/** Lists every user because the final-SuperAdmin race is safe only in isolation. */
async function listAllUsers(api: ApiClient): Promise<readonly UserSummary[]> {
  const pageSize = 500;
  const users: UserSummary[] = [];
  let total = Number.POSITIVE_INFINITY;

  while (users.length < total) {
    const response = await api.request(
      `/users?take=${pageSize}&skip=${users.length}`,
    );
    if (!response.ok) {
      throw new Error(
        `[e2e] listing users for the SuperAdmin preflight returned HTTP ${response.status}.`,
      );
    }
    const totalHeader = response.headers.get('X-Total-Count');
    if (totalHeader === null) {
      throw new Error('[e2e] the users API omitted X-Total-Count during the SuperAdmin preflight.');
    }
    total = Number(totalHeader);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error(
        `[e2e] invalid X-Total-Count during the SuperAdmin preflight: ${totalHeader}.`,
      );
    }
    const page = (await response.json()) as readonly UserSummary[];
    if (page.length === 0 && users.length < total) {
      throw new Error('[e2e] the users API returned an empty page before reaching X-Total-Count.');
    }
    users.push(...page);
  }

  return users;
}

/** Paket 5.2.1: role/scope boundaries, request-linked bypass audit, and user lifecycle. */
test.describe('38 users, groups, and RBAC (5.2.1 M3 B5–B7 / M4 B3–B5)', () => {
  test('OU-scoped admins cannot enumerate or mutate another OU; SuperAdmin bypass is request-audited', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const superAdminUsers = await admin.requestJson<readonly UserSummary[]>(
      `/users?q=${encodeURIComponent(env.superAdminEmail)}&take=10`,
    );
    const superAdmin = superAdminUsers.find(
      (user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase(),
    );
    if (superAdmin === undefined) throw new Error('Configured SuperAdmin was not found through the users API.');
    const tree = await admin.requestJson<readonly UnitNode[]>('/organizational-units/tree');
    const parentId = firstUnitId(tree);
    if (parentId === null) throw new Error('No parent OU is available for the group-scope E2E.');
    const parent = await admin.requestJson<UnitDetail>(`/organizational-units/${parentId}`);
    const suffix = newSuffix();
    let ouAId: string | null = null;
    let ouBId: string | null = null;
    let groupAId: string | null = null;
    let groupBId: string | null = null;
    let scopedCreatedGroupId: string | null = null;
    let scopedForbiddenGroupId: string | null = null;
    let scopedAdminId: string | null = null;
    let inactiveUserId: string | null = null;

    try {
      const createUnit = async (letter: 'A' | 'B'): Promise<UnitDetail> =>
        admin.requestJson<UnitDetail>('/organizational-units', {
          method: 'POST',
          body: JSON.stringify({
            name: `E2E-${suffix}-${letter}`,
            type: 'BRANCH',
            distinguishedName: `OU=E2E-${suffix}-${letter},${parent.distinguishedName}`,
            parentId,
          }),
        });
      const ouA = await createUnit('A');
      ouAId = ouA.id;
      const ouB = await createUnit('B');
      ouBId = ouB.id;

      const createGroup = async (letter: 'A' | 'B', organizationalUnitId: string): Promise<Group> =>
        admin.requestJson<Group>('/groups', {
          method: 'POST',
          body: JSON.stringify({
            name: `E2E ${suffix} Group ${letter}`,
            organizationalUnitId,
          }),
        });
      const groupA = await createGroup('A', ouA.id);
      groupAId = groupA.id;
      const groupB = await createGroup('B', ouB.id);
      groupBId = groupB.id;

      const scopedEmail = `e2e.group-admin-${suffix}@example.com`;
      scopedAdminId = await createLocalUser(admin, {
        email: scopedEmail,
        displayName: `E2E Group Admin ${suffix}`,
        roleKey: 'ADMIN',
        organizationalUnitId: ouA.id,
        password: disposableLocalUserPassword,
      });
      const scopedAdmin = new ApiClient();
      await scopedAdmin.login(scopedEmail, disposableLocalUserPassword);

      const createdInA = await scopedAdmin.requestJson<Group>('/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: `E2E ${suffix} Scoped Group`,
          organizationalUnitId: ouA.id,
        }),
      });
      scopedCreatedGroupId = createdInA.id;
      expect(createdInA.organizationalUnitId).toBe(ouA.id);
      const forbiddenCreate = await scopedAdmin.request('/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: `E2E ${suffix} Forbidden Group`,
          organizationalUnitId: ouB.id,
        }),
      });
      if (forbiddenCreate.status === 200 || forbiddenCreate.status === 201) {
        scopedForbiddenGroupId = ((await forbiddenCreate.json()) as Group).id;
      }
      expect(forbiddenCreate.status).toBe(403);

      const visibleGroups = await scopedAdmin.requestJson<readonly Group[]>('/groups');
      expect(visibleGroups.map((group) => group.id)).toContain(groupA.id);
      expect(visibleGroups.map((group) => group.id)).not.toContain(groupB.id);
      expect((await scopedAdmin.request(`/groups/${groupA.id}`)).status).toBe(200);
      expect((await scopedAdmin.request(`/groups/${groupB.id}`)).status).toBe(403);
      expect(
        (
          await scopedAdmin.request(`/groups/${groupA.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: `E2E ${suffix} Group A Updated` }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await scopedAdmin.request(`/groups/${groupB.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: `E2E ${suffix} Group B Must Not Change` }),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await scopedAdmin.request(`/groups/${groupB.id}/members/${scopedAdminId}`, {
            method: 'POST',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await scopedAdmin.request(`/groups/${groupB.id}/members/${scopedAdminId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(403);
      expect(
        (await scopedAdmin.request(`/groups/${groupB.id}`, { method: 'DELETE' })).status,
      ).toBe(403);

      const requestId = `e2e-superadmin-bypass-${suffix}`;
      expect(
        (
          await admin.request(`/groups/${groupA.id}`, {
            headers: { 'X-Request-Id': requestId },
          })
        ).status,
      ).toBe(200);
      const auditPage = await admin.requestJson<AuditPage>(
        `/audit-logs?organizationalUnitId=${encodeURIComponent(ouA.id)}&take=100`,
      );
      const matchingBypasses = auditPage.items.filter((record) => record.requestId === requestId);
      expect(matchingBypasses).toHaveLength(1);
      expect(matchingBypasses[0]).toMatchObject({
        action: 'authorization.super_admin_bypass',
        entityType: 'authorization',
        actorUserId: superAdmin.id,
        organizationalUnitId: ouA.id,
        requestId,
      });
      expect(matchingBypasses[0]?.metadata).toMatchObject({
        decision: 'SUPER_ADMIN_ALLOWED',
        route: '/groups/:groupId',
        method: 'GET',
        resource: { type: 'groupId', id: groupA.id },
      });

      const inactiveEmail = `e2e.inactive-${suffix}@example.com`;
      inactiveUserId = await createLocalUser(admin, {
        email: inactiveEmail,
        displayName: `E2E Inactive ${suffix}`,
        roleKey: 'USER',
        organizationalUnitId: ouA.id,
        password: disposableLocalUserPassword,
      });
      await admin.requestJson(`/users/${inactiveUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      const reset = await admin.request(`/users/${inactiveUserId}/reset-password`, {
        method: 'POST',
      });
      expect(reset.status).toBe(409);
      expect(await responseFailure(reset)).toMatchObject({ code: 'USER_INACTIVE' });

      const firstPage = await admin.request('/users?take=1&skip=0');
      expect(firstPage.status).toBe(200);
      const total = Number(firstPage.headers.get('X-Total-Count'));
      expect(Number.isFinite(total)).toBe(true);
      expect(total).toBeGreaterThan(0);
      expect(await firstPage.json()).toHaveLength(1);
      if (total > 1) {
        const secondPage = await admin.request('/users?take=1&skip=1');
        expect(Number(secondPage.headers.get('X-Total-Count'))).toBe(total);
        expect(secondPage.status).toBe(200);
        const [firstUser] = (await (await admin.request('/users?take=1&skip=0')).json()) as UserSummary[];
        const [secondUser] = (await secondPage.json()) as UserSummary[];
        expect(secondUser?.id).not.toBe(firstUser?.id);
      }
    } finally {
      await deleteIfPresent(admin, inactiveUserId === null ? null : `/users/${inactiveUserId}`);
      await deleteIfPresent(admin, scopedAdminId === null ? null : `/users/${scopedAdminId}`);
      await deleteIfPresent(
        admin,
        scopedCreatedGroupId === null ? null : `/groups/${scopedCreatedGroupId}`,
      );
      await deleteIfPresent(
        admin,
        scopedForbiddenGroupId === null ? null : `/groups/${scopedForbiddenGroupId}`,
      );
      await deleteIfPresent(admin, groupAId === null ? null : `/groups/${groupAId}`);
      await deleteIfPresent(admin, groupBId === null ? null : `/groups/${groupBId}`);
      await deleteIfPresent(admin, ouAId === null ? null : `/organizational-units/${ouAId}`);
      await deleteIfPresent(admin, ouBId === null ? null : `/organizational-units/${ouBId}`);
    }
  });

  test('serializes simultaneous removal of the final two active SuperAdmin assignments', async () => {
    const env = readE2EEnvironment();
    const firstAdmin = new ApiClient();
    await firstAdmin.login(env.superAdminEmail, env.superAdminPassword);
    const firstMatches = await firstAdmin.requestJson<readonly UserSummary[]>(
      `/users?q=${encodeURIComponent(env.superAdminEmail)}&take=10`,
    );
    const firstUser = firstMatches.find(
      (user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase(),
    );
    if (firstUser === undefined) throw new Error('Configured SuperAdmin was not found through the users API.');
    const firstRoles = await firstAdmin.requestJson<readonly UserRole[]>(
      `/users/${firstUser.id}/roles`,
    );
    const firstSuperAdminRoles = firstRoles.filter(
      (role) => role.roleKey === 'SUPER_ADMIN',
    );
    const allUsers = await listAllUsers(firstAdmin);
    const activeLocalSuperAdmins = allUsers.filter(
      (user) =>
        user.isActive &&
        user.isLocalOnly &&
        user.roleKey === 'SUPER_ADMIN',
    );
    const isolatedSetup =
      activeLocalSuperAdmins.length === 1 &&
      activeLocalSuperAdmins[0]?.id === firstUser.id &&
      firstSuperAdminRoles.length === 1;
    const skipReason =
      'The destructive SuperAdmin race requires an isolated E2E install with ' +
      'the configured account as its only active local SuperAdmin and one ' +
      `assignment; found ${activeLocalSuperAdmins.length} active local ` +
      `SuperAdmin account(s) and ${firstSuperAdminRoles.length} assignment(s) ` +
      'on the configured account.';
    test.skip(!isolatedSetup, skipReason);
    const firstSuperAdminRole = firstSuperAdminRoles[0];
    if (firstSuperAdminRole === undefined) {
      throw new Error('Configured SuperAdmin has no SUPER_ADMIN assignment.');
    }

    const suffix = newSuffix();
    const secondEmail = `e2e.superadmin-race-${suffix}@example.com`;
    let secondUserId: string | null = null;
    let cleanupAdmin: ApiClient | null = null;
    const secondAdmin = new ApiClient();
    try {
      secondUserId = await createLocalUser(firstAdmin, {
        email: secondEmail,
        displayName: `E2E SuperAdmin Race ${suffix}`,
        roleKey: 'ADMIN',
        password: disposableLocalUserPassword,
      });
      const secondRole = await firstAdmin.requestJson<UserRole>(`/users/${secondUserId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleKey: 'SUPER_ADMIN' }),
      });
      await secondAdmin.login(secondEmail, disposableLocalUserPassword);

      const removals = await Promise.all([
        secondAdmin.request(`/users/${firstUser.id}/roles/${firstSuperAdminRole.id}`, {
          method: 'DELETE',
        }),
        firstAdmin.request(`/users/${secondUserId}/roles/${secondRole.id}`, {
          method: 'DELETE',
        }),
      ]);
      const successfulRemovals = removals.filter((response) => response.status === 204);
      expect(successfulRemovals).toHaveLength(1);
      const rejected = removals.find((response) => response.status !== 204);
      if (rejected === undefined) throw new Error('Expected one SuperAdmin removal to be rejected.');
      expect([403, 409]).toContain(rejected.status);
      if (rejected.status === 409) {
        expect(await responseFailure(rejected)).toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });
      }

      // Restore the removed role before cleanup. A late request can be rejected
      // by the guard after its own actor lost the role, or by the invariant.
      const survivingAdmin = removals[0]?.status === 204 ? secondAdmin : firstAdmin;
      const removedTargetId = removals[0]?.status === 204 ? firstUser.id : secondUserId;
      const targetRoles = await survivingAdmin.requestJson<readonly UserRole[]>(
        `/users/${removedTargetId}/roles`,
      );
      if (!targetRoles.some((role) => role.roleKey === 'SUPER_ADMIN')) {
        await survivingAdmin.requestJson<UserRole>(`/users/${removedTargetId}/roles`, {
          method: 'POST',
          body: JSON.stringify({ roleKey: 'SUPER_ADMIN' }),
        });
      }
      const restoredFirstRoles = await survivingAdmin.requestJson<readonly UserRole[]>(
        `/users/${firstUser.id}/roles`,
      );
      if (!restoredFirstRoles.some((role) => role.roleKey === 'SUPER_ADMIN')) {
        await survivingAdmin.requestJson<UserRole>(`/users/${firstUser.id}/roles`, {
          method: 'POST',
          body: JSON.stringify({ roleKey: 'SUPER_ADMIN' }),
        });
      }
      if (secondUserId !== null) {
        const restoredSecondRoles = await survivingAdmin.requestJson<readonly UserRole[]>(
          `/users/${secondUserId}/roles`,
        );
        expect(restoredSecondRoles.some((role) => role.roleKey === 'SUPER_ADMIN')).toBe(true);
      }
      cleanupAdmin = survivingAdmin;
    } finally {
      // Best-effort restoration protects the shared E2E server even when an
      // assertion fails after the race has committed one removal.
      if (secondUserId !== null) {
        const candidates = [firstAdmin, secondAdmin];
        for (const candidate of candidates) {
          try {
            const firstRolesNow = await candidate.requestJson<readonly UserRole[]>(
              `/users/${firstUser.id}/roles`,
            );
            if (!firstRolesNow.some((role) => role.roleKey === 'SUPER_ADMIN')) {
              await candidate.requestJson<UserRole>(`/users/${firstUser.id}/roles`, {
                method: 'POST',
                body: JSON.stringify({ roleKey: 'SUPER_ADMIN' }),
              });
            }
            const secondRolesNow = await candidate.requestJson<readonly UserRole[]>(
              `/users/${secondUserId}/roles`,
            );
            if (!secondRolesNow.some((role) => role.roleKey === 'SUPER_ADMIN')) {
              await candidate.requestJson<UserRole>(`/users/${secondUserId}/roles`, {
                method: 'POST',
                body: JSON.stringify({ roleKey: 'SUPER_ADMIN' }),
              });
            }
            cleanupAdmin = candidate;
            break;
          } catch {
            // This actor may have lost its role; try the other session.
          }
        }
        if (cleanupAdmin !== null) {
          await deleteIfPresent(cleanupAdmin, `/users/${secondUserId}`);
        } else {
          console.warn('[e2e] SuperAdmin cleanup actor could not be restored; preserving the second test identity.');
        }
      }
    }
  });
});
