import { useTranslation } from "react-i18next";
import {
  auditMetadataFieldTranslationKey,
  auditMetadataValueTranslationKey,
  flattenAuditMetadata,
  type AuditMetadataEntry,
} from "@/lib/audit/audit-log-i18n";

/*
  One rendering of audit metadata for both cards (Admin → Red poslova i audit,
  and the SuperAdmin security journal). Before this the two cards had their own
  copies: the journal printed a raw field name whenever the field was not in the
  catalogue, and neither of them translated values.

  Rules, in the order they apply:

    * the field name becomes its label from the registry (`ipMaxFailures` →
      "Max failures per IP"); a field this client does not know yet falls back to
      a generic "Additional detail" — raw property names are never shown;
    * a value with a closed vocabulary is translated (`must_change` → "Must
      change password", `SUPER_ADMIN_ALLOWED` → "Allowed (SuperAdmin)"); free
      text, ids and timestamps are left exactly as the backend wrote them;
    * the first `visibleCount` rows are shown, the rest sit behind a "N more
      details" toggle, and the full list is the row tooltip.
*/

interface AuditMetadataListProperties {
  readonly metadata: unknown;
  readonly visibleCount?: number;
}

export function AuditMetadataList({ metadata, visibleCount = 3 }: AuditMetadataListProperties) {
  const { t } = useTranslation();
  const entries = flattenAuditMetadata(metadata);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  const labelFor = (path: readonly string[]) =>
    path
      .map((field) => {
        const key = auditMetadataFieldTranslationKey(field);
        return key === null ? t("admin.ops.auditLog.labels.unknownField") : t(key as never);
      })
      .join(" · ");

  const valueFor = (entry: AuditMetadataEntry) => {
    const field = entry.path.at(-1) ?? "";
    const key = auditMetadataValueTranslationKey(field, entry.value);
    return key === null ? entry.value : t(key as never);
  };

  const summary = entries.map((entry) => `${labelFor(entry.path)}: ${valueFor(entry)}`).join("; ");
  const visibleEntries = entries.slice(0, visibleCount);
  const hiddenEntries = entries.slice(visibleCount);

  const row = (entry: AuditMetadataEntry, index: number) => (
    <li key={`${entry.path.join(".")}-${index}`} className="break-words">
      <span className="font-medium text-foreground">{labelFor(entry.path)}:</span>{" "}
      <span className="text-muted-foreground">{valueFor(entry)}</span>
    </li>
  );

  return (
    <ul className="grid gap-0.5" title={summary}>
      {visibleEntries.map(row)}
      {hiddenEntries.length > 0 ? (
        <li>
          <details>
            <summary className="cursor-pointer text-link">
              {t("admin.ops.auditLog.labels.moreDetails", {
                count: hiddenEntries.length,
              })}
            </summary>
            <ul className="mt-1 grid gap-0.5 border-l border-border pl-2">
              {hiddenEntries.map((entry, index) => row(entry, index + visibleCount))}
            </ul>
          </details>
        </li>
      ) : null}
    </ul>
  );
}
