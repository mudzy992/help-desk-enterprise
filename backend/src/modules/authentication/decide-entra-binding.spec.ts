import type { AuthenticationUserRecord } from './authentication.types';
import { decideEntraBinding } from './decide-entra-binding';

function user(overrides: Partial<AuthenticationUserRecord> = {}): AuthenticationUserRecord {
  return {
    id: 'u1',
    email: 'ana@epbih.ba',
    displayName: 'Ana',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    localPasswordHash: null,
    entraObjectId: null,
    roleKeys: ['USER'],
    ...overrides,
  };
}

describe('decideEntraBinding (paket 1.8 A2)', () => {
  it('logs in an already linked user by oid, even if the e-mail changed', () => {
    const linked = user({ entraObjectId: 'oid-1', email: 'old@epbih.ba' });
    expect(decideEntraBinding({ byObjectId: linked, byEmail: null, jitProvisioning: false }))
      .toEqual({ kind: 'login', user: linked });
  });

  it('rejects a linked but deactivated user', () => {
    expect(
      decideEntraBinding({
        byObjectId: user({ entraObjectId: 'oid-1', isActive: false }),
        byEmail: null,
        jitProvisioning: true,
      }),
    ).toMatchObject({ kind: 'reject', reason: 'ACCOUNT_DISABLED' });
  });

  it('binds a synced directory user on the first login', () => {
    const synced = user();
    expect(decideEntraBinding({ byObjectId: null, byEmail: synced, jitProvisioning: false }))
      .toEqual({ kind: 'bind', user: synced });
  });

  it('never binds local accounts (SuperAdmin break-glass)', () => {
    expect(
      decideEntraBinding({
        byObjectId: null,
        byEmail: user({ isLocalOnly: true, roleKeys: ['SUPER_ADMIN'] }),
        jitProvisioning: true,
      }),
    ).toMatchObject({ kind: 'reject', reason: 'LOCAL_ACCOUNT' });
  });

  it('refuses to take over an account bound to another oid', () => {
    expect(
      decideEntraBinding({
        byObjectId: null,
        byEmail: user({ entraObjectId: 'oid-other' }),
        jitProvisioning: true,
      }),
    ).toMatchObject({ kind: 'reject', reason: 'BOUND_TO_OTHER_IDENTITY' });
  });

  it('rejects a deactivated account instead of binding it', () => {
    expect(
      decideEntraBinding({ byObjectId: null, byEmail: user({ isActive: false }), jitProvisioning: true }),
    ).toMatchObject({ kind: 'reject', reason: 'ACCOUNT_DISABLED' });
  });

  it('provisions unknown identities only when JIT is on', () => {
    expect(decideEntraBinding({ byObjectId: null, byEmail: null, jitProvisioning: true }))
      .toEqual({ kind: 'provision' });
    expect(decideEntraBinding({ byObjectId: null, byEmail: null, jitProvisioning: false }))
      .toMatchObject({ kind: 'reject', reason: 'NOT_REGISTERED' });
  });
});
