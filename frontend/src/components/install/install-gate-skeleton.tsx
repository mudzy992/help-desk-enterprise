import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/layout/brand-mark";
import { PanelSkeleton } from "@/components/ui/skeleton";

/*
  Shown while the install gate resolves. Loading is a skeleton of the real
  layout (brand header + panel), never a spinner.
*/
export function InstallGateSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/70 bg-surface px-4 md:px-6">
        <BrandLockup subtitle={t("shell.brandTagline")} />
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1000px] px-4 py-8 lg:px-8">
          <PanelSkeleton className="mt-0" label={t("install.loading")} />
        </div>
      </main>
    </div>
  );
}
