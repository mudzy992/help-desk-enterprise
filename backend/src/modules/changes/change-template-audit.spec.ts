import {
  assertChangeTemplateRevision,
  changeTemplateRevisionOf,
  changeTemplateUpdateAuditMetadata,
  normalizeChangeTemplateRevision,
  type ChangeTemplateSnapshot,
} from './change-template-audit';
import { ChangeError, changeErrorCodes } from './changes.constants';

function snapshot(overrides: Partial<ChangeTemplateSnapshot> = {}): ChangeTemplateSnapshot {
  return {
    name: 'Restart aplikacijskog servisa',
    description: 'Kratak prekid.',
    implementationPlan: 'Restart u terminu.',
    backoutPlan: 'Vraćanje prethodne instance.',
    testPlan: null,
    impact: 'LOW',
    likelihood: 'MEDIUM',
    causesDowntime: false,
    isActive: true,
    serviceIds: ['svc-1'],
    ...overrides,
  };
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof ChangeError ? error.code : undefined;
  }
  return undefined;
}

describe('change template revision (BA-changes-15)', () => {
  const row = { updatedAt: new Date('2027-01-01T10:00:00.000Z') };

  it('publishes the row updatedAt as the revision token', () => {
    expect(changeTemplateRevisionOf(row)).toBe('2027-01-01T10:00:00.000Z');
  });

  it.each([
    ['bare timestamp', '2027-01-01T10:00:00.000Z'],
    ['quoted entity tag', '"2027-01-01T10:00:00.000Z"'],
    ['weak entity tag', 'W/"2027-01-01T10:00:00.000Z"'],
    ['same instant without milliseconds', '2027-01-01T11:00:00+01:00'],
  ])('accepts the %s of the current revision', (_label, header) => {
    expect(assertChangeTemplateRevision(row, header)).toBe('2027-01-01T10:00:00.000Z');
  });

  it('refuses an edit without a revision instead of overwriting silently', () => {
    expect(codeOf(() => assertChangeTemplateRevision(row, undefined))).toBe(
      changeErrorCodes.templateRevisionRequired,
    );
    expect(normalizeChangeTemplateRevision('  "" ')).toBeUndefined();
  });

  it('refuses an edit that only saw an older revision', () => {
    expect(codeOf(() => assertChangeTemplateRevision(row, '2026-12-31T10:00:00.000Z'))).toBe(
      changeErrorCodes.templateStale,
    );
    expect(codeOf(() => assertChangeTemplateRevision(row, 'not-a-date'))).toBe(
      changeErrorCodes.templateStale,
    );
  });
});

describe('change template audit metadata (BA-changes-15)', () => {
  const previousRevision = '2027-01-01T10:00:00.000Z';
  const revision = '2027-01-01T10:05:00.000Z';

  it('reports nothing when the edit would not change the template', () => {
    const diff = changeTemplateUpdateAuditMetadata({
      before: snapshot(),
      after: snapshot({ serviceIds: ['svc-1', 'svc-1'] }),
      previousRevision,
      revision,
    });

    expect(diff.changedFields).toEqual([]);
    expect(diff.metadata).toEqual({});
  });

  it('carries before/after for scalars and only names free text', () => {
    const diff = changeTemplateUpdateAuditMetadata({
      before: snapshot(),
      after: snapshot({
        name: 'Restart uz najavu',
        impact: 'MEDIUM',
        isActive: false,
        implementationPlan: 'Restart uz najavu korisnicima.',
      }),
      previousRevision,
      revision,
    });

    expect(diff.changedFields).toEqual(['name', 'impact', 'isActive', 'implementationPlan']);
    expect(diff.metadata).toMatchObject({
      operation: 'updated',
      name: 'Restart uz najavu',
      previousName: 'Restart aplikacijskog servisa',
      impact: 'MEDIUM',
      previousImpact: 'LOW',
      isActive: false,
      previousIsActive: true,
      textChanged: ['implementationPlan'],
      changedFields: ['name', 'impact', 'isActive', 'implementationPlan'],
      previousRevision,
      revision,
    });
    // The plans are the record; the audit entry must not become a second copy.
    expect(JSON.stringify(diff.metadata)).not.toContain('Restart uz najavu korisnicima.');
    expect(diff.metadata).not.toHaveProperty('implementationPlan');
  });

  it('counts service links instead of naming CMDB rows', () => {
    const diff = changeTemplateUpdateAuditMetadata({
      before: snapshot({ serviceIds: ['svc-1', 'svc-2'] }),
      after: snapshot({ serviceIds: ['svc-2', 'svc-3', 'svc-4'] }),
      previousRevision,
      revision,
    });

    expect(diff.changedFields).toEqual(['services']);
    expect(diff.metadata).toMatchObject({ servicesAdded: 2, servicesRemoved: 1 });
    expect(JSON.stringify(diff.metadata)).not.toContain('svc-3');
  });

  it('treats a cleared test plan as a text change', () => {
    const diff = changeTemplateUpdateAuditMetadata({
      before: snapshot({ testPlan: 'Provjeri health endpoint.' }),
      after: snapshot({ testPlan: null }),
      previousRevision,
      revision,
    });

    expect(diff.changedFields).toEqual(['testPlan']);
    expect(diff.metadata).toMatchObject({ textChanged: ['testPlan'] });
  });
});
