import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
} from "@/components/ui/control";
import { ApiError } from "@/services/api";
import { readPasswordFeedbackKeys, type PasswordFeedbackKey } from "@/components/auth/password-feedback";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

const minimumPasswordLength = 12;

interface ChangePasswordFormProperties {
  readonly onCompleted: (newPassword: string) => Promise<void>;
  readonly onCancel?: () => void;
  /** Paket 2.1: an expired password explains itself differently. */
  readonly reason?: "temporary" | "expired";
}

export function ChangePasswordForm({
  onCompleted,
  onCancel,
  reason = "temporary",
}: ChangePasswordFormProperties) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [policyKeys, setPolicyKeys] = useState<PasswordFeedbackKey[] | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setPolicyKeys(null);
    if (newPassword.length < minimumPasswordLength) {
      setErrorMessage(t("auth.changePassword.tooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage(t("auth.changePassword.mismatch"));
      return;
    }
    setIsSubmitting(true);
    try {
      await onCompleted(newPassword);
    } catch (error) {
      const keys = readPasswordFeedbackKeys(error);
      if (keys) {
        setPolicyKeys(keys);
        return;
      }
      setErrorMessage(
        error instanceof ApiError && error.status === 429
          ? t("session.errorRateLimited")
          : error instanceof ApiError
            ? error.message
            : t("auth.changePassword.failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="fade-in space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-[13px] leading-5 text-muted-foreground">
        {reason === "expired" ? t("auth.changePassword.introExpired") : t("auth.changePassword.intro")}
      </p>
      <div>
        <label
          className="mb-1 block text-[12px] font-medium text-foreground"
          htmlFor="change-password-new"
        >
          {t("auth.changePassword.newPassword")}
        </label>
        <input
          id="change-password-new"
          className={controlClassName}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          minLength={minimumPasswordLength}
        />
        <div className="mt-1.5">
          <PasswordStrengthMeter password={newPassword} />
        </div>
      </div>
      <div>
        <label
          className="mb-1 block text-[12px] font-medium text-foreground"
          htmlFor="change-password-confirm"
        >
          {t("auth.changePassword.confirmPassword")}
        </label>
        <input
          id="change-password-confirm"
          className={controlClassName}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={minimumPasswordLength}
        />
      </div>
      {policyKeys ? (
        <ul className={`${errorTextClassName} list-disc space-y-0.5 pl-4`} role="alert">
          {policyKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      ) : null}
      {errorMessage ? (
        <p className={errorTextClassName} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting
            ? t("auth.changePassword.saving")
            : t("auth.changePassword.submit")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("settings.drawer.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
