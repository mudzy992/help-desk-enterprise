import { UnauthorizedException } from '@nestjs/common';
import { StepUpPolicyService } from './step-up-policy.service';

const subject = { id: 'super-1', isActive: true, isLocalOnly: true, roleKeys: ['SUPER_ADMIN'] };

function world(input: { marker?: boolean; markerError?: boolean; enabled?: boolean; user?: Record<string, unknown> | null } = {}) {
  const consumeFreshConfirmation = jest.fn(async () => {
    if (input.markerError) throw new Error('redis down');
    return input.marker ?? false;
  });
  const verify = jest.fn(async () => 'totp' as const);
  const service = new StepUpPolicyService(
    { isEnabled: jest.fn(async () => input.enabled ?? true), verify } as never,
    { consumeFreshConfirmation } as never,
    { findById: jest.fn(async () => input.user === undefined ? subject : input.user) } as never,
  );
  return { service, consumeFreshConfirmation, verify };
}
const request = { caller: { subjectId: 'super-1', sessionId: 'sid-1' }, purpose: 'rate-limits-change', code: '123456', requireLocalSuperAdmin: true } as const;

describe('fail-closed step-up policy', () => {
  it('consumes a purpose-scoped passkey proof once', async () => {
    const state = { available: true };
    const consumeFreshConfirmation = jest.fn(async () => {
      if (!state.available) return false;
      state.available = false;
      return true;
    });
    const service = new StepUpPolicyService(
      { isEnabled: jest.fn(async () => false) } as never,
      { consumeFreshConfirmation } as never,
      { findById: jest.fn(async () => subject) } as never,
    );
    await expect(service.assertConfirmed(request)).resolves.toBe('passkey');
    await expect(service.assertConfirmed(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats an expired marker as absent and requires an enrolled factor', async () => {
    const { service } = world({ marker: false, enabled: false });
    await expect(service.assertConfirmed(request)).rejects.toMatchObject({ response: { code: 'IDENTITY_CONFIRMATION_REQUIRED' } });
  });

  it('rejects non-local and non-SuperAdmin emergency callers', async () => {
    const nonLocal = world({ marker: true, user: { ...subject, isLocalOnly: false } });
    const ordinary = world({ marker: true, user: { ...subject, roleKeys: ['ADMIN'] } });
    await expect(nonLocal.service.assertConfirmed(request)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(ordinary.service.assertConfirmed(request)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(nonLocal.consumeFreshConfirmation).not.toHaveBeenCalled();
  });

  it('fails closed on an ambiguous marker-store dependency error', async () => {
    const { service, verify } = world({ markerError: true });
    await expect(service.assertConfirmed(request)).rejects.toMatchObject({ response: { code: 'IDENTITY_CONFIRMATION_FAILED' } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects caller-controlled malformed purposes', async () => {
    const { service } = world({ marker: true });
    await expect(service.assertConfirmed({ ...request, purpose: '../admin' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
