import { parseFreezePeriods } from './change-settings';

describe('change settings (3.4)', () => {
  it('parses freeze periods sorted by start', () => {
    expect(parseFreezePeriods('[]')).toEqual([]);
    expect(parseFreezePeriods('')).toEqual([]);
    expect(
      parseFreezePeriods('[{"from":"2026-12-24","to":"2027-01-02","label":" Kraj godine "},{"from":"2026-11-01","to":"2026-11-01"}]'),
    ).toEqual([
      { from: '2026-11-01', to: '2026-11-01', label: '' },
      { from: '2026-12-24', to: '2027-01-02', label: 'Kraj godine' },
    ]);
  });

  it('rejects malformed periods', () => {
    expect(parseFreezePeriods('{')).toBeNull();
    expect(parseFreezePeriods('{}')).toBeNull();
    expect(parseFreezePeriods('[{"from":"2026-02-30","to":"2026-03-01"}]')).toBeNull();
    expect(parseFreezePeriods('[{"from":"2026-03-02","to":"2026-03-01"}]')).toBeNull();
    expect(parseFreezePeriods(42)).toBeNull();
  });
});
