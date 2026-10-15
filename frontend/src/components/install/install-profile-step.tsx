import { useTranslation } from "react-i18next";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { InstallProfileForm } from "@/components/install/install-profile-form";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import { loadInstallProfile, type InstallProfileStatus } from "@/services/install-profile-api";
import type { InstallStepKey, InstallStepState } from "@/services/install-api";

/*
  Install wizard v2 (F3): the package picker is the wizard's first question (§4
  makes „Izbor paketa“ required in all three packages), so this step has no
  „Nastavi“ — saving the choice is what moves the wizard on. The loader lives here
  and the form is a child, so the form may initialise its selection from the
  stored package while the loading and error states keep the F0.2 rule: no form
  before the state is known.
*/

export function InstallProfileStep({
  states,
  onSaved,
  onDeferStep,
  isDeferPending,
}: {
  readonly states: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
  readonly onSaved: (next: InstallProfileStatus) => void;
  readonly onDeferStep: (stepKey: InstallStepKey, shouldDefer: boolean) => void;
  readonly isDeferPending: boolean;
}) {
  const { t } = useTranslation();
  const resource = useInstallStepResource(loadInstallProfile);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }
  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  return (
    <InstallProfileForm
      data={resource.data}
      states={states}
      onSaved={onSaved}
      onLoaded={resource.setData}
      onDeferStep={onDeferStep}
      isDeferPending={isDeferPending}
    />
  );
}
