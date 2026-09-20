import { GitBranch, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, MetaBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ROUTING_OUTCOME_META } from "@/lib/theme/semantic-meta";
import { cn } from "@/lib/utils";
import type { RoutingErrorKey } from "@/lib/routing/map-routing-error";
import type { RoutingResolution } from "@/services/routing-api";

interface RoutingResolutionResultProperties {
  readonly resolution: RoutingResolution | null;
  readonly isLoading: boolean;
  readonly errorKey: RoutingErrorKey | null;
  readonly requestId: string | null;
  readonly originLabel: string;
  readonly serviceLabel: string;
  readonly groupLabel: string | null;
}

export function RoutingResolutionResult({
  resolution,
  isLoading,
  errorKey,
  requestId,
  originLabel,
  serviceLabel,
  groupLabel,
}: RoutingResolutionResultProperties) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader
        title={t("routing.resolutionTitle")}
        subtitle={t("routing.resolutionSubtitle")}
      />
      <div className="px-4 py-4">
        {isLoading ? (
          <PanelSkeleton className="mt-0" label={t("routing.resolutionTitle")} />
        ) : errorKey ? (
          <ApiErrorText messageKey={errorKey} requestId={requestId} />
        ) : resolution ? (
          <ResolutionBody
            resolution={resolution}
            originLabel={originLabel}
            serviceLabel={serviceLabel}
            groupLabel={groupLabel}
          />
        ) : (
          <EmptyState title={t("routing.testerEmpty")} />
        )}
      </div>
    </Card>
  );
}

function ResolutionBody({
  resolution,
  originLabel,
  serviceLabel,
  groupLabel,
}: {
  readonly resolution: RoutingResolution;
  readonly originLabel: string;
  readonly serviceLabel: string;
  readonly groupLabel: string | null;
}) {
  const { t } = useTranslation();
  const queue = resolution.unroutedQueue ?? null;
  const groupDisplay =
    groupLabel ??
    (resolution.groupId === null || resolution.groupId === undefined
      ? t("routing.noGroup")
      : t("tickets.detail.unknownGroup"));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <MetaBadge
          meta={{
            label: t(outcomeLabelKey(resolution.outcome)),
            tone: ROUTING_OUTCOME_META[resolution.outcome].tone,
          }}
          className="px-2 py-1 text-[12px]"
        />
        <span className="text-[15px] font-semibold text-text">
          {resolution.groupId ? groupDisplay : t("routing.noGroup")}
        </span>
        {resolution.fallbackDepth > 0 && resolution.groupId ? (
          <Badge tone="info" dot={false}>
            {t("routing.fallbackDepth", { depth: resolution.fallbackDepth })}
          </Badge>
        ) : null}
      </div>
      {resolution.outcome === "UNROUTED" ? (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/6 px-3.5 py-2.5 text-[12px] leading-5 text-text/85">
          {t("routing.unroutedBanner")}
          {queue ? (
            <span className="tnum"> {queue.ownerRole}</span>
          ) : null}
        </div>
      ) : null}
      <FallbackPath resolution={resolution} />
      <div className="mt-4 rounded-md border border-border bg-background/70 p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted/60">
          <GitBranch size={11} /> {t("routing.engineResponse")}
        </p>
        <pre className="overflow-x-auto text-[11.5px] leading-5 text-text/85 tnum">
          {JSON.stringify(resolution, null, 2)}
        </pre>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-4.5 text-muted">
        <Info size={12.5} className="mt-0.5 shrink-0" />
        {t("routing.testerNote")}
      </p>
      <p className="mt-1 text-[11px] text-muted/60">
        {t("routing.testerInputSummary", {
          origin: originLabel,
          service: serviceLabel,
        })}
      </p>
    </>
  );
}

function FallbackPath({ resolution }: { readonly resolution: RoutingResolution }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/70">
        {t("routing.fallbackPathHeading")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {resolution.fallbackPath.map((path, index) => {
          const isMatch =
            resolution.matchedOriginUnitId !== null &&
            index === resolution.fallbackPath.length - 1;
          return (
            <span key={`${path}-${index}`} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] tnum",
                  isMatch
                    ? "border-success/45 bg-success/12 font-semibold text-[#4ADE80]"
                    : "border-border bg-background/60 text-muted",
                )}
              >
                {path}
                {index === 0 ? (
                  <span className="ml-1 text-[9px] text-info">
                    {t("routing.originChip")}
                  </span>
                ) : null}
                {isMatch ? <span className="ml-1">✓</span> : null}
              </span>
              {index < resolution.fallbackPath.length - 1 ? (
                <span className="text-muted/50">→</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function outcomeLabelKey(
  outcome: RoutingResolution["outcome"],
):
  | "routing.outcomeExact"
  | "routing.outcomeInherited"
  | "routing.outcomeUnrouted" {
  if (outcome === "EXACT") {
    return "routing.outcomeExact";
  }
  if (outcome === "PARENT_FALLBACK") {
    return "routing.outcomeInherited";
  }
  return "routing.outcomeUnrouted";
}
