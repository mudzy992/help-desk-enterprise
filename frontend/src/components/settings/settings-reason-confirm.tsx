import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";

interface SettingsReasonConfirmProperties {
  readonly pending: boolean;
  readonly onConfirm: (reason: string) => Promise<void>;
  readonly onCancel: () => void;
}

export function SettingsReasonConfirm({
  pending,
  onConfirm,
  onCancel,
}: SettingsReasonConfirmProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
      <input
        className={controlCompactClassName}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={pending}
        placeholder={t("settings.registry.reason")}
        aria-label={t("settings.registry.reason")}
      />
      <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={onCancel}>
        {t("settings.drawer.cancel")}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending || reason.trim().length === 0}
        onClick={() => void onConfirm(reason.trim())}
      >
        {pending ? t("settings.registry.saving") : t("settings.registry.save")}
      </Button>
    </div>
  );
}
