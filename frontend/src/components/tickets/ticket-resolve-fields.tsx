import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { labelClassName, selectClassName, textareaClassName } from "@/components/ui/control";
import type { TicketClosePolicy, TicketStatus } from "@/services/tickets-api";

interface TicketResolveFieldsProperties {
  readonly pendingStatus: TicketStatus;
  readonly closePolicy: TicketClosePolicy | undefined;
  readonly closeCode: string;
  readonly resolutionNote: string;
  readonly saving: boolean;
  readonly onCloseCodeChange: (value: string) => void;
  readonly onResolutionNoteChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function TicketResolveFields({
  pendingStatus,
  closePolicy,
  closeCode,
  resolutionNote,
  saving,
  onCloseCodeChange,
  onResolutionNoteChange,
  onConfirm,
  onCancel,
}: TicketResolveFieldsProperties) {
  const { t } = useTranslation();
  const codes = closePolicy?.allowedCodes ?? [];
  return (
    <div className="mt-3 grid max-w-lg gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-[12.5px] text-muted-foreground">
        {t("tickets.detail.resolveHint", { status: t(`tickets.status.${pendingStatus}`) })}
      </p>
      {closePolicy?.enabled === true && codes.length > 0 ? (
        <label className={labelClassName}>
          {t("tickets.detail.closeCode")}
          <select
            className={selectClassName}
            value={closeCode}
            onChange={(event) => onCloseCodeChange(event.target.value)}
            required={closePolicy.requireOnResolve && pendingStatus === "RESOLVED"}
          >
            <option value="">{t("tickets.detail.closeCodePlaceholder")}</option>
            {codes.map((code) => (
              <option key={code.key} value={code.key}>
                {t(`tickets.closeCodes.${code.key}`, { defaultValue: code.name })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={labelClassName}>
        {t("tickets.detail.resolutionNote")}
        <textarea
          className={textareaClassName}
          value={resolutionNote}
          onChange={(event) => onResolutionNoteChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={onConfirm}>
          {saving ? t("tickets.detail.saving") : t("tickets.detail.confirmStatus")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          {t("tickets.detail.cancelStatus")}
        </Button>
      </div>
    </div>
  );
}
