import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";

/*
  Paket 5.4.1 (M3): the Turnstile widget on the sign-in page.

  It renders **only** when the server answered `CAPTCHA_REQUIRED` — the login
  page used to be able to sign in without any check, and it still can: the
  challenge appears after repeated failures, not on every visit. Three rules the
  widget has to keep:

    * the Cloudflare script is loaded on demand, once per page, explicitly
      (`?render=explicit`); no third-party script runs before the challenge is
      actually needed;
    * a Turnstile token is single-use — after a rejected attempt the widget is
      reset so the user gets a fresh one instead of retrying with a spent token;
    * if the script cannot load (offline installation, blocked network), the user
      sees a plain sentence and a retry button instead of a mute empty box. The
      provider is a deliberate admin decision: an installation that has no
      internet keeps `private.security.captcha.provider` on `none`.
*/

export const turnstileScriptUrl =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      readonly sitekey: string;
      readonly theme?: "light" | "dark" | "auto";
      readonly callback: (token: string) => void;
      readonly "error-callback": () => void;
      readonly "expired-callback": () => void;
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
};

declare global {
  /** Installed by the Turnstile script once it has loaded. */
  var turnstile: TurnstileApi | undefined;
}

/**
 * Loads the explicit-render API on demand. Exported for the unit test: the
 * frontend runs its specs in a node environment, so the DOM side is exercised
 * with a minimal stub here and for real in the E2E spec.
 */
export function loadTurnstileScript(): Promise<TurnstileApi> {
  const existing = globalThis.turnstile;
  if (existing !== undefined) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = turnstileScriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.testid = "turnstile-script";
    script.onload = () => {
      const api = globalThis.turnstile;
      if (api === undefined) {
        reject(new Error("turnstile api missing after load"));
        return;
      }
      resolve(api);
    };
    script.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(script);
  });
}

export type CaptchaLoadState = "loading" | "ready" | "unavailable";

interface CaptchaChallengeProperties {
  readonly siteKey: string;
  /** Called with a fresh token, or `null` when the current one expired or failed. */
  readonly onToken: (token: string | null) => void;
  /** Reports whether the widget can provide a token or needs administrator/network help. */
  readonly onLoadState?: (state: CaptchaLoadState) => void;
  /** Bump this value to reset the widget (a rejected attempt spends its token). */
  readonly resetSignal?: number;
}

export function CaptchaChallenge({
  siteKey,
  onToken,
  onLoadState,
  resetSignal = 0,
}: CaptchaChallengeProperties) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    onToken(null);
    setHasLoadError(false);
    onLoadState?.("loading");
    loadTurnstileScript()
      .then((api) => {
        if (cancelled || container.current === null) return;
        setHasLoadError(false);
        widgetId.current = api.render(container.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token: string) => {
            if (cancelled) return;
            setHasLoadError(false);
            onToken(token);
            onLoadState?.("ready");
          },
          "error-callback": () => {
            if (cancelled) return;
            onToken(null);
            setHasLoadError(true);
            onLoadState?.("unavailable");
          },
          "expired-callback": () => {
            if (cancelled) return;
            onToken(null);
            onLoadState?.("ready");
          },
        });
        onLoadState?.("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setHasLoadError(true);
          onLoadState?.("unavailable");
        }
      });
    return () => {
      cancelled = true;
      const api = globalThis.turnstile;
      if (api !== undefined && widgetId.current !== null) {
        api.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // `attempt` re-runs the load after the user presses "Try again".
  }, [siteKey, attempt, onToken, onLoadState]);

  useEffect(() => {
    const api = globalThis.turnstile;
    if (api === undefined || widgetId.current === null || resetSignal === 0) return;
    onToken(null);
    api.reset(widgetId.current);
  }, [resetSignal, onToken]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <div className="grid gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
        <ShieldCheck size={13.5} strokeWidth={2} aria-hidden="true" />
        {t("session.captchaTitle")}
      </p>
      <div ref={container} data-testid="turnstile-widget" />
      {hasLoadError ? (
        <div className="grid gap-1.5">
          <p className={hintClassName}>{t("session.captchaUnavailable")}</p>
          <Button type="button" size="xs" variant="secondary" onClick={retry}>
            <RefreshCw /> {t("session.captchaRetry")}
          </Button>
        </div>
      ) : (
        <p className={hintClassName}>{t("session.captchaHint")}</p>
      )}
    </div>
  );
}
