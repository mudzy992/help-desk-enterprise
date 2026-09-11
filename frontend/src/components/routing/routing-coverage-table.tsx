import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import type { RoutingCoverageItem } from "@/services/routing-api";

interface RoutingCoverageTableProperties {
  readonly items: readonly RoutingCoverageItem[];
}

function outcomeMark(
  outcome: RoutingCoverageItem["resolution"]["outcome"],
): { markKey: "routing.markExact" | "routing.markFallback" | "routing.markUnrouted"; tone: BadgeTone } {
  if (outcome === "EXACT") {
    return { markKey: "routing.markExact", tone: "success" };
  }
  if (outcome === "PARENT_FALLBACK") {
    return { markKey: "routing.markFallback", tone: "info" };
  }
  return { markKey: "routing.markUnrouted", tone: "danger" };
}

function resolutionLabelKey(
  outcome: RoutingCoverageItem["resolution"]["outcome"],
): "routing.outcomeExact" | "routing.outcomeInherited" | "routing.outcomeUnrouted" {
  if (outcome === "EXACT") {
    return "routing.outcomeExact";
  }
  if (outcome === "PARENT_FALLBACK") {
    return "routing.outcomeInherited";
  }
  return "routing.outcomeUnrouted";
}

export function RoutingCoverageTable({ items }: RoutingCoverageTableProperties) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("routing.coverageEmptyTitle")}
        body={t("routing.coverageEmptyHint")}
      />
    );
  }

  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[960px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("routing.columnService")}</th>
            <th className="px-3 py-2">{t("routing.columnOriginUnit")}</th>
            <th className="px-3 py-2">{t("routing.columnExact")}</th>
            <th className="px-3 py-2">{t("routing.columnResolved")}</th>
            <th className="px-3 py-2">{t("routing.columnGroup")}</th>
            <th className="px-3 py-2">{t("routing.columnPath")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const mark = outcomeMark(item.resolution.outcome);
            return (
              <tr
                key={`${item.serviceId}:${item.originUnitId}`}
                className={tableRowClassName}
              >
                <td className="px-3 py-2">{item.serviceName}</td>
                <td className="px-3 py-2">{item.originUnitPath}</td>
                <td className="px-3 py-2">
                  {item.hasExactRule ? (
                    <Badge tone="success">{t("routing.exactYes")}</Badge>
                  ) : item.resolution.outcome === "UNROUTED" ? (
                    <Badge tone="danger">{t("routing.missing")}</Badge>
                  ) : (
                    <Badge tone="info">{t("routing.outcomeInherited")}</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span title={t(resolutionLabelKey(item.resolution.outcome))}>
                    <Badge tone={mark.tone}>
                      {t(mark.markKey)}
                      <span className="sr-only">
                        {t(resolutionLabelKey(item.resolution.outcome))}
                      </span>
                    </Badge>
                  </span>
                </td>
                <td className="px-3 py-2 tnum">{item.resolution.groupId ?? "—"}</td>
                <td className="px-3 py-2 text-[12px] text-muted-foreground">
                  {item.resolution.fallbackPath.join(" → ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
