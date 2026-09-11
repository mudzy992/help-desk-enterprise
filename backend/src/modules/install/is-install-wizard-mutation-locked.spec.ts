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
