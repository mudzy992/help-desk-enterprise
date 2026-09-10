import { authenticationConstants } from './authentication.constants';
import type { AuthenticationUserRecord } from './authentication.types';
import { hashLocalPassword } from './hash-local-password';
import { LocalAuthenticationProvider } from './local-authentication.provider';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createUser(
  overrides: Partial<AuthenticationUserRecord> = {},
): AuthenticationUserRecord {
  return {
    id: 'user-1',
    email: 'agent@example.com',
    displayName: 'Agent',
    isActive: true,
    isLocalOnly: false,
    localPasswordHash: null,
    entraObjectId: null,
    roleKeys: [],
    ...overrides,
  };
}

describe('LocalAuthenticationProvider', () => {
  const findByEmail = jest.fn();
  const provider = new LocalAuthenticationProvider({
    findByEmail,
    findByEntraObjectId: jest.fn(),
  } as never);

  beforeEach(() => {
    findByEmail.mockReset();
  });

  it('returns a normalized principal for valid local credentials', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(
      createUser({
        localPasswordHash,
        email: 'agent@example.com',
      }),
    );
    const principal = await provider.authenticate({
      kind: 'password',
      email: 'Agent@Example.com',
      password,
    });
    expect(principal).toEqual({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isLocalOnly: false,
    });
    expect(JSON.stringify(principal)).not.toContain(password);
    expect(JSON.stringify(principal)).not.toContain(localPasswordHash);
  });

  it('rejects invalid local credentials with the same failure', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(createUser({ localPasswordHash }));
    await expect(
      provider.authenticate({
        kind: 'password',
        email: 'agent@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    findByEmail.mockResolvedValue(null);
    await expect(
      provider.authenticate({
        kind: 'password',
        email: 'missing@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects SuperAdmin identities that are not local-only', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(
      createUser({
        localPasswordHash,
        isLocalOnly: false,
        roleKeys: [authenticationConstants.superAdminRoleKey],
      }),
    );
    await expect(
      provider.authenticate({
        kind: 'password',
        email: 'admin@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects external-identity credentials in the local provider', async () => {
    await expect(
      provider.authenticate({
        kind: 'external_identity',
        externalSubject: 'entra-object-1',
        email: 'agent@example.com',
        displayName: 'Agent',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(findByEmail).not.toHaveBeenCalled();
  });
});
