import { authorizationRoleKeys } from '../authorization/authorization.constants';

/** Roles that get single-key shortcuts by default (2.8 §4.3). */
const SHORTCUTS_ON_BY_DEFAULT: ReadonlySet<string> = new Set([
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
]);

export function defaultKeyboardShortcutsForRoles(roleKeys: readonly string[]): boolean {
  return roleKeys.some((roleKey) => SHORTCUTS_ON_BY_DEFAULT.has(roleKey));
}

/**
 * Effective value: the user's explicit choice wins; otherwise on for staff and
 * off for end users, who rarely need them and are confused by an accidental `N`.
 */
export function resolveKeyboardShortcuts(stored: boolean | null, roleKeys: readonly string[]): boolean {
  return stored ?? defaultKeyboardShortcutsForRoles(roleKeys);
}
