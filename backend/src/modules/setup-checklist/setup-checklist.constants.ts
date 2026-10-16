/**
 * Install wizard v2 (F6.3): the post-install checklist. One stored fact — the
 * moment the widget was dismissed — plus the change-log reason it is written
 * with, so `GET /setup-checklist` stays a pure read.
 */
export const setupChecklistConstants = {
  changeLogReason: 'setup_checklist_dismissed',
} as const;
