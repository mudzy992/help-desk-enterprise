import { createHash } from 'node:crypto';

export type AssignmentInventoryRow = {
  readonly id: string; readonly userId: string; readonly roleId: string; readonly roleKey: string;
  readonly userIsActive: boolean; readonly userIsLocalOnly: boolean;
  readonly organizationalUnitId: string | null; readonly serviceId: string | null;
};
export type AssignmentAnomalyCode = 'AMBIGUOUS_SCOPE' | 'DUPLICATE_ASSIGNMENT' | 'SUPER_ADMIN_SCOPED' | 'SUPER_ADMIN_NOT_LOCAL';
export type AssignmentAnomaly = { readonly code: AssignmentAnomalyCode; readonly assignmentIds: readonly string[]; readonly userId: string; readonly recommendation: string };
export type AssignmentRepairManifest = { readonly schemaVersion: 1; readonly mode: 'report-only'; readonly generatedAt: string; readonly sourceFingerprint: string; readonly rowCount: number; readonly anomalies: readonly AssignmentAnomaly[] };

/** Deterministic analysis only: this module deliberately exposes no write client. */
const identity = (row: AssignmentInventoryRow): string => [row.userId, row.roleId, row.organizationalUnitId ?? '-', row.serviceId ?? '-'].join('|');
export function analyzeRoleAssignments(rows: readonly AssignmentInventoryRow[], generatedAt = new Date().toISOString()): AssignmentRepairManifest {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, AssignmentInventoryRow[]>();
  for (const row of sorted) groups.set(identity(row), [...(groups.get(identity(row)) ?? []), row]);
  const anomalies: AssignmentAnomaly[] = [];
  for (const row of sorted) {
    if (row.organizationalUnitId && row.serviceId) anomalies.push({ code: 'AMBIGUOUS_SCOPE', assignmentIds: [row.id], userId: row.userId, recommendation: 'choose exactly one OU or service scope after owner review' });
    if (row.roleKey === 'SUPER_ADMIN' && (row.organizationalUnitId || row.serviceId)) anomalies.push({ code: 'SUPER_ADMIN_SCOPED', assignmentIds: [row.id], userId: row.userId, recommendation: 'replace with one global SUPER_ADMIN assignment' });
    if (row.roleKey === 'SUPER_ADMIN' && !row.userIsLocalOnly) anomalies.push({ code: 'SUPER_ADMIN_NOT_LOCAL', assignmentIds: [row.id], userId: row.userId, recommendation: 'remove assignment or convert the identity to reviewed local-only ownership' });
  }
  for (const duplicate of groups.values()) if (duplicate.length > 1) anomalies.push({ code: 'DUPLICATE_ASSIGNMENT', assignmentIds: duplicate.map(({ id }) => id), userId: duplicate[0].userId, recommendation: `keep ${duplicate[0].id}; remove duplicates only after approval` });
  anomalies.sort((a, b) => `${a.code}:${a.assignmentIds.join(',')}`.localeCompare(`${b.code}:${b.assignmentIds.join(',')}`));
  const sourceFingerprint = createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  return { schemaVersion: 1, mode: 'report-only', generatedAt, sourceFingerprint, rowCount: sorted.length, anomalies };
}
