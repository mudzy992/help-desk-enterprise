import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import { defaultSecurityRateLimitConfig as d } from '../authentication/security/security-rate-limit-config';
import { rateLimitsStepUpPurpose, SecurityRateLimitsService } from './security-rate-limits.service';

/*
  Paket 5.4.0-b (M2): the retune flow. Pinned here: bounds are enforced before
  anything is written, identity confirmation is either a fresh passkey step-up
  marker (purpose-scoped) or a current TOTP code, and the write is one batch
  with the admin's reason.
*/

function service(overrides: {
  enabled?: boolean;
  markerConsumed?: boolean;
  verifyError?: Error;
} = {}) {
  const settingsService = { setSettingValues: jest.fn(async () => ({})) };
  const configLoader = { load: jest.fn(async () => d) };
  const mfaService = {
    isEnabled: jest.fn(async () => overrides.enabled ?? true),
    verify: jest.fn(async () => {
      if (overrides.verifyError) throw overrides.verifyError;
      return 'totp';
    }),
  };
  const identityPasskeyService = {
    consumeFreshConfirmation: jest.fn(async () => overrides.markerConsumed ?? false),
  };
  const userLoader = {
    findById: jest.fn(async () => ({
      id: 'admin-1',
      email: 'admin@desk.ba',
      localPasswordHash: 'x',
      entraObjectId: null,
      roleKeys: ['SUPER_ADMIN'],
      isActive: true,
      mustChangePassword: false,
      displayName: 'Admin',
      isLocalOnly: true,
    })),
  };
  const instance = new SecurityRateLimitsService(
    settingsService as never,
    configLoader as never,
    mfaService as never,
    identityPasskeyService as never,
    userLoader as never,
    {} as never, // audit write is best-effort; the stub makes it throw and be swallowed
  );
  return { instance, settingsService, mfaService, identityPasskeyService };
}

const caller = { subjectId: 'admin-1', sessionId: 'session-1' };

describe('SecurityRateLimitsService', () => {
  it('returns the effective config with the bounds', async () => {
    const { instance } = service();
    const { config, bounds } = await instance.current();
    expect(config).toEqual(d);
    expect(bounds.ipMaxFailures).toEqual({ min: 10, max: 500 });
  });

  it('accepts a fresh passkey step-up marker instead of a code', async () => {
    const { instance, mfaService, settingsService, identityPasskeyService } = service({ markerConsumed: true });
    const { config } = await instance.update(caller, { config: { ...d }, reason: 'kalibracija nakon provjere' });
    expect(identityPasskeyService.consumeFreshConfirmation).toHaveBeenCalledWith(caller.sessionId, rateLimitsStepUpPurpose);
    expect(mfaService.verify).not.toHaveBeenCalled();
    expect(settingsService.setSettingValues).toHaveBeenCalledTimes(1);
    const calls = settingsService.setSettingValues.mock.calls as unknown as Array<
      [Array<{ key: string; value: number }>, { reason: string; actorUserId: string }]
    >;
    const [entries, mutation] = calls[0];
    expect(entries).toHaveLength(8);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(8);
    expect(mutation).toEqual({ reason: 'kalibracija nakon provjere', actorUserId: 'admin-1' });
    expect(config).toEqual(d);
  });

  it('requires a current TOTP code when there is no marker', async () => {
    const { instance, mfaService, settingsService } = service({});
    await instance.update(caller, { config: { ...d }, reason: 'kalibracija nakon provjere', code: '123456' });
    expect(mfaService.verify).toHaveBeenCalledWith(expect.objectContaining({ id: 'admin-1' }), '123456');
    expect(settingsService.setSettingValues).toHaveBeenCalledTimes(1);
  });

  it('refuses to write without identity confirmation', async () => {
    const { instance, settingsService } = service({ verifyError: new AccountSecurityError('MFA_INVALID_CODE') });
    await expect(
      instance.update(caller, { config: { ...d }, reason: 'kalibracija nakon provjere', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(settingsService.setSettingValues).not.toHaveBeenCalled();
  });

  it('rejects an out-of-bounds config before any write', async () => {
    const { instance, settingsService } = service({ markerConsumed: true });
    await expect(
      instance.update(caller, { config: { ...d, ipMaxFailures: 501 }, reason: 'probaj 501' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(settingsService.setSettingValues).not.toHaveBeenCalled();
  });
});
