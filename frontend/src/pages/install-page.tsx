import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallAddonsStep } from "@/components/install/install-addons-step";
import { InstallCompleteStep } from "@/components/install/install-complete-step";
import { InstallLoginProviderStep } from "@/components/install/install-login-provider-step";
import { InstallSeedStep } from "@/components/install/install-seed-step";
import { InstallSmtpStep } from "@/components/install/install-smtp-step";
import { InstallTokenGate } from "@/components/install/install-token-gate";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { BrandLockup } from "@/components/layout/brand-mark";
import { LocaleSelect } from "@/components/layout/locale-select";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import {
  installWizardCopyKeys,
  resolveInstallWizardStep,
  type InstallWizardStep,
} from "@/lib/resolve-install-wizard-step";
import { loadInstallSuperAdmin } from "@/services/install-api";
import { loadInstallSeed } from "@/services/install-seed-api";
import { loadInstallSmtp } from "@/services/install-smtp-api";

/*
  Pulse install wizard. The step machine (`resolveInstallWizardStep`) and every
  step form are untouched — this file only supplies the shell: brand header,
  progress, and the step frames.
*/

const WIZARD_STEP_ORDER: readonly InstallWizardStep[] = [
  "superAdmin",
  "loginProvider",
  "smtp",
  "seed",
  "addons",
  "complete",
];

const STEP_LABEL_KEYS = {
  superAdmin: "install.steps.superAdmin",
  loginProvider: "install.steps.loginProvider",
  smtp: "install.steps.smtp",
  seed: "install.steps.seed",
  addons: "install.steps.addons",
  complete: "install.steps.complete",
} as const satisfies Record<InstallWizardStep, string>;

export function InstallPage() {
  return (
    <InstallTokenGate>
      <InstallWizard />
    </InstallTokenGate>
  );
}

function InstallWizard() {
  const { t } = useTranslation();
  const [step, setStep] = useState<InstallWizardStep | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void Promise.all([
      loadInstallSuperAdmin().catch(() => ({ superAdmin: null })),
      loadInstallSmtp()
        .then((status) => status.smtp.isConfigured)
        .catch(() => false),
      loadInstallSeed()
        .then((status) => status.seed.isSeeded)
        .catch(() => false),
    ]).then(([adminStatus, isSmtpConfigured, isSeeded]) => {
      if (isCancelled) {
        return;
      }
      setStep(
        resolveInstallWizardStep({
          hasSuperAdmin: adminStatus.superAdmin !== null,
          isSmtpConfigured,
          loginProviderSaved: false,
          isSeeded,
        }),
      );
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const copy = step === null ? null : installWizardCopyKeys[step];
  const activeIndex = step === null ? 0 : WIZARD_STEP_ORDER.indexOf(step);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border/70 bg-surface px-4 md:px-6">
        <BrandLockup subtitle={t("install.title")} />
        <span className="ml-auto flex items-center gap-3">
          <LocaleSelect />
        </span>
      </header>

      <main className="flex-1">
        <div className="page-in mx-auto max-w-[1000px] px-4 py-8 lg:px-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-border/70">
              <span
                className="pulse-gradient block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${((activeIndex + 1) / WIZARD_STEP_ORDER.length) * 100}%` }}
              />
            </span>
            <span className="tnum shrink-0 text-[11px] font-medium text-muted-foreground">
              {t("install.progress", {
                current: activeIndex + 1,
                total: WIZARD_STEP_ORDER.length,
              })}
            </span>
          </div>

          <WizardStepper
            activeIndex={activeIndex}
            steps={WIZARD_STEP_ORDER.map((wizardStep) => ({
              key: wizardStep,
              label: t(STEP_LABEL_KEYS[wizardStep]),
            }))}
          />

          <section className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-7">
            <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">
              {t(copy?.heading ?? "install.heading")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
              {t(copy?.body ?? "install.body")}
            </p>

            <div className="mt-6">
              {step === null ? (
                <PanelSkeleton className="mt-0 border-0 bg-transparent p-0 shadow-none" label={t("install.loading")} />
              ) : null}
              {step === "complete" ? <InstallCompleteStep /> : null}
              {step === "addons" ? (
                <InstallAddonsStep onSaved={() => setStep("complete")} />
              ) : null}
              {step === "seed" ? (
                <InstallSeedStep onSaved={() => setStep("addons")} />
              ) : null}
              {step === "smtp" ? (
                <InstallSmtpStep onSaved={() => setStep("seed")} />
              ) : null}
              {step === "loginProvider" ? (
                <InstallLoginProviderStep onSaved={() => setStep("smtp")} />
              ) : null}
              {step === "superAdmin" ? (
                <InstallSuperAdminStep onCreated={() => setStep("loginProvider")} />
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
