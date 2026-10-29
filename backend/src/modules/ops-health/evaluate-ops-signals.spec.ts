import {
  dlqGrowth,
  evaluateOpsSignals,
  findLateSchedulers,
  lowerDlqBaseline,
  observeMonitorFreshness,
  observeWorkerHeartbeat,
  type OpsSignals,
  type OpsThresholds,
} from './evaluate-ops-signals';
import { opsAlertKeys } from './ops-alert-catalog';

const now = Date.parse('2026-11-20T10:00:00.000Z');
const minute = 60_000;

const thresholds: OpsThresholds = {
  diskWarnPercent: 80,
  diskCriticalPercent: 90,
  http5xxMinCount: 20,
  http5xxMinPercent: 2,
  slaScanLateMinutes: 5,
  workerHeartbeatStaleSeconds: 120,
  clamavFailuresBeforeAlert: 3,
  websocketEmitWarnPerMinute: 500,
  websocketEmitCriticalPerMinute: 2_000,
  login429WarnPerHour: 50,
  login429CriticalPerHour: 200,
  captchaFailedWarnPerHour: 50,
  captchaFailedCriticalPerHour: 200,
  captchaSkippedWarnPerHour: 50,
  captchaSkippedCriticalPerHour: 200,
};

function healthy(overrides: Partial<OpsSignals> = {}): OpsSignals {
  return {
    nowMs: now,
    database: 'ok',
    redis: 'ok',
    disk: { usedPercent: 40, freeBytes: 60 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 },
    clamav: { configured: true, ok: true, failOpen: false },
    schedulers: [
      { queue: 'sla-scan', schedulerId: 'sla-scan', everyMs: minute, pattern: null, nextMs: now + 30_000, lastSuccessMs: now - 30_000, lastFailureMs: null },
      { queue: 'privacy', schedulerId: 'privacy-maintenance', everyMs: null, pattern: '*/15 * * * *', nextMs: now + 5 * minute, lastSuccessMs: now - 10 * minute, lastFailureMs: null },
    ],
    queues: [
      { queue: 'sla-scan', waiting: 0, active: 0, delayed: 1, failed: 0 },
      { queue: 'integration', waiting: 0, active: 0, delayed: 0, failed: 2 },
    ],
    integrationDlq: 1,
    http: { errors5xx: 0, total: 1_000 },
    eventLoopLagMs: 12,
    ldapsCaExpiresAtMs: null,
    websocketEmits: { staff: 10, public: 0, user: 5, group: 120, 'group-legacy': 0, broadcast: 0 },
    // Quiet by default: the metric exists and is zero.
    login429LastHour: 0,
    captchaFailedLastHour: 0,
    captchaSkippedLastHour: 0,
    auditWebhookPendingSinceMs: null,
    mailProviderBlock: null,
    ...overrides,
  };
}

const baseline = { integrationDlq: 1, failedByQueue: { integration: 2 } };

function byKey(signals: OpsSignals, base = baseline) {
  return new Map(evaluateOpsSignals(signals, thresholds, base).map((observation) => [observation.key, observation]));
}

describe('evaluateOpsSignals', () => {
  it('keeps the 429 alarm quiet below the warning threshold and when the metric is unknown', () => {
    expect(byKey(healthy({ login429LastHour: 49 })).get(opsAlertKeys.login429High)).toMatchObject({
      active: false,
    });
    // An unread metric must never read as "quiet" turning into an alarm, nor
    // as a false alarm: unknown stays inactive, the redis alarm covers it.
    expect(byKey(healthy({ login429LastHour: null })).get(opsAlertKeys.login429High)).toMatchObject({
      active: false,
    });
    // Exactly on the threshold is already a warning ("at or above").
    expect(byKey(healthy({ login429LastHour: 50 })).get(opsAlertKeys.login429High)).toMatchObject({
      active: true,
      severity: 'WARNING',
      details: { login429LastHour: 50, warnThreshold: 50, criticalThreshold: 200, windowMinutes: 60 },
    });
  });

  it('raises the 429 alarm to critical at the critical threshold', () => {
    const warning = byKey(healthy({ login429LastHour: 199 })).get(opsAlertKeys.login429High)!;
    expect(warning.severity).toBe('WARNING');
    const critical = byKey(healthy({ login429LastHour: 200 })).get(opsAlertKeys.login429High)!;
    expect(critical).toMatchObject({ active: true, severity: 'CRITICAL' });
  });

  it('reports every key and nothing active for a healthy system', () => {
    const observations = evaluateOpsSignals(healthy(), thresholds, baseline);
    expect(observations.filter((observation) => observation.active)).toEqual([]);
    expect(new Set(observations.map((observation) => observation.key)).size).toBe(observations.length);
  });

  it('raises the disk alarm as a warning, then critical', () => {
    const warn = byKey(healthy({ disk: { usedPercent: 83.44, freeBytes: 16.6 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 } })).get(opsAlertKeys.diskUsage)!;
    expect(warn).toMatchObject({ active: true, severity: 'WARNING', details: { usedPercent: 83.4, freeGb: 16.6, totalGb: 100 } });
    const critical = byKey(healthy({ disk: { usedPercent: 90, freeBytes: 1, totalBytes: 10 } })).get(opsAlertKeys.diskUsage)!;
    expect(critical.severity).toBe('CRITICAL');
  });

  it('treats an unreadable disk as unknown, not as an alarm', () => {
    expect(byKey(healthy({ disk: null })).get(opsAlertKeys.diskUsage)!.active).toBe(false);
  });

  it('uses the configurable ClamAV streak and grades by fail-open', () => {
    const closed = byKey(healthy({ clamav: { configured: true, ok: false, failOpen: false } })).get(opsAlertKeys.clamavUnavailable)!;
    expect(closed).toMatchObject({ active: true, severity: 'CRITICAL', openAfter: 3 });
    const open = byKey(healthy({ clamav: { configured: true, ok: false, failOpen: true } })).get(opsAlertKeys.clamavUnavailable)!;
    expect(open.severity).toBe('WARNING');
    expect(byKey(healthy({ clamav: { configured: false } })).get(opsAlertKeys.clamavUnavailable)!.active).toBe(false);
  });

  it('flags a late SLA scan by last success or by an overdue schedule', () => {
    const stale = healthy({
      schedulers: [{ queue: 'sla-scan', schedulerId: 'sla-scan', everyMs: minute, pattern: null, nextMs: now + 1_000, lastSuccessMs: now - 6 * minute, lastFailureMs: now - 30_000 }],
    });
    expect(byKey(stale).get(opsAlertKeys.slaScanLate)).toMatchObject({ active: true, severity: 'CRITICAL', details: { minutesSinceSuccess: 6 } });
    const fresh = healthy({
      schedulers: [{ queue: 'sla-scan', schedulerId: 'sla-scan', everyMs: minute, pattern: null, nextMs: now - 2 * minute, lastSuccessMs: null, lastFailureMs: null }],
    });
    // New install, nothing completed yet and only 2 minutes overdue: not late.
    expect(byKey(fresh).get(opsAlertKeys.slaScanLate)!.active).toBe(false);
  });

  it('alarms on 5xx only when both the count and the share are reached', () => {
    expect(byKey(healthy({ http: { errors5xx: 19, total: 100 } })).get(opsAlertKeys.http5xx)!.active).toBe(false);
    expect(byKey(healthy({ http: { errors5xx: 25, total: 5_000 } })).get(opsAlertKeys.http5xx)!.active).toBe(false);
    expect(byKey(healthy({ http: { errors5xx: 25, total: 1_000 } })).get(opsAlertKeys.http5xx)).toMatchObject({ active: true, severity: 'WARNING', details: { percent: 2.5 } });
    expect(byKey(healthy({ http: { errors5xx: 50, total: 400 } })).get(opsAlertKeys.http5xx)!.severity).toBe('CRITICAL');
  });

  it('marks database and Redis outages critical', () => {
    const observations = byKey(healthy({ database: 'fail', redis: 'fail', integrationDlq: null, queues: null, schedulers: null, http: null }));
    expect(observations.get(opsAlertKeys.databaseUnavailable)).toMatchObject({ active: true, severity: 'CRITICAL' });
    expect(observations.get(opsAlertKeys.redisUnavailable)).toMatchObject({ active: true, severity: 'CRITICAL' });
    // Unknown data never turns into a DLQ or scheduler alarm.
    expect(observations.get(opsAlertKeys.queueDlq)!.active).toBe(false);
    expect(observations.get(opsAlertKeys.schedulerLate)!.active).toBe(false);
  });

  it('grades event-loop lag and LDAPS CA expiry', () => {
    expect(byKey(healthy({ eventLoopLagMs: 700 })).get(opsAlertKeys.apiEventLoopLag)!.severity).toBe('WARNING');
    expect(byKey(healthy({ eventLoopLagMs: 2_500 })).get(opsAlertKeys.apiEventLoopLag)!.severity).toBe('CRITICAL');
    expect(byKey(healthy({ ldapsCaExpiresAtMs: now + 31 * 86_400_000 })).get(opsAlertKeys.ldapsCaExpiry)!.active).toBe(false);
    expect(byKey(healthy({ ldapsCaExpiresAtMs: now + 20 * 86_400_000 })).get(opsAlertKeys.ldapsCaExpiry)).toMatchObject({ severity: 'WARNING', details: { daysLeft: 20 } });
    expect(byKey(healthy({ ldapsCaExpiresAtMs: now - 86_400_000 })).get(opsAlertKeys.ldapsCaExpiry)!.severity).toBe('CRITICAL');
  });

  it('fires websocket emit alarm above threshold (busiest room wins)', () => {
    expect(byKey(healthy()).get(opsAlertKeys.websocketEmitsHigh)!.active).toBe(false);
    expect(
      byKey(healthy({ websocketEmits: { staff: 10, public: 0, user: 5, group: 600, 'group-legacy': 0, broadcast: 0 } })).get(opsAlertKeys.websocketEmitsHigh)!,
    ).toMatchObject({ active: true, severity: 'WARNING', details: { busiestRoom: 'group', emitsPerMinute: 600 }, openAfter: 2 });
    expect(
      byKey(healthy({ websocketEmits: { staff: 0, public: 0, user: 0, group: 0, 'group-legacy': 2_500, broadcast: 0 } })).get(opsAlertKeys.websocketEmitsHigh)!.severity,
    ).toBe('CRITICAL');
    // Null signal means Redis/metric outage - do not alert (that is the
    // redis.unavailable alarm's job).
    expect(byKey(healthy({ websocketEmits: null })).get(opsAlertKeys.websocketEmitsHigh)!.active).toBe(false);
  });
});

describe('findLateSchedulers', () => {
  it('reports a schedule nobody picked up after its grace', () => {
    const late = findLateSchedulers({
      nowMs: now,
      schedulers: [
        { queue: 'privacy', schedulerId: 'p', everyMs: null, pattern: '*/15 * * * *', nextMs: now - 16 * minute, lastSuccessMs: null, lastFailureMs: null },
        { queue: 'unrouted-sweep', schedulerId: 'u', everyMs: 5 * minute, pattern: null, nextMs: now - 14 * minute, lastSuccessMs: null, lastFailureMs: null },
      ],
    });
    expect(late).toEqual([{ queue: 'privacy', schedulerId: 'p', reason: 'not_picked_up', minutesLate: 16 }]);
  });

  it('reports an interval job whose runs keep failing', () => {
    const late = findLateSchedulers({
      nowMs: now,
      schedulers: [
        { queue: 'waiting-for-user', schedulerId: 'w', everyMs: minute, pattern: null, nextMs: now + 1_000, lastSuccessMs: now - 11 * minute, lastFailureMs: now - 10_000 },
      ],
    });
    expect(late).toEqual([{ queue: 'waiting-for-user', schedulerId: 'w', reason: 'failing', minutesLate: 11 }]);
  });

  it('leaves the SLA scan to its own alarm', () => {
    expect(
      findLateSchedulers({
        nowMs: now,
        schedulers: [{ queue: 'sla-scan', schedulerId: 's', everyMs: minute, pattern: null, nextMs: now - 60 * minute, lastSuccessMs: null, lastFailureMs: null }],
      }),
    ).toEqual([]);
  });
});

describe('DLQ baseline', () => {
  it('alarms on growth only', () => {
    const signals = { integrationDlq: 3, queues: [{ queue: 'integration', waiting: 0, active: 0, delayed: 0, failed: 5 }] };
    expect(dlqGrowth(signals, baseline)).toEqual({ integrationDlq: 2, failedByQueue: { integration: 3 } });
    expect(byKey(healthy(signals)).get(opsAlertKeys.queueDlq)).toMatchObject({ active: true, details: { newFailures: 5 } });
  });

  it('follows trimmed counts down but never up', () => {
    const lowered = lowerDlqBaseline({ integrationDlq: 0, queues: [{ queue: 'integration', waiting: 0, active: 0, delayed: 0, failed: 1 }] }, baseline);
    expect(lowered).toEqual({ integrationDlq: 0, failedByQueue: { integration: 1 } });
    expect(lowerDlqBaseline({ integrationDlq: 4, queues: [{ queue: 'integration', waiting: 0, active: 0, delayed: 0, failed: 9 }] }, baseline)).toBeNull();
  });
});

describe('watchdog observations', () => {
  const heartbeat = (overrides: Partial<Parameters<typeof observeWorkerHeartbeat>[0]> = {}) =>
    observeWorkerHeartbeat({
      lastHeartbeatAt: null,
      nowMs: now,
      staleSeconds: 120,
      snapshotGeneratedAt: null,
      snapshotStaleSeconds: 180,
      absenceIsEvidence: true,
      ...overrides,
    });
  const monitor = (overrides: Partial<Parameters<typeof observeMonitorFreshness>[0]> = {}) =>
    observeMonitorFreshness({
      workerAlive: true,
      snapshotGeneratedAt: null,
      nowMs: now,
      staleSeconds: 180,
      absenceIsEvidence: true,
      ...overrides,
    });

  it('reads a heartbeat that exists by its age, in both directions', () => {
    expect(heartbeat({ lastHeartbeatAt: new Date(now - 30_000).toISOString() }).active).toBe(false);
    expect(heartbeat({ lastHeartbeatAt: new Date(now - 121_000).toISOString() })).toMatchObject({
      active: true,
      severity: 'CRITICAL',
      details: { heartbeatAgeSeconds: 121, thresholdSeconds: 120 },
    });
    // A stale heartbeat pages even during the cold-start grace: the worker ran
    // and stopped, which is proof, not absence of proof.
    expect(
      heartbeat({ lastHeartbeatAt: new Date(now - 121_000).toISOString(), absenceIsEvidence: false }).active,
    ).toBe(true);
  });

  it('does not fire worker.down when the heartbeat key is missing but the worker is clearly alive', () => {
    // Incident 2026-10-16: absence was read as death, so a healthy worker was
    // paged CRITICAL whenever the key could not be read.
    expect(heartbeat({ snapshotGeneratedAt: new Date(now - 40_000).toISOString() }).active).toBe(false);
    // Cold start / rolling deploy: nothing in Redis yet, no snapshot yet either.
    expect(heartbeat({ absenceIsEvidence: false }).active).toBe(false);
  });

  it('fires worker.down on a missing key only with corroboration and a trustworthy Redis', () => {
    const observation = heartbeat({});
    expect(observation).toMatchObject({ active: true, severity: 'CRITICAL' });
    // `heartbeatAgeSeconds` is gone: the card must not show a number nobody read.
    expect(observation.details).toEqual({ heartbeatMissing: true, snapshotAgeSeconds: null, thresholdSeconds: 120 });
    // A stale snapshot is corroboration that nothing is running.
    expect(
      heartbeat({ snapshotGeneratedAt: new Date(now - 10 * 60_000).toISOString() }).details,
    ).toMatchObject({ heartbeatMissing: true, snapshotAgeSeconds: 600 });
  });

  it('fires ops.monitor.stale only while the worker is alive and absence can be trusted', () => {
    expect(monitor({}).active).toBe(true);
    expect(monitor({ workerAlive: false }).active).toBe(false);
    expect(monitor({ snapshotGeneratedAt: new Date(now - 60_000).toISOString() }).active).toBe(false);
    expect(monitor({ snapshotGeneratedAt: new Date(now - 200_000).toISOString() })).toMatchObject({
      active: true,
      severity: 'WARNING',
      details: { snapshotAgeSeconds: 200 },
    });
    expect(monitor({ absenceIsEvidence: false }).active).toBe(false);
    expect(monitor({ absenceIsEvidence: false }).details).toEqual({});
  });

  it('alarms while the mail provider blocks outbound mail, and grades a long block', () => {
    const blocked = (overrides: Partial<NonNullable<OpsSignals['mailProviderBlock']>> = {}) => ({
      reason: 'dailyLimit',
      openedAtMs: now - 10 * minute,
      blockedUntilMs: now + 50 * minute,
      suppressedTotal: 7,
      ...overrides,
    });
    expect(byKey(healthy({})).get(opsAlertKeys.emailProviderBlocked)!.active).toBe(false);
    expect(byKey(healthy({ mailProviderBlock: blocked() })).get(opsAlertKeys.emailProviderBlocked)).toMatchObject({
      active: true,
      severity: 'WARNING',
      details: { blockedMinutesLeft: 50, suppressedTotal: 7 },
    });
    // An expired block is not an alarm, even if the key is still in Redis.
    expect(
      byKey(healthy({ mailProviderBlock: blocked({ blockedUntilMs: now - 1 }) })).get(opsAlertKeys.emailProviderBlocked)!
        .active,
    ).toBe(false);
    // The provider keeps refusing for hours: real mail is piling up.
    expect(
      byKey(healthy({ mailProviderBlock: blocked({ openedAtMs: now - 4 * 60 * minute }) })).get(
        opsAlertKeys.emailProviderBlocked,
      )!.severity,
    ).toBe('CRITICAL');
  });
});

describe('captcha metric alarms (5.4.2 stavka 2)', () => {
  const byKey = (signals: OpsSignals) => new Map(evaluateOpsSignals(signals, thresholds, baseline).map((o) => [o.key, o]));

  it('stays quiet at zero and below the warning threshold', () => {
    expect(byKey(healthy()).get(opsAlertKeys.captchaFailedHigh)?.active).toBe(false);
    expect(byKey(healthy({ captchaFailedLastHour: 49 })).get(opsAlertKeys.captchaFailedHigh)?.active).toBe(false);
    expect(byKey(healthy({ captchaSkippedLastHour: 49 })).get(opsAlertKeys.captchaSkippedHigh)?.active).toBe(false);
  });

  it('raises WARNING at the warning threshold and CRITICAL at the critical one, per metric', () => {
    const warning = byKey(healthy({ captchaFailedLastHour: 50 })).get(opsAlertKeys.captchaFailedHigh)!;
    expect(warning).toMatchObject({ active: true, severity: 'WARNING', details: { captchaFailedLastHour: 50, warnThreshold: 50, criticalThreshold: 200, windowMinutes: 60 } });
    const critical = byKey(healthy({ captchaSkippedLastHour: 200 })).get(opsAlertKeys.captchaSkippedHigh)!;
    expect(critical).toMatchObject({ active: true, severity: 'CRITICAL', details: { captchaSkippedLastHour: 200 } });
    // The two alarms are independent: a skipped burst does not raise the failed alarm.
    expect(byKey(healthy({ captchaSkippedLastHour: 200 })).get(opsAlertKeys.captchaFailedHigh)?.active).toBe(false);
  });

  it('never fires on an unknown total (Redis unreadable or a field missing)', () => {
    expect(byKey(healthy({ captchaFailedLastHour: null })).get(opsAlertKeys.captchaFailedHigh)?.active).toBe(false);
    const withoutField: Record<string, unknown> = { ...healthy() };
    delete withoutField.captchaSkippedLastHour;
    expect(byKey(withoutField as unknown as OpsSignals).get(opsAlertKeys.captchaSkippedHigh)?.active).toBe(false);
  });
  // Paket 5.4.2 (stavka 4): the audit webhook export has not delivered for a streak.
  it('stays quiet when nothing is pending, when the streak is short, or when the state is unknown', () => {
    const now = Date.parse('2026-10-13T10:00:00.000Z');
    expect(byKey(healthy({ nowMs: now })).get(opsAlertKeys.auditWebhookStalled)?.active).toBe(false);
    const short = now - 14 * 60_000;
    expect(byKey(healthy({ nowMs: now, auditWebhookPendingSinceMs: short })).get(opsAlertKeys.auditWebhookStalled)?.active).toBe(false);
    // An unreadable state reaches the evaluation as null, the same as "nothing pending": no alarm either way.
  });

  it('raises WARNING from 15 minutes and CRITICAL from one hour of the same streak', () => {
    const now = Date.parse('2026-10-13T10:00:00.000Z');
    const warning = byKey(healthy({ nowMs: now, auditWebhookPendingSinceMs: now - 15 * 60_000 })).get(opsAlertKeys.auditWebhookStalled)!;
    expect(warning).toMatchObject({
      active: true,
      severity: 'WARNING',
      details: { auditWebhookPendingMinutes: 15, warnAfterMinutes: 15, criticalAfterMinutes: 60 },
    });
    const critical = byKey(healthy({ nowMs: now, auditWebhookPendingSinceMs: now - 60 * 60_000 })).get(opsAlertKeys.auditWebhookStalled)!;
    expect(critical).toMatchObject({ active: true, severity: 'CRITICAL', details: { auditWebhookPendingMinutes: 60 } });
  });
});
