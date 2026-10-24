import { analyzeRoleAssignments, type AssignmentInventoryRow } from './role-assignment-analyzer';
const base: AssignmentInventoryRow = { id: 'a1', userId: 'u1', roleId: 'r1', roleKey: 'AGENT', userIsActive: true, userIsLocalOnly: false, organizationalUnitId: null, serviceId: null };
describe('role assignment report-only analyzer', () => {
  it('emits a deterministic repair manifest without mutating source rows', () => {
    const rows = [base, { ...base, id: 'a2' }];
    const before = structuredClone(rows);
    const first = analyzeRoleAssignments(rows, '2026-10-24T00:00:00.000Z');
    const second = analyzeRoleAssignments([...rows].reverse(), '2026-10-24T00:00:00.000Z');
    expect(first).toEqual(second); expect(rows).toEqual(before);
    expect(first).toMatchObject({ mode: 'report-only', rowCount: 2, anomalies: [{ code: 'DUPLICATE_ASSIGNMENT', assignmentIds: ['a1', 'a2'] }] });
  });
  it('reports ambiguous scope and unsafe SuperAdmin assignments', () => {
    const manifest = analyzeRoleAssignments([{ ...base, roleKey: 'SUPER_ADMIN', organizationalUnitId: 'ou1', serviceId: 'svc1' }]);
    expect(manifest.anomalies.map(({ code }) => code).sort()).toEqual(['AMBIGUOUS_SCOPE', 'SUPER_ADMIN_NOT_LOCAL', 'SUPER_ADMIN_SCOPED']);
  });
  it('accepts global, OU-only, and service-only assignments', () => {
    const rows = [base, { ...base, id: 'a2', roleId: 'r2', organizationalUnitId: 'ou1' }, { ...base, id: 'a3', roleId: 'r3', serviceId: 'svc1' }];
    expect(analyzeRoleAssignments(rows).anomalies).toEqual([]);
  });
});
