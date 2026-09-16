import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Button } from "@/components/ui/button";
import {
  controlCompactClassName,
  errorTextClassName,
} from "@/components/ui/control";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";

export function SessionSignInControls() {
  const { t } = useTranslation();
  const { signIn, completePasswordChange } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [passwordChangeToken, setPasswordChangeToken] = useState<string | null>(
    null,
  );

  if (passwordChangeToken !== null) {
    return (
      <div className="min-w-0 max-w-sm rounded-md border border-border bg-surface p-3">
        <p className="mb-2 text-[12px] font-medium text-foreground">
          {t("auth.changePassword.title")}
        </p>
        <ChangePasswordForm
          onCompleted={async (newPassword) => {
            await completePasswordChange(passwordChangeToken, newPassword);
            setPasswordChangeToken(null);
            setPassword("");
          }}
          onCancel={() => setPasswordChangeToken(null)}
        />
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);
    try {
      const outcome = await signIn(email, password);
      if (outcome.kind === "must_change_password") {
        setPasswordChangeToken(outcome.passwordChangeToken);
        setPassword("");
        return;
      }
      setPassword("");
    } catch (error) {
      setHasError(error instanceof ApiError || error instanceof Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <form
        className="flex min-w-0 flex-wrap items-center justify-end gap-2"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="sr-only" htmlFor="session-email">
          {t("session.email")}
        </label>
        <input
          id="session-email"
          className={cn(controlCompactClassName, "w-28 sm:w-36")}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("session.email")}
          required
        />
        <label className="sr-only" htmlFor="session-password">
          {t("session.password")}
        </label>
        <input
          id="session-password"
          className={cn(controlCompactClassName, "w-24 sm:w-32")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("session.password")}
          required
        />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? t("session.signingIn") : t("session.signIn")}
        </Button>
      </form>
      {hasError ? (
        <p className={errorTextClassName} role="alert">
          {t("session.error")}
        </p>
      ) : null}
    </div>
  );
}
