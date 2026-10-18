import {
  Blocks,
  Building2,
  Flag,
  KeyRound,
  ListTree,
  Mail,
  Network,
  Package,
  Rocket,
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
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 one declaration per step for the shell — icon, headline
  and the „Šta dobijaš“ lines. The registry on the server owns which steps the
  package asks for, the order lives in `install-wizard-order.ts`; this file only
  says how a step is presented, so the page, the rail, the footer and the mobile
  header cannot drift apart.
*/

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
  // F6.1: the screen where the operator watches the installation come up.
  provisioning: {
    icon: Rocket,
    titleKey: "install.provisioning.heading",
    bodyKey: "install.provisioning.body",
    whatYouGetKeys: [
      "install.whatYouGet.provisioning.1",
      "install.whatYouGet.provisioning.2",
      "install.whatYouGet.provisioning.3",
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

export { installStepIndex, installStepLabelKey, installWizardSteps } from "./install-wizard-order";
