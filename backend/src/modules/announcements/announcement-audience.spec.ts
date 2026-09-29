import {
  csvCell,
  effectiveAnnouncementStatus,
  expandAudienceUnits,
  isAudienceWithinUnit,
  isInAnnouncementAudience,
} from './announcement-audience';

const units = [
  { id: 'root', ouPath: 'org' },
  { id: 'it', ouPath: 'org/it' },
  { id: 'it-ops', ouPath: 'org/it/ops' },
  { id: 'hr', ouPath: 'org/hr' },
  { id: 'itx', ouPath: 'org/itx' },
];
const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
const none = { roles: [], organizationalUnitIds: [], groupIds: [] };

describe('isInAnnouncementAudience', () => {
  const agentInOps = { roleKeys: ['AGENT'], groupIds: ['g1'], unitPath: 'org/it/ops' };

  it('matches everyone when no filter is set', () => {
    expect(isInAnnouncementAudience(none, agentInOps, paths)).toBe(true);
    expect(isInAnnouncementAudience(none, { roleKeys: [], groupIds: [], unitPath: null }, paths)).toBe(true);
  });

  it('includes sub-units but not siblings sharing a prefix', () => {
    const audience = { ...none, organizationalUnitIds: ['it'] };
    expect(isInAnnouncementAudience(audience, agentInOps, paths)).toBe(true);
    expect(isInAnnouncementAudience(audience, { ...agentInOps, unitPath: 'org/itx' }, paths)).toBe(false);
    expect(isInAnnouncementAudience(audience, { ...agentInOps, unitPath: null }, paths)).toBe(false);
  });

  it('requires every non-empty filter to match', () => {
    const audience = { roles: ['AGENT'], organizationalUnitIds: ['it'], groupIds: ['g2'] };
    expect(isInAnnouncementAudience(audience, agentInOps, paths)).toBe(false);
    expect(isInAnnouncementAudience(audience, { ...agentInOps, groupIds: ['g2'] }, paths)).toBe(true);
    expect(isInAnnouncementAudience(audience, { ...agentInOps, groupIds: ['g2'], roleKeys: ['USER'] }, paths)).toBe(false);
  });

  it('ignores audience units that no longer exist', () => {
    expect(isInAnnouncementAudience({ ...none, organizationalUnitIds: ['gone'] }, agentInOps, paths)).toBe(false);
  });
});

describe('expandAudienceUnits', () => {
  it('returns the units and their sub-units', () => {
    expect(expandAudienceUnits(['it'], units).sort()).toEqual(['it', 'it-ops']);
    expect(expandAudienceUnits(['hr', 'it-ops'], units).sort()).toEqual(['hr', 'it-ops']);
    expect(expandAudienceUnits([], units)).toEqual([]);
  });
});

describe('effectiveAnnouncementStatus', () => {
  const row = { status: 'PUBLISHED' as const, startsAt: new Date('2026-10-01T08:00:00Z'), endsAt: new Date('2026-10-02T08:00:00Z') };
  it('derives scheduled, published and ended', () => {
    expect(effectiveAnnouncementStatus(row, new Date('2026-09-30T00:00:00Z'))).toBe('SCHEDULED');
    expect(effectiveAnnouncementStatus(row, new Date('2026-10-01T08:00:00Z'))).toBe('PUBLISHED');
    expect(effectiveAnnouncementStatus(row, new Date('2026-10-02T08:00:00Z'))).toBe('ENDED');
    expect(effectiveAnnouncementStatus({ ...row, status: 'WITHDRAWN' }, new Date('2026-10-01T09:00:00Z'))).toBe('WITHDRAWN');
    expect(effectiveAnnouncementStatus({ ...row, status: 'DRAFT' }, new Date('2026-10-01T09:00:00Z'))).toBe('DRAFT');
  });
});

describe('isAudienceWithinUnit', () => {
  it('allows only a non-empty audience inside the own unit', () => {
    expect(isAudienceWithinUnit(['it', 'it-ops'], 'org/it', paths)).toBe(true);
    expect(isAudienceWithinUnit(['it', 'hr'], 'org/it', paths)).toBe(false);
    expect(isAudienceWithinUnit([], 'org/it', paths)).toBe(false);
    expect(isAudienceWithinUnit(['it'], null, paths)).toBe(false);
    expect(isAudienceWithinUnit(['itx'], 'org/it', paths)).toBe(false);
  });
});

describe('csvCell', () => {
  it('quotes and neutralises formulas', () => {
    expect(csvCell('Ana "A"')).toBe('"Ana ""A"""');
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
  });
});
