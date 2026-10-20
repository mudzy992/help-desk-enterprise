import type { TranslationKey } from "@/i18n/translation-key";
import { changeStatusKeys } from "@/lib/changes/change-labels";
import type { ChangeStatus } from "@/services/changes-api";

type Translate = (key: TranslationKey, options?: Record<string, unknown>) => string;

const historyFieldKeys: Readonly<Record<string, TranslationKey>> = {
  title: "changes.fields.title",
  type: "changes.fields.type",
  description: "changes.fields.description",
  reason: "changes.fields.reason",
  impact: "changes.fields.impact",
  likelihood: "changes.fields.likelihood",
  risk: "changes.fields.risk",
  causesDowntime: "changes.fields.causesDowntime",
  plannedStart: "changes.fields.plannedStart",
  plannedEnd: "changes.fields.plannedEnd",
  organizationalUnitId: "changes.fields.organizationalUnit",
  cabGroupId: "changes.fields.cabGroup",
  ownerUserId: "changes.fields.owner",
  problemId: "changes.fields.problem",
  implementationPlan: "changes.fields.implementationPlan",
  backoutPlan: "changes.fields.backoutPlan",
  testPlan: "changes.fields.testPlan",
  communicationPlan: "changes.fields.communicationPlan",
};

const statusLabel = (t: Translate, value: unknown) =>
  typeof value === "string" && value in changeStatusKeys
    ? t(changeStatusKeys[value as ChangeStatus])
    : "—";

const countOf = (detail: Record<string, unknown> | null, key: string): number => {
  const value = detail?.[key];
  if (typeof value === "number") return value;
  return Array.isArray(value) ? value.length : 0;
};

/** One line of the change history (requirement). */
export function changeHistoryText(
  t: Translate,
  action: string,
  detail: Record<string, unknown> | null,
): string {
  const text = (key: string) =>
    detail !== null && typeof detail[key] === "string" ? (detail[key] as string) : null;
  switch (action) {
    case "created":
      return t("changes.history.created", { number: text("number") ?? "" });
    case "status": {
      const via = text("action");
      if (via === "cab")
        return t("changes.history.statusCab", {
          from: statusLabel(t, detail?.from),
          to: statusLabel(t, detail?.to),
        });
      if (via === "reschedule") return t("changes.history.statusReschedule");
      return t("changes.history.status", {
        from: statusLabel(t, detail?.from),
        to: statusLabel(t, detail?.to),
      });
    }
    case "owner":
      return detail?.claimed === true ? t("changes.history.claimed") : t("changes.history.owner");
    case "updated": {
      const changes =
        detail !== null && typeof detail.changes === "object" && detail.changes !== null
          ? Object.keys(detail.changes)
          : [];
      const texts = Array.isArray(detail?.textChanged)
        ? (detail.textChanged as unknown[]).filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      const fields = [...changes, ...texts].map((field) =>
        historyFieldKeys[field] ? t(historyFieldKeys[field]) : field,
      );
      const links =
        countOf(detail, "addedServices") +
        countOf(detail, "removedServices") +
        countOf(detail, "addedAssets") +
        countOf(detail, "removedAssets");
      if (links > 0) fields.push(t("changes.history.linksChanged"));
      return t("changes.history.updated", { fields: fields.join(", ") || "—" });
    }
    case "approval":
      return t(
        detail?.decision === "REJECTED" ? "changes.history.rejected" : "changes.history.approved",
        {
          approvals: countOf(detail, "approvals"),
          quorum: countOf(detail, "quorum"),
          round: countOf(detail, "round"),
        },
      );
    case "conflicts_acknowledged":
      return t("changes.history.conflictsAcknowledged");
    case "downtime":
      return t("changes.history.downtime", {
        created: countOf(detail, "created"),
        updated: countOf(detail, "updated"),
        deleted: countOf(detail, "deleted"),
        skipped: countOf(detail, "skippedServiceIds"),
      });
    case "reminder":
      return text("kind") === "overdue"
        ? t("changes.history.reminderOverdue")
        : t("changes.history.reminderStartingSoon");
    default:
      return action;
  }
}
