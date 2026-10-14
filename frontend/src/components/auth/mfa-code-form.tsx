import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  hintClassName,
  labelClassName,
} from "@/components/ui/control";
import { mapMfaCodeError, type MfaCodeError } from "@/lib/auth/map-mfa-step-error";

interface MfaCodeFormProperties {
  readonly onSubmit: (code: string) => Promise<void>;
  readonly onCancel?: () => void;
  /** Sign-in and sensitive actions accept a recovery code; set-up does not. */
  readonly allowRecoveryCode?: boolean;
  readonly submitLabel?: string;
  readonly idPrefix?: string;
  /** Paket 5.4.1 closeout (M3): the human check, shown only when the server asks for it. */
  readonly captcha?: ReactNode;
  /** Keeps the submit button off until the human check is solved or available. */
  readonly isSubmitBlocked?: boolean;
  /** A missing/broken CAPTCHA is shown by the shared slot, not as token wait. */
  readonly isCaptchaUnavailable?: boolean;
}

type MfaCodeErrorKey =
  | "session.errorRateLimited"
  | "auth.mfa.enrollmentExpired"
  | "auth.mfa.signInExpired"
  | "auth.mfa.recoveryCodesExhausted"
  | "auth.mfa.mfaRequiredCannotDisable"
  | "auth.mfa.captchaRequired"
  | "auth.mfa.captchaFailed"
  | "auth.mfa.invalidCode"
  | "auth.mfa.failed";

const mfaCodeErrorKeys: Readonly<Record<MfaCodeError, MfaCodeErrorKey>> = {
  rateLimited: "session.errorRateLimited",
  expired: "auth.mfa.enrollmentExpired",
  signInExpired: "auth.mfa.signInExpired",
  recoveryCodesExhausted: "auth.mfa.recoveryCodesExhausted",
  mfaRequired: "auth.mfa.mfaRequiredCannotDisable",
  captchaRequired: "auth.mfa.captchaRequired",
  captchaFailed: "auth.mfa.captchaFailed",
  invalid: "auth.mfa.invalidCode",
  failed: "auth.mfa.failed",
};

/** Paket 2.1: one input for a 6-digit TOTP code or an "xxxxx-xxxxx" recovery code. */
export function MfaCodeForm({
  onSubmit,
  onCancel,
  allowRecoveryCode = true,
  submitLabel,
  idPrefix = "mfa",
  captcha,
  isSubmitBlocked = false,
  isCaptchaUnavailable = false,
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
      {captcha ?? null}
      {isCaptchaUnavailable ? null : isSubmitBlocked ? (
        <p className={hintClassName}>{t("session.captchaBlocked")}</p>
      ) : null}
      {error && !(error === "captchaRequired" && captcha != null) ? (
        <p id={`${inputId}-error`} className={errorTextClassName} role="alert">
          {t(mfaCodeErrorKeys[error])}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting || isSubmitBlocked}>
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
