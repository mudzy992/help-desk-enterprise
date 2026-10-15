import {
  Activity,
  BellRing,
  Blocks,
  BookOpen,
  Building2,
  Clock,
  Flag,
  Folders,
  Inbox,
  KeyRound,
  Layers,
  ListChecks,
  Lock,
  Mail,
  Network,
  Plug,
  Server,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { InstallStepKey } from "@/services/install-api";
import type {
  InstallProfile,
  InstallProfilePackage,
  InstallProfileItem,
} from "@/services/install-profile-api";

/*
  Install wizard v2 (F3): how one catalogue line from `install-profile.catalog.ts`
  is presented. `stepKey` is the wizard step that owns the item — the customize
  pane may only offer a switch where a step exists and the registry allows it to
  be deferred; items whose behaviour arrives with F4/F5 have `null` and are shown
  as package content, never as a switch that does nothing.
*/

export type InstallProfileItemPresentation = {
  readonly icon: LucideIcon;
  readonly stepKey: InstallStepKey | null;
};

export const installProfileItemPresentations: Readonly<
  Record<string, InstallProfileItemPresentation>
> = {
  tokenGate: { icon: Lock, stepKey: null },
  superAdmin: { icon: ShieldCheck, stepKey: "superAdmin" },
  organizationIdentity: { icon: Building2, stepKey: "identity" },
  branding: { icon: Sparkles, stepKey: "identity" },
  loginMode: { icon: KeyRound, stepKey: "loginProvider" },
  structure: { icon: Network, stepKey: "seed" },
  firstService: { icon: Inbox, stepKey: "seed" },
  team: { icon: Users, stepKey: "team" },
  smtp: { icon: Mail, stepKey: "smtp" },
  emailNotifications: { icon: BellRing, stepKey: null },
  catalogBlueprints: { icon: Layers, stepKey: null },
  policyPackIt: { icon: ShieldHalf, stepKey: null },
  addonsOverview: { icon: Blocks, stepKey: "addons" },
  handlerLevels: { icon: Network, stepKey: null },
  slaOverview: { icon: Clock, stepKey: null },
  securityRecommendations: { icon: ShieldHalf, stepKey: null },
  inboundEmail: { icon: Inbox, stepKey: null },
  directorySync: { icon: Server, stepKey: null },
  knowledgeBase: { icon: BookOpen, stepKey: null },
  statusPage: { icon: Activity, stepKey: null },
  onCall: { icon: Clock, stepKey: null },
  announcements: { icon: BellRing, stepKey: null },
  itsmModules: { icon: Layers, stepKey: null },
  integrations: { icon: Plug, stepKey: null },
  privacyRetention: { icon: Lock, stepKey: null },
  provisioning: { icon: ListChecks, stepKey: null },
  readyScreen: { icon: Flag, stepKey: null },
};

const fallbackItemIcon = Folders;

export function readInstallProfileItemPresentation(key: string): InstallProfileItemPresentation {
  return installProfileItemPresentations[key] ?? { icon: fallbackItemIcon, stepKey: null };
}

/**
 * The catalogue lines of the chosen package — the package itself plus everything
 * the smaller packages include (D1: each package contains the previous one). The
 * server derives the same list in `listInstallProfileItems`; the cards and the
 * customize pane read the same rows the backend would report.
 */
export function listInstallProfileItems(
  packages: readonly InstallProfilePackage[],
  profile: InstallProfile,
): readonly InstallProfileItem[] {
  const rank = (value: InstallProfile) => ["minimum", "standard", "full"].indexOf(value);
  const seen = new Set<string>();
  return packages
    .filter((pack) => rank(pack.profile) <= rank(profile))
    .flatMap((pack) => pack.items)
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });
}

/** The wizard steps the chosen package actually walks, in wizard order. */
export function listInstallProfileStepItems(
  items: readonly { readonly key: string; readonly labelKey: string }[],
): readonly {
  readonly itemKey: string;
  readonly labelKey: string;
  readonly stepKey: InstallStepKey;
}[] {
  return items.flatMap((item) => {
    const stepKey = readInstallProfileItemPresentation(item.key).stepKey;
    return stepKey === null ? [] : [{ itemKey: item.key, labelKey: item.labelKey, stepKey }];
  });
}
