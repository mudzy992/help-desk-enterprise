import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApiClient } from '../helpers/api-client';
import {
  applyOutboundEmailGate,
  emailGateRequested,
  restoreOutboundEmailGate,
} from '../helpers/outbound-email-gate';

const key = 'private.notifications.email.enabled';

type FakeStack = {
  value: boolean;
  writes: Array<{ value: boolean; reason: string }>;
  offline: boolean;
};

function fakeApi(stack: FakeStack): ApiClient {
  return {
    async requestJson(route: string, init?: RequestInit) {
      if (stack.offline) throw new Error('network unavailable');
      if (route === '/settings') return [{ key, value: stack.value }];
      const body = JSON.parse(String(init?.body)) as {
        entries: Array<{ key: string; value: boolean }>;
        reason: string;
      };
      stack.writes.push({ value: body.entries[0]!.value, reason: body.reason });
      stack.value = body.entries[0]!.value;
      return {};
    },
  } as unknown as ApiClient;
}

/** Fresh scratch directory per test; the journal path is what the helpers read. */
function withJournal(run: (path: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'email-gate-test-'));
  const journal = join(directory, 'outbound-email.json');
  process.env.E2E_EMAIL_GATE_JOURNAL = journal;
  process.env.E2E_EMAIL_GATE_NOTE = join(directory, 'note.json');
  return run(journal).finally(() => {
    delete process.env.E2E_EMAIL_GATE_JOURNAL;
    delete process.env.E2E_EMAIL_GATE_NOTE;
    delete process.env.E2E_DISABLE_EMAIL_CHANNEL;
    rmSync(directory, { recursive: true, force: true });
  });
}

test('only the exact opt-in closes the channel', () => {
  expect(emailGateRequested({ E2E_DISABLE_EMAIL_CHANNEL: '1' })).toBe(true);
  expect(emailGateRequested({ E2E_DISABLE_EMAIL_CHANNEL: '0' })).toBe(false);
  expect(emailGateRequested({ E2E_DISABLE_EMAIL_CHANNEL: 'true' })).toBe(false);
  expect(emailGateRequested({})).toBe(false);
});

test('a nightly run leaves the setting alone and writes no journal', async () => {
  await withJournal(async (journal) => {
    const stack: FakeStack = { value: true, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    expect(stack.writes).toEqual([]);
    expect(stack.value).toBe(true);
    expect(existsSync(journal)).toBe(false);
  });
});

test('a pull-request run closes the channel, records the original value and restores it', async () => {
  await withJournal(async (journal) => {
    process.env.E2E_DISABLE_EMAIL_CHANNEL = '1';
    const stack: FakeStack = { value: true, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    expect(stack.value).toBe(false);
    expect(stack.writes).toHaveLength(1);
    expect(stack.writes[0]!.reason).toContain('pull-request');
    expect(JSON.parse(readFileSync(journal, 'utf8'))).toEqual({ key, value: true });

    await restoreOutboundEmailGate(fakeApi(stack));
    expect(stack.value).toBe(true);
    expect(existsSync(journal)).toBe(false);
  });
});

test('an interrupted run is restored before the next one changes anything', async () => {
  await withJournal(async (journal) => {
    process.env.E2E_DISABLE_EMAIL_CHANNEL = '1';
    // Previous run closed the channel and was cancelled before teardown.
    const stack: FakeStack = { value: false, writes: [], offline: false };
    const { writeFileSync } = await import('node:fs');
    writeFileSync(journal, JSON.stringify({ key, value: true }));
    await applyOutboundEmailGate(fakeApi(stack));
    // Restored to the original, then closed again for *this* run.
    expect(stack.writes.map((write) => write.value)).toEqual([true, false]);
    expect(stack.value).toBe(false);
    expect(JSON.parse(readFileSync(journal, 'utf8'))).toEqual({ key, value: true });
  });
});

test('a channel that was already closed is recorded, not "changed"', async () => {
  await withJournal(async (journal) => {
    process.env.E2E_DISABLE_EMAIL_CHANNEL = '1';
    const stack: FakeStack = { value: false, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    expect(stack.writes).toEqual([]);
    expect(JSON.parse(readFileSync(journal, 'utf8'))).toEqual({ key, value: false });
    await restoreOutboundEmailGate(fakeApi(stack));
    expect(stack.value).toBe(false);
    expect(existsSync(journal)).toBe(false);
  });
});

test('the run artifact records what the gate decided', async () => {
  await withJournal(async (journal) => {
    const note = process.env.E2E_EMAIL_GATE_NOTE!;
    process.env.E2E_DISABLE_EMAIL_CHANNEL = '1';
    const stack: FakeStack = { value: true, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({
      requested: true,
      channelBefore: true,
      channelClosed: true,
      restoredTo: null,
    });
    await restoreOutboundEmailGate(fakeApi(stack));
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({
      channelBefore: true,
      restoredTo: true,
    });
    expect(existsSync(journal)).toBe(false);
  });
});

test('a nightly run records that it left the channel alone', async () => {
  await withJournal(async () => {
    const note = process.env.E2E_EMAIL_GATE_NOTE!;
    const stack: FakeStack = { value: true, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({
      requested: false,
      channelClosed: false,
    });
  });
});

test('a failed restore keeps the journal and says an operator must check', async () => {
  await withJournal(async (journal) => {
    process.env.E2E_DISABLE_EMAIL_CHANNEL = '1';
    const stack: FakeStack = { value: true, writes: [], offline: false };
    await applyOutboundEmailGate(fakeApi(stack));
    stack.offline = true;
    await expect(restoreOutboundEmailGate(fakeApi(stack))).rejects.toThrow('operator must check');
    expect(existsSync(journal)).toBe(true);
    stack.offline = false;
    await restoreOutboundEmailGate(fakeApi(stack));
    expect(stack.value).toBe(true);
    expect(existsSync(journal)).toBe(false);
  });
});

test('a corrupt journal stops the run instead of guessing a value', async () => {
  await withJournal(async (journal) => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(journal, JSON.stringify({ key, value: 'yes' }));
    await expect(
      restoreOutboundEmailGate(fakeApi({ value: true, writes: [], offline: false })),
    ).rejects.toThrow('Invalid e-mail gate journal');
    expect(existsSync(journal)).toBe(true);
  });
});
