import { Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SlaEscalationRulesPanel } from "@/components/sla/sla-escalation-rules-panel";
import { Card, CardHeader } from "@/components/ui/card";
import type { SlaPauseSettings } from "@/lib/sla/use-sla-page-data";

interface SlaPausesEscalationsCardProperties {
  readonly slaProfileId: string;
  readonly pauses: SlaPauseSettings;
  readonly canWrite: boolean;
}

export function SlaPausesEscalationsCard({
  slaProfileId,
  pauses,
  canWrite,
}: SlaPausesEscalationsCardProperties) {
  const { t } = useTranslation();

  const pauseRows = [
    {
      key: "waiting",
      enabled: pauses.pauseOnWaitingForUser,
      title: t("sla.pauseWaitingTitle"),
      note: t("sla.pauseWaitingNote"),
    },
    {
      key: "approval",
      enabled: pauses.pauseOnPendingApproval,
      title: t("sla.pauseApprovalTitle"),
      note: t("sla.pauseApprovalNote"),
    },
  ] as const;

  return (
    <Card>
      <CardHeader
        title={t("sla.pausesEscalationsTitle")}
        subtitle={t("sla.pausesEscalationsHint")}
      />
      <div className="space-y-3 px-4 py-3.5">
        {pauseRows.map((row) => (
          <div key={row.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-6 items-center justify-center rounded-md border border-warning/30 bg-warning/10">
              <Pause size={11.5} className="text-warning" />
            </span>
            <div>
              <p className="text-[12.5px] font-medium text-text">
                {row.title}
                {!row.enabled ? (
                  <span className="ml-1.5 text-[11px] font-normal text-muted">
                    ({t("sla.pauseDisabled")})
                  </span>
                ) : null}
              </p>
              <p className="text-[11.5px] leading-[18px] text-muted">{row.note}</p>
            </div>
          </div>
        ))}
        <div className="border-t border-border/60 pt-3">
          <SlaEscalationRulesPanel
            slaProfileId={slaProfileId}
            canWrite={canWrite}
            embedded
          />
        </div>
      </div>
    </Card>
  );
}
