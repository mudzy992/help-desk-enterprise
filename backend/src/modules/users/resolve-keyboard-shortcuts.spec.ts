import { resolveKeyboardShortcuts } from './resolve-keyboard-shortcuts';
import { toUserPreferencesResponse } from './user-preferences.controller';

describe('resolveKeyboardShortcuts (2.8 §4.3)', () => {
  it('defaults to on for staff roles and off for end users', () => {
    expect(resolveKeyboardShortcuts(null, ['AGENT'])).toBe(true);
    expect(resolveKeyboardShortcuts(null, ['USER', 'ADMIN'])).toBe(true);
    expect(resolveKeyboardShortcuts(null, ['SUPER_ADMIN'])).toBe(true);
    expect(resolveKeyboardShortcuts(null, ['USER'])).toBe(false);
    expect(resolveKeyboardShortcuts(null, [])).toBe(false);
  });

  it('lets the explicit choice win in both directions', () => {
    expect(resolveKeyboardShortcuts(false, ['AGENT'])).toBe(false);
    expect(resolveKeyboardShortcuts(true, ['USER'])).toBe(true);
  });
});

describe('toUserPreferencesResponse', () => {
  it('maps the stored row and the role default', () => {
    expect(
      toUserPreferencesResponse({
        preferredLocale: 'bs',
        keyboardShortcuts: null,
        userRoles: [{ role: { key: 'USER' } }],
      }),
    ).toEqual({
      preferredLocale: 'bs',
      keyboardShortcuts: null,
      keyboardShortcutsEffective: false,
      keyboardShortcutsDefault: false,
    });
    expect(toUserPreferencesResponse(null).keyboardShortcutsEffective).toBe(false);
  });
});
