import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";

export function SessionControls() {
  const { t } = useTranslation();
  const { session, signIn, signOut } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (session !== null) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={session.principal.displayName} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-[12px] text-muted-foreground sm:inline">
          {session.principal.displayName}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={signOut}>
          {t("session.signOut")}
        </Button>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);
    try {
      await signIn(email, password);
      setPassword("");
    } catch (error) {
      setHasError(error instanceof ApiError || error instanceof Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex min-w-0 items-center gap-2" onSubmit={(event) => void onSubmit(event)}>
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
      {hasError ? (
        <span className="sr-only" role="alert">
          {t("session.error")}
        </span>
      ) : null}
    </form>
  );
}
