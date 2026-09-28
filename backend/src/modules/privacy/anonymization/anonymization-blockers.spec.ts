import { evaluateAnonymizationBlockers, type AnonymizationFacts } from './anonymization-blockers';

const base: AnonymizationFacts = {
  isActive: false,
  anonymizedAt: null,
  legalHoldAt: null,
  directoryObjectGuid: 'g',
  directoryDeactivatedAt: new Date('2026-01-01'),
  roleKeys: ['USER'],
  otherActiveAdmins: 2,
  openAssignedTickets: 0,
  exportInProgress: false,
  erasureInProgress: false,
  isSelf: false,
};

describe('evaluateAnonymizationBlockers (§6.1)', () => {
  it('allows a user deactivated by the directory', () => {
    expect(evaluateAnonymizationBlockers(base)).toEqual([]);
  });

  it('allows a manual (non-AD) account deactivated by an admin', () => {
    expect(evaluateAnonymizationBlockers({ ...base, directoryObjectGuid: null, directoryDeactivatedAt: null })).toEqual([]);
  });

  it('refuses an AD account that is still active in AD', () => {
    expect(evaluateAnonymizationBlockers({ ...base, directoryDeactivatedAt: null })).toEqual(['active_in_directory']);
  });

  it('collects every reason', () => {
    expect(
      evaluateAnonymizationBlockers({
        ...base,
        isActive: true,
        isSelf: true,
        roleKeys: ['ADMIN', 'SUPER_ADMIN'],
        otherActiveAdmins: 0,
        legalHoldAt: new Date(),
        openAssignedTickets: 2,
        exportInProgress: true,
        erasureInProgress: true,
      }),
    ).toEqual([
      'self',
      'active',
      'super_admin',
      'last_admin',
      'legal_hold',
      'open_assigned_tickets',
      'export_in_progress',
      'erasure_in_progress',
    ]);
  });

  it('already anonymized short-circuits', () => {
    expect(evaluateAnonymizationBlockers({ ...base, isActive: true, anonymizedAt: new Date() })).toEqual(['already_anonymized']);
  });
});
