import type { AuthenticationUserRecord } from './authentication.types';
import { EntraIdentityBinder } from './entra-identity-binder';
import type { NormalizedEntraIdentity } from './entra-id-token.verifier';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

function user(overrides: Partial<AuthenticationUserRecord> = {}): AuthenticationUserRecord {
  return {
    id: 'user-1',
    email: 'agent@example.com',
    displayName: 'Directory Agent',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    localPasswordHash: null,
    entraObjectId: null,
    directoryObjectGuid: null,
    roleKeys: ['AGENT'],
    ...overrides,
  };
}

const identity: NormalizedEntraIdentity = {
  externalSubject: '33333333-3333-3333-3333-333333333333',
  email: 'agent@example.com',
  displayName: 'Directory Agent',
  tenantId: '11111111-1111-1111-1111-111111111111',
};

describe('EntraIdentityBinder', () => {
  it('bumps the durable authz fence and notifies after binding before reloading', async () => {
    const events: string[] = [];
    const updatedUser = user({ entraObjectId: identity.externalSubject });
    const updateMany = jest.fn(async () => {
      events.push('bind');
      return { count: 1 };
    });
    const findUnique = jest.fn(async () => ({ authzVersion: 8 }));
    const findByEntraObjectId = jest.fn().mockResolvedValue(null);
    const findByEmail = jest.fn().mockResolvedValue(user());
    const findById = jest.fn(async () => {
      events.push('reload');
      return updatedUser;
    });
    const notifyUserChanged = jest.fn(async () => {
      events.push('invalidate');
    });
    const binder = new EntraIdentityBinder(
      { user: { updateMany, findUnique } } as never,
      { getSetting: jest.fn() } as never,
      { findByEntraObjectId, findByEmail, findById } as never,
      { notifyUserChanged } as never,
    );

    await expect(binder.resolve(identity)).resolves.toEqual(updatedUser);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', entraObjectId: null, isLocalOnly: false },
      data: {
        entraObjectId: identity.externalSubject,
        authzVersion: { increment: 1 },
      },
    });
    expect(notifyUserChanged).toHaveBeenCalledWith('user-1', 8);
    expect(events).toEqual(['bind', 'invalidate', 'reload']);
  });

  it('keeps a committed bind successful if cache notification fails', async () => {
    const updatedUser = user({ entraObjectId: identity.externalSubject });
    const notifyUserChanged = jest.fn().mockRejectedValue(new Error('redis unavailable'));
    const binder = new EntraIdentityBinder(
      {
        user: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({ authzVersion: 8 }),
        },
      } as never,
      { getSetting: jest.fn() } as never,
      {
        findByEntraObjectId: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue(user()),
        findById: jest.fn().mockResolvedValue(updatedUser),
      } as never,
      { notifyUserChanged } as never,
    );

    await expect(binder.resolve(identity)).resolves.toEqual(updatedUser);
    expect(notifyUserChanged).toHaveBeenCalledWith('user-1', 8);
  });
});
