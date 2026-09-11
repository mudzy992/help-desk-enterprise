import { useTranslation } from "react-i18next";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { LocaleSelect } from "@/components/layout/locale-select";

export function InstallPage() {
  const { t } = useTranslation();

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
            {t("install.heading")}
          </h2>
          <p className="mt-2 text-body leading-6 text-muted-foreground">
            {t("install.body")}
          </p>
          <InstallSuperAdminStep />
        </section>
      </main>
    </div>
  );
}
