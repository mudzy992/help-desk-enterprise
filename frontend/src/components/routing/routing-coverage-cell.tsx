import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { RoutingCoverageItem } from "@/services/routing-api";
import {
  ROUTING_COVERAGE_CELL_STYLE,
  coverageCellKind,
  markKeyForKind,
  outcomeLabelKeyForKind,
} from "./build-routing-coverage-matrix";
import { RoutingCoverageTooltip } from "./routing-coverage-tooltip";

interface RoutingCoverageCellProperties {
  readonly item: RoutingCoverageItem;
  readonly groupName: string | null;
  readonly isActive: boolean;
  readonly onActivate: () => void;
  readonly onDeactivate: () => void;
}

export function RoutingCoverageCell({
  item,
  groupName,
  isActive,
  onActivate,
  onDeactivate,
}: RoutingCoverageCellProperties) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const kind = coverageCellKind(item.resolution.outcome);
  const labelKey = outcomeLabelKeyForKind(kind);

  return (
    <td className="text-center">
      <button
        ref={buttonRef}
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
        <RoutingCoverageTooltip
          anchorRef={buttonRef}
          item={item}
          groupName={groupName}
        />
      ) : null}
    </td>
  );
}
