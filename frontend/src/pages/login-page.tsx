import { BookOpen, Lock, ShieldCheck, Ticket, TrendingUp } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  labelClassName,
} from "@/components/ui/control";
import { useSession } from "@/lib/session/use-session";
import { ApiError } from "@/services/api";

/*
  Pulse sign-in: the brand panel carries the identity on the left, the form
  stays narrow and focused on the right. The form markup (ids, submit button,
  change-password flow) is unchanged on purpose — it is the E2E entry point.
*/

const POINTS = [
  { icon: Ticket, key: "login.pointTickets" },
  { icon: BookOpen, key: "login.pointKnowledge" },
  { icon: TrendingUp, key: "login.pointInsight" },
] as const;

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
    <div className="page-in grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel — hidden on small screens ─────────────────────── */}
      <aside className="pulse-gradient relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 12%, white 0, transparent 42%), radial-gradient(circle at 82% 78%, white 0, transparent 46%)",
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2.5">
          <BrandMark size={36} className="shadow-none" />
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-white">
            EP<span className="text-white/60">·</span>HelpDesk
          </p>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[27px] font-semibold leading-[1.2] tracking-[-0.02em] text-white xl:text-[31px]">
            {t("login.panelTitle")}
          </h1>
          <p className="mt-3 text-[13.5px] leading-6 text-white/85">
            {t("login.panelBody")}
          </p>
          <ul className="mt-7 space-y-3">
            {POINTS.map((point) => (
              <li key={point.key} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <point.icon size={14} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-[12.5px] leading-5 text-white/90">
                  {t(point.key)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-1.5 text-[11.5px] text-white/70">
          <ShieldCheck size={12} aria-hidden="true" />
          {t("login.secure")}
        </p>
      </aside>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <main className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <section className="mx-auto w-full max-w-[26rem]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <div className="leading-tight">
              <p className="text-[14px] font-semibold tracking-[-0.02em] text-foreground">
                EP<span className="text-link">·</span>HelpDesk
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {t("login.subtitle")}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-7">
            {passwordChangeToken !== null ? (
              <>
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">
                  {t("auth.changePassword.title")}
                </h2>
                <div className="mt-5">
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
                <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">
                  {t("login.title")}
                </h2>
                <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
                  {t("login.intro")}
                </p>
                <form
                  className="mt-6 space-y-4"
                  onSubmit={(event) => void handleSubmit(event)}
                >
                  <label className={labelClassName} htmlFor="login-email">
                    <span>{t("session.email")}</span>
                    <input
                      id="login-email"
                      className={controlClassName}
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>
                  <label className={labelClassName} htmlFor="login-password">
                    <span>{t("session.password")}</span>
                    <input
                      id="login-password"
                      className={controlClassName}
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </label>
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
          </div>

          <p className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Lock size={11} aria-hidden="true" />
            {t("login.installHint")}
            <Link
              to="/install"
              className="text-link underline-offset-4 hover:underline"
            >
              {t("login.installLink")}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
