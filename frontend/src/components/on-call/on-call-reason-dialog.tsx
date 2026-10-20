import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Textarea } from "@/components/ui/field";

interface OnCallReasonDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onConfirm: (reason: string) => void;
}

/** Collects the audit reason required by destructive on-call actions. */
export function OnCallReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  error,
  isPending,
  onConfirm,
}: OnCallReasonDialogProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      intent="danger"
      isPending={isPending}
      confirmDisabled={reason.trim().length < 3}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <div className="grid gap-2">
        <Field label={t("onCall.reason")} required hint={t("onCall.reasonHint")}>
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {error ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
