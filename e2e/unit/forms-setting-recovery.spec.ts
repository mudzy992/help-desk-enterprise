import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiClient } from '../helpers/api-client';
import { snapshotFormsSetting, restoreFormsSetting } from '../helpers/forms-setting-recovery';

test('journal keeps the initial value across failure and retry, then confirms cleanup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'forms-recovery-test-'));
  const path = join(dir, 'journal.json');
  process.env.E2E_FORMS_RECOVERY_JOURNAL = path;
  let value = true;
  let offline = false;
  const api = {
    async requestJson(route: string, init?: RequestInit) {
      if (offline) throw new Error('network unavailable');
      if (route === '/settings') return [{ key: 'private.ticket.forms.enabled', value }];
      const body = JSON.parse(String(init?.body)) as { entries: Array<{ value: boolean }> };
      value = body.entries[0].value;
      return {};
    },
  } as unknown as ApiClient;
  try {
    await snapshotFormsSetting(api);
    value = false;
    offline = true;
    await expect(restoreFormsSetting(api)).rejects.toThrow('operator must check');
    expect(existsSync(path)).toBe(true);
    offline = false;
    // The retry must not treat the accidental false value as its original state.
    await snapshotFormsSetting(api);
    expect(value).toBe(true);
    value = false;
    await restoreFormsSetting(api);
    expect(value).toBe(true);
    expect(existsSync(path)).toBe(false);
    value = false;
    await snapshotFormsSetting(api);
    value = true;
    await restoreFormsSetting(api);
    expect(value).toBe(false);
  } finally {
    delete process.env.E2E_FORMS_RECOVERY_JOURNAL;
    rmSync(dir, { recursive: true, force: true });
  }
});
