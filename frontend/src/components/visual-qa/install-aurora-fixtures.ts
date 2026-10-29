import type { InstallRailItem } from "@/components/install/shell/install-step-rail";
import type { InstallSetupSummary } from "@/services/install-api";
import type { InstallReadinessCheck, InstallProfilePackage } from "@/services/install-profile-api";

/*
  Fixtures for the wizard's design surfaces — the Visual QA board (`/_visual-qa`)
  and the dev-only preview at `/install-preview`.

  Both render the *real* components, so the fixtures have to be shaped exactly
  like the API's answers: the rail states come from `GET /install/status`, the
  checks from `GET /install/readiness`, the packages from `GET /install/profile`.
  They live in one file so the two surfaces cannot drift apart, and every string
  is a real i18n key — a renamed key shows up here as a raw key, not as nothing.
*/

export const auroraRailItems: readonly InstallRailItem[] = [
  { key: "profile", state: "done" },
  { key: "superAdmin", state: "done" },
  { key: "identity", state: "current" },
  { key: "loginProvider", state: "upcoming" },
  { key: "smtp", state: "deferred" },
  { key: "seed", state: "upcoming" },
  { key: "team", state: "locked" },
  { key: "blueprint", state: "locked" },
  { key: "policyPack", state: "locked" },
  { key: "slaReview", state: "locked" },
  { key: "securityRecommendations", state: "locked" },
  { key: "addons", state: "locked" },
  { key: "provisioning", state: "upcoming" },
];

const minimumItems = ["tokenGate", "superAdmin", "organizationIdentity", "structure"];
const standardItems = [
  "team",
  "smtp",
  "catalogBlueprints",
  "policyPackIt",
  "securityRecommendations",
];
const fullItems = [
  "inboundEmail",
  "directorySync",
  "knowledgeBase",
  "itsmModules",
  "privacyRetention",
];

function items(keys: readonly string[]) {
  return keys.map((key, index) => ({
    key,
    labelKey: `install.profile.item.${key}`,
    required: index < 2,
  }));
}

export const auroraPackages: readonly InstallProfilePackage[] = [
  {
    profile: "minimum",
    titleKey: "install.profile.minimum.title",
    descriptionKey: "install.profile.minimum.description",
    estimatedMinutes: 5,
    recommended: false,
    requiredSteps: [],
    offeredSteps: [],
    defaultEnabledAddons: [],
    items: items(minimumItems),
  },
  {
    profile: "standard",
    titleKey: "install.profile.standard.title",
    descriptionKey: "install.profile.standard.description",
    estimatedMinutes: 15,
    recommended: true,
    requiredSteps: ["smtp", "team"],
    offeredSteps: ["smtp", "team", "addons"],
    defaultEnabledAddons: [],
    items: items(standardItems),
  },
  {
    profile: "full",
    titleKey: "install.profile.full.title",
    descriptionKey: "install.profile.full.description",
    estimatedMinutes: 25,
    recommended: false,
    requiredSteps: [],
    offeredSteps: [],
    defaultEnabledAddons: [],
    items: items(fullItems),
  },
];

/** Real check keys: the list resolves its wording through `installReadinessMessageKey`. */
export const auroraReadinessChecks: readonly InstallReadinessCheck[] = [
  { key: "superAdmin", status: "ok", messageKey: "install.readiness.superAdmin" },
  { key: "organizationalUnit", status: "ok", messageKey: "install.readiness.organizationalUnit" },
  { key: "service", status: "ok", messageKey: "install.readiness.service" },
  { key: "handlerGroup", status: "missing", messageKey: "install.readiness.handlerGroup" },
  { key: "roles", status: "missing", messageKey: "install.readiness.roles", stepKey: null },
];

/** What `GET /install/status` reports once the wizard has built the installation. */
export const auroraSummary: InstallSetupSummary = {
  organizationName: "Gradska uprava Visoko",
  profile: "standard",
  organizationalUnitCount: 3,
  serviceCount: 5,
  groupCount: 4,
  teamMemberCount: 6,
  enabledAddonKeys: ["csat", "emailNotifications"],
  deferredSteps: ["smtp"],
};
