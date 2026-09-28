import { decideAlertTransition, type OpenAlertState } from './alert-state-machine';
import type { OpsObservation } from './evaluate-ops-signals';

const now = new Date('2026-11-20T10:00:00.000Z');
const hour = 3_600_000;

const disk = (active: boolean, severity: 'WARNING' | 'CRITICAL' = 'WARNING'): OpsObservation => ({
  key: 'disk.usage',
  active,
  severity,
  details: {},
});

const firing = (overrides: Partial<OpenAlertState> = {}): OpenAlertState => ({
  status: 'FIRING',
  severity: 'WARNING',
  lastNotifiedAt: new Date(now.getTime() - 10 * 60_000),
  notifyCount: 1,
  ...overrides,
});

const step = (observation: OpsObservation, open: OpenAlertState | null, positive = 0, negative = 0) =>
  decideAlertTransition({ observation, open, streak: { positive, negative }, now, reminderMs: 4 * hour });

describe('decideAlertTransition', () => {
  it('opens only after the hysteresis streak (disk: 2 checks)', () => {
    expect(step(disk(true), null)).toEqual({ streak: { positive: 1, negative: 0 }, action: 'none', notify: null });
    expect(step(disk(true), null, 1)).toEqual({ streak: { positive: 2, negative: 0 }, action: 'open', notify: 'opened' });
  });

  it('honours an observation-specific streak (ClamAV setting)', () => {
    const clamav: OpsObservation = { key: 'clamav.unavailable', active: true, severity: 'CRITICAL', details: {}, openAfter: 3 };
    expect(step(clamav, null, 1).action).toBe('none');
    expect(step(clamav, null, 2).action).toBe('open');
  });

  it('escalates immediately, even when acknowledged', () => {
    expect(step(disk(true, 'CRITICAL'), firing({ status: 'ACKNOWLEDGED' }), 5)).toMatchObject({ action: 'escalate', notify: 'escalated' });
  });

  it('de-escalates silently', () => {
    expect(step(disk(true, 'WARNING'), firing({ severity: 'CRITICAL' }), 5)).toMatchObject({ action: 'deescalate', notify: null });
  });

  it('reminds every reminder interval while firing, not while acknowledged', () => {
    const old = new Date(now.getTime() - 4 * hour);
    expect(step(disk(true), firing({ lastNotifiedAt: old }), 5)).toMatchObject({ action: 'touch', notify: 'reminder' });
    expect(step(disk(true), firing({ lastNotifiedAt: old, status: 'ACKNOWLEDGED' }), 5)).toMatchObject({ action: 'touch', notify: null });
    expect(step(disk(true), firing(), 5)).toMatchObject({ action: 'touch', notify: null });
  });

  it('sends the missed "opened" message once notifications are possible again', () => {
    expect(step(disk(true), firing({ notifyCount: 0, lastNotifiedAt: null }), 5)).toMatchObject({ action: 'touch', notify: 'opened' });
  });

  it('resolves after the negative streak and announces it only if it was announced', () => {
    expect(step(disk(false), firing(), 0, 0)).toEqual({ streak: { positive: 0, negative: 1 }, action: 'none', notify: null });
    expect(step(disk(false), firing(), 0, 1)).toMatchObject({ action: 'resolve', notify: 'resolved' });
    expect(step(disk(false), firing({ notifyCount: 0 }), 0, 1)).toMatchObject({ action: 'resolve', notify: null });
  });

  it('resets the opposite streak on every flip', () => {
    expect(step(disk(false), null, 1, 0).streak).toEqual({ positive: 0, negative: 1 });
    expect(step(disk(true), null, 0, 3).streak).toEqual({ positive: 1, negative: 0 });
  });
});
