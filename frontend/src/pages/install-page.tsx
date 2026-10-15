import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstallSetup } from "@/app/install-setup-provider";
import { InstallActiveStep } from "@/components/install/install-active-step";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { InstallTokenGate } from "@/components/install/install-token-gate";
import { InstallStepFooter } from "@/components/install/shell/install-step-footer";
import { InstallWizardShell } from "@/components/install/shell/install-wizard-shell";
import { GateStatusError } from "@/components/layout/gate-status-error";
import { errorTextClassName } from "@/components/ui/control";
import { buildInstallRailItems } from "@/lib/install/build-install-rail-items";
import { resolveRenderedStep } from "@/lib/install/resolve-rendered-step";
import { useInstallStepDeferral } from "@/lib/install/use-install-step-deferral";
import { useInstallStepNavigation } from "@/lib/install/use-install-step-navigation";
import type { InstallStepKey, InstallStepState, InstallWizardStep } from "@/services/install-api";
import type { InstallProfileStatus } from "@/services/install-profile-api";

/*
  Install wizard v2 (F3): the page is a composition — token gate, then the shell
  around the step the server asks for. F0.3 still holds: the step comes from
  `InstallSetupProvider`, the single reader of `GET /install/status`, and the rail
  reads the same payload. This page is not inside `InstallSetupLayout`, so the
  loading and error states of the status read belong here — the old shell rendered
  a skeleton forever when the status request failed.
*/

/** IN19: the one-line explanation shown above a step a package change reopened. */
const reopenedNoticeClassName =
  "rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] leading-5 text-foreground";

export function InstallPage() {
  return (
    <InstallTokenGate>
      <InstallWizard />
    </InstallTokenGate>
  );
}

function InstallWizard() {
  const { t } = useTranslation();
  const setup = useInstallSetup();

  if (setup.status === "loading") {
    return <InstallGateSkeleton />;
  }
  if (setup.status === "error") {
    return (
      <GateStatusError
        title={t("install.statusError.title")}
        body={t("install.statusError.body")}
        retryLabel={t("install.statusError.retry")}
        onRetry={setup.reload}
      />
    );
  }

  // The status is known here, so the step is decided by the same resolver the F0
  // shell used — never by a half-loaded payload.
  return (
    <InstallWizardStep
      states={setup.steps}
      serverStep={resolveRenderedStep({
        nextStep: setup.nextStep,
        isCompleted: setup.isCompleted,
        steps: setup.steps,
      })}
      onReload={setup.reload}
    />
  );
}

/** The shell plus the step, with navigation and deferral for the current step. */
function InstallWizardStep({
  states,
  serverStep,
  onReload,
}: {
  readonly states: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
  readonly serverStep: InstallWizardStep;
  readonly onReload: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useInstallStepNavigation({ serverStep, states });
  const deferral = useInstallStepDeferral({ onChanged: onReload });
  // IN19: a package change may cancel deferrals, and the operator deserves to
  // know why the step is suddenly in the way. Kept until the step is answered
  // (its own save clears it through the condition below), never persisted.
  const [reopenedSteps, setReopenedSteps] = useState<readonly InstallStepKey[]>([]);
  const step = navigation.step;
  const state = step === "complete" ? undefined : states?.[step];
  // „Podesi kasnije“ is a step action; the final screen is not a step.
  const deferrableStep: InstallStepKey | null = step === "complete" ? null : step;
  const isReopened =
    step !== "complete" &&
    reopenedSteps.includes(step) &&
    state?.completed !== true &&
    state?.skipped !== true;

  const handleSaved = (next?: InstallProfileStatus) => {
    if (next !== undefined) setReopenedSteps(next.reopenedSteps);
    onReload();
  };

  return (
    <InstallWizardShell
      step={step}
      railItems={buildInstallRailItems({ activeStep: step, states })}
      footer={
        <div>
          <InstallStepFooter
            canGoBack={navigation.canGoBack}
            onBack={navigation.goBack}
            isDeferred={state?.skipped === true}
            canDefer={deferrableStep !== null && state?.skippable === true}
            isDeferring={deferral.isPending}
            onDefer={() => {
              if (deferrableStep !== null) deferral.defer(deferrableStep);
            }}
            onUndoDefer={() => {
              if (deferrableStep !== null) deferral.undo(deferrableStep);
            }}
            onContinue={navigation.continueForward}
            isContinueVisible={step !== serverStep}
          />
          {deferral.errorKey === null ? null : (
            <p role="alert" className={errorTextClassName}>
              {t(deferral.errorKey)}
            </p>
          )}
        </div>
      }
    >
      {isReopened ? <p className={reopenedNoticeClassName}>{t("install.shell.reopened")}</p> : null}
      <div className="mt-4">
        <InstallActiveStep
          step={step}
          states={states}
          onSaved={handleSaved}
          isAddonsSaved={states?.addons.completed === true}
          onDeferStep={(stepKey, shouldDefer) =>
            shouldDefer ? deferral.defer(stepKey) : deferral.undo(stepKey)
          }
          isDeferPending={deferral.isPending}
        />
      </div>
    </InstallWizardShell>
  );
}
