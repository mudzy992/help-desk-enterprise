import { useTranslation } from "react-i18next";
import {
  installStepIndex,
  installStepPresentations,
  installWizardSteps,
} from "@/lib/install/install-step-presentation";
import type { InstallWizardStep } from "@/services/install-api";
import type { RefCallback } from "react";

/*
  Install wizard v2 — „Aurora“: the question the step asks.

  Eyebrow („Korak 4 od 14“), the display headline and one sentence that
  says what the step is for. The `h1` is the element `useInstallStepTransition`
  focuses, so it stays a real heading with `tabIndex={-1}` — the wizard never
  takes the operator's tab order, it only lands them on the new question.
*/

export function InstallStepHeader({
  step,
  titleRef,
}: {
  readonly step: InstallWizardStep;
  readonly titleRef: RefCallback<HTMLHeadingElement>;
}) {
  const { t } = useTranslation();
  const presentation = installStepPresentations[step];
  const index = installStepIndex(step);

  return (
    <header className="grid gap-3">
      <p className="iw-eyebrow">
        {t("install.shell.stepOf", { current: index + 1, total: installWizardSteps.length })}
      </p>
      {/* a11y-focus: the step title only takes programmatic focus on a step change; it is not tabbable (tabIndex -1). */}
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="iw-display iw-title outline-none"
        data-iw-step-title=""
      >
        {t(presentation.titleKey as never)}
      </h1>
      <p className="max-w-2xl text-[13.5px] leading-6 text-muted-foreground">
        {t(presentation.bodyKey as never)}
      </p>
    </header>
  );
}
