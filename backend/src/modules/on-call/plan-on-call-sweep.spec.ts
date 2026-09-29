import { planOnCallSweep } from './plan-on-call-sweep';
import type { OnCallSegment } from './resolve-on-call';

const seg = (from: string, to: string, userId: string | null): OnCallSegment => ({
  startsAt: new Date(from),
  endsAt: new Date(to),
  userId,
  source: userId === null ? 'none' : 'rotation',
  overrideId: null,
});

// Sarajevo, CEST (UTC+2). Handoff 08:00 local = 06:00Z.
const segments = [
  seg('2026-09-28T06:00:00Z', '2026-09-30T06:00:00Z', 'ana'),
  seg('2026-09-30T06:00:00Z', '2026-10-01T06:00:00Z', 'bojan'),
  seg('2026-10-01T06:00:00Z', '2026-10-02T06:00:00Z', null),
];
const base = { scheduleId: 's1', timezone: 'Europe/Sarajevo', ownerUserId: 'owner', segments, reminderMinute: 15 * 60 };

describe('planOnCallSweep (Paket 2.9 K3)', () => {
  it('reminds the next person the day before, inside the reminder hour only', () => {
    const at1500 = planOnCallSweep({ ...base, now: new Date('2026-09-29T13:01:00Z') });
    expect(at1500.filter((a) => a.kind === 'reminder').map((a) => a.userId)).toEqual(['bojan']);
    const at1630 = planOnCallSweep({ ...base, now: new Date('2026-09-29T14:31:00Z') });
    expect(at1630.some((a) => a.kind === 'reminder')).toBe(false);
  });

  it('announces a shift start within the grace window, not the clipped first segment', () => {
    const actions = planOnCallSweep({ ...base, now: new Date('2026-09-30T06:16:00Z') });
    expect(actions.filter((a) => a.kind === 'shiftStarted').map((a) => a.userId)).toEqual(['bojan']);
    expect(planOnCallSweep({ ...base, now: new Date('2026-09-28T06:10:00Z') }).some((a) => a.kind === 'shiftStarted')).toBe(false);
    expect(planOnCallSweep({ ...base, now: new Date('2026-09-30T07:00:00Z') }).some((a) => a.kind === 'shiftStarted')).toBe(false);
  });

  it('warns the owner about an uncovered shift in the next 24 h with a stable dedupe key', () => {
    const early = planOnCallSweep({ ...base, now: new Date('2026-09-30T05:00:00Z') });
    expect(early.some((a) => a.kind === 'gap')).toBe(false);
    const gaps = planOnCallSweep({ ...base, now: new Date('2026-09-30T08:00:00Z') }).filter((a) => a.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ userId: 'owner', dedupeKey: `gap:s1:${Date.parse('2026-10-01T06:00:00Z')}` });
    expect(planOnCallSweep({ ...base, ownerUserId: null, now: new Date('2026-09-30T08:00:00Z') }).some((a) => a.kind === 'gap')).toBe(false);
  });
});
