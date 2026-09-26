import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { readPasswordFeedbackKeys, type PasswordFeedbackKey } from "@/components/auth/password-feedback";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/services/api";
import { changeOwnPassword, type AccountSecurityOverview } from "@/services/account-security-api";

interface PasswordSectionProperties {
  readonly password: AccountSecurityOverview["password"];
  readonly onChanged: () => void;
}

/** Paket 2.1 (M7): own password change; other sessions end, this one stays. */
export function PasswordSection({ password, onChanged }: PasswordSectionProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<PasswordFeedbackKey[] | null>(null);
  const [error, setError] = useState<"mismatch" | "rateLimited" | "failed" | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("mismatch");
      return;
    }
    setIsSaving(true);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ tone: "success", title: t("account.security.passwordChanged") });
      onChanged();
    } catch (caught) {
      const keys = readPasswordFeedbackKeys(caught);
      if (keys) setFeedback(keys);
      else setError(caught instanceof ApiError && caught.status === 429 ? "rateLimited" : "failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="max-w-md space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-[12px] leading-5 text-muted-foreground">
        {t("account.security.passwordRules", { minLength: password.minLength })}
        {password.historyCount > 0 ? ` ${t("account.security.passwordHistoryRule", { count: password.historyCount })}` : ""}
      </p>
      <Field label={t("account.security.currentPassword")} required>
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </Field>
      <Field label={t("auth.changePassword.newPassword")} required>
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          minLength={password.minLength}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
      </Field>
      <PasswordStrengthMeter password={newPassword} />
      <Field label={t("auth.changePassword.confirmPassword")} required>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </Field>
      {feedback ? (
        <ul className={`${errorTextClassName} list-disc space-y-0.5 pl-4`} role="alert">
          {feedback.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className={errorTextClassName} role="alert">
          {t(
            error === "mismatch"
              ? "auth.changePassword.mismatch"
              : error === "rateLimited"
                ? "session.errorRateLimited"
                : "auth.changePassword.failed",
          )}
        </p>
      ) : null}
      <p className="text-[11.5px] text-muted-foreground">{t("account.security.passwordOtherSessions")}</p>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? t("auth.changePassword.saving") : t("account.security.changePassword")}
      </Button>
    </form>
  );
}
