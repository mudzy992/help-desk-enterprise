import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { RoutingCoverageItem } from "@/services/routing-api";
import {
  ROUTING_COVERAGE_CELL_STYLE,
  buildRoutingCoverageMatrix,
  coverageCellKey,
  type RoutingCoverageCellKind,
} from "./build-routing-coverage-matrix";
import { RoutingCoverageCell } from "./routing-coverage-cell";

interface RoutingCoverageTableProperties {
  readonly items: readonly RoutingCoverageItem[];
  readonly emptyAction?: ReactNode;
}

const LEGEND: readonly {
  readonly kind: RoutingCoverageCellKind;
  readonly markKey:
    | "routing.markExact"
    | "routing.markFallback"
    | "routing.markUnrouted";
  readonly labelKey:
    | "routing.legendExact"
    | "routing.legendInherited"
    | "routing.legendUnrouted";
}[] = [
  { kind: "exact", markKey: "routing.markExact", labelKey: "routing.legendExact" },
  {
    kind: "inherited",
    markKey: "routing.markFallback",
    labelKey: "routing.legendInherited",
  },
  {
    kind: "unrouted",
    markKey: "routing.markUnrouted",
    labelKey: "routing.legendUnrouted",
  },
];

export function RoutingCoverageTable({
  items,
  emptyAction,
}: RoutingCoverageTableProperties) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<{
    originUnitId: string;
    serviceId: string;
  } | null>(null);
  const matrix = useMemo(() => buildRoutingCoverageMatrix(items), [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("routing.coverageEmptyTitle")}
        body={t("routing.coverageEmptyHint")}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">
          {t("routing.coverageStats", matrix.stats)}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          {LEGEND.map((entry) => (
            <span key={entry.kind} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border text-[9px] font-bold",
                  ROUTING_COVERAGE_CELL_STYLE[entry.kind],
                )}
              >
                {t(entry.markKey)}
              </span>
              {t(entry.labelKey)}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[980px] border-separate"
          style={{ borderSpacing: 3 }}
        >
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[190px] bg-surface px-2 py-1 text-left text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted/70">
                {t("routing.matrixAxis")}
              </th>
              {matrix.originUnits.map((origin) => (
                <th key={origin.originUnitId} className="px-1 py-1 text-center">
                  <span
                    className={cn(
                      "block text-[10.5px] font-medium",
                      hover?.originUnitId === origin.originUnitId
                        ? "text-text"
                        : "text-muted/80",
                    )}
                  >
                    {origin.originUnitShortName}
                  </span>
                  <span className="block truncate text-[8.5px] font-normal text-muted/40">
                    {origin.originUnitPath}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.services.map((service, rowIndex) => (
              <tr key={service.serviceId}>
                <td className="sticky left-0 z-10 bg-surface py-1 pr-2">
                  <span
                    className={cn(
                      "text-[11.5px]",
                      hover?.serviceId === service.serviceId
                        ? "text-text"
                        : "text-text/80",
                    )}
                  >
                    {service.serviceName}
                  </span>
                </td>
                {matrix.originUnits.map((origin) => {
                  const item = matrix.cellByKey.get(
                    coverageCellKey(service.serviceId, origin.originUnitId),
                  );
                  if (!item) {
                    return <td key={origin.originUnitId} />;
                  }
                  return (
                    <RoutingCoverageCell
                      key={origin.originUnitId}
                      item={item}
                      isActive={
                        hover?.originUnitId === origin.originUnitId &&
                        hover?.serviceId === service.serviceId
                      }
                      nearBottom={rowIndex >= matrix.services.length - 2}
                      onActivate={() =>
                        setHover({
                          originUnitId: origin.originUnitId,
                          serviceId: service.serviceId,
                        })
                      }
                      onDeactivate={() => setHover(null)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
