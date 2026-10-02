import { ApiClient } from './api-client';
import { firstUnit, readSetting, setSetting, uniqueStamp } from './assets';
import { readE2EEnvironment } from './environment';

/**
 * Paket 3.4: a self-contained change management fixture. It switches the
 * addon on, creates a dedicated CAB group whose only voter is the E2E agent
 * (temporarily given CHANGE_MANAGER), and restores everything afterwards.
 * With the agent as the only voter the quorum is always 1, whatever the
 * quorum settings are.
 */

export const changeSettingKeys = {
  addon: 'private.addons.changes',
  freezePeriods: 'private.changes.freezePeriods',
  requireTestPlan: 'private.changes.requireTestPlan',
  minLeadTimeHours: 'private.changes.minLeadTimeHours',
  downtimeEnabled: 'private.services.downtimeScheduling.enabled',
} as const;

const settingDefaults: Readonly<Record<string, unknown>> = {
  [changeSettingKeys.addon]: false,
  [changeSettingKeys.freezePeriods]: '[]',
  [changeSettingKeys.requireTestPlan]: false,
  [changeSettingKeys.minLeadTimeHours]: 0,
  [changeSettingKeys.downtimeEnabled]: false,
};

export type ChangeDetail = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly risk: string;
  readonly version: number;
  readonly outcome: string | null;
  readonly allowedActions: readonly string[];
};

export type ChangeFixture = {
  readonly admin: ApiClient;
  readonly agent: ApiClient;
  readonly user: ApiClient;
  readonly unitId: string;
  readonly cabGroupId: string;
  readonly serviceId: string;
  readonly stamp: string;
};

type Options = { readonly services: ReadonlyArray<{ id: string; name: string }> };

export async function withChangeFixture(
  extraSettings: Readonly<Record<string, unknown>>,
  body: (fixture: ChangeFixture) => Promise<void>,
): Promise<void> {
  const env = readE2EEnvironment();
  const admin = new ApiClient();
  await admin.login(env.superAdminEmail, env.superAdminPassword);
  const stamp = uniqueStamp();
  const values: Record<string, unknown> = { [changeSettingKeys.addon]: true, [changeSettingKeys.freezePeriods]: '[]', [changeSettingKeys.minLeadTimeHours]: 0, [changeSettingKeys.requireTestPlan]: false, ...extraSettings };
  const previous = new Map<string, unknown>();
  for (const key of Object.keys(values)) previous.set(key, await readSetting(admin, key));

  const users = await admin.requestJson<Array<{ id: string; email: string }>>('/users');
  const agentUser = users.find((item) => item.email.toLowerCase() === env.agentEmail.toLowerCase());
  if (agentUser === undefined) throw new Error(`E2E agent ${env.agentEmail} not found`);
  const unit = await firstUnit(admin);

  let grantedRoleId: string | null = null;
  let groupId: string | null = null;
  try {
    for (const [key, value] of Object.entries(values)) await setSetting(admin, key, value, `E2E 3.4 ${stamp}`);
    const roles = await admin.requestJson<Array<{ id: string; roleKey: string }>>(`/users/${agentUser.id}/roles`);
    if (!roles.some((role) => role.roleKey === 'CHANGE_MANAGER')) {
      const granted = await admin.requestJson<{ id: string }>(`/users/${agentUser.id}/roles`, { method: 'POST', body: JSON.stringify({ roleKey: 'CHANGE_MANAGER' }) });
      grantedRoleId = granted.id;
    }
    const group = await admin.requestJson<{ id: string }>('/groups', {
      method: 'POST',
      body: JSON.stringify({ name: `E2E CAB ${stamp}`, organizationalUnitId: unit.id, isCabGroup: true }),
    });
    groupId = group.id;
    await admin.requestJson(`/groups/${group.id}/members/${agentUser.id}`, { method: 'POST' });

    // Log in after the role change so the agent's session carries the new permissions.
    const agent = new ApiClient();
    await agent.login(env.agentEmail, env.agentPassword);
    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    const options = await admin.requestJson<Options>('/changes/options');
    const service = options.services[0];
    if (service === undefined) throw new Error('No active service for changes');
    await body({ admin, agent, user, unitId: unit.id, cabGroupId: group.id, serviceId: service.id, stamp });
  } finally {
    if (groupId !== null) {
      await admin.request(`/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify({ isCabGroup: false }) }).catch(() => undefined);
      await admin.request(`/groups/${groupId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (grantedRoleId !== null) await admin.request(`/users/${agentUser.id}/roles/${grantedRoleId}`, { method: 'DELETE' }).catch(() => undefined);
    for (const [key, value] of previous) {
      await setSetting(admin, key, value ?? settingDefaults[key] ?? false, `E2E 3.4 ${stamp} (restore)`).catch(() => undefined);
    }
  }
}

/** A future window: `daysAhead` days from now at 10:00–12:00 UTC (or the given hours). */
export function futureWindow(daysAhead: number, startHour = 10, endHour = 12): { plannedStart: string; plannedEnd: string } {
  const base = new Date();
  const day = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + daysAhead);
  return { plannedStart: new Date(day + startHour * 3_600_000).toISOString(), plannedEnd: new Date(day + endHour * 3_600_000).toISOString() };
}

export async function act(api: ApiClient, change: ChangeDetail, action: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return api.request(`/changes/${change.id}/actions`, { method: 'POST', body: JSON.stringify({ version: change.version, action, ...extra }) });
}

export async function loadChange(api: ApiClient, id: string): Promise<ChangeDetail> {
  return api.requestJson<ChangeDetail>(`/changes/${id}`);
}

/** Cancels a change left open by a failed step (best effort). */
export async function cancelIfOpen(api: ApiClient, id: string | null): Promise<void> {
  if (id === null) return;
  const current = await loadChange(api, id).catch(() => null);
  if (current === null || !current.allowedActions.includes('cancel')) return;
  await act(api, current, 'cancel', { reason: 'E2E čišćenje nakon testa.' }).catch(() => undefined);
}

export function fullNormalChange(fixture: ChangeFixture, label: string, window: { plannedStart: string; plannedEnd: string }, extra: Record<string, unknown> = {}) {
  return {
    type: 'NORMAL',
    title: `E2E promjena ${label} ${fixture.stamp}`,
    description: 'Nadogradnja servera aplikacije (E2E).',
    reason: 'Sigurnosne zakrpe dobavljača.',
    impact: 'MEDIUM',
    likelihood: 'LOW',
    implementationPlan: '1. Snapshot 2. Instalacija 3. Restart',
    backoutPlan: 'Vratiti snapshot.',
    testPlan: 'Prijava i osnovni scenariji.',
    organizationalUnitId: fixture.unitId,
    cabGroupId: fixture.cabGroupId,
    serviceIds: [fixture.serviceId],
    ...window,
    ...extra,
  };
}
