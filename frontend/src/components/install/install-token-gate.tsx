import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api";
import { loadInstallSuperAdmin } from "@/services/install-api";
import { clearInstallToken, readInstallToken, writeInstallToken } from "@/lib/install/install-token-store";

type GateError = "invalid" | "notConfigured" | null;

function toGateError(error: unknown): GateError {
  if (error instanceof ApiError && error.code === "INSTALL_TOKEN_NOT_CONFIGURED") return "notConfigured";
  if (error instanceof ApiError && error.status === 403) return "invalid";
  return null;
}

/** Review 2026-09-25 (S4): the wizard opens only after a valid INSTALL_TOKEN. */
export function InstallTokenGate({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const [isUnlocked, setIsUnlocked] = useState(() => readInstallToken() !== null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<GateError>(null);
  const [isChecking, setIsChecking] = useState(false);

  if (isUnlocked) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsChecking(true);
    setError(null);
    writeInstallToken(value);
    try {
      await loadInstallSuperAdmin();
      setIsUnlocked(true);
    } catch (caught) {
      const gateError = toGateError(caught);
      if (gateError === null) {
        setIsUnlocked(true);
        return;
      }
      clearInstallToken();
      setError(gateError);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/70 bg-surface px-4 md:px-6">
        <BrandLockup subtitle={t("install.title")} />
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10">
    <form className="space-y-3 rounded-lg border border-border bg-surface p-6 shadow-card" onSubmit={(event) => void submit(event)}>
      <h2 className="text-[15px] font-semibold text-foreground">{t("install.tokenHeading")}</h2>
      <p className="text-[12.5px] leading-5 text-muted-foreground">{t("install.tokenBody")}</p>
      <label className="block text-[12px] font-medium text-foreground" htmlFor="install-token">
        {t("install.tokenLabel")}
      </label>
      <input
        id="install-token"
        type="password"
        autoComplete="off"
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {error !== null ? (
        <p role="alert" className="text-[12px] text-destructive">
          {t(error === "invalid" ? "install.tokenInvalid" : "install.tokenNotConfigured")}
        </p>
      ) : null}
      <Button type="submit" disabled={isChecking || value.trim().length === 0}>
        {t("install.tokenSubmit")}
      </Button>
    </form>
      </main>
    </div>
  );
}
