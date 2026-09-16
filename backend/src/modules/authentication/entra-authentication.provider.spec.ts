import { AuthenticationError } from './authentication.error';
import { authenticationConstants } from './authentication.constants';
import type { AuthenticationUserRecord } from './authentication.types';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { hashLocalPassword } from './hash-local-password';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const entraObjectId = '33333333-3333-3333-3333-333333333333';
const idToken = 'signed.entra.id-token';

function createUser(
  overrides: Partial<AuthenticationUserRecord> = {},
): AuthenticationUserRecord {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    displayName: 'Super Admin',
    isActive: true,
    isLocalOnly: true,
    mustChangePassword: false,
    localPasswordHash: null,
    entraObjectId: null,
    roleKeys: [authenticationConstants.superAdminRoleKey],
    ...overrides,
  };
}

describe('EntraAuthenticationProvider', () => {
  const findByEmail = jest.fn();
  const findByEntraObjectId = jest.fn();
  const loadConfiguration = jest.fn();
  const verifyIdToken = jest.fn();
  const provider = new EntraAuthenticationProvider(
    { findByEmail, findByEntraObjectId } as never,
    { load: loadConfiguration } as never,
    { verify: verifyIdToken } as never,
  );

  beforeEach(() => {
    findByEmail.mockReset();
    findByEntraObjectId.mockReset();
    loadConfiguration.mockReset();
    verifyIdToken.mockReset();
    findByEntraObjectId.mockResolvedValue(null);
    loadConfiguration.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      issuer:
        'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0',
      jwksUrl:
        'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/discovery/v2.0/keys',
    });
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
    expect(loadConfiguration).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('does not authenticate directory users with a local password', async () => {
    const password = 'correct-horse-battery';
    const localPasswordHash = await hashLocalPassword(password, 4);
    findByEmail.mockResolvedValue(
      createUser({
        isLocalOnly: false,
        localPasswordHash,
        roleKeys: ['AGENT'],
        entraObjectId,
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

  it('returns the same normalized principal for a valid Entra identity', async () => {
    findByEntraObjectId.mockResolvedValue(
      createUser({
        email: 'agent@example.com',
        displayName: 'Directory Agent',
        isLocalOnly: false,
        entraObjectId,
        roleKeys: ['AGENT'],
      }),
    );
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'token-email@example.com',
      displayName: 'Token Display Name',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    const principal = await provider.authenticate({
      kind: 'entra_id_token',
      idToken,
    });
    expect(principal).toEqual({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      isLocalOnly: false,
    });
    expect(principal).not.toHaveProperty('provider');
    expect(JSON.stringify(principal)).not.toContain(idToken);
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('never binds an Entra identity to SuperAdmin or local-only users', async () => {
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'admin@example.com',
      displayName: 'Directory Admin',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    findByEntraObjectId.mockResolvedValue(createUser({ entraObjectId }));
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    findByEntraObjectId.mockResolvedValue(
      createUser({
        isLocalOnly: true,
        entraObjectId,
        roleKeys: ['AGENT'],
      }),
    );
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('fails closed when the Entra user is missing or inactive', async () => {
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'agent@example.com',
      displayName: 'Agent',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    findByEntraObjectId.mockResolvedValue(
      createUser({
        isActive: false,
        isLocalOnly: false,
        entraObjectId,
        roleKeys: ['AGENT'],
      }),
    );
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('fails closed when Entra configuration is unavailable', async () => {
    loadConfiguration.mockRejectedValue(
      new AuthenticationError('AUTHENTICATION_UNAVAILABLE'),
    );
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_UNAVAILABLE' });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('does not authenticate from unverified identity fields', async () => {
    await expect(
      provider.authenticate({ kind: 'entra_id_token', idToken: '   ' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(loadConfiguration).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
