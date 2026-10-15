import {
  Blocks,
  Building2,
  Flag,
  KeyRound,
  ListTree,
  Mail,
  Network,
  Package,
  ScrollText,
  ShieldCheck,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  installSectionStepPresentations,
  installSecurityRecommendationsPresentation,
} from "@/lib/install/install-section-presentation";
import { installSectionStepKeys } from "@/services/install-sections-api";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F3): one declaration per step for the shell — order, icon,
  headline and the „Šta dobijaš“ lines. The registry on the server owns which
  steps the package asks for; this file only says how a step is presented, so the
  page, the rail, the footer and the mobile header cannot drift apart.
*/

/** The wizard's order; the step counter, the rail and „Nazad“ all read this. */
export const installWizardSteps: readonly InstallWizardStep[] = [
  "profile",
  "superAdmin",
  "identity",
  "loginProvider",
  "smtp",
  "seed",
  "team",
  // F4: Standard/Full content, in the order the registry declares it.
  "blueprint",
  "policyPack",
  "slaReview",
  // F5: the sections of the Full package, in the order the registry declares
  // them, then the recommendations panel Standard and Full share.
  ...installSectionStepKeys,
  "securityRecommendations",
  "addons",
  "complete",
];

export type InstallStepPresentation = {
  readonly icon: LucideIcon;
  readonly titleKey: string;
  readonly bodyKey: string;
  /**
   * „Šta dobijaš“ — value the operator understands, 2–4 short lines. Never a
   * list of settings; the panel answers „why am I filling this in“.
   */
  readonly whatYouGetKeys: readonly string[];
};

export const installStepPresentations: Readonly<
  Record<InstallWizardStep, InstallStepPresentation>
> = {
  ...installSectionStepPresentations,
  profile: {
    icon: Package,
    titleKey: "install.profile.heading",
    bodyKey: "install.profile.body",
    whatYouGetKeys: [
      "install.whatYouGet.profile.1",
      "install.whatYouGet.profile.2",
      "install.whatYouGet.profile.3",
    ],
  },
  superAdmin: {
    icon: ShieldCheck,
    titleKey: "install.heading",
    bodyKey: "install.body",
    whatYouGetKeys: [
      "install.whatYouGet.superAdmin.1",
      "install.whatYouGet.superAdmin.2",
      "install.whatYouGet.superAdmin.3",
    ],
  },
  identity: {
    icon: Building2,
    titleKey: "install.identity.heading",
    bodyKey: "install.identity.body",
    whatYouGetKeys: [
      "install.whatYouGet.identity.1",
      "install.whatYouGet.identity.2",
      "install.whatYouGet.identity.3",
    ],
  },
  loginProvider: {
    icon: KeyRound,
    titleKey: "install.loginProvider.heading",
    bodyKey: "install.loginProvider.body",
    whatYouGetKeys: [
      "install.whatYouGet.loginProvider.1",
      "install.whatYouGet.loginProvider.2",
      "install.whatYouGet.loginProvider.3",
    ],
  },
  smtp: {
    icon: Mail,
    titleKey: "install.smtp.heading",
    bodyKey: "install.smtp.body",
    whatYouGetKeys: [
      "install.whatYouGet.smtp.1",
      "install.whatYouGet.smtp.2",
      "install.whatYouGet.smtp.3",
    ],
  },
  seed: {
    icon: Network,
    titleKey: "install.structure.heading",
    bodyKey: "install.structure.body",
    whatYouGetKeys: [
      "install.whatYouGet.seed.1",
      "install.whatYouGet.seed.2",
      "install.whatYouGet.seed.3",
    ],
  },
  team: {
    icon: Users,
    titleKey: "install.team.heading",
    bodyKey: "install.team.body",
    whatYouGetKeys: [
      "install.whatYouGet.team.1",
      "install.whatYouGet.team.2",
      "install.whatYouGet.team.3",
    ],
  },
  blueprint: {
    icon: ListTree,
    titleKey: "install.blueprint.heading",
    bodyKey: "install.blueprint.body",
    whatYouGetKeys: [
      "install.whatYouGet.blueprint.1",
      "install.whatYouGet.blueprint.2",
      "install.whatYouGet.blueprint.3",
    ],
  },
  policyPack: {
    icon: ScrollText,
    titleKey: "install.policyPack.heading",
    bodyKey: "install.policyPack.body",
    whatYouGetKeys: [
      "install.whatYouGet.policyPack.1",
      "install.whatYouGet.policyPack.2",
      "install.whatYouGet.policyPack.3",
    ],
  },
  slaReview: {
    icon: Timer,
    titleKey: "install.slaReview.heading",
    bodyKey: "install.slaReview.body",
    whatYouGetKeys: [
      "install.whatYouGet.slaReview.1",
      "install.whatYouGet.slaReview.2",
      "install.whatYouGet.slaReview.3",
    ],
  },
  securityRecommendations: installSecurityRecommendationsPresentation,
  addons: {
    icon: Blocks,
    titleKey: "install.addons.heading",
    bodyKey: "install.addons.body",
    whatYouGetKeys: [
      "install.whatYouGet.addons.1",
      "install.whatYouGet.addons.2",
      "install.whatYouGet.addons.3",
    ],
  },
  complete: {
    icon: Flag,
    titleKey: "install.complete.heading",
    bodyKey: "install.complete.body",
    whatYouGetKeys: [
      "install.whatYouGet.complete.1",
      "install.whatYouGet.complete.2",
      "install.whatYouGet.complete.3",
    ],
  },
};


export type InstallStepLabelKey = `install.steps.${InstallWizardStep}`;

export function installStepLabelKey(step: InstallWizardStep): InstallStepLabelKey {
  return `install.steps.${step}`;
}

export function installStepIndex(step: InstallWizardStep): number {
  return installWizardSteps.indexOf(step);
}
