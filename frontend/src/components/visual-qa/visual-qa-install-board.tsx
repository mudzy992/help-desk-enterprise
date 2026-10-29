import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallAuroraBackdrop } from "@/components/install/shell/install-aurora-backdrop";
import { InstallFlightPlan } from "@/components/install/shell/install-flight-plan";
import { InstallLiftoff } from "@/components/install/shell/install-liftoff";
import { InstallStepFooter } from "@/components/install/shell/install-step-footer";
import { InstallTopBar } from "@/components/install/shell/install-top-bar";
import { InstallReadinessList } from "@/components/install/install-readiness-checks";
import { InstallTokenGate } from "@/components/install/install-token-gate";
import { InstallProfileCard } from "@/components/install/install-profile-card";
import {
  auroraPackages,
  auroraRailItems,
  auroraReadinessChecks,
} from "@/components/visual-qa/install-aurora-fixtures";
import type { InstallProfilePackage } from "@/services/install-profile-api";

/*
  Visual QA — the install wizard's own story („Aurora“, owner decision).

  The wizard wears the product's palette nowhere: it is the screen an operator
  meets *before* the product exists, and it is allowed to look like nothing else
  in the app. This board is where that design is judged, and it renders the real
  components — the HUD, the flight plan, the package cards, the readiness list,
  the token gate and the liftoff — with fixtures shaped like the API's answers
  (`install-aurora-fixtures.ts`).

  The theme attribute sits on this container instead of `<html>`: a page that
  merely *shows* the design must not repaint the application shell it lives in.
  `/install` itself, and any sheet or dialog opened from it, get the attribute on
  `<html>` from `useInstallTheme` so portals inherit it.
*/

export function VisualQaInstallBoard() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<InstallProfilePackage["profile"]>("standard");

  return (
    <div data-install-theme="aurora" className="iw-canvas -mx-4 -my-2 px-4 py-6 sm:-mx-6 sm:px-6">
      <InstallAuroraBackdrop />
      <div className="grid gap-10">
        <section className="grid gap-3">
          <h2 className="iw-panel iw-eyebrow w-fit px-3 py-2">
            1 · Paketi — prvi ekran čarobnjaka
          </h2>
          <div className="iw-panel p-5">
            <div className="grid gap-3 md:grid-cols-3">
              {auroraPackages.map((pack) => (
                <InstallProfileCard
                  key={pack.profile}
                  pack={pack}
                  packages={auroraPackages}
                  isSelected={selected === pack.profile}
                  onSelect={() => setSelected(pack.profile)}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="iw-panel iw-eyebrow w-fit px-3 py-2">
            2 · HUD, plan leta i pozornica koraka
          </h2>
          <div className="iw-panel overflow-hidden p-0">
            <InstallTopBar step="identity" railItems={auroraRailItems} />
            <div className="grid gap-6 p-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
              <InstallFlightPlan step="identity" railItems={auroraRailItems} />
              <div className="iw-panel iw-panel--lit grid gap-5 p-6">
                <header className="grid gap-2">
                  <p className="iw-eyebrow">
                    {t("install.shell.stepOf", { current: 3, total: 14 })}
                  </p>
                  <h3 className="iw-display iw-title">{t("install.identity.heading")}</h3>
                  <p className="text-[13.5px] leading-6 text-muted-foreground">
                    {t("install.identity.body")}
                  </p>
                </header>

                <div className="grid gap-4">
                  <label className="grid gap-2" htmlFor="qa-organization">
                    {t("install.identity.organizationName")}
                    <input id="qa-organization" defaultValue="Gradska uprava Visoko" />
                  </label>
                  <label className="grid gap-2" htmlFor="qa-time-zone">
                    {t("install.identity.timeZone")}
                    <select id="qa-time-zone" defaultValue="Europe/Sarajevo">
                      <option value="Europe/Sarajevo">Europe/Sarajevo</option>
                      <option value="Europe/Berlin">Europe/Berlin</option>
                    </select>
                  </label>
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("install.identity.timeZoneHint")}
                  </p>
                </div>

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
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="iw-panel iw-eyebrow w-fit px-3 py-2">
            3 · Spremnost i liftoff (zadnji ekran)
          </h2>
          <div className="iw-panel grid gap-6 p-5 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              <p className="iw-eyebrow">{t("install.provisioning.heading")}</p>
              <InstallReadinessList checks={auroraReadinessChecks} onFixStep={() => undefined} />
            </div>
            <div className="grid content-start gap-4">
              <InstallLiftoff />
              <div className="iw-tile grid gap-2 p-4 text-[12.5px] leading-6 text-muted-foreground">
                {t("install.complete.hint")}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="iw-panel iw-eyebrow w-fit px-3 py-2">4 · Airlock (token)</h2>
          <div className="iw-panel overflow-hidden p-0 [&>div]:min-h-[32rem]">
            <InstallTokenGate>
              <p className="iw-eyebrow p-8">
                Token je već u sesiji, pa je airlock otvoren — očisti `sessionStorage` za zaključanu
                scenu.
              </p>
            </InstallTokenGate>
          </div>
        </section>
      </div>
    </div>
  );
}
