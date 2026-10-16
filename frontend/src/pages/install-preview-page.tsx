import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallAuroraBackdrop } from "@/components/install/shell/install-aurora-backdrop";
import { InstallStepFooter } from "@/components/install/shell/install-step-footer";
import { InstallTokenGate } from "@/components/install/install-token-gate";
import { InstallReadyScreenContent } from "@/components/install/install-ready-screen";
import { InstallWizardShell } from "@/components/install/shell/install-wizard-shell";
import { auroraRailItems, auroraSummary } from "@/components/visual-qa/install-aurora-fixtures";
import { useInstallTheme } from "@/lib/install/use-install-theme";

/*
  Development-only design preview of the install wizard („Aurora“).

  `/install` cannot be looked at without a backend — the token gate and the
  status read fail first — and the wizard is the one screen an operator meets
  before the product exists, so its palette, its display face and its motion need
  somewhere to be judged on their own. This page renders the real components with
  fixtures: the airlock, a step inside the shell, and the liftoff.

  It exists in dev builds only (`import.meta.env.DEV` in the router), is not in
  the product's navigation, and is not linked from anywhere.
*/

type Scene = "airlock" | "step" | "liftoff";

const scenes: readonly Scene[] = ["airlock", "step", "liftoff"];

export function InstallPreviewPage() {
  const [scene, setScene] = useState<Scene>("step");
  useInstallTheme();

  return (
    <>
      {scene === "step" ? (
        <InstallWizardShell
          step="identity"
          railItems={auroraRailItems}
          footer={
            <InstallStepFooter
              canGoBack
              onBack={() => undefined}
              isDeferred={false}
              canDefer
              isDeferring={false}
              onDefer={() => undefined}
              onUndoDefer={() => undefined}
              onContinue={() => undefined}
              isContinueVisible
            />
          }
        >
          <StepBody />
        </InstallWizardShell>
      ) : null}

      {scene === "airlock" ? (
        <InstallTokenGate>
          {/* The gate opens by itself when the tab already holds a token; the
              scene then has to say *why* it is not showing the key card. */}
          <p className="iw-eyebrow mx-auto max-w-3xl p-10">
            Token je već u sesiji, pa je airlock otvoren — očistite `sessionStorage` za zaključanu
            scenu.
          </p>
        </InstallTokenGate>
      ) : null}

      {scene === "liftoff" ? (
        <div className="iw-canvas">
          <InstallAuroraBackdrop />
          <main className="mx-auto w-full max-w-3xl px-4 py-10">
            <InstallReadyScreenContent summary={auroraSummary} />
          </main>
        </div>
      ) : null}

      <nav
        aria-label="Scene"
        className="iw-panel fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 gap-1.5 p-1.5 shadow-pop"
      >
        {scenes.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={scene === key}
            onClick={() => setScene(key)}
            className={`px-4 py-2 text-[12.5px] ${
              scene === key
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted-foreground"
            }`}
          >
            {key}
          </button>
        ))}
      </nav>
    </>
  );
}

/** A handful of real fields, so the theme is judged on the step it dresses. */
function StepBody() {
  const { t } = useTranslation();
  const [mode, setMode] = useState("local");
  return (
    <div className="grid gap-5">
      <div className="grid gap-4">
        <label className="grid gap-2" htmlFor="preview-organization">
          {t("install.identity.organizationName")}
          <input id="preview-organization" defaultValue="Gradska uprava Visoko" />
        </label>
        <label className="grid gap-2" htmlFor="preview-time-zone">
          {t("install.identity.timeZone")}
          <select id="preview-time-zone" defaultValue="Europe/Sarajevo">
            <option value="Europe/Sarajevo">Europe/Sarajevo</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
          </select>
        </label>
        <p className="text-[11.5px] text-muted-foreground">{t("install.identity.timeZoneHint")}</p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="iw-eyebrow">{t("install.loginProvider.mode")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["local", "entraAd"] as const).map((key) => (
            <label key={key} className="flex items-start gap-2">
              <input
                type="radio"
                name="install-preview-mode"
                checked={mode === key}
                onChange={() => setMode(key)}
              />
              <span className="grid gap-1">
                <span className="text-[13px] text-foreground">
                  {t(`install.loginProvider.${key}`)}
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                  {key === "local"
                    ? t("install.loginProvider.localHint")
                    : t("install.loginProvider.entraHint")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
