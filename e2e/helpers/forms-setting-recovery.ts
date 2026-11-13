import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { ApiClient } from './api-client';

const key = 'private.ticket.forms.enabled';
const journalPath = (): string => {
  const path = process.env.E2E_FORMS_RECOVERY_JOURNAL;
  if (!path) throw new Error('E2E forms recovery journal was not initialized by global setup');
  return path;
};

type Entry = { readonly key: string; readonly value: unknown };

async function readFormsEnabled(api: ApiClient): Promise<boolean> {
  const entries = await api.requestJson<Entry[]>('/settings');
  const entry = entries.find((item) => item.key === key);
  if (typeof entry?.value !== 'boolean') throw new Error(`Cannot safely snapshot ${key}: expected boolean`);
  return entry.value;
}

/** Preserve the first attempt's actual value across Playwright worker retries. */
export async function snapshotFormsSetting(api: ApiClient): Promise<void> {
  const path = journalPath();
  if (existsSync(path)) {
    await restoreFormsSetting(api, false);
    return;
  }
  const value = await readFormsEnabled(api);
  writeFileSync(path, JSON.stringify({ key, value }), { flag: 'wx', mode: 0o600 });
}

/** Retry recovery with read-back; never claim a successful restore on failure. */
export async function restoreFormsSetting(api: ApiClient, removeJournal = true): Promise<void> {
  const path = journalPath();
  if (!existsSync(path)) return;
  const record = JSON.parse(readFileSync(path, 'utf8')) as { key?: unknown; value?: unknown };
  if (record.key !== key || typeof record.value !== 'boolean') throw new Error('Invalid forms recovery journal');
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if (await readFormsEnabled(api) !== record.value) {
        await api.requestJson('/settings/batch', {
          method: 'PUT',
          body: JSON.stringify({ entries: [{ key, value: record.value }], reason: 'E2E 15: restore original forms setting', resetDependents: true }),
        });
      }
      if (await readFormsEnabled(api) !== record.value) throw new Error('Forms setting read-back mismatch');
      if (removeJournal) unlinkSync(path);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`E2E could not restore ${key}; operator must check the setting`, { cause: lastError });
}
