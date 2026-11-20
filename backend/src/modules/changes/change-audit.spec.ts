import { prepareAuditEntry } from '../audit-log/audit-event-policy';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { changeClaimAuditMetadata, changeUpdateAuditMetadata } from './change-audit';

const noLinks = {
  addedServices: [],
  removedServices: [],
  addedAssets: [],
  removedAssets: [],
};

describe('change audit metadata (BA-changes-11)', () => {
  it('names every changed field but copies only references', () => {
    const metadata = changeUpdateAuditMetadata(
      {
        title: { from: 'Staro ime', to: 'Novo ime' },
        impact: { from: 'MEDIUM', to: 'HIGH' },
        ownerUserId: { from: 'owner-old', to: 'owner-new' },
        plannedStart: { from: '2027-01-01T08:00:00.000Z', to: '2027-01-02T08:00:00.000Z' },
      },
      ['description', 'backoutPlan'],
      noLinks,
      false,
    );

    expect(metadata.changedFields).toEqual([
      'title',
      'impact',
      'ownerUserId',
      'plannedStart',
      'description',
      'backoutPlan',
    ]);
    expect(metadata.textChanged).toEqual(['description', 'backoutPlan']);
    expect(metadata).toMatchObject({
      impact: 'HIGH',
      previousImpact: 'MEDIUM',
      ownerUserId: 'owner-new',
      previousOwnerUserId: 'owner-old',
      plannedStart: '2027-01-02T08:00:00.000Z',
      previousPlannedStart: '2027-01-01T08:00:00.000Z',
    });
    expect(JSON.stringify(metadata)).not.toContain('Staro ime');
    expect(JSON.stringify(metadata)).not.toContain('Novo ime');
  });

  it('keeps link changes as counts, not as CMDB identifiers', () => {
    const metadata = changeUpdateAuditMetadata(
      {},
      [],
      {
        addedServices: ['svc-1', 'svc-2'],
        removedServices: ['svc-3'],
        addedAssets: [],
        removedAssets: ['asset-1'],
      },
      false,
    );

    expect(metadata).toMatchObject({
      changedFields: ['services', 'assets'],
      servicesAdded: 2,
      servicesRemoved: 1,
      assetsRemoved: 1,
    });
    expect(metadata).not.toHaveProperty('assetsAdded');
    expect(JSON.stringify(metadata)).not.toContain('svc-1');
    expect(JSON.stringify(metadata)).not.toContain('asset-1');
  });

  it('flags a write that pushed the change back to authorization', () => {
    const metadata = changeUpdateAuditMetadata(
      { plannedEnd: { from: '2027-01-01T10:00:00.000Z', to: '2027-01-05T10:00:00.000Z' } },
      [],
      noLinks,
      true,
    );
    expect(metadata.reauthorized).toBe(true);
  });

  it('keeps a claim to the two owners', () => {
    expect(changeClaimAuditMetadata('owner-old', 'owner-new')).toEqual({
      ownerUserId: 'owner-new',
      previousOwnerUserId: 'owner-old',
    });
    expect(changeClaimAuditMetadata(null, 'owner-new')).toEqual({
      ownerUserId: 'owner-new',
      previousOwnerUserId: null,
    });
  });

  it('emits only keys the audit schema allows (checked by the real policy)', () => {
    const updateMetadata = changeUpdateAuditMetadata(
      {
        title: { from: 'a', to: 'b' },
        type: { from: 'NORMAL', to: 'EMERGENCY' },
        impact: { from: 'LOW', to: 'HIGH' },
        likelihood: { from: 'LOW', to: 'MEDIUM' },
        risk: { from: 'LOW', to: 'HIGH' },
        causesDowntime: { from: false, to: true },
        ownerUserId: { from: null, to: 'owner-1' },
        organizationalUnitId: { from: 'ou-1', to: 'ou-2' },
        cabGroupId: { from: null, to: 'cab-1' },
        problemId: { from: null, to: 'problem-1' },
        plannedStart: { from: null, to: '2027-01-01T08:00:00.000Z' },
        plannedEnd: { from: null, to: '2027-01-01T10:00:00.000Z' },
      },
      ['description', 'reason', 'implementationPlan', 'backoutPlan', 'testPlan', 'communicationPlan'],
      {
        addedServices: ['svc-1'],
        removedServices: ['svc-2'],
        addedAssets: ['asset-1'],
        removedAssets: ['asset-2'],
      },
      true,
    );

    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeUpdated,
        entityType: auditLogEntityTypes.change,
        entityId: 'change-1',
        actorUserId: 'user-1',
        organizationalUnitId: 'ou-1',
        metadata: updateMetadata as never,
      }),
    ).not.toThrow();

    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeClaimed,
        entityType: auditLogEntityTypes.change,
        entityId: 'change-1',
        actorUserId: 'user-1',
        organizationalUnitId: 'ou-1',
        metadata: changeClaimAuditMetadata('owner-old', 'user-1') as never,
      }),
    ).not.toThrow();
  });

  it('requires an organizational unit for both canonical actions', () => {
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeUpdated,
        entityType: auditLogEntityTypes.change,
        entityId: 'change-1',
        actorUserId: 'user-1',
        metadata: changeUpdateAuditMetadata({}, [], noLinks, false) as never,
      }),
    ).toThrow('AUDIT_SCOPE_REQUIRED:change.updated');

    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeClaimed,
        entityType: auditLogEntityTypes.change,
        entityId: 'change-1',
        actorUserId: 'user-1',
        metadata: changeClaimAuditMetadata(null, 'user-1') as never,
      }),
    ).toThrow('AUDIT_SCOPE_REQUIRED:change.claimed');
  });

  it('rejects metadata that tries to carry free text', () => {
    expect(() =>
      prepareAuditEntry({
        action: auditLogActions.changeUpdated,
        entityType: auditLogEntityTypes.change,
        entityId: 'change-1',
        actorUserId: 'user-1',
        organizationalUnitId: 'ou-1',
        metadata: { changedFields: ['description'], description: 'tajni tekst' } as never,
      }),
    ).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED:change.updated:description');
  });
});
