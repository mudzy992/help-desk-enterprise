import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallLoginProviderStep } from "@/components/install/install-login-provider-step";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { LocaleSelect } from "@/components/layout/locale-select";
import { loadInstallSuperAdmin } from "@/services/install-api";

export function InstallPage() {
  const { t } = useTranslation();
  const [hasSuperAdmin, setHasSuperAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSuperAdmin()
      .then((status) => {
        if (!isCancelled) {
          setHasSuperAdmin(status.superAdmin !== null);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHasSuperAdmin(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const isLoginProviderStep = hasSuperAdmin === true;

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
            {isLoginProviderStep
              ? t("install.loginProvider.heading")
              : t("install.heading")}
          </h2>
          <p className="mt-2 text-body leading-6 text-muted-foreground">
            {isLoginProviderStep
              ? t("install.loginProvider.body")
              : t("install.body")}
          </p>
          {hasSuperAdmin === null ? (
            <div className="mt-6 h-40 animate-pulse bg-elevated" />
          ) : isLoginProviderStep ? (
            <InstallLoginProviderStep />
          ) : (
            <InstallSuperAdminStep onCreated={() => setHasSuperAdmin(true)} />
          )}
        </section>
      </main>
    </div>
  );
}
