import { authenticationConstants } from './authentication.constants';
import type { AuthenticationUserRecord } from './authentication.types';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { hashLocalPassword } from './hash-local-password';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createUser(
  overrides: Partial<AuthenticationUserRecord> = {},
): AuthenticationUserRecord {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    displayName: 'Super Admin',
    isActive: true,
    isLocalOnly: true,
    localPasswordHash: null,
    entraObjectId: null,
    roleKeys: [authenticationConstants.superAdminRoleKey],
    ...overrides,
  };
}

describe('EntraAuthenticationProvider', () => {
  const findByEmail = jest.fn();
  const findByEntraObjectId = jest.fn();
  const provider = new EntraAuthenticationProvider({
    findByEmail,
    findByEntraObjectId,
  } as never);

  beforeEach(() => {
    findByEmail.mockReset();
    findByEntraObjectId.mockReset();
    findByEntraObjectId.mockResolvedValue(null);
  });

  it('authenticates local-only SuperAdmin with a password while entra mode is selected', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(createUser({ localPasswordHash }));
    const principal = await provider.authenticate({
      kind: 'password',
      email: 'admin@example.com',
      password,
    });
    expect(principal).toEqual({
      subjectId: 'user-1',
      email: 'admin@example.com',
      displayName: 'Super Admin',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
  });

  it('does not authenticate directory users with a local password', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(
      createUser({
        isLocalOnly: false,
        localPasswordHash,
        roleKeys: ['AGENT'],
        entraObjectId: 'entra-object-1',
      }),
    );
    await expect(
      provider.authenticate({
        kind: 'password',
        email: 'agent@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('fails closed for external identity and never binds it to SuperAdmin', async () => {
    findByEntraObjectId.mockResolvedValue(null);
    findByEmail.mockResolvedValue(createUser());
    await expect(
      provider.authenticate({
        kind: 'external_identity',
        externalSubject: 'entra-object-superadmin',
        email: 'admin@example.com',
        displayName: 'Directory Admin',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    findByEntraObjectId.mockResolvedValue(
      createUser({ entraObjectId: 'entra-object-superadmin' }),
    );
    await expect(
      provider.authenticate({
        kind: 'external_identity',
        externalSubject: 'entra-object-superadmin',
        email: 'admin@example.com',
        displayName: 'Directory Admin',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('does not call external Microsoft services', async () => {
    findByEmail.mockResolvedValue(null);
    await expect(
      provider.authenticate({
        kind: 'external_identity',
        externalSubject: 'entra-object-1',
        email: 'user@example.com',
        displayName: 'User',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
