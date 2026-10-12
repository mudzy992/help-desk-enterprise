import { createHmac } from 'node:crypto';
import {
  auditWebhookEpochCursor,
  buildAuditWebhookBatch,
  isAuditWebhookAction,
  signAuditWebhookBody,
  type AuditWebhookRow,
} from './security-audit-webhook.batch';
import {
  createAuditWebhookPoster,
  isValidAuditWebhookUrl,
  type AuditWebhookPostResult,
  type AuditWebhookPoster,
} from './security-audit-webhook.poster';
import {
  SecurityAuditWebhookDelivery,
  type AuditWebhookConfig,
  type AuditWebhookState,
  type AuditWebhookStore,
} from './security-audit-webhook.delivery';
import {
  securityAuditWebhookBatchSize,
  securityAuditWebhookGiveUpMilliseconds,
  securityAuditWebhookSettleMilliseconds,
} from './security-audit-webhook.constants';
import { securityAuditWebhookSettings } from '../settings/definitions/security-audit-webhook-settings';
import { settingKeys } from '../settings/setting-keys';

type PostInput = Parameters<AuditWebhookPoster>[0];
type PostResult = Promise<AuditWebhookPostResult>;

const now = new Date('2026-10-12T10:00:00.000Z');
const settled = new Date(now.getTime() - securityAuditWebhookSettleMilliseconds);

function row(
  index: number,
  action = 'auth.login_failed',
  createdAt = new Date(now.getTime() - 60_000 + index),
): AuditWebhookRow {
  return {
    id: `row${String(index).padStart(4, '0')}`,
    createdAt,
    action,
    entityType: 'User',
    entityId: 'user-1',
    actorUserId: null,
    requestId: 'req-1',
    metadata: { reason: 'x' },
  };
}

function makeStore(rows: AuditWebhookRow[], initial: Partial<AuditWebhookState> = {}) {
  let state: AuditWebhookState = {
    cursor: null,
    pendingSince: null,
    sentTotal: 0,
    failedTotal: 0,
    droppedTotal: 0,
    lastSuccessAt: null,
    lastErrorCode: null,
    ...initial,
  };
  const saves: AuditWebhookState[] = [];
  const isAfter = (r: AuditWebhookRow, c: { createdAt: Date; id: string }) =>
    r.createdAt.getTime() > c.createdAt.getTime() || (r.createdAt.getTime() === c.createdAt.getTime() && r.id > c.id);
  const eligible = (r: AuditWebhookRow) => isAuditWebhookAction(r.action) && r.createdAt.getTime() <= settled.getTime();
  const store: AuditWebhookStore = {
    loadState: async () => state,
    saveState: async (next) => {
      state = next;
      saves.push(next);
    },
    newestCursor: async (before) => {
      const list = rows.filter((r) => isAuditWebhookAction(r.action) && r.createdAt.getTime() <= before.getTime());
      const last = list[list.length - 1];
      return last === undefined ? null : { createdAt: last.createdAt, id: last.id };
    },
    findBatch: async (cursor, before, take) => rows.filter((r) => eligible(r) && isAfter(r, cursor)).slice(0, take),
    countAfter: async (cursor) => rows.filter((r) => eligible(r) && isAfter(r, cursor)).length,
  };
  return { store, saves, current: () => state };
}

function makeDelivery(config: AuditWebhookConfig, store: AuditWebhookStore, post: jest.Mock) {
  return new SecurityAuditWebhookDelivery(store, { load: async () => config } as never, post);
}

const enabledConfig: AuditWebhookConfig = {
  enabled: true,
  url: 'http://siem.internal:8080/hook',
  secret: 's3cret',
};
const okPost = () => jest.fn<PostResult, [PostInput]>(async () => ({ ok: true as const }));

describe('audit webhook: kind filter and batch body', () => {
  it('exports only auth.* and security.* actions', () => {
    expect(isAuditWebhookAction('auth.login_failed')).toBe(true);
    expect(isAuditWebhookAction('security.mfa_secrets.reencrypted')).toBe(true);
    expect(isAuditWebhookAction('ticket.created')).toBe(false);
    expect(isAuditWebhookAction('authentication.foo')).toBe(false);
  });

  it('builds a stable JSON body with the audit row id per event', () => {
    const body = buildAuditWebhookBatch([row(1)], now);
    const parsed = JSON.parse(body);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sentAt).toBe(now.toISOString());
    expect(parsed.events[0]).toMatchObject({
      id: 'row0001',
      action: 'auth.login_failed',
      entityId: 'user-1',
    });
  });

  it('signs timestamp.body with HMAC-SHA256 hex', () => {
    const body = '{"a":1}';
    const expected = createHmac('sha256', 'k').update('1700000000.{"a":1}').digest('hex');
    expect(signAuditWebhookBody('k', 1700000000, body)).toBe(expected);
  });
});

describe('audit webhook: url and poster', () => {
  it('accepts http and https only, without credentials', () => {
    expect(isValidAuditWebhookUrl('https://siem.example/x')).toBe(true);
    expect(isValidAuditWebhookUrl('http://10.0.0.5:9000/in')).toBe(true);
    expect(isValidAuditWebhookUrl('ftp://x')).toBe(false);
    expect(isValidAuditWebhookUrl('https://user:pw@x')).toBe(false);
    expect(isValidAuditWebhookUrl('not a url')).toBe(false);
  });

  it('posts signed headers, refuses redirects and reduces failures to codes', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchOk = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    };
    const poster = createAuditWebhookPoster(fetchOk as never);
    const result = await poster({
      url: 'http://siem.internal/hook',
      secret: 's3cret',
      body: '{}',
      now,
    });
    expect(result).toEqual({ ok: true });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].init.redirect).toBe('error');
    expect(headers['x-helpdesk-timestamp']).toBe(String(Math.floor(now.getTime() / 1000)));
    expect(headers['x-helpdesk-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);

    const http500 = createAuditWebhookPoster((async () => new Response('secret body', { status: 500 })) as never);
    expect(await http500({ url: 'http://x/hook', secret: 's', body: '{}', now })).toEqual({
      ok: false,
      code: 'HTTP_500',
    });

    const network = createAuditWebhookPoster((async () => {
      throw new TypeError('fetch failed');
    }) as never);
    expect(await network({ url: 'http://x/hook', secret: 's', body: '{}', now })).toEqual({
      ok: false,
      code: 'NETWORK',
    });

    const invalid = createAuditWebhookPoster(fetchOk as never);
    expect(await invalid({ url: 'ftp://x', secret: 's', body: '{}', now })).toEqual({ ok: false, code: 'INVALID_URL' });
  });
});

describe('audit webhook: delivery tick', () => {
  it('does nothing and parks the cursor on the newest row while disabled (no backfill)', async () => {
    const rows = [row(1), row(2)];
    const { store, current } = makeStore(rows);
    const post = okPost();
    const result = await makeDelivery({ ...enabledConfig, enabled: false }, store, post).runTick(now);
    expect(result).toEqual({ status: 'disabled' });
    expect(post).not.toHaveBeenCalled();
    expect(current().cursor).toEqual({
      createdAt: rows[1].createdAt,
      id: rows[1].id,
    });
  });

  it('sends rows in order, advances the cursor and counts them', async () => {
    const rows = [row(1), row(2), row(3, 'ticket.created'), row(4, 'security.mfa_secrets.reencrypted')];
    const { store, current } = makeStore(rows, {
      cursor: auditWebhookEpochCursor,
    });
    const post = okPost();
    const result = await makeDelivery(enabledConfig, store, post).runTick(now);
    expect(result).toEqual({ status: 'sent', events: 3 });
    const body = JSON.parse(post.mock.calls[0][0].body);
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(['row0001', 'row0002', 'row0004']);
    expect(current()).toMatchObject({
      sentTotal: 3,
      pendingSince: null,
      lastErrorCode: null,
    });
    expect(current().cursor).toEqual({
      createdAt: rows[3].createdAt,
      id: rows[3].id,
    });
  });

  it('keeps the cursor on failure, starts a streak and retries the same batch next tick', async () => {
    const rows = [row(1)];
    const { store, current } = makeStore(rows, {
      cursor: auditWebhookEpochCursor,
    });
    const post = jest.fn<PostResult, [PostInput]>(async () => ({
      ok: false as const,
      code: 'HTTP_503',
    }));
    const delivery = makeDelivery(enabledConfig, store, post);
    expect(await delivery.runTick(now)).toEqual({
      status: 'failed',
      code: 'HTTP_503',
      dropped: 0,
    });
    expect(current()).toMatchObject({
      pendingSince: now,
      failedTotal: 1,
      lastErrorCode: 'HTTP_503',
    });
    expect(current().cursor).toEqual(auditWebhookEpochCursor);

    post.mockImplementationOnce(async () => ({ ok: true as const }));
    const later = new Date(now.getTime() + 60_000);
    expect(await delivery.runTick(later)).toEqual({
      status: 'sent',
      events: 1,
    });
    expect(current()).toMatchObject({
      pendingSince: null,
      lastErrorCode: null,
    });
    expect(JSON.parse(post.mock.calls[1][0].body).events).toEqual(JSON.parse(post.mock.calls[0][0].body).events);
  });

  it('after 24 h of failure drops the pending rows, counts them and jumps the cursor', async () => {
    const rows = [row(1), row(2), row(3)];
    const { store, current } = makeStore(rows, {
      cursor: auditWebhookEpochCursor,
      pendingSince: new Date(now.getTime() - securityAuditWebhookGiveUpMilliseconds),
    });
    const post = jest.fn<PostResult, [PostInput]>(async () => ({
      ok: false as const,
      code: 'TIMEOUT',
    }));
    const result = await makeDelivery(enabledConfig, store, post).runTick(now);
    expect(result).toEqual({ status: 'failed', code: 'TIMEOUT', dropped: 3 });
    expect(current()).toMatchObject({
      pendingSince: null,
      droppedTotal: 3,
      failedTotal: 1,
    });
    expect(current().cursor).toEqual({
      createdAt: rows[2].createdAt,
      id: rows[2].id,
    });
  });

  it('stops after a failure so a broken endpoint is not hammered within one tick', async () => {
    const rows = Array.from({ length: securityAuditWebhookBatchSize * 2 }, (_, i) => row(i + 1));
    const { store } = makeStore(rows, { cursor: auditWebhookEpochCursor });
    const post = jest.fn<PostResult, [PostInput]>(async () => ({
      ok: false as const,
      code: 'HTTP_500',
    }));
    await makeDelivery(enabledConfig, store, post).runTick(now);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('activation sends only rows after the newest existing row', async () => {
    const rows = [row(1)];
    const { store } = makeStore(rows);
    const post = okPost();
    expect(await makeDelivery(enabledConfig, store, post).runTick(now)).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });

  it('skips rows that are not yet settled', async () => {
    const fresh = row(1, 'auth.login_failed', new Date(now.getTime() - 1_000));
    const { store } = makeStore([fresh], { cursor: auditWebhookEpochCursor });
    const post = okPost();
    expect(await makeDelivery(enabledConfig, store, post).runTick(now)).toEqual({ status: 'idle' });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('audit webhook: settings', () => {
  const byKey = (key: string) => securityAuditWebhookSettings.find((definition) => definition.key === key);

  it('keeps the export off by default and requires a URL and a secret before it can be on', () => {
    const enabled = byKey(settingKeys.privateSecurityAuditWebhookEnabled);
    expect(enabled).toMatchObject({ defaultValue: false });
    expect(enabled?.requires).toEqual(
      expect.arrayContaining([
        { key: settingKeys.privateSecurityAuditWebhookUrl, notEmpty: true },
        { key: settingKeys.privateSecurityAuditWebhookSecret, isSet: true },
      ]),
    );
  });

  it('rejects credentials, non-http schemes and oversize URLs', () => {
    const assertValue = byKey(settingKeys.privateSecurityAuditWebhookUrl)?.assertValue;
    expect(assertValue).toBeDefined();
    expect(() => assertValue?.('')).not.toThrow();
    expect(() => assertValue?.('https://siem.example/hook')).not.toThrow();
    expect(() => assertValue?.('ftp://siem.example/hook')).toThrow();
    expect(() => assertValue?.('https://user:pw@siem.example/hook')).toThrow();
    expect(() => assertValue?.(`https://x.example/${'a'.repeat(2100)}`)).toThrow();
  });
});
