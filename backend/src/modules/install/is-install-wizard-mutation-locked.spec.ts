import { installSetupAllowlist } from './install-setup.constants';
import { isInstallWizardMutationLocked } from './is-install-wizard-mutation-locked';

describe('isInstallWizardMutationLocked', () => {
  it('allows wizard mutations while setup is incomplete', () => {
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/addons',
        isCompleted: false,
      }),
    ).toBe(false);
  });

  it('rejects wizard mutations after completion and allows complete retries', () => {
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/super-admin',
        isCompleted: true,
      }),
    ).toBe(true);
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/login-provider',
        isCompleted: true,
      }),
    ).toBe(true);
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/smtp',
        isCompleted: true,
      }),
    ).toBe(true);
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/seed',
        isCompleted: true,
      }),
    ).toBe(true);
    expect(
      isInstallWizardMutationLocked({
        method: 'POST',
        path: '/install/addons',
        isCompleted: true,
      }),
    ).toBe(true);
    expect(
      isInstallWizardMutationLocked({
        method: installSetupAllowlist.completeMethod,
        path: installSetupAllowlist.completePath,
        isCompleted: true,
      }),
    ).toBe(false);
    expect(
      isInstallWizardMutationLocked({
        method: 'GET',
        path: '/install/status',
        isCompleted: true,
      }),
    ).toBe(false);
  });
});

describe('install reads after completion (review 2026-09-25)', () => {
  const locked = (path: string, method = 'GET') =>
    isInstallWizardMutationLocked({ method, path, isCompleted: true });
  it('hides super admin, SMTP, login provider and seed details', () => {
    expect(locked('/install/super-admin')).toBe(true);
    expect(locked('/install/smtp')).toBe(true);
    expect(locked('/install/login-provider')).toBe(true);
    expect(locked('/install/seed')).toBe(true);
  });
  it('keeps status and the add-on catalog readable', () => {
    expect(locked('/install/status')).toBe(false);
    expect(locked('/install/addons')).toBe(false);
  });
  it('leaves everything open before completion', () => {
    expect(
      isInstallWizardMutationLocked({ method: 'GET', path: '/install/smtp', isCompleted: false }),
    ).toBe(false);
  });
});
