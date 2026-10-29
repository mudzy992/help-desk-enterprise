import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import { defaultSecurityRateLimitConfig as d } from '../authentication/security/security-rate-limit-config';
import { rateLimitsStepUpPurpose, SecurityRateLimitsService } from './security-rate-limits.service';
import { StepUpPolicyService } from './step-up-policy.service';

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
  const stepUpPolicy = new StepUpPolicyService(
    mfaService as never,
    identityPasskeyService as never,
    userLoader as never,
  );
  const instance = new SecurityRateLimitsService(
    settingsService as never,
    configLoader as never,
    stepUpPolicy,
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

/*
  Paket 5.4.0-f: what the unit next to the endpoint still has to prove for the
  E2E spec 47 to be meaningful — the cross-field rules are refused before any
  write (a value can be inside each bound and still be a broken combination),
  and the write that does go through leaves both trails the runbook promises: the
  settings batch with the admin's reason and one auth audit entry with counts
  only.
*/
describe('SecurityRateLimitsService cross-field rules and audit (5.4.0-f)', () => {
  function instrumented(auditRows: Record<string, unknown>[]) {
    const settingsService = { setSettingValues: jest.fn(async () => ({})) };
    const configLoader = { load: jest.fn(async () => d) };
    const mfaService = { isEnabled: jest.fn(async () => true), verify: jest.fn(async () => 'totp') };
    const identityPasskeyService = { consumeFreshConfirmation: jest.fn(async () => false) };
    const userLoader = { findById: jest.fn(async () => ({ id: 'admin-1', email: 'admin@desk.ba', roleKeys: ['SUPER_ADMIN'], isActive: true, isLocalOnly: true })) };
    const auditClient = {
      $executeRaw: jest.fn(async () => 1),
      auditLog: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          auditRows.push(data);
          return data;
        }),
      },
    };
    const prisma = {
      $transaction: async (run: (client: unknown) => Promise<unknown>) => run(auditClient),
    };
    const stepUpPolicy = new StepUpPolicyService(
      mfaService as never,
      identityPasskeyService as never,
      userLoader as never,
    );
    const instance = new SecurityRateLimitsService(
      settingsService as never,
      configLoader as never,
      stepUpPolicy,
      prisma as never,
    );
    return { instance, settingsService };
  }

  it('refuses a combination that is inside every bound but contradicts itself', async () => {
    const { instance, settingsService } = instrumented([]);

    // The IP bucket would always open before the account delay starts: accepted
    // by the per-field bounds, refused by the cross-field rule.
    await expect(
      instance.update(caller, {
        config: { ...d, accountDelayStartsAfterFailures: 20, ipMaxFailures: 10 },
        reason: 'kombinacija koja nema smisla',
        code: '123456',
      }),
    ).rejects.toMatchObject({ response: { code: 'RATE_LIMITS_INVALID' } });
    expect(settingsService.setSettingValues).not.toHaveBeenCalled();

    // A floor above the ceiling.
    await expect(
      instance.update(caller, {
        config: { ...d, accountDelayBaseMilliseconds: 4_000, accountDelayMaxMilliseconds: 1_000 },
        reason: 'obrnute granice odgode',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(settingsService.setSettingValues).not.toHaveBeenCalled();
  });

  it('journals the retune as one batch with the reason and one privacy-clean audit entry', async () => {
    const auditRows: Record<string, unknown>[] = [];
    const { instance, settingsService } = instrumented(auditRows);

    const result = await instance.update(caller, {
      config: { ...d, ipMaxFailures: 55, ipWindowSeconds: 120 },
      reason: 'kalibracija: veliki NAT proxy u sjedištu',
      code: '123456',
    });

    // The answer is what the loader reads back — the endpoint never echoes the
    // request body, so the client always sees the effective, stored policy.
    expect(result.config.ipMaxFailures).toBe(d.ipMaxFailures);
    const [batch, mutation] = settingsService.setSettingValues.mock.calls[0] as unknown as [
      Array<{ key: string; value: unknown }>,
      { reason: string; actorUserId: string },
    ];
    expect(batch).toHaveLength(8);
    expect(batch).toContainEqual({ key: expect.stringContaining('ipMaxFailures'), value: 55 });
    expect(mutation).toEqual({ reason: 'kalibracija: veliki NAT proxy u sjedištu', actorUserId: 'admin-1' });

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: 'auth.rate_limits_changed',
      entityType: 'user',
      entityId: 'admin-1',
      actorUserId: 'admin-1',
      metadata: { ipMaxFailures: 55, ipWindowSeconds: 120 },
    });
    // Counts only: nothing about a person, a code or an address travels with it.
    expect(JSON.stringify(auditRows[0])).not.toMatch(/admin@desk\.ba|123456|@/);
  });
});
