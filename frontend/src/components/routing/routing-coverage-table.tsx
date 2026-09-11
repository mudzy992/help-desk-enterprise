import { useTranslation } from "react-i18next";
import type { RoutingCoverageItem } from "@/services/routing-api";

interface RoutingCoverageTableProperties {
  readonly items: readonly RoutingCoverageItem[];
}

export function RoutingCoverageTable({ items }: RoutingCoverageTableProperties) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="mt-3 text-body text-muted-foreground">
        {t("routing.coverageEmpty")}
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto border border-border">
      <table className="w-full text-left text-body">
        <thead className="bg-elevated text-metadata text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("routing.columnService")}</th>
            <th className="px-3 py-2 font-medium">{t("routing.columnOriginUnit")}</th>
            <th className="px-3 py-2 font-medium">{t("routing.columnExact")}</th>
            <th className="px-3 py-2 font-medium">{t("routing.columnResolved")}</th>
            <th className="px-3 py-2 font-medium">{t("routing.columnGroup")}</th>
            <th className="px-3 py-2 font-medium">{t("routing.columnPath")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.serviceId}:${item.originUnitId}`}
              className="border-t border-border"
            >
              <td className="px-3 py-2">{item.serviceName}</td>
              <td className="px-3 py-2">{item.originUnitPath}</td>
              <td className="px-3 py-2">
                {item.hasExactRule ? t("routing.exactYes") : t("routing.missing")}
              </td>
              <td className="px-3 py-2">{t(resolutionLabelKey(item.resolution.outcome))}</td>
              <td className="px-3 py-2">{item.resolution.groupId ?? "—"}</td>
              <td className="px-3 py-2 text-metadata text-muted-foreground">
                {item.resolution.fallbackPath.join(" → ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
