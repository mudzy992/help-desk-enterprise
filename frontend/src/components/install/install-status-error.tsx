import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface InstallStatusErrorProperties {
  readonly onRetry: () => void;
}

/*
  Shown when the install status cannot be read. The gate never guesses the
  setup state from a failed request, so the user retries instead of being sent
  to the installation wizard.
*/
export function InstallStatusError({ onRetry }: InstallStatusErrorProperties) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/70 bg-surface px-4 md:px-6">
        <BrandLockup subtitle={t("shell.brandTagline")} />
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1000px] px-4 py-8 lg:px-8" role="alert">
          <EmptyState
            icon={<AlertTriangle size={18} strokeWidth={1.8} />}
            title={t("install.statusError.title")}
            body={t("install.statusError.body")}
            action={
              <Button type="button" variant="outline" onClick={onRetry}>
                {t("install.statusError.retry")}
              </Button>
            }
          />
        </div>
      </main>
    </div>
  );
}
