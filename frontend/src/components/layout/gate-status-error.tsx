import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface GateStatusErrorProperties {
  readonly title: string;
  readonly body: string;
  readonly retryLabel: string;
  readonly onRetry: () => void;
}

/*
  Full-page state for a gate that could not decide where the user belongs. The
  gate never guesses from a failed request: the user retries explicitly.
*/
export function GateStatusError({ title, body, retryLabel, onRetry }: GateStatusErrorProperties) {
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
            title={title}
            body={body}
            action={
              <Button type="button" variant="outline" onClick={onRetry}>
                {retryLabel}
              </Button>
            }
          />
        </div>
      </main>
    </div>
  );
}
