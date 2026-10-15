import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { installStepPresentations } from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): „Šta dobijaš“ for the step the operator is standing on.
  Two to four lines of value — the panel answers „why am I filling this in“, never
  „which settings exist“. The brand panel renders it with `tone="brand"`, the
  sheet on phones with the default surface tone.
*/

export function InstallWhatYouGetPanel({
  step,
  tone = "surface",
}: {
  readonly step: InstallWizardStep;
  readonly tone?: "brand" | "surface";
}) {
  const { t } = useTranslation();
  const isBrand = tone === "brand";
  return (
    <section
      aria-labelledby="install-what-you-get-title"
      className={cn(
        "rounded-lg border p-3.5",
        isBrand
          ? "border-primary-foreground/25 bg-primary-foreground/10"
          : "border-border/70 bg-surface",
      )}
    >
      <h2
        id="install-what-you-get-title"
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase",
          isBrand ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />
        {t("install.shell.whatYouGet")}
      </h2>
      <ul className="mt-2.5 grid gap-2">
        {installStepPresentations[step].whatYouGetKeys.map((key) => (
          <li
            key={key}
            className={cn(
              "flex gap-2 text-[12.5px] leading-5",
              isBrand ? "text-primary-foreground/90" : "text-foreground/85",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-[7px] size-1.5 shrink-0 rounded-full",
                isBrand ? "bg-primary-foreground/70" : "bg-primary/70",
              )}
            />
            <span>{t(key as never)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
