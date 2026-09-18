import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MetaBadge } from "@/components/ui/badge";
import { floatingPanelClassName } from "@/components/ui/control";
import { ROUTING_OUTCOME_META } from "@/lib/theme/semantic-meta";
import { cn } from "@/lib/utils";
import type { RoutingCoverageItem } from "@/services/routing-api";
import {
  coverageCellKind,
  outcomeLabelKeyForKind,
} from "./build-routing-coverage-matrix";

const TOOLTIP_WIDTH_PX = 224;
const VIEWPORT_PAD_PX = 8;

interface RoutingCoverageTooltipProperties {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly item: RoutingCoverageItem;
  readonly groupName: string | null;
}

export function RoutingCoverageTooltip({
  anchorRef,
  item,
  groupName,
}: RoutingCoverageTooltipProperties) {
  const { t } = useTranslation();
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const kind = coverageCellKind(item.resolution.outcome);
  const labelKey = outcomeLabelKeyForKind(kind);
  const fallbackPath = item.resolution.fallbackPath.join(" → ");

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const placeAbove = rect.bottom + 120 > window.innerHeight;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH_PX / 2, VIEWPORT_PAD_PX),
        window.innerWidth - TOOLTIP_WIDTH_PX - VIEWPORT_PAD_PX,
      );
      setStyle({
        position: "fixed",
        left,
        width: TOOLTIP_WIDTH_PX,
        top: placeAbove ? undefined : rect.bottom + 6,
        bottom: placeAbove ? window.innerHeight - rect.top + 6 : undefined,
        zIndex: 80,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef]);

  if (style === null) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        floatingPanelClassName,
        "pointer-events-none p-2.5 text-left",
      )}
      style={style}
      role="tooltip"
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
        {groupName ? (
          <span className="tnum text-[10.5px] text-text/85">→ {groupName}</span>
        ) : null}
      </div>
      <p className="mt-1 tnum text-[10px] text-muted/70">
        {fallbackPath || item.originUnitPath}
      </p>
      <p className="mt-0.5 text-[10px] text-muted/70">
        {t("routing.fallbackDepth", { depth: item.resolution.fallbackDepth })}
      </p>
      {kind === "unrouted" ? (
        <p className="mt-1 text-[10px] text-danger/80">
          {t("routing.tooltipUnrouted")}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
