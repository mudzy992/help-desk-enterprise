import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatSlaEscalationTarget } from "@/lib/sla/format-sla-escalation-target";
import {
  listSlaEscalationRules,
  type SlaEscalationRule,
} from "@/services/sla-api";

interface SlaEscalationsCardProperties {
  readonly slaProfileId: string;
  readonly canWrite: boolean;
  readonly onEdit: () => void;
  readonly refreshKey?: number;
}

export function SlaEscalationsCard({
  slaProfileId,
  canWrite,
  onEdit,
  refreshKey = 0,
}: SlaEscalationsCardProperties) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<readonly SlaEscalationRule[]>([]);

  useEffect(() => {
    if (slaProfileId.length === 0) {
      setRules([]);
      return;
    }
    void listSlaEscalationRules(slaProfileId).then((items) => setRules(items));
  }, [slaProfileId, refreshKey]);

  return (
    <Card>
      <CardHeader
        title={t("sla.escalationsCardTitle")}
        subtitle={t("sla.escalationsCardHint")}
        actions={
          canWrite ? (
            <Button type="button" variant="outline" size="xs" onClick={onEdit}>
              {t("sla.edit")}
            </Button>
          ) : null
        }
      />
      <div className="space-y-3 px-4 py-3.5">
        {rules.length === 0 ? (
          <EmptyState
            title={t("sla.escalationsHeading")}
            body={t("sla.escalationsEmptyBody")}
          />
        ) : (
          rules.map((rule) => {
            const isImmediate = rule.triggerOffsetMinutes === 0;
            return (
              <div key={rule.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 items-center justify-center rounded-md border",
                    isImmediate
                      ? "border-danger/30 bg-danger/10"
                      : "border-warning/30 bg-warning/10",
                  )}
                >
                  <BellRing
                    size={11.5}
                    className={isImmediate ? "text-danger" : "text-warning"}
                  />
                </span>
                <div className="flex-1">
                  <p className="tnum text-[12.5px] font-medium text-text">
                    {t("sla.escalationAtOffset", {
                      minutes: rule.triggerOffsetMinutes,
                      level: rule.level,
                    })}
                  </p>
                  <p className="text-[11.5px] leading-[18px] text-muted">
                    {t("sla.escalationNotifyAction")} ·{" "}
                    <span className="text-text/70">
                      {formatSlaEscalationTarget(rule, t)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
