import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { installStepPresentations } from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 — „Aurora“: „Šta dobijaš“ for the step the operator is
  standing on. Two to four lines of value — the panel answers „why am I filling
  this in“, never „which settings exist“.
*/

export function InstallWhatYouGetPanel({ step }: { readonly step: InstallWizardStep }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="install-what-you-get-title" className="iw-panel p-4">
      <h2 id="install-what-you-get-title" className="iw-eyebrow flex items-center gap-1.5">
        <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />
        {t("install.shell.whatYouGet")}
      </h2>
      <ul className="mt-3 grid gap-2">
        {installStepPresentations[step].whatYouGetKeys.map((key) => (
          <li key={key} className="flex gap-2 text-[12.5px] leading-5 text-muted-foreground">
            <span aria-hidden="true" className="iw-dot mt-[7px] size-1.5 shrink-0 rounded-full" />
            <span>{t(key as never)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
