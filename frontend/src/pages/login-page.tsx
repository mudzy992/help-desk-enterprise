import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { CaptchaSlot, hasTurnstileConfiguration } from "@/components/auth/captcha-slot";
import { type CaptchaLoadState } from "@/components/auth/captcha-challenge";
import { LoginFlowStep } from "@/components/auth/login-flow-step";
import { LoginValuePoints, MicrosoftMark } from "@/components/auth/login-presentation";
import { BrandMark } from "@/components/layout/brand-mark";
import { LocaleSelect } from "@/components/layout/locale-select";
import { useBranding } from "@/lib/branding/branding-store";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  hintClassName,
  labelClassName,
} from "@/components/ui/control";
import { type SignInOutcome, useSession } from "@/lib/session/use-session";
import { safeReturnPath, startEntraSignIn } from "@/lib/auth/entra-redirect";
import { scheduleIdlePrefetch } from "@/lib/app/idle-prefetch";
import {
  readPendingLoginStep,
  reduceLoginFlow,
  stepFromSignInOutcome,
} from "@/lib/auth/login-flow";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import {
  getAuthenticationProviders,
  startSignInMfaEnrollment,
  type AuthenticationProviders,
} from "@/services/auth-api";

/*
  Pulse sign-in: the brand panel carries the identity on the left, the form
  stays narrow and focused on the right. The form markup (ids, submit button,
  change-password flow) is unchanged on purpose — it is the E2E entry point.
*/

export function LoginPage() {
  const { t } = useTranslation();

  useEffect(() => scheduleIdlePrefetch(() => import("@/pages/dashboard-page")), []);
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    session,
    signIn,
    completePasswordChange,
    completeMfa,
    completeMfaWithPasskey,
    confirmMfaEnrollment,
  } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  /**
   * The server asks for a solved Turnstile challenge only
   * after repeated failures — the widget is not rendered before that, so a
   * normal sign-in stays exactly as it was.
   */
  const [isCaptchaRequired, setIsCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaLoadState, setCaptchaLoadState] = useState<CaptchaLoadState>("loading");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [step, dispatchFlow] = useReducer(reduceLoginFlow, location.state, readPendingLoginStep);
  // Reveal toggle + Caps Lock hint, the two
  // most common reasons for a failed first attempt.
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  // Microsoft sign-in when the server runs in entra_ad mode;
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

  const redirectPath = safeReturnPath(
    typeof location.state === "object" &&
      location.state !== null &&
      "from" in location.state &&
      typeof location.state.from === "string"
      ? location.state.from
      : null,
  );

  // While recovery codes are on screen the session is held back on purpose.
  if (session !== null && step.kind !== "codes") {
    return <Navigate to={redirectPath} replace />;
  }

  const advance = (outcome: SignInOutcome) => {
    if (stepFromSignInOutcome(outcome) === null) {
      navigate(redirectPath, { replace: true });
      return;
    }
    dispatchFlow({ type: "OUTCOME", outcome });
  };

  const isCaptchaUnavailable =
    isCaptchaRequired &&
    (!hasTurnstileConfiguration(providers?.captcha) || captchaLoadState === "unavailable");
  const isCaptchaBlocked = isCaptchaRequired && !isCaptchaUnavailable && captchaToken === null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);
    setIsRateLimited(false);
    try {
      const outcome = await signIn(email, password, rememberMe, captchaToken ?? undefined);
      setPassword("");
      setIsCaptchaRequired(false);
      setCaptchaToken(null);
      advance(outcome);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      if (code === "CAPTCHA_REQUIRED") {
        // First time the server asks: show the widget and let the user solve it.
        setCaptchaLoadState("loading");
        setIsCaptchaRequired(true);
        setHasError(false);
      } else if (code === "CAPTCHA_FAILED") {
        // A Turnstile token is single-use; a rejected one is already spent.
        setIsCaptchaRequired(true);
        setHasError(false);
        setCaptchaToken(null);
        setCaptchaResetSignal((value) => value + 1);
      } else {
        setHasError(error instanceof ApiError || error instanceof Error);
        setIsRateLimited(error instanceof ApiError && error.status === 429);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * The same human check as the password
   * step. A solved challenge is single-use and buys one code attempt, so every
   * attempt that carried one — right or wrong — leaves the widget empty again.
   */
  const verifyMfaWithCaptcha = async (mfaToken: string, code: string) => {
    const sentToken = captchaToken;
    try {
      await completeMfa(mfaToken, code, sentToken ?? undefined);
      setIsCaptchaRequired(false);
      setCaptchaToken(null);
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : null;
      if (errorCode === "CAPTCHA_REQUIRED" || errorCode === "CAPTCHA_FAILED") {
        if (errorCode === "CAPTCHA_REQUIRED") setCaptchaLoadState("loading");
        setIsCaptchaRequired(true);
        setCaptchaToken(null);
        setCaptchaResetSignal((value) => value + 1);
      } else if (sentToken !== null) {
        setCaptchaToken(null);
        setCaptchaResetSignal((value) => value + 1);
      }
      throw error;
    }
  };

  const captchaSlot = isCaptchaRequired ? (
    <CaptchaSlot
      configuration={providers?.captcha}
      onToken={setCaptchaToken}
      onLoadState={setCaptchaLoadState}
      resetSignal={captchaResetSignal}
    />
  ) : null;

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

  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(event.getModifierState("CapsLock"));
  };

  const isEntraMode = providers?.mode === "entra_ad";
  const localFormVisible = !isEntraMode || showLocalForm;

  return (
    <div className="page-in grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
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
            {branding.appName}
          </p>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[27px] font-semibold leading-[1.2] tracking-[-0.02em] text-primary-foreground xl:text-[31px]">
            {t("login.panelTitle")}
          </h1>
          <p className="mt-3 text-[13.5px] leading-6 text-primary-foreground/85">
            {t("login.panelBody")}
          </p>
          <LoginValuePoints />
        </div>

        <p className="relative flex items-center gap-1.5 text-[11.5px] text-primary-foreground/70">
          <ShieldCheck size={12} aria-hidden="true" />
          {t("login.secure")}
        </p>
      </aside>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      <main className="relative flex flex-col justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 sm:px-8 lg:px-12 lg:py-10">
        <div className="absolute right-4 top-4 w-36 sm:right-8 lg:right-12">
          <LocaleSelect />
        </div>
        <section className="mx-auto w-full max-w-[26rem]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <div className="min-w-0 leading-tight">
              <p className="text-[14px] font-semibold tracking-[-0.02em] text-foreground">
                {branding.appName}
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {branding.tagline || t("login.subtitle")}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-card sm:p-7">
            {step.kind !== "credentials" ? (
              <LoginFlowStep
                step={step}
                email={email}
                captcha={captchaSlot ?? undefined}
                isCaptchaBlocked={isCaptchaBlocked}
                isCaptchaUnavailable={isCaptchaUnavailable}
                onPasswordChange={async (token, newPassword) => {
                  advance(await completePasswordChange(token, newPassword));
                }}
                onVerifyCode={verifyMfaWithCaptcha}
                onCompletePasskey={completeMfaWithPasskey}
                onVerified={() => navigate(redirectPath, { replace: true })}
                onLoadEnrollmentSecret={startSignInMfaEnrollment}
                onConfirmEnrollment={async (token, code) => {
                  const result = await confirmMfaEnrollment(token, code);
                  dispatchFlow({
                    type: "ENROLLMENT_CONFIRMED",
                    codes: result.recoveryCodes,
                    finish: result.finish,
                  });
                }}
                onRecoveryCodesDone={(finish) => {
                  finish();
                  navigate(redirectPath, { replace: true });
                }}
                onCancel={() => dispatchFlow({ type: "CANCEL" })}
              />
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
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        autoFocus={!isEntraMode}
                        aria-invalid={hasError ? true : undefined}
                        aria-describedby={hasError ? "login-error" : undefined}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </label>
                    <div className={labelClassName}>
                      <label htmlFor="login-password">{t("session.password")}</label>
                      <div className="relative">
                        <input
                          id="login-password"
                          className={cn(controlClassName, "pr-10")}
                          type={isPasswordVisible ? "text" : "password"}
                          autoComplete="current-password"
                          aria-invalid={hasError ? true : undefined}
                          aria-describedby={
                            [hasError ? "login-error" : null, isCapsLockOn ? "login-caps" : null]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyDown={readCapsLock}
                          onKeyUp={readCapsLock}
                          onBlur={() => setIsCapsLockOn(false)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setIsPasswordVisible((value) => !value)}
                          aria-label={t(
                            isPasswordVisible ? "login.hidePassword" : "login.showPassword",
                          )}
                          aria-pressed={isPasswordVisible}
                          aria-controls="login-password"
                          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary/70"
                        >
                          {isPasswordVisible ? (
                            <EyeOff size={15} aria-hidden="true" />
                          ) : (
                            <Eye size={15} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {isCapsLockOn ? (
                        <p id="login-caps" className="text-[11.5px] text-warning" role="status">
                          {t("login.capsLock")}
                        </p>
                      ) : null}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      <span>{t("login.rememberMe")}</span>
                    </label>
                    {captchaSlot}
                    {hasError ? (
                      <p id="login-error" className={errorTextClassName} role="alert">
                        {t(isRateLimited ? "session.errorRateLimited" : "session.error")}
                      </p>
                    ) : null}
                    {isCaptchaBlocked ? (
                      <p className={hintClassName}>{t("session.captchaBlocked")}</p>
                    ) : null}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting || isCaptchaBlocked || isCaptchaUnavailable}
                    >
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
            <Link to="/install" className="text-link underline-offset-4 hover:underline">
              {t("login.installLink")}
            </Link>
          </p>
          <p className="mt-2 text-center text-[11.5px]">
            <Link
              to="/privacy-notice"
              className="text-link underline-offset-4 hover:underline"
              data-testid="login-privacy-notice"
            >
              {t("privacy.notice.loginLink")}
            </Link>
          </p>
          {branding.supportEmail || branding.supportUrl ? (
            <p
              className="mt-2 text-center text-[11.5px] text-muted-foreground"
              data-testid="login-support-contact"
            >
              {t("login.supportHelp")}{" "}
              {branding.supportEmail ? (
                <a
                  href={`mailto:${branding.supportEmail}`}
                  className="text-link underline-offset-4 hover:underline"
                >
                  {branding.supportEmail}
                </a>
              ) : null}
              {branding.supportEmail && branding.supportUrl ? " · " : null}
              {branding.supportUrl ? (
                <a
                  href={branding.supportUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-link underline-offset-4 hover:underline"
                >
                  {branding.supportUrl.replace(/^https:\/\//, "")}
                </a>
              ) : null}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
