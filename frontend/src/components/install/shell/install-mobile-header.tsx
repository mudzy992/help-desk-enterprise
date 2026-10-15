import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { InstallWhatYouGetPanel } from "@/components/install/shell/install-what-you-get-panel";
import { useBranding } from "@/lib/branding/branding-store";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): below `lg` the brand panel becomes a compact header —
  mark, organisation, „Korak X od Y“ and a thin progress bar. The rule „drawer or
  sheet instead of a dialog on mobile“ applies, so „Šta dobijaš“ is a bottom
  sheet here rather than a second column that does not fit.
*/

export function InstallMobileHeader({
  step,
  currentIndex,
  totalSteps,
}: {
  readonly step: InstallWizardStep;
  readonly currentIndex: number;
  readonly totalSteps: number;
}) {
  const { t } = useTranslation();
  const { organizationName } = useBranding();
  const percent = Math.round(((currentIndex + 1) / totalSteps) * 100);

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/95 px-4 pt-3 pb-2 backdrop-blur-[2px] lg:hidden">
      <div className="flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em] text-foreground">
          {organizationName.length > 0 ? organizationName : t("install.title")}
        </span>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="xs" aria-label={t("install.shell.whatYouGet")}>
              <Info size={14} strokeWidth={2.2} />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetTitle>{t("install.shell.whatYouGet")}</SheetTitle>
            <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
              {t("install.shell.whatYouGetHint")}
            </SheetDescription>
            <InstallWhatYouGetPanel step={step} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-valuenow={currentIndex + 1}
          className="h-1 flex-1 overflow-hidden rounded-full bg-border/70"
        >
          <span
            className="pulse-gradient block h-full rounded-full transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span
          aria-live="polite"
          className="tnum shrink-0 text-[11px] font-medium text-muted-foreground"
        >
          {t("install.shell.stepOf", { current: currentIndex + 1, total: totalSteps })}
        </span>
      </div>
    </header>
  );
}
