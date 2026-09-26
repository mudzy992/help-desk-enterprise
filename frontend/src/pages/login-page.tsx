import { BookOpen, Lock, ShieldCheck, Ticket, TrendingUp } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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
import { startEntraSignIn } from "@/lib/auth/entra-redirect";
import { ApiError } from "@/services/api";
import {
  getAuthenticationProviders,
  type AuthenticationProviders,
} from "@/services/auth-api";

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
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [passwordChangeToken, setPasswordChangeToken] = useState<string | null>(
    null,
  );

  // Paket 1.8 (A1): Microsoft sign-in when the server runs in entra_ad mode;
  // the local form stays available as the break-glass path.
  const [providers, setProviders] = useState<AuthenticationProviders | null>(null);
  const [showLocalForm, setShowLocalForm] = useState(false);
  const [entraError, setEntraError] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    let active = true;
    getAuthenticationProviders()
      .then((value) => {
        if (active) setProviders(value);
      })
      .catch(() => {
        if (active) setProviders({ mode: "local", entra: null });
      });
    return () => {
      active = false;
    };
  }, []);

  const callbackError =
    typeof location.state === "object" &&
    location.state !== null &&
    "entraError" in location.state &&
    location.state.entraError === true;

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
    setIsRateLimited(false);
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
      setIsRateLimited(error instanceof ApiError && error.status === 429);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEntraSignIn = async () => {
    if (providers?.entra == null) return;
    setEntraError(false);
    setIsRedirecting(true);
    try {
      await startEntraSignIn(providers.entra, redirectPath);
    } catch {
      setEntraError(true);
      setIsRedirecting(false);
    }
  };

  const isEntraMode = providers?.mode === "entra_ad";
  const localFormVisible = !isEntraMode || showLocalForm;

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
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-primary-foreground">
            EP<span className="text-primary-foreground/60">·</span>HelpDesk
          </p>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[27px] font-semibold leading-[1.2] tracking-[-0.02em] text-primary-foreground xl:text-[31px]">
            {t("login.panelTitle")}
          </h1>
          <p className="mt-3 text-[13.5px] leading-6 text-primary-foreground/85">
            {t("login.panelBody")}
          </p>
          <ul className="mt-7 space-y-3">
            {POINTS.map((point) => (
              <li key={point.key} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
                  <point.icon size={14} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="text-[12.5px] leading-5 text-primary-foreground/90">
                  {t(point.key)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-1.5 text-[11.5px] text-primary-foreground/70">
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
                {isEntraMode ? (
                  <div className="mt-6 space-y-3">
                    {providers?.entra ? (
                      <Button
                        type="button"
                        className="w-full"
                        disabled={isRedirecting}
                        onClick={() => void handleEntraSignIn()}
                      >
                        <MicrosoftMark />
                        {isRedirecting ? t("login.entraRedirecting") : t("login.entraSignIn")}
                      </Button>
                    ) : (
                      <p className="text-[12.5px] leading-5 text-muted-foreground" role="status">
                        {t("login.entraNotConfigured")}
                      </p>
                    )}
                    {entraError || callbackError ? (
                      <p className={errorTextClassName} role="alert">
                        {t("login.entraFailed")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="w-full text-center text-[11.5px] text-link underline-offset-4 hover:underline"
                      aria-expanded={showLocalForm}
                      aria-controls="login-local-form"
                      onClick={() => setShowLocalForm((value) => !value)}
                    >
                      {showLocalForm ? t("login.localHide") : t("login.localShow")}
                    </button>
                  </div>
                ) : null}
                {localFormVisible ? (
                <form
                  id="login-local-form"
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
                      {t(isRateLimited ? "session.errorRateLimited" : "session.error")}
                    </p>
                  ) : null}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? t("session.signingIn") : t("session.signIn")}
                  </Button>
                </form>
                ) : null}
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

/** Four-square Microsoft logo (brand colours are fixed by Microsoft). */
function MicrosoftMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true" className="mr-1.5">
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      {/* design-system-allow-hex: Microsoft brand mark */}
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
