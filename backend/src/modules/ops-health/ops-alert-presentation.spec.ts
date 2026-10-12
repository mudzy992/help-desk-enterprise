import { opsAlertDetailRows } from './ops-alert-presentation';

/*
  The detail rows are the only part of an alarm that carries numbers. They are
  rendered into the e-mail, the Teams card and the plain-text fallback, so a
  field without a label or an object dumped as "[object Object]" reaches the
  operator at the worst possible moment.

  The 429 alarm (package 5.4.0-f follow-up) adds `login429LastHour`, and the
  WebSocket alarm (5.2.3) carries the per-room map fixed here.
*/
describe('opsAlertDetailRows', () => {
  it('labels the 429 alarm fields in Bosnian and English', () => {
    const details = {
      login429LastHour: 1200,
      warnThreshold: 50,
      criticalThreshold: 200,
      windowMinutes: 60,
    };
    expect(opsAlertDetailRows({ details }, 'bs')).toEqual([
      { label: 'Blokirane prijave (429) u zadnjih sat', value: '1.200' },
      { label: 'Prag upozorenja', value: '50' },
      { label: 'Kritični prag', value: '200' },
      { label: 'Prozor (min)', value: '60' },
    ]);
    expect(opsAlertDetailRows({ details }, 'en').map((row) => row.label)).toEqual([
      'Blocked sign-ins (429) in the last hour',
      'Warning threshold',
      'Critical threshold',
      'Window (min)',
    ]);
  });

  it('expands the per-room map instead of printing an object', () => {
    const rows = opsAlertDetailRows(
      { details: { emitsPerMinute: 3200, busiestRoom: 'group-legacy', perRoom: { group: 3200, staff: 12 } } },
      'bs',
    );
    expect(rows).toEqual([
      { label: 'Emitova u minuti', value: '3.200' },
      { label: 'Najopterećenija soba', value: 'group-legacy' },
      { label: 'Emitova u minuti: group', value: '3.200' },
      { label: 'Emitova u minuti: staff', value: '12' },
    ]);
    expect(JSON.stringify(rows)).not.toContain('[object Object]');
  });

  it('keeps an unknown value readable', () => {
    expect(opsAlertDetailRows({ details: { meanLagMs: null } }, 'en')).toEqual([
      { label: 'Mean delay (ms)', value: 'unknown' },
    ]);
  });
});
