import { ServiceUnavailableException } from '@nestjs/common';
import { enforceInstallSetupGate } from './enforce-install-setup-gate';
import { installSetupErrorCodes } from './install-setup.constants';

describe('enforceInstallSetupGate', () => {
  const loadCompletedAt = jest.fn();

  beforeEach(() => {
    loadCompletedAt.mockReset();
  });

  it('allows /install while setup is incomplete', async () => {
    loadCompletedAt.mockResolvedValue('');
    await expect(
      enforceInstallSetupGate({
        method: 'GET',
        path: '/install',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
    await expect(
      enforceInstallSetupGate({
        method: 'GET',
        path: '/health',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
    expect(loadCompletedAt).not.toHaveBeenCalled();
  });

  it('returns 503 SETUP_REQUIRED for a protected API while setup is incomplete', async () => {
    loadCompletedAt.mockResolvedValue('');
    await expect(
      enforceInstallSetupGate({
        method: 'POST',
        path: '/auth/login',
        loadCompletedAt,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      enforceInstallSetupGate({
        method: 'PUT',
        path: '/settings',
        loadCompletedAt,
      }),
    ).rejects.toMatchObject({
      response: { code: installSetupErrorCodes.setupRequired },
    });
  });

  it('disables the gate after private.install.completedAt has a valid ISO value', async () => {
    loadCompletedAt.mockResolvedValue('2026-09-11T08:00:00.000Z');
    await expect(
      enforceInstallSetupGate({
        method: 'POST',
        path: '/auth/login',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
    await expect(
      enforceInstallSetupGate({
        method: 'PUT',
        path: '/settings',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
  });

  it('does not block /install routes with its own gate', async () => {
    loadCompletedAt.mockResolvedValue('');
    await expect(
      enforceInstallSetupGate({
        method: 'GET',
        path: '/install/status',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
    await expect(
      enforceInstallSetupGate({
        method: 'POST',
        path: '/install/super-admin',
        loadCompletedAt,
      }),
    ).resolves.toBeUndefined();
    expect(loadCompletedAt).not.toHaveBeenCalled();
  });
});
