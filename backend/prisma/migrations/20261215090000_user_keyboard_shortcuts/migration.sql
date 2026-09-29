-- Paket 2.8 §4.3 (WCAG 2.1.4): per-user switch for single-key keyboard shortcuts.
-- NULL = default by role (enabled for AGENT, ADMIN, SUPER_ADMIN; disabled for USER).
ALTER TABLE "User" ADD COLUMN "keyboardShortcuts" BOOLEAN;
