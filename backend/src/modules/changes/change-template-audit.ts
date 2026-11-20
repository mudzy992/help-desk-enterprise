import { ChangeError, changeErrorCodes } from './changes.constants';

/**
 * W7.71 (`BA-changes-15`): a template edit used to be last-write-wins. Two
 * managers could replace the same fields and the service links, and both got a
 * `change.template_saved` row that only said "updated" - no revision, no
 * before/after, so the audit log could not tell an edit from an overwrite.
 *
 * The fix has two halves, and neither needs a schema migration:
 *
 * 1. `ChangeTemplate` has no integer version, so the row's `updatedAt` is the
 *    revision token - exactly what `KnowledgeArticle` does since W7.51. The
 *    write compares that token inside its transaction, and the editor sends the
 *    one it loaded in `If-Match`, so a stale editor is rejected instead of
 *    silently winning. The header is mandatory here (unlike the knowledge
 *    article, whose write also re-checks a status); a template has no other
 *    precondition, so without it there is nothing to compare against.
 * 2. The audit entry follows the W7.67 rule for changes: free text is only
 *    *named* (a template holds up to four 8.000-character plans - copying both
 *    revisions would blow the 16 KiB metadata budget and duplicate the record),
 *    scalars carry previous and new value, service links are counted, and both
 *    revisions are named.
 */

/** Fields whose content is text; the audit entry names them and never copies them. */
export const changeTemplateTextFields = [
  'description',
  'implementationPlan',
  'backoutPlan',
  'testPlan',
] as const;

/** Fields small enough to carry before/after in the audit entry. */
export const changeTemplateScalarFields = [
  'name',
  'impact',
  'likelihood',
  'causesDowntime',
  'isActive',
] as const;

export type ChangeTemplateTextValue = string | null;

export type ChangeTemplateSnapshot = {
  readonly name: string;
  readonly description: string;
  readonly implementationPlan: string;
  readonly backoutPlan: string;
  readonly testPlan: ChangeTemplateTextValue;
  readonly impact: string;
  readonly likelihood: string;
  readonly causesDowntime: boolean;
  readonly isActive: boolean;
  readonly serviceIds: readonly string[];
};

export type ChangeTemplateRevisionRow = { readonly updatedAt: Date };

function previousKey(field: string): string {
  return `previous${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

/**
 * `If-Match` arrives as an entity tag, an ISO timestamp or both quoted. A
 * client may echo the response verbatim (`2027-01-01T10:00:00.000Z`), wrap it
 * in quotes, or send the weaker `W/"..."` form.
 */
export function normalizeChangeTemplateRevision(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  let normalized = value.trim();
  if (normalized.toLowerCase().startsWith('w/')) normalized = normalized.slice(2).trim();
  normalized = normalized.replace(/^"+|"+$/gu, '').trim();
  return normalized.length === 0 ? undefined : normalized;
}

/** The revision token a client has to send back unchanged. */
export function changeTemplateRevisionOf(row: ChangeTemplateRevisionRow): string {
  return row.updatedAt.toISOString();
}

function revisionMillis(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rejects a stale editor and refuses a write that carries no revision at all.
 * Compared as instants, so the same moment written without milliseconds or in
 * another offset is still the same revision.
 */
export function assertChangeTemplateRevision(
  row: ChangeTemplateRevisionRow,
  ifMatch: string | undefined,
): string {
  const expected = normalizeChangeTemplateRevision(ifMatch);
  if (expected === undefined) throw new ChangeError(changeErrorCodes.templateRevisionRequired);
  const expectedMillis = revisionMillis(expected);
  if (expectedMillis === null || expectedMillis !== row.updatedAt.getTime()) {
    throw new ChangeError(changeErrorCodes.templateStale);
  }
  return changeTemplateRevisionOf(row);
}

function sameServiceSet(
  before: readonly string[],
  after: readonly string[],
): boolean {
  const left = [...new Set(before)].sort();
  const right = [...new Set(after)].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export type ChangeTemplateAuditDiff = {
  /** Empty when the request would not change anything. */
  readonly changedFields: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
};

/**
 * Builds the `change.template_saved` metadata for an edit. The caller passes the
 * new revision only after the row was written, because `updatedAt` is assigned
 * by the database.
 */
export function changeTemplateUpdateAuditMetadata(input: {
  readonly before: ChangeTemplateSnapshot;
  readonly after: ChangeTemplateSnapshot;
  readonly previousRevision: string;
  readonly revision?: string;
}): ChangeTemplateAuditDiff {
  const { before, after } = input;
  const changedFields: string[] = [];
  const textChanged: string[] = [];
  const metadata: Record<string, unknown> = { operation: 'updated' };

  for (const field of changeTemplateScalarFields) {
    if (before[field] === after[field]) continue;
    changedFields.push(field);
    metadata[field] = after[field];
    metadata[previousKey(field)] = before[field];
  }
  for (const field of changeTemplateTextFields) {
    if (before[field] === after[field]) continue;
    changedFields.push(field);
    textChanged.push(field);
  }

  const added = [...new Set(after.serviceIds)].filter((id) => !before.serviceIds.includes(id));
  const removed = [...new Set(before.serviceIds)].filter((id) => !after.serviceIds.includes(id));
  if (!sameServiceSet(before.serviceIds, after.serviceIds)) changedFields.push('services');

  if (changedFields.length === 0) return { changedFields, metadata: {} };

  if (textChanged.length > 0) metadata.textChanged = textChanged;
  if (added.length > 0) metadata.servicesAdded = added.length;
  if (removed.length > 0) metadata.servicesRemoved = removed.length;
  metadata.changedFields = changedFields;
  metadata.previousRevision = input.previousRevision;
  if (input.revision !== undefined) metadata.revision = input.revision;
  return { changedFields, metadata };
}
