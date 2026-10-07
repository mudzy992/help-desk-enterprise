import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { mapMfaCodeError, type MfaCodeError } from "@/lib/auth/map-mfa-step-error";

interface MfaCodeFormProperties {
  readonly onSubmit: (code: string) => Promise<void>;
  readonly onCancel?: () => void;
  /** Sign-in and sensitive actions accept a recovery code; set-up does not. */
  readonly allowRecoveryCode?: boolean;
  readonly submitLabel?: string;
  readonly idPrefix?: string;
}

/** Paket 2.1: one input for a 6-digit TOTP code or an "xxxxx-xxxxx" recovery code. */
export function MfaCodeForm({
  onSubmit,
  onCancel,
  allowRecoveryCode = true,
  submitLabel,
  idPrefix = "mfa",
}: MfaCodeFormProperties) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<MfaCodeError | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(code.trim());
      setCode("");
    } catch (caught) {
      setError(mapMfaCodeError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputId = `${idPrefix}-code`;
  return (
    <form className="fade-in space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <label className={labelClassName} htmlFor={inputId}>
        <span>{useRecovery ? t("auth.mfa.recoveryCodeLabel") : t("auth.mfa.codeLabel")}</span>
        <input
          id={inputId}
          className={`${controlClassName} tnum tracking-[0.2em]`}
          type="text"
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          pattern={useRecovery ? "[A-Za-z0-9 -]{10,13}" : "[0-9 ]{6,7}"}
          maxLength={useRecovery ? 13 : 7}
          placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoFocus
          required
        />
      </label>
      {error ? (
        <p id={`${inputId}-error`} className={errorTextClassName} role="alert">
          {t(
            error === "rateLimited"
              ? "session.errorRateLimited"
              : error === "expired"
                ? "auth.mfa.enrollmentExpired"
                : error === "signInExpired"
                  ? "auth.mfa.signInExpired"
                  : error === "recoveryCodesExhausted"
                    ? "auth.mfa.recoveryCodesExhausted"
                : error === "invalid"
                  ? "auth.mfa.invalidCode"
                  : "auth.mfa.failed",
          )}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? t("auth.mfa.verifying") : (submitLabel ?? t("auth.mfa.verify"))}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("ui.cancel")}
          </Button>
        ) : null}
      </div>
      {allowRecoveryCode ? (
        <button
          type="button"
          className="w-full text-center text-[11.5px] text-link underline-offset-4 hover:underline"
          onClick={() => {
            setUseRecovery((value) => !value);
            setCode("");
            setError(null);
          }}
        >
          {useRecovery ? t("auth.mfa.useAuthenticator") : t("auth.mfa.useRecoveryCode")}
        </button>
      ) : null}
    </form>
  );
}
