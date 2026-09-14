import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import {
  canActivateConfigVersion,
  canRollbackConfigVersion,
  canValidateConfigVersion,
} from "@/lib/config-versions/config-version-actions";
import { requireConfigChangeReason } from "@/lib/config-versions/require-config-change-reason";
import type { ConfigVersion } from "@/services/config-versions-types";

interface ConfigVersionActionsProperties {
  readonly version: ConfigVersion;
  readonly canWrite: boolean;
  readonly isBusy: boolean;
  readonly onValidate: () => void;
  readonly onActivate: (reason: string) => void;
  readonly onRollback: (reason: string) => void;
}

export function ConfigVersionActions({
  version,
  canWrite,
  isBusy,
  onValidate,
  onActivate,
  onRollback,
}: ConfigVersionActionsProperties) {
  const { t } = useTranslation();
  const [activateReason, setActivateReason] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
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
              onClick={() => {
                const reason = requireConfigChangeReason(activateReason);
                if (reason !== null) {
                  onActivate(reason);
                }
              }}
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
            onClick={() => {
              const reason = requireConfigChangeReason(rollbackReason);
              if (reason !== null) {
                onRollback(reason);
              }
            }}
          >
            {t("configVersions.rollback")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
