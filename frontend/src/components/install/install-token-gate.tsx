import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { BrandLockup } from "@/components/layout/brand-mark";
import { InstallAuroraBackdrop } from "@/components/install/shell/install-aurora-backdrop";
import { Button } from "@/components/ui/button";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/services/api";
import { loadInstallSuperAdmin } from "@/services/install-api";
import { useInstallTheme } from "@/lib/install/use-install-theme";
import {
  clearInstallToken,
  readInstallToken,
  writeInstallToken,
} from "@/lib/install/install-token-store";

type GateError = "invalid" | "notConfigured" | "unavailable" | null;

function toGateError(error: unknown): GateError {
  if (error instanceof ApiError) {
    if (error.code === "INSTALL_TOKEN_NOT_CONFIGURED") return "notConfigured";
    if (error.code === "INSTALL_TOKEN_INVALID" || error.status === 401 || error.status === 403) {
      return "invalid";
    }
  }
  // Network failure, timeout, 5xx — the token is neither proven good nor bad, so
  // the wizard must stay shut (F0.1/IN2).
  return "unavailable";
}

type GateMessageKey =
  "install.tokenInvalid" | "install.tokenNotConfigured" | "install.tokenUnavailable";

function errorMessageKey(error: GateError): GateMessageKey {
  if (error === "invalid") return "install.tokenInvalid";
  if (error === "notConfigured") return "install.tokenNotConfigured";
  return "install.tokenUnavailable";
}

/**
 * Review 2026-09-25 (S4): the wizard opens only after a valid INSTALL_TOKEN.
 * F0.1 (IN2): it opens **only** on a successful `loadInstallSuperAdmin()` — the
 * token is probed while still unsaved, so a network error, a 5xx or any unknown
 * failure keeps the gate closed with a retry, and a rejected token is never
 * written to the tab.
 *
 * „Aurora“: the gate is the airlock of the whole story — the aurora canvas with
 * one key card on it, and the token field keeps its `#install-token` id and its
 * own `<form>` submit, which is what the E2E harness drives.
 */
export function InstallTokenGate({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const [savedToken] = useState(() => readInstallToken());
  const [isUnlocked, setIsUnlocked] = useState(false);
  // A stored token is verified silently on mount; until that answer arrives the
  // wizard is neither shown nor replaced by the form.
  const [isChecking, setIsChecking] = useState(savedToken !== null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<GateError>(null);
  useInstallTheme();

  const verify = useCallback(async (token: string, options: { readonly persist: boolean }) => {
    setIsChecking(true);
    setError(null);
    try {
      await loadInstallSuperAdmin(token);
      if (options.persist) writeInstallToken(token);
      setIsUnlocked(true);
    } catch (caught) {
      const gateError = toGateError(caught);
      if (gateError === "invalid" || gateError === "notConfigured") {
        // The stored token is gone or wrong: drop it so a reload asks again.
        clearInstallToken();
      }
      setError(gateError);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (savedToken === null) return;
    void verify(savedToken, { persist: false });
  }, [savedToken, verify]);

  if (isUnlocked) return <>{children}</>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void verify(value, { persist: true });
  };

  return (
    <div className="iw-canvas">
      <InstallAuroraBackdrop />
      {/* The gate's own header is a HUD strip: `BrandLockup`'s second line is muted
          text and muted text never sits on the raw canvas (see install-theme.css). */}
      <header className="iw-hud flex h-16 items-center px-5 md:px-8">
        <BrandLockup subtitle={t("install.title")} />
      </header>

      <main className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 pb-16">
        {isChecking ? (
          <div className="w-full max-w-md">
            <PanelSkeleton label={t("install.tokenChecking")} />
          </div>
        ) : (
          <div className="iw-airlock iw-rise">
            <form className="grid gap-4 p-7" onSubmit={submit}>
              <span
                className="iw-tile grid size-11 place-items-center text-link"
                aria-hidden="true"
              >
                <KeyRound size={19} strokeWidth={2.1} />
              </span>
              <h1 className="iw-display text-[26px] leading-tight text-foreground">
                {t("install.tokenHeading")}
              </h1>
              <p className="text-[13px] leading-6 text-muted-foreground">
                {t("install.tokenBody")}
              </p>

              <label className="grid gap-2" htmlFor="install-token">
                {t("install.tokenLabel")}
                <input
                  id="install-token"
                  type="password"
                  autoComplete="off"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>

              {error !== null ? (
                <div className="grid gap-2" role="alert">
                  <p className="text-[12.5px] text-danger">{t(errorMessageKey(error))}</p>
                  {error === "unavailable" ? (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={value.trim().length === 0}
                        onClick={() => void verify(value, { persist: true })}
                      >
                        {t("install.retry")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <Button type="submit" disabled={value.trim().length === 0}>
                  {t("install.tokenSubmit")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
