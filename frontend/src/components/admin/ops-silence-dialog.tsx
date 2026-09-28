import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { hintClassName, labelClassName, selectClassName, textareaClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { opsSilenceLimits, opsSilencePresetMinutes, silenceOpsAlerts } from "@/services/ops-health-api";

/**
 * Paket 2.7 (§5.4): silence alarm messages for planned work. Checks and the
 * history keep running; only notifications stop. Always audited with a reason.
 */
export function OpsSilenceDialog({
  open,
  onOpenChange,
  onSilenced,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSilenced: () => void;
}) {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState<number>(60);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiErrorKey | null>(null);

  useEffect(() => {
    if (open) {
      setMinutes(60);
      setReason("");
      setError(null);
    }
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= opsSilenceLimits.minReason && trimmed.length <= opsSilenceLimits.maxReason;

  const submit = async () => {
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      await silenceOpsAlerts(minutes, trimmed);
      onOpenChange(false);
      onSilenced();
    } catch (caught) {
      setError(mapApiError(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader title={t("admin.opsHealth.silence.title")} description={t("admin.opsHealth.silence.description")} />
        <div className="grid gap-3">
          <label className={labelClassName}>
            {t("admin.opsHealth.silence.duration")}
            <select
              className={selectClassName}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {opsSilencePresetMinutes.map((value) => (
                <option key={value} value={value}>
                  {value < 60
                    ? t("admin.opsHealth.silence.minutes", { count: value })
                    : t("admin.opsHealth.silence.hours", { count: value / 60 })}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.opsHealth.silence.reason")}
            <textarea
              className={textareaClassName}
              value={reason}
              maxLength={opsSilenceLimits.maxReason}
              placeholder={t("admin.opsHealth.silence.reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
            />
            <span className={hintClassName}>
              {t("admin.opsHealth.silence.reasonHint", { min: opsSilenceLimits.minReason, max: opsSilenceLimits.maxReason })}
            </span>
          </label>
          {error ? <ApiErrorText messageKey={error} /> : null}
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("ui.cancel")}
          </Button>
          <Button type="button" disabled={pending || !valid} onClick={() => void submit()}>
            {t("admin.opsHealth.silence.action")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
