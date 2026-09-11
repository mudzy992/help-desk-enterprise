import { useTranslation } from "react-i18next";

export function InstallGateSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-12 items-center border-b border-border bg-surface px-4 md:px-6">
        <div
          className="h-4 w-40 rounded-md bg-elevated"
          aria-hidden="true"
        />
      </header>
      <main className="flex-1 p-4 md:p-6">
        <section
          className="max-w-2xl space-y-3"
          aria-busy="true"
          aria-label={t("install.loading")}
        >
          <div className="h-5 w-56 rounded-md bg-elevated" />
          <div className="h-4 w-full max-w-lg rounded-md bg-elevated" />
          <div className="h-4 w-3/4 max-w-md rounded-md bg-elevated" />
        </section>
      </main>
    </div>
  );
}
