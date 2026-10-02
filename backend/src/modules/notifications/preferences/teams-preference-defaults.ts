/**
 * Paket 3.1 (§12): categories that can also be delivered to Teams, with their
 * default. Approvals and CAB votes are on by default (they need an answer);
 * everything else is opt-in. Categories not listed here never go to Teams.
 */
export const teamsPreferenceDefaults: Readonly<Record<string, boolean>> = {
  'ticket.assigned': false,
  'ticket.forwarded': false,
  'ticket.message': false,
  'ticket.mentioned': false,
  'ticket.outcome': false,
  'ticket.approval': true,
  'ticket.sla': false,
  'problem.owner': false,
  'problem.linked': false,
  'change.approval': true,
  'change.owner': false,
  'oncall.shift': false,
};

export function isTeamsCapableCategory(categoryKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(teamsPreferenceDefaults, categoryKey);
}

/** Effective Teams choice: the stored value or the category default. */
export function effectiveTeamsPreference(categoryKey: string, stored: boolean | null | undefined): boolean {
  if (!isTeamsCapableCategory(categoryKey)) return false;
  return stored ?? teamsPreferenceDefaults[categoryKey] === true;
}
