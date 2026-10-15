import {
  Activity,
  Blocks,
  BookOpen,
  Inbox,
  Lock,
  Megaphone,
  Network,
  PhoneCall,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import {
  installSectionKeys,
  resolveInstallSectionStepKey,
  type InstallSectionStepKey,
  type InstallSettingsSectionKey,
} from "@/services/install-sections-api";

/*
  Install wizard v2 (F5): how a section step presents itself — icon and the i18n
  slots of its copy. The keys are derived from the section key
  (`install.section.<sectionKey>.title|value|whatYouGet.<n>`), the same convention
  the backend uses for `titleKey`, so a new section only has to be added to
  `installSectionKeys` (frontend) and to the registry (backend) to work end to
  end. The fields themselves need no copy here: they render the registry's own
  `settings.registry.keys|help.<key>` translations.
*/

export type InstallSectionPresentation = {
  readonly icon: LucideIcon;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly whatYouGetKeys: readonly string[];
};

const sectionIcons: Readonly<Record<InstallSettingsSectionKey, LucideIcon>> = {
  inboundEmail: Inbox,
  directory: Network,
  knowledgeBase: BookOpen,
  statusPage: Activity,
  onCall: PhoneCall,
  announcements: Megaphone,
  security: ShieldCheck,
  privacy: Lock,
  auditWebhook: Webhook,
  itsm: Blocks,
  integrations: Plug,
};

function presentationFor(prefix: string, icon: LucideIcon): InstallSectionPresentation {
  return {
    icon,
    titleKey: `${prefix}.title`,
    bodyKey: `${prefix}.value`,
    whatYouGetKeys: [`${prefix}.whatYouGet.1`, `${prefix}.whatYouGet.2`, `${prefix}.whatYouGet.3`],
  };
}

export const installSectionPresentations: Readonly<
  Record<InstallSettingsSectionKey, InstallSectionPresentation>
> = Object.fromEntries(
  installSectionKeys.map((sectionKey) => [
    sectionKey,
    presentationFor(`install.section.${sectionKey}`, sectionIcons[sectionKey]),
  ]),
) as Readonly<Record<InstallSettingsSectionKey, InstallSectionPresentation>>;

/** Owner decision 7: the one panel Standard and Full share. */
export const installSecurityRecommendationsPresentation: InstallSectionPresentation =
  presentationFor("install.security.recommendations", ShieldAlert);

/**
 * The same declarations keyed by step (`section.<sectionKey>`). `install-step-
 * presentation.ts` spreads this into the wizard's step record, so a section is
 * declared in exactly one place: this list.
 */
export const installSectionStepPresentations: Readonly<
  Record<InstallSectionStepKey, InstallSectionPresentation>
> = Object.fromEntries(
  installSectionKeys.map((sectionKey) => [
    resolveInstallSectionStepKey(sectionKey),
    installSectionPresentations[sectionKey],
  ]),
) as Readonly<Record<InstallSectionStepKey, InstallSectionPresentation>>;
