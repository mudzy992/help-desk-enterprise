type FieldChange = { readonly from: unknown; readonly to: unknown };

/**
 * W7.67 (`BA-changes-11`): the canonical audit log has to answer the same
 * forensic question as the change history, without becoming a second copy of
 * the record. Free text (title, description, reason and the four plans) is
 * therefore only *named*; references and classifications carry the previous and
 * the new value. Service/asset links are references too, but they are stored as
 * counts: the audit reader needs to know that links moved and how many, not
 * which CMDB rows a change elsewhere in the installation touches.
 */
const auditedReferenceFields = [
  'ownerUserId',
  'organizationalUnitId',
  'cabGroupId',
  'problemId',
  'impact',
  'likelihood',
  'risk',
  'plannedStart',
  'plannedEnd',
] as const;

function previousKey(field: string): string {
  return `previous${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

export type ChangeAuditLinks = {
  readonly addedServices: readonly string[];
  readonly removedServices: readonly string[];
  readonly addedAssets: readonly string[];
  readonly removedAssets: readonly string[];
};

export function changeUpdateAuditMetadata(
  changes: Readonly<Record<string, FieldChange>>,
  textChanged: readonly string[],
  links: ChangeAuditLinks,
  reauthorized: boolean,
): Record<string, unknown> {
  const changedFields = [...Object.keys(changes), ...textChanged];
  if (
    links.addedServices.length +
      links.removedServices.length +
      links.addedAssets.length +
      links.removedAssets.length >
    0
  ) {
    changedFields.push('services', 'assets');
  }
  const metadata: Record<string, unknown> = { changedFields };
  if (textChanged.length > 0) metadata.textChanged = [...textChanged];
  for (const field of auditedReferenceFields) {
    const change = changes[field];
    if (change === undefined) continue;
    metadata[field] = change.to ?? null;
    metadata[previousKey(field)] = change.from ?? null;
  }
  if (links.addedServices.length > 0) metadata.servicesAdded = links.addedServices.length;
  if (links.removedServices.length > 0) metadata.servicesRemoved = links.removedServices.length;
  if (links.addedAssets.length > 0) metadata.assetsAdded = links.addedAssets.length;
  if (links.removedAssets.length > 0) metadata.assetsRemoved = links.removedAssets.length;
  if (reauthorized) metadata.reauthorized = true;
  return metadata;
}

/** A claim only moves the owner: who had it and who took it. */
export function changeClaimAuditMetadata(
  previousOwnerUserId: string | null,
  ownerUserId: string,
): Record<string, unknown> {
  return { ownerUserId, previousOwnerUserId };
}
