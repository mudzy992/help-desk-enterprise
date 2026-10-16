import { InstallAddonsStep } from "@/components/install/install-addons-step";
import { InstallBlueprintStep } from "@/components/install/install-blueprint-step";
import { InstallIdentityStep } from "@/components/install/install-identity-step";
import { InstallLoginProviderStep } from "@/components/install/install-login-provider-step";
import { InstallPolicyPackStep } from "@/components/install/install-policy-pack-step";
import { InstallProfileStep } from "@/components/install/install-profile-step";
import { InstallProvisioningStep } from "@/components/install/install-provisioning-step";
import { InstallReadyScreen } from "@/components/install/install-ready-screen";
import { InstallSectionStep } from "@/components/install/install-section-step";
import { InstallSecurityRecommendations } from "@/components/install/install-security-recommendations";
import { InstallSlaReviewStep } from "@/components/install/install-sla-review-step";
import { InstallSmtpStep } from "@/components/install/install-smtp-step";
import { InstallStructureStep } from "@/components/install/install-structure-step";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { InstallTeamStep } from "@/components/install/install-team-step";
import { readInstallSectionKeyFromStep } from "@/services/install-sections-api";
import type { InstallStepKey, InstallStepState, InstallWizardStep } from "@/services/install-api";
import type { InstallProfileStatus } from "@/services/install-profile-api";

/*
  Install wizard v2 (F3): one place that maps a step key to its screen, so the
  page stays a composition and the shell keeps its slots. Every step keeps the F0
  contract — it loads its own state, it saves itself, and it reports back with
  `onSaved`, which asks `InstallSetupProvider` for a fresh status.
*/

export function InstallActiveStep({
  step,
  states,
  onSaved,
  isAddonsSaved,
  onDeferStep,
  onFixStep,
  isDeferPending,
}: {
  readonly step: InstallWizardStep;
  readonly states: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
  /** Steps without a payload just report "saved"; the package step returns its status. */
  readonly onSaved: (next?: InstallProfileStatus) => void;
  readonly isAddonsSaved: boolean;
  readonly onDeferStep: (stepKey: InstallStepKey, shouldDefer: boolean) => void;
  /** F6.1: „Idi na korak“ from the provisioning screen. */
  readonly onFixStep: (stepKey: InstallStepKey) => void;
  readonly isDeferPending: boolean;
}) {
  switch (step) {
    case "profile":
      return (
        <InstallProfileStep
          states={states}
          onSaved={onSaved}
          onDeferStep={onDeferStep}
          isDeferPending={isDeferPending}
        />
      );
    case "superAdmin":
      return <InstallSuperAdminStep onCreated={() => onSaved()} />;
    case "identity":
      return <InstallIdentityStep onSaved={onSaved} />;
    case "loginProvider":
      return <InstallLoginProviderStep onSaved={onSaved} />;
    case "smtp":
      return <InstallSmtpStep onSaved={onSaved} />;
    case "seed":
      return <InstallStructureStep onSaved={onSaved} />;
    case "team":
      return <InstallTeamStep onSaved={onSaved} />;
    case "blueprint":
      return <InstallBlueprintStep onSaved={onSaved} />;
    case "policyPack":
      return <InstallPolicyPackStep onSaved={onSaved} />;
    case "slaReview":
      return <InstallSlaReviewStep onSaved={onSaved} />;
    case "securityRecommendations":
      return <InstallSecurityRecommendations onSaved={() => onSaved()} />;
    case "addons":
      return <InstallAddonsStep onSaved={onSaved} isSaved={isAddonsSaved} />;
    case "provisioning":
      return <InstallProvisioningStep onFixStep={onFixStep} />;
    case "complete":
      return <InstallReadyScreen />;
    default: {
      // F5: every `section.<key>` step is the same screen with a different
      // allowlist behind it — the registry decides what the step holds, so the
      // wizard needs no eleven cases and no eleventh component.
      const sectionKey = readInstallSectionKeyFromStep(step);
      if (sectionKey === null) {
        // A `section.*` key the registry does not know: the client is older than
        // the server. The shell only renders the step the status endpoint reports,
        // and it keeps „Nazad“ working, so a blank screen here beats inventing an
        // error the operator cannot act on.
        return null;
      }
      return <InstallSectionStep sectionKey={sectionKey} onSaved={() => onSaved()} />;
    }
  }
}
