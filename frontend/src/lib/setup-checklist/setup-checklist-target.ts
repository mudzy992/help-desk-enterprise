import type { SetupChecklistItem } from "@/services/setup-checklist-api";

/*
  Resolves where a checklist item sends the operator. The backend owns
  *what* is still open (step keys and setting keys); which screen fixes it is a
  client question — the routes are the client's business and change with it.
*/

/** Screens of the admin area a deferred step is usually answered from. */
const stepTargets: Readonly<Record<string, string>> = {
  team: "/admin?tab=users",
  seed: "/services",
  blueprint: "/services",
  slaReview: "/sla",
  policyPack: "/admin?tab=permissions",
};

export function setupChecklistTarget(item: SetupChecklistItem): string {
  // A recommendation is a setting: the security tab is where the value lives.
  if (item.kind === "recommendation") {
    return "/admin?tab=security";
  }
  return stepTargets[item.targetKey] ?? "/admin?tab=settings";
}
