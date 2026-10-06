import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import type { RolePermissionPreviewResponse } from "@/services/rbac-api";

interface PermissionsPreviewPanelProperties {
  readonly preview: RolePermissionPreviewResponse;
  readonly pending: boolean;
  readonly onCancel: () => void;
  /** Paket 5.1 (M4 B2): the server stores the reason in the change log. */
  readonly onConfirm: (reason: string) => void;
}

export function PermissionsPreviewPanel({
  preview,
  pending,
  onCancel,
  onConfirm,
}: PermissionsPreviewPanelProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  // RAW `:223`: a permission change without a written reason is not accepted.
  const canConfirm = trimmedReason.length > 0 && trimmedReason.length <= 500;
  return (
    <div className="fade-in mt-4 rounded-lg border border-border/70 bg-elevated/40 p-4">
      <p className="text-[13px] font-medium text-foreground">
        {t("permissions.previewTitle")}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {t("permissions.previewSummary", {
          count: preview.affectedUserCount,
          added: preview.addedPermissionKeys.length,
          removed: preview.removedPermissionKeys.length,
        })}
      </p>
      {preview.samples.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {preview.samples.map((sample) => (
            <li
              key={`${sample.userId}-${sample.permissionKey}`}
              className="rounded border border-border/70 px-3 py-2 text-[12px]"
            >
              <p className="font-medium text-foreground">{sample.displayName}</p>
              <p className="text-muted-foreground">{sample.permissionKey}</p>
              <p className="mt-1 text-muted-foreground">
                {t("permissions.previewDecisionChange", {
                  before: sample.before.decision,
                  after: sample.after.decision,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          {t("permissions.previewNoSamples")}
        </p>
      )}
      <label className={`${labelClassName} mt-4`}>
        {t("permissions.reasonLabel")}
        <textarea
          className={controlClassName}
          rows={2}
          maxLength={500}
          value={reason}
          placeholder={t("permissions.reasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {trimmedReason.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("permissions.reasonRequired")}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("permissions.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onConfirm(trimmedReason)}
          disabled={pending || !canConfirm}
        >
          {pending ? t("permissions.saving") : t("permissions.confirmSave")}
        </Button>
      </div>
    </div>
  );
}
