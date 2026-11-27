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
      <p className="text-[13px] font-medium text-foreground">{t("permissions.previewTitle")}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {t("permissions.previewSummary", {
          count: preview.affectedUserCount,
          added: preview.addedPermissionKeys.length,
          removed: preview.removedPermissionKeys.length,
        })}
      </p>
      {preview.affectedAssignmentCount > preview.affectedUserCount ? (
        // W2.33 (`BA-rbac-06`): the summary counts people; the grants behind
        // them explain why the scope counters can be larger than the headcount.
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("permissions.previewAssignmentCount", {
            count: preview.affectedAssignmentCount,
            users: preview.affectedUserCount,
          })}
        </p>
      ) : null}
      {preview.scopeImpacts["organizational-unit"] > 0 ||
      preview.scopeImpacts.service > 0 ||
      preview.scopeImpacts["organizational-unit-and-service"] > 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("permissions.previewScopeImpacts", {
            global: preview.scopeImpacts.global,
            organizationalUnit:
              preview.scopeImpacts["organizational-unit"] +
              preview.scopeImpacts["organizational-unit-and-service"],
            service:
              preview.scopeImpacts.service +
              preview.scopeImpacts["organizational-unit-and-service"],
          })}
        </p>
      ) : null}
      {preview.samples.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {preview.samples.map((sample) => (
            <li
              key={`${sample.assignmentId}-${sample.permissionKey}-${sample.scope.kind}`}
              className="rounded border border-border/70 px-3 py-2 text-[12px]"
            >
              <p className="font-medium text-foreground">{sample.displayName}</p>
              <p className="text-muted-foreground">{sample.permissionKey}</p>
              <p className="text-muted-foreground">
                {/* W2.31 (`BA-rbac-03`): the decision is only meaningful with its scope. */}
                {sample.scope.kind === "organizational-unit"
                  ? t("permissions.previewScopeOrganizationalUnit", {
                      name:
                        sample.scope.organizationalUnitName ??
                        sample.scope.organizationalUnitPath ??
                        "",
                    })
                  : sample.scope.kind === "service"
                    ? t("permissions.previewScopeService", {
                        name: sample.scope.serviceName ?? sample.scope.serviceId ?? "",
                      })
                    : sample.scope.kind === "organizational-unit-and-service"
                      ? t("permissions.previewScopeOrganizationalUnitAndService", {
                          organizationalUnit:
                            sample.scope.organizationalUnitName ??
                            sample.scope.organizationalUnitPath ??
                            "",
                          service: sample.scope.serviceName ?? sample.scope.serviceId ?? "",
                        })
                      : t("permissions.previewScopeGlobal")}
              </p>
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
        <p className="mt-1 text-[12px] text-muted-foreground">{t("permissions.reasonRequired")}</p>
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
