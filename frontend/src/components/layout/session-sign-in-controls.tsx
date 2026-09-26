import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);
    try {
      const outcome = await signIn(email, password);
      setPassword("");
      // Paket 2.1: password change and the second factor continue on /login.
      if (outcome.kind !== "authenticated") {
        navigate("/login", { state: { pendingSignIn: outcome } });
      }
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
