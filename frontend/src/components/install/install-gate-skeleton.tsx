import { useTranslation } from "react-i18next";
import { PanelSkeleton } from "@/components/ui/skeleton";

export function InstallGateSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border bg-surface px-4 md:px-6">
        <div className="h-4 w-40 rounded-md bg-elevated" aria-hidden="true" />
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
          <PanelSkeleton className="mt-0" label={t("install.loading")} />
        </section>
      </main>
    </div>
  );
}
