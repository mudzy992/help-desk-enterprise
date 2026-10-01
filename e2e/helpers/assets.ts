import { expect } from '@playwright/test';
import { ApiClient } from './api-client';

/**
 * Paket 3.2 (CMDB) e2e helpers shared by specs 23–28. Every spec switches the
 * settings it needs and restores the previous values in `finally`, and every
 * asset it creates is moved back to stock and retired, so a run leaves no
 * active equipment behind.
 */

export const assetSettingKeys = {
  cmdb: 'private.addons.cmdb',
  locationsEnabled: 'private.assets.locations.enabled',
  transferEnabled: 'private.assets.transfer.enabled',
  transferRequired: 'private.assets.transfer.required',
  ticketPicker: 'private.assets.ticketPicker.enabled',
} as const;

/** Documented defaults, used when a key had no stored value before the test. */
const assetSettingDefaults: Readonly<Record<string, unknown>> = {
  [assetSettingKeys.cmdb]: false,
  [assetSettingKeys.locationsEnabled]: false,
  [assetSettingKeys.transferEnabled]: true,
  [assetSettingKeys.transferRequired]: false,
  [assetSettingKeys.ticketPicker]: true,
};

type RegistryEntry = { readonly key: string; readonly value: unknown };

export type AssetCatalog = {
  readonly types: ReadonlyArray<{
    readonly id: string;
    readonly key: string;
    readonly archivedAt: string | null;
    readonly isUserSelectable: boolean;
    readonly routingGroupId?: string | null;
  }>;
  readonly locations: ReadonlyArray<{ readonly id: string; readonly name: string; readonly archivedAt: string | null }>;
};
export type AssetOptions = { readonly units: ReadonlyArray<{ readonly id: string; readonly path: string }> };
export type AssetUserHit = { readonly id: string; readonly email: string; readonly displayName?: string };
export type AssetMovement = { readonly transferId: string | null; readonly number: string | null; readonly movedAssetIds: readonly string[] };
export type CreatedAsset = { readonly id: string; readonly assetTag: string; readonly name: string };

export async function readSetting(api: ApiClient, key: string): Promise<unknown> {
  const entries = await api.requestJson<RegistryEntry[]>('/settings');
  return entries.find((entry) => entry.key === key)?.value ?? null;
}

export async function setSetting(api: ApiClient, key: string, value: unknown, reason: string): Promise<void> {
  await api.requestJson('/settings', { method: 'PUT', body: JSON.stringify({ key, value, reason }) });
}

/**
 * Applies `values`, runs `body`, then restores what was there before (also on
 * failure). A key that had no stored value is restored to its documented default.
 */
export async function withSettings(
  api: ApiClient,
  values: Readonly<Record<string, unknown>>,
  reason: string,
  body: () => Promise<void>,
  defaults: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const previous = new Map<string, unknown>();
  for (const key of Object.keys(values)) previous.set(key, await readSetting(api, key));
  try {
    for (const [key, value] of Object.entries(values)) await setSetting(api, key, value, reason);
    await body();
  } finally {
    for (const [key, value] of previous) {
      const restored = value ?? defaults[key] ?? assetSettingDefaults[key] ?? false;
      await setSetting(api, key, restored, `${reason} (restore)`).catch(() => undefined);
    }
  }
}

/** A usable (non-archived) type, preferring `preferredKey`. */
export async function pickAssetType(api: ApiClient, preferredKey = 'laptop'): Promise<AssetCatalog['types'][number]> {
  const catalog = await api.requestJson<AssetCatalog>('/assets/catalog');
  const type =
    catalog.types.find((entry) => entry.archivedAt === null && entry.key === preferredKey) ??
    catalog.types.find((entry) => entry.archivedAt === null);
  expect(type, 'a seeded, non-archived asset type').toBeTruthy();
  return type!;
}

export async function firstUnit(api: ApiClient): Promise<AssetOptions['units'][number]> {
  const options = await api.requestJson<AssetOptions>('/assets/options');
  expect(options.units[0], 'an organizational unit in scope').toBeTruthy();
  return options.units[0];
}

export function uniqueStamp(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function createAsset(
  api: ApiClient,
  input: { readonly typeId: string; readonly organizationalUnitId: string; readonly name: string; readonly assetTag: string; readonly status?: string } & Record<string, unknown>,
): Promise<CreatedAsset> {
  return api.requestJson<CreatedAsset>('/assets', { method: 'POST', body: JSON.stringify({ status: 'IN_STOCK', ...input }) });
}

export async function findAssignableUser(api: ApiClient, email: string): Promise<AssetUserHit> {
  const hits = await api.requestJson<{ items: AssetUserHit[] }>(`/assets/users?search=${encodeURIComponent(email.split('@')[0])}`);
  const user = hits.items.find((entry) => entry.email === email);
  expect(user, `${email} is assignable`).toBeTruthy();
  return user!;
}

export async function move(api: ApiClient, body: Record<string, unknown>): Promise<AssetMovement> {
  return api.requestJson<AssetMovement>('/assets/movements', { method: 'POST', body: JSON.stringify(body) });
}

/** Best-effort cleanup: back to stock without a record, then retired. */
export async function retireAssets(api: ApiClient, ids: readonly string[], reason: string): Promise<void> {
  for (const id of ids) {
    await api
      .request('/assets/movements', {
        method: 'POST',
        body: JSON.stringify({ scenario: 'USER_TO_WAREHOUSE', assetIds: [id], returnStatus: 'IN_STOCK', issueDocument: false }),
      })
      .catch(() => undefined);
    await api.request(`/assets/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'RETIRED', reason }) }).catch(() => undefined);
  }
}

/** Error code of a failed response (`{ code }` body), or `HTTP_<status>`. */
export async function errorCode(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { code?: unknown };
    if (typeof parsed.code === 'string') return parsed.code;
  } catch {
    // not JSON
  }
  return `HTTP_${response.status}`;
}
