import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  hintClassName,
  labelClassName,
} from "@/components/ui/control";
import {
  mapInstallSmtpTestError,
  type InstallSmtpTestErrorKey,
} from "@/lib/install/map-install-smtp-test-error";
import { sendInstallSmtpTest } from "@/services/install-content-api";

/*
  Install wizard v2 (F4.1): „Da li e-mail stvarno radi?“ — the operator sends one
  message to a real mailbox before the wizard closes, instead of finding out days
  later that notifications never left. The endpoint tests what is *stored*, so the
  panel stays disabled while the form has unsaved edits: a green answer for a host
  that was never saved would be a lie. The panel is not a form of its own — it
  lives inside the step's form, so its button is `type="button"`.
*/
export function InstallSmtpTestPanel({
  isConfigured,
  hasUnsavedChanges,
}: {
  readonly isConfigured: boolean;
  readonly hasUnsavedChanges: boolean;
}) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<InstallSmtpTestErrorKey | null>(null);
  const helpId = useId();
  const isDisabled = !isConfigured || hasUnsavedChanges || isSending;

  const onSend = async () => {
    setIsSending(true);
    setErrorKey(null);
    setSentTo(null);
    try {
      const result = await sendInstallSmtpTest(
        address.trim().length === 0 ? undefined : address.trim(),
      );
      setSentTo(result.toAddress);
    } catch (error) {
      setErrorKey(mapInstallSmtpTestError(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="grid gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{t("install.smtp.test.title")}</h3>
      <p className={hintClassName}>{t("install.smtp.test.body")}</p>
      <label className={labelClassName}>
        {t("install.smtp.test.address")}
        <input
          className={controlClassName}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={address}
          aria-describedby={helpId}
          onChange={(event) => setAddress(event.target.value)}
        />
      </label>
      <p id={helpId} className={hintClassName}>
        {isConfigured
          ? hasUnsavedChanges
            ? t("install.smtp.test.savingFirst")
            : t("install.smtp.test.storedHint")
          : t("install.smtp.test.errorNotConfigured")}
      </p>
      {sentTo !== null ? (
        <p role="status" className="text-sm text-ok">
          {t("install.smtp.test.sent", { toAddress: sentTo })}
        </p>
      ) : null}
      {errorKey !== null ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" disabled={isDisabled} onClick={onSend}>
          {isSending ? t("install.smtp.test.sending") : t("install.smtp.test.send")}
        </Button>
      </div>
    </section>
  );
}
