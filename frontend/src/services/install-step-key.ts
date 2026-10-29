import type { InstallSectionStepKey } from "@/services/install-sections-api";

/*
  Install wizard v2: the wizard's step vocabulary. It lives in its own module
  because two services answer about the same steps — the wizard state
  (`install-api.ts`) and the package/skip state (`install-profile-api.ts`) — and
  while each kept its own copy of the union, F5's new steps compiled in one and
  not in the other. Importing the type from here is what keeps a new step honest
  everywhere at once.
*/
export type InstallStepKey =
  | "profile"
  | "superAdmin"
  | "identity"
  | "loginProvider"
  | "smtp"
  | "seed"
  | "team"
  | "blueprint"
  | "policyPack"
  | "slaReview"
  | InstallSectionStepKey
  | "securityRecommendations"
  | "addons"
  // F6.1: the screen where the operator watches the installation come up; it is
  // the last step before the final screen.
  | "provisioning";

export type InstallWizardStep = InstallStepKey | "complete";
