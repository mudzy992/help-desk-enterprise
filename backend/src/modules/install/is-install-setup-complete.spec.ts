import { isInstallSetupComplete } from './is-install-setup-complete';

describe('isInstallSetupComplete', () => {
  it('treats missing, empty, and invalid values as incomplete', () => {
    expect(isInstallSetupComplete(undefined)).toBe(false);
    expect(isInstallSetupComplete('')).toBe(false);
    expect(isInstallSetupComplete('   ')).toBe(false);
    expect(isInstallSetupComplete('not-a-date')).toBe(false);
    expect(isInstallSetupComplete('2026-09-11')).toBe(false);
  });

  it('accepts a valid ISO datetime as completed', () => {
    expect(isInstallSetupComplete('2026-09-11T08:00:00.000Z')).toBe(true);
    expect(isInstallSetupComplete('2026-09-11T10:00:00+02:00')).toBe(true);
  });
});
