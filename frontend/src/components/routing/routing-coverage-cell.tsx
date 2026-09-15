import { useTranslation } from "react-i18next";
import { MetaBadge } from "@/components/ui/badge";
import { floatingPanelClassName } from "@/components/ui/control";
import { ROUTING_OUTCOME_META } from "@/lib/theme/semantic-meta";
import { cn } from "@/lib/utils";
import type { RoutingCoverageItem } from "@/services/routing-api";
import {
  ROUTING_COVERAGE_CELL_STYLE,
  coverageCellKind,
  markKeyForKind,
  outcomeLabelKeyForKind,
} from "./build-routing-coverage-matrix";

interface RoutingCoverageCellProperties {
  readonly item: RoutingCoverageItem;
  readonly isActive: boolean;
  readonly nearBottom: boolean;
  readonly onActivate: () => void;
  readonly onDeactivate: () => void;
}

export function RoutingCoverageCell({
  item,
  isActive,
  nearBottom,
  onActivate,
  onDeactivate,
}: RoutingCoverageCellProperties) {
  const { t } = useTranslation();
  const kind = coverageCellKind(item.resolution.outcome);
  const labelKey = outcomeLabelKeyForKind(kind);
  const fallbackPath = item.resolution.fallbackPath.join(" → ");

  return (
    <td className="relative text-center">
      <button
        type="button"
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        onFocus={onActivate}
        onBlur={onDeactivate}
        className={cn(
          "flex h-7 w-full items-center justify-center rounded-[5px] border text-[10.5px] font-bold transition-all",
          ROUTING_COVERAGE_CELL_STYLE[kind],
          isActive && "scale-105 ring-1 ring-white/30",
        )}
      >
        {t(markKeyForKind(kind))}
        <span className="sr-only">{t(labelKey)}</span>
      </button>
      {isActive ? (
        <div
          className={cn(
            floatingPanelClassName,
            "pointer-events-none absolute left-1/2 z-30 w-56 -translate-x-1/2 p-2.5 text-left",
            nearBottom ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <p className="text-[11px] font-medium text-text">{item.serviceName}</p>
          <p className="text-[10.5px] text-muted">{item.originUnitPath}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <MetaBadge
              meta={{
                label: t(labelKey),
                tone: ROUTING_OUTCOME_META[item.resolution.outcome].tone,
              }}
            />
            {item.resolution.groupId ? (
              <span className="tnum text-[10.5px] text-text/85">
                → {item.resolution.groupId}
              </span>
            ) : null}
          </div>
          <p className="mt-1 tnum text-[10px] text-muted/70">
            {fallbackPath || item.originUnitPath}
          </p>
          <p className="mt-0.5 text-[10px] text-muted/70">
            {t("routing.fallbackDepth", {
              depth: item.resolution.fallbackDepth,
            })}
          </p>
          {kind === "unrouted" ? (
            <p className="mt-1 text-[10px] text-danger/80">
              {t("routing.tooltipUnrouted")}
            </p>
          ) : null}
        </div>
      ) : null}
    </td>
  );
}
