import { LifeBuoy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
} from "@/components/ui/control";
import { useSession } from "@/lib/session/use-session";
import { ApiError } from "@/services/api";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn, completePasswordChange } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [passwordChangeToken, setPasswordChangeToken] = useState<string | null>(
    null,
  );

  const redirectPath =
    typeof location.state === "object" &&
    location.state !== null &&
    "from" in location.state &&
    typeof location.state.from === "string"
      ? location.state.from
      : "/";

  if (session !== null) {
    return <Navigate to={redirectPath} replace />;
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
      navigate(redirectPath, { replace: true });
    } catch (error) {
      setHasError(error instanceof ApiError || error instanceof Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LifeBuoy size={20} strokeWidth={2} />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight text-foreground">
                EP-HelpDesk
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("login.subtitle")}
              </p>
            </div>
          </div>
          {passwordChangeToken !== null ? (
            <>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                {t("auth.changePassword.title")}
              </h1>
              <div className="mt-4">
                <ChangePasswordForm
                  onCompleted={async (newPassword) => {
                    await completePasswordChange(
                      passwordChangeToken,
                      newPassword,
                    );
                    navigate(redirectPath, { replace: true });
                  }}
                  onCancel={() => setPasswordChangeToken(null)}
                />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                {t("login.title")}
              </h1>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                {t("login.intro")}
              </p>
              <form
                className="mt-6 space-y-3"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div>
                  <label
                    className="mb-1 block text-[12px] font-medium text-foreground"
                    htmlFor="login-email"
                  >
                    {t("session.email")}
                  </label>
                  <input
                    id="login-email"
                    className={controlClassName}
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-[12px] font-medium text-foreground"
                    htmlFor="login-password"
                  >
                    {t("session.password")}
                  </label>
                  <input
                    id="login-password"
                    className={controlClassName}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                {hasError ? (
                  <p className={errorTextClassName} role="alert">
                    {t("session.error")}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t("session.signingIn") : t("session.signIn")}
                </Button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
