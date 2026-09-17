import { History, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { SlaProfile } from "@/services/sla-types";

interface SlaProfileDetailHeaderProperties {
  readonly profile: SlaProfile | undefined;
  readonly canWrite: boolean;
  readonly showHistory: boolean;
  readonly showEdit: boolean;
  readonly onToggleHistory: () => void;
  readonly onToggleEdit: () => void;
  readonly children: ReactNode;
}

export function SlaProfileDetailHeader({
  profile,
  canWrite,
  showHistory,
  showEdit,
  onToggleHistory,
  onToggleEdit,
  children,
}: SlaProfileDetailHeaderProperties) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader
        title={
          profile ? (
            <span className="flex items-center gap-2">
              <TimerReset size={15} className="text-[#7FA8F5]" />
              {profile.name}{" "}
              <span className="tnum text-muted/70">({profile.key})</span>
            </span>
          ) : (
            t("sla.newProfile")
          )
        }
        subtitle={profile ? t("sla.priorityTargetsHint") : undefined}
        actions={
          profile ? (
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onToggleHistory}
              >
                <History size={12} />
                {showHistory ? t("sla.hideHistory") : t("sla.history")}
              </Button>
              {canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={onToggleEdit}
                >
                  {showEdit ? t("sla.hideEdit") : t("sla.edit")}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      {children}
    </Card>
  );
}
