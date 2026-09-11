import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallLoginProviderStep } from "@/components/install/install-login-provider-step";
import { InstallSeedStep } from "@/components/install/install-seed-step";
import { InstallSmtpStep } from "@/components/install/install-smtp-step";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { LocaleSelect } from "@/components/layout/locale-select";
import {
  resolveInstallWizardStep,
  type InstallWizardStep,
} from "@/lib/resolve-install-wizard-step";
import { loadInstallSuperAdmin } from "@/services/install-api";
import { loadInstallSeed } from "@/services/install-seed-api";
import { loadInstallSmtp } from "@/services/install-smtp-api";

export function InstallPage() {
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

  const headingKey =
    step === "seed"
      ? "install.seed.heading"
      : step === "smtp"
        ? "install.smtp.heading"
        : step === "loginProvider"
          ? "install.loginProvider.heading"
          : "install.heading";
  const bodyKey =
    step === "seed"
      ? "install.seed.body"
      : step === "smtp"
        ? "install.smtp.body"
        : step === "loginProvider"
          ? "install.loginProvider.body"
          : "install.body";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-12 items-center gap-3 border-b border-border bg-surface px-4 md:px-6">
        <h1 className="min-w-0 truncate text-section font-medium text-foreground">
          {t("install.title")}
        </h1>
        <LocaleSelect />
      </header>
      <main className="flex-1 p-4 md:p-6">
        <section className="max-w-2xl">
          <h2 className="text-section font-medium text-foreground">
            {t(headingKey)}
          </h2>
          <p className="mt-2 text-body leading-6 text-muted-foreground">
            {t(bodyKey)}
          </p>
          {step === null ? (
            <div className="mt-6 h-40 animate-pulse bg-elevated" />
          ) : null}
          {step === "seed" ? <InstallSeedStep /> : null}
          {step === "smtp" ? (
            <InstallSmtpStep onSaved={() => setStep("seed")} />
          ) : null}
          {step === "loginProvider" ? (
            <InstallLoginProviderStep onSaved={() => setStep("smtp")} />
          ) : null}
          {step === "superAdmin" ? (
            <InstallSuperAdminStep onCreated={() => setStep("loginProvider")} />
          ) : null}
        </section>
      </main>
    </div>
  );
}
