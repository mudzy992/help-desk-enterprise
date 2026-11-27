import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { ApiClient } from './api-client';

/*
  2026-11-27: the browser gate used to be silent about outbound mail. Specs
  01/02/03 create tickets through the UI, and the stack then sends its own
  notification e-mail through the configured provider, so every pull-request
  smoke run — and every re-run after a stack outage — spent the provider's daily
  quota. `E2E_ALLOW_EMAIL_SEND` only guards the explicit send inside spec 18, so
  it never covered those runs.

  The suite therefore closes the notification-e-mail channel for a pull request
  run and restores it afterwards, exactly the way an administrator would toggle it
  in Admin → E-mail. Nothing is mocked: in-app notifications, templates, delivery
  rows and the health panel keep working, they simply record `email_channel_disabled`
  instead of handing a message to SMTP. The nightly run leaves the channel open,
  so e-mail sending keeps its full coverage there.

  The journal exists because a cancelled run must not leave the stack with mail
  switched off: setup restores an interrupted journal before it touches anything,
  and teardown restores the original value.
*/
const emailChannelKey = 'private.notifications.email.enabled';

const journalPath = (): string => {
  const path = process.env.E2E_EMAIL_GATE_JOURNAL;
  if (!path) throw new Error('E2E e-mail gate journal was not initialized by global setup');
  return path;
};

const reason = 'E2E pull-request smoke run: close the notification e-mail channel';

type Entry = { readonly key: string; readonly value: unknown };
type Journal = { readonly key: string; readonly value: boolean };

async function readChannelEnabled(api: ApiClient): Promise<boolean> {
  const entries = await api.requestJson<Entry[]>('/settings');
  const entry = entries.find((item) => item.key === emailChannelKey);
  if (typeof entry?.value !== 'boolean') {
    throw new Error(`Cannot safely read ${emailChannelKey}: expected boolean`);
  }
  return entry.value;
}

async function writeChannelEnabled(api: ApiClient, value: boolean): Promise<void> {
  await api.requestJson('/settings/batch', {
    method: 'PUT',
    body: JSON.stringify({
      entries: [{ key: emailChannelKey, value }],
      reason,
    }),
  });
}

/** `true` when this run asked for the channel to be closed. */
export function emailGateRequested(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.E2E_DISABLE_EMAIL_CHANNEL === '1';
}

/**
 * Closes the channel for this run. Restores an interrupted journal first, so a
 * cancelled run cannot leave the value behind: whatever the journal recorded is
 * the value this run starts from.
 */
export async function applyOutboundEmailGate(api: ApiClient): Promise<void> {
  if (existsSync(journalPath())) await restoreOutboundEmailGate(api);
  if (!emailGateRequested()) {
    console.log('[e2e] outbound e-mail channel left as the stack has it (nightly/dispatch run)');
    return;
  }
  const value = await readChannelEnabled(api);
  writeFileSync(journalPath(), JSON.stringify({ key: emailChannelKey, value }), {
    flag: 'wx',
    mode: 0o600,
  });
  if (!value) {
    console.log('[e2e] outbound e-mail channel was already closed; nothing to change');
    return;
  }
  await writeChannelEnabled(api, false);
  if (await readChannelEnabled(api)) {
    throw new Error(`E2E could not close ${emailChannelKey}; the smoke run would send real e-mail`);
  }
  console.log('[e2e] outbound e-mail channel closed for this pull-request run (restored in teardown)');
}

/** Puts the recorded value back; never claims success without a read-back. */
export async function restoreOutboundEmailGate(api: ApiClient): Promise<void> {
  const path = journalPath();
  if (!existsSync(path)) return;
  const record = JSON.parse(readFileSync(path, 'utf8')) as { key?: unknown; value?: unknown };
  if (record.key !== emailChannelKey || typeof record.value !== 'boolean') {
    throw new Error('Invalid e-mail gate journal');
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if ((await readChannelEnabled(api)) !== record.value) {
        await writeChannelEnabled(api, record.value);
      }
      if ((await readChannelEnabled(api)) !== record.value) {
        throw new Error('E-mail channel read-back mismatch');
      }
      unlinkSync(path);
      console.log(`[e2e] outbound e-mail channel restored (enabled: ${record.value})`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(
    `E2E could not restore ${emailChannelKey}; an operator must check the e-mail channel`,
    { cause: lastError },
  );
}
