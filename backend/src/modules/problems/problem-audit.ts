type FieldChange = { readonly from: unknown; readonly to: unknown };

/**
 * W7.30 (BA-problems-12): the canonical audit log needs the same forensic
 * answer as the problem history, but it must not become a second copy of the
 * record. So the entry carries **which** fields changed and, for references and
 * classifications, the previous and the new value; free text (description, RCA,
 * workaround, resolution, title) only appears by name in `textChanged`.
 */
const auditedReferenceFields = [
  'ownerUserId',
  'organizationalUnitId',
  'serviceId',
  'impact',
  'urgency',
  'priority',
  'rootCauseCategory',
] as const;

function previousKey(field: string): string {
  return `previous${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

export function problemUpdateAuditMetadata(
  changes: Readonly<Record<string, FieldChange>>,
  textChanged: readonly string[],
): Record<string, unknown> {
  const changedFields = [...Object.keys(changes), ...textChanged];
  const metadata: Record<string, unknown> = { changedFields };
  if (textChanged.length > 0) metadata.textChanged = [...textChanged];
  for (const field of auditedReferenceFields) {
    const change = changes[field];
    if (change === undefined) continue;
    metadata[field] = change.to ?? null;
    metadata[previousKey(field)] = change.from ?? null;
  }
  return metadata;
}

/** A claim only moves the owner: who had it and who took it. */
export function problemClaimAuditMetadata(
  previousOwnerUserId: string | null,
  ownerUserId: string,
): Record<string, unknown> {
  return { ownerUserId, previousOwnerUserId };
}
