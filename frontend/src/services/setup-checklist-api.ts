import { apiRequest } from "@/services/api";

/**
 * the post-install checklist. The backend derives every
 * item from state the product already keeps, so the client only reads the list
 * and can hide the widget once — nothing here toggles an item by hand.
 */
export type SetupChecklistItemKind = "step" | "recommendation";

export type SetupChecklistItem = {
  readonly key: string;
  readonly kind: SetupChecklistItemKind;
  /** Step key (`step`) or setting key (`recommendation`) the item points at. */
  readonly targetKey: string;
  /** i18n key of the line (`install.steps.*` or a recommendation title). */
  readonly titleKey: string;
  readonly helpKey?: string;
};

export type SetupChecklistStatus = {
  /** Set when an administrator hid the widget; the items stay readable. */
  readonly dismissedAt: string | null;
  readonly items: readonly SetupChecklistItem[];
};

export function loadSetupChecklist(): Promise<SetupChecklistStatus> {
  return apiRequest<SetupChecklistStatus>("/setup-checklist");
}

export function dismissSetupChecklist(): Promise<SetupChecklistStatus> {
  return apiRequest<SetupChecklistStatus>("/setup-checklist/dismiss", { method: "POST" });
}
