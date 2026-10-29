/**
 * the post-install checklist. It is not a to-do list
 * the operator maintains — every item is a promise the wizard made („Podesi
 * kasnije“) or a production recommendation that is not in place yet, and it
 * disappears by itself once the thing behind it exists.
 */
export type SetupChecklistItemKind = 'step' | 'recommendation';

export type SetupChecklistItem = {
  /** Stable identity of the line, e.g. `step.smtp` or `recommendation.private…`. */
  readonly key: string;
  readonly kind: SetupChecklistItemKind;
  /** Step key (`step`) or setting key (`recommendation`) the item points at. */
  readonly targetKey: string;
  /** i18n key of the line itself (`dashboard.setupChecklist.item.*`). */
  readonly titleKey: string;
  /** i18n key of the „what is missing“ sentence, when the item has one. */
  readonly helpKey?: string;
};

export type SetupChecklistStatus = {
  /**
   * When an administrator hid the widget. The items stay in the payload: the
   * dashboard hides the card, Settings keeps showing what is still open.
   */
  readonly dismissedAt: string | null;
  readonly items: readonly SetupChecklistItem[];
};
