import { EntraIdentityBinder } from '../authentication/entra-identity-binder';
import { authenticationConstants } from '../authentication/authentication.constants';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { EntraAuthenticationProvider } from '../authentication/entra-authentication.provider';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { LocalAuthenticationProvider } from '../authentication/local-authentication.provider';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const password = 'correct-horse-battery';
const entraObjectId = '33333333-3333-3333-3333-333333333333';
const idToken = 'signed.entra.id-token';

describe('Install SuperAdmin authentication', () => {
  const memory = createInMemoryInstallSuperAdminPrisma();
  const prisma = memory.prisma as unknown as PrismaService;
  const loader = new AuthenticationUserLoader(prisma);
  const localProvider = new LocalAuthenticationProvider(loader);
  const loadConfiguration = jest.fn();
  const verifyIdToken = jest.fn();
  const entraProvider = new EntraAuthenticationProvider(
    loader,
    { load: loadConfiguration } as never,
    { verify: verifyIdToken } as never,
    new EntraIdentityBinder(
      prisma,
      { getSetting: async () => false } as never,
      loader,
    ),
  );

  beforeAll(async () => {
    memory.seedUser({
      id: 'directory-agent',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      isActive: true,
      isLocalOnly: false,
      localPasswordHash: await hashLocalPassword(password, 4),
      entraObjectId,
    });
    await createInstallSuperAdmin(
      prisma,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password,
      },
      (value) => hashLocalPassword(value, 4),
    );
  });

  beforeEach(() => {
    loadConfiguration.mockReset();
    verifyIdToken.mockReset();
    loadConfiguration.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      issuer:
        'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0',
      jwksUrl:
        'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/discovery/v2.0/keys',
    });
  });

  it('keeps local break-glass login for the install SuperAdmin when entra_ad is selected', async () => {
    const principal = await entraProvider.authenticate({
      kind: 'password',
      email: 'admin@example.com',
      password,
    });
    expect(principal).toEqual({
      subjectId: expect.any(String),
      email: 'admin@example.com',
      displayName: 'Super Admin',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
    expect(JSON.stringify(principal)).not.toContain(password);
    expect(loadConfiguration).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('does not change normal entra_ad password rejection for directory users', async () => {
    await expect(
      entraProvider.authenticate({
        kind: 'password',
        email: 'agent@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('keeps local-provider password authentication unchanged', async () => {
    const principal = await localProvider.authenticate({
      kind: 'password',
      email: 'admin@example.com',
      password,
    });
    expect(principal).toMatchObject({
      email: 'admin@example.com',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
  });

  it('keeps entra_ad token authentication for directory users unchanged', async () => {
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'token-email@example.com',
      displayName: 'Token Display Name',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    const principal = await entraProvider.authenticate({
      kind: 'entra_id_token',
      idToken,
    });
    expect(principal).toEqual({
      subjectId: 'directory-agent',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      isLocalOnly: false,
    });
    expect(JSON.stringify(principal)).not.toContain(idToken);
  });

  it('does not bind the install SuperAdmin to an Entra identity', async () => {
    const superAdmin = await loader.findByEmail('admin@example.com');
    expect(superAdmin).toMatchObject({
      email: 'admin@example.com',
      isLocalOnly: true,
      entraObjectId: null,
      roleKeys: [authenticationConstants.superAdminRoleKey],
    });
    expect(superAdmin?.localPasswordHash).toEqual(
      expect.stringMatching(/^\$2[aby]\$/),
    );
    expect(superAdmin?.localPasswordHash).not.toContain(password);
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'admin@example.com',
      displayName: 'Directory Admin',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    await expect(
      entraProvider.authenticate({ kind: 'entra_id_token', idToken }),
    ).resolves.toMatchObject({
      email: 'agent@example.com',
      isLocalOnly: false,
    });
  });
});
