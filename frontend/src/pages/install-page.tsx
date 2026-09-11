import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy } from "lucide-react";
import { InstallAddonsStep } from "@/components/install/install-addons-step";
import { InstallCompleteStep } from "@/components/install/install-complete-step";
import { InstallLoginProviderStep } from "@/components/install/install-login-provider-step";
import { InstallSeedStep } from "@/components/install/install-seed-step";
import { InstallSmtpStep } from "@/components/install/install-smtp-step";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { LocaleSelect } from "@/components/layout/locale-select";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  installWizardCopyKeys,
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

  const copy = step === null ? null : installWizardCopyKeys[step];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border/70 bg-surface px-4 md:px-6">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LifeBuoy size={17} strokeWidth={2} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight text-foreground">
          EP-HelpDesk
        </p>
        <LocaleSelect />
      </header>
      <main className="flex-1">
        <section className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
          <PageHeader
            crumbs={["EP-HelpDesk", t("install.title")]}
            title={t(copy?.heading ?? "install.heading")}
            subtitle={t(copy?.body ?? "install.body")}
          />
          {step === null ? (
            <PanelSkeleton label={t("install.loading")} />
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
        </section>
      </main>
    </div>
  );
}
