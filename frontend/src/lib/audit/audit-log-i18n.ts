import { knownAuditActions } from "@/lib/audit/audit-log-actions";
export { knownAuditActions } from "@/lib/audit/audit-log-actions";
import { knownAuditEntityTypes } from "@/lib/audit/audit-log-entities";
export { knownAuditEntityTypes } from "@/lib/audit/audit-log-entities";
import { knownAuditMetadataFields } from "@/lib/audit/audit-log-fields";
export { knownAuditMetadataFields } from "@/lib/audit/audit-log-fields";
import { knownAuditMetadataValues } from "@/lib/audit/audit-log-values";
export { knownAuditMetadataValues } from "@/lib/audit/audit-log-values";

const knownActions = new Set<string>(knownAuditActions);
const knownEntityTypes = new Set<string>(knownAuditEntityTypes);
const knownMetadataFields = new Set<string>(knownAuditMetadataFields);

function keySlug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function auditActionTranslationKey(action: string): string | null {
  return knownActions.has(action) ? `admin.ops.auditLog.labels.actions.${keySlug(action)}` : null;
}

export function auditEntityTranslationKey(entityType: string): string | null {
  return knownEntityTypes.has(entityType)
    ? `admin.ops.auditLog.labels.entities.${keySlug(entityType)}`
    : null;
}

/** i18n key of a metadata value, or `null` when the value keeps its own words. */
export function auditMetadataValueTranslationKey(field: string, value: string): string | null {
  const known = knownAuditMetadataValues[field];
  if (known === undefined || !known.includes(value)) return null;
  return `admin.ops.auditLog.values.${field}.${keySlug(value)}`;
}

export function auditMetadataFieldTranslationKey(field: string): string | null {
  return knownMetadataFields.has(field) ? `admin.ops.auditLog.labels.fields.${field}` : null;
}

export type AuditMetadataEntry = {
  readonly path: readonly string[];
  readonly value: string;
};

/**
 * Flatten JSON metadata without exposing raw property names. The display uses
 * translated labels for known fields and one generic translated label for any
 * field introduced by an older/newer backend. Values were already scrubbed by
 * the audit writer; property names are never a user-visible fallback.
 */
export function flattenAuditMetadata(metadata: unknown): readonly AuditMetadataEntry[] {
  const entries: AuditMetadataEntry[] = [];
  const visit = (value: unknown, path: readonly string[], depth: number): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (value.every((item) => item === null || typeof item !== "object")) {
        entries.push({
          path: path.length === 0 ? ["unknown"] : path,
          value: value.map(displayScalar).join(", "),
        });
        return;
      }
      if (depth >= 6) return;
      for (const item of value) visit(item, path, depth + 1);
      return;
    }
    if (typeof value === "object") {
      if (depth >= 6) return;
      const fields = Object.entries(value as Record<string, unknown>);
      for (const [field, nested] of fields) visit(nested, [...path, field], depth + 1);
      return;
    }
    entries.push({ path: path.length === 0 ? ["unknown"] : path, value: displayScalar(value) });
  };
  visit(metadata, [], 0);
  return entries;
}

function displayScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}
