import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlClassName, labelClassName } from "@/components/ui/control";
import {
  canActivateConfigVersion,
  canRollbackConfigVersion,
  canValidateConfigVersion,
} from "@/lib/config-versions/config-version-actions";
import { requireConfigChangeReason } from "@/lib/config-versions/require-config-change-reason";
import type { ConfigShadowDiff, ConfigVersion } from "@/services/config-versions-types";

interface ConfigVersionActionsProperties {
  readonly version: ConfigVersion;
  readonly canWrite: boolean;
  readonly isBusy: boolean;
  readonly shadowResult: ConfigShadowDiff | null;
  readonly onValidate: () => void;
  readonly onActivate: (reason: string) => void;
  readonly onRollback: (reason: string) => void;
}

export function ConfigVersionActions({
  version,
  canWrite,
  isBusy,
  shadowResult,
  onValidate,
  onActivate,
  onRollback,
}: ConfigVersionActionsProperties) {
  const { t } = useTranslation();
  const [activateReason, setActivateReason] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [confirmation, setConfirmation] = useState<"activate" | "rollback" | null>(null);
  const activateReady = requireConfigChangeReason(activateReason) !== null;
  const rollbackReady = requireConfigChangeReason(rollbackReason) !== null;

  if (!canWrite) {
    return <p className="text-[12.5px] text-muted-foreground">{t("configVersions.readOnly")}</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-2">
        {canValidateConfigVersion(version.status) ? (
          <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={onValidate}>
            {t("configVersions.validate")}
          </Button>
        ) : null}
        {canActivateConfigVersion(version.status) ? (
          <>
            <label className={labelClassName}>
              {t("configVersions.activateReason")}
              <input
                className={controlClassName}
                value={activateReason}
                disabled={isBusy}
                onChange={(event) => setActivateReason(event.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={isBusy || !activateReady}
              onClick={() => setConfirmation("activate")}
            >
              {t("configVersions.activate")}
            </Button>
          </>
        ) : null}
      </div>
      {canRollbackConfigVersion(version.status) ? (
        <div className="grid gap-2">
          <label className={labelClassName}>
            {t("configVersions.rollbackReason")}
            <input
              className={controlClassName}
              value={rollbackReason}
              disabled={isBusy}
              required
              onChange={(event) => setRollbackReason(event.target.value)}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isBusy || !rollbackReady}
            onClick={() => setConfirmation("rollback")}
          >
            {t("configVersions.rollback")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={t(
          confirmation === "rollback"
            ? "configVersions.confirmRollbackTitle"
            : "configVersions.confirmActivateTitle",
        )}
        description={t("configVersions.confirmChangeDescription", {
          version: version.version,
        })}
        confirmLabel={t(
          confirmation === "rollback" ? "configVersions.rollback" : "configVersions.activate",
        )}
        intent={confirmation === "rollback" ? "danger" : "default"}
        isPending={isBusy}
        onConfirm={() => {
          const reason = requireConfigChangeReason(
            confirmation === "rollback" ? rollbackReason : activateReason,
          );
          if (reason === null) return;
          if (confirmation === "rollback") onRollback(reason);
          else onActivate(reason);
          setConfirmation(null);
        }}
      >
        {shadowResult ? (
          <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[12px]">
            <div>
              <dt className="text-muted-foreground">{t("configVersions.shadowSampleSize")}</dt>
              <dd className="font-semibold">{shadowResult.sampleSize}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("configVersions.shadowRoutingMismatches")}
              </dt>
              <dd className="font-semibold">{shadowResult.routingGroupMismatches}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("configVersions.shadowSlaMismatches")}</dt>
              <dd className="font-semibold">{shadowResult.slaRuleMismatches}</dd>
            </div>
          </dl>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
