jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AccountSecurityError } from './account-security.error';
import {
  PasskeyCredentialService,
  passkeyLoginChallengeKey,
  toBase64Url,
} from './passkey-credential.service';
import { PasskeyChallengeStoreProvider } from './passkey-challenge.store';

/*
  Paket 5.4.0-a (M1): the credential service is the security boundary of the
  passkey factor — these tests pin the decisions that must never regress:
  single-use challenges, the cloned-authenticator cutoff and the last-factor
  guard on removal.
*/

const rp = { rpID: 'helpdesk.example', expectedOrigins: ['https://helpdesk.example'], rpName: 'Service Desk' };

const localUser = {
  id: 'u-1',
  email: 'a@b.ba',
  localPasswordHash: 'x',
  entraObjectId: null,
  roleKeys: ['AGENT'],
};

function service(overrides: Record<string, unknown> = {}) {
  const store = new PasskeyChallengeStoreProvider(undefined);
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ localPasswordHash: 'x', entraObjectId: null })) },
    userPasskeyCredential: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({
        id: 'row-1',
        deviceName: null,
        aaguid: null,
        createdAt: new Date('2026-10-09T00:00:00Z'),
        lastUsedAt: new Date('2026-10-09T00:00:00Z'),
        isBackedUp: false,
      })),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 1),
      ...(overrides.prisma ?? {}),
    },
  };
  const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
  const instance = new PasskeyCredentialService(
    prisma as never,
    store,
    notifier as never,
  );
  return { instance, prisma, notifier, store };
}

/** Minimal policy: mfaIsRequired only reads the admin switch. */
const policy = { mfaRequiredForAdmins: true } as never;

describe('PasskeyCredentialService', () => {
  it('starts a registration and stores the challenge under the user key', async () => {
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'challenge-1' });
    const { instance, store } = service();
    const { options } = await instance.startRegistration({ id: 'u-1', email: 'a@b.ba' }, rp);
    expect(options.challenge).toBe('challenge-1');
    await expect(store.store.peek('webauthn:reg:u-1')).resolves.toBe('challenge-1');
  });

  it('confirms a registration: verifies, stores COSE key and audits', async () => {
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        aaguid: 'ad872465-8e5e-4ffa-8a25-4c22ee53ca8d',
      },
    });
    const { instance, prisma, notifier, store } = service();
    void store;
    await instance.startRegistration({ id: 'u-1', email: 'a@b.ba' }, rp);
    const passkey = await instance.confirmRegistration(localUser, { id: 'cred-1' } as never, rp, '1.2.3.4');
    expect(passkey.id).toBe('row-1');
    expect(prisma.userPasskeyCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          credentialId: 'cred-1',
          publicKey: toBase64Url(new Uint8Array([1, 2, 3])),
          isBackedUp: true,
          isBackupEligible: true,
          aaguid: 'ad872465-8e5e-4ffa-8a25-4c22ee53ca8d',
        }),
      }),
    );
    expect(notifier.audit).toHaveBeenCalledWith('auth.mfa_passkey_enrolled', 'u-1', 'u-1', expect.anything());
  });

  it('refuses a confirmation when the challenge expired (single-use)', async () => {
    const { instance } = service();
    await expect(instance.confirmRegistration(localUser, { id: 'cred-1' } as never, rp, null)).rejects.toThrow(
      new AccountSecurityError('MFA_ENROLLMENT_EXPIRED'),
    );
  });

  it('cuts the factor off when the authenticator counter goes backwards', async () => {
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4 },
    });
    const { instance, prisma } = service({
      prisma: {
        userPasskeyCredential: {
          findMany: jest.fn(async () => [{ credentialId: 'cred-1', transports: null }]),
          findFirst: jest.fn(async () => ({
            id: 'row-1',
            credentialId: 'cred-1',
            publicKey: toBase64Url(new Uint8Array([1])),
            counter: BigInt(5),
            transports: null,
          })),
          deleteMany: jest.fn(async () => ({ count: 1 })),
        },
      },
    });
    await instance.startAuthentication('u-1', passkeyLoginChallengeKey('jti-1'), rp);
    await expect(
      instance.verifyAssertion('u-1', passkeyLoginChallengeKey('jti-1'), { id: 'cred-1' } as never, rp, false, null),
    ).rejects.toThrow(new AccountSecurityError('PASSKEY_CLONED'));
    expect(prisma.userPasskeyCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
  });

  it('refuses to remove the last factor of an account that requires MFA', async () => {
    const { instance } = service({
      prisma: {
        userPasskeyCredential: {
          findFirst: jest.fn(async () => ({ id: 'row-1' })),
          count: jest.fn(async () => 1),
          delete: jest.fn(async () => ({})),
        },
        user: { findUnique: jest.fn(async () => ({ localPasswordHash: 'x', entraObjectId: null })) },
      },
    });
    const superAdmin = { ...localUser, roleKeys: ['SUPER_ADMIN'] };
    await expect(instance.removeCredential(superAdmin, policy, 'row-1', 'u-1', false)).rejects.toThrow(
      new AccountSecurityError('MFA_REQUIRED_CANNOT_DISABLE'),
    );
  });

  it('removes a passkey when another factor remains', async () => {
    const deleteFn = jest.fn(async () => ({}));
    const { instance, prisma, notifier } = service({
      prisma: {
        userPasskeyCredential: {
          findFirst: jest.fn(async () => ({ id: 'row-1' })),
          count: jest.fn(async () => 2),
          delete: deleteFn,
        },
        user: { findUnique: jest.fn(async () => ({ localPasswordHash: 'x', entraObjectId: null })) },
      },
    });
    await instance.removeCredential(localUser, policy, 'row-1', 'u-1', true);
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: 'row-1' } });
    expect(notifier.audit).toHaveBeenCalledWith('auth.mfa_passkey_removed', 'u-1', 'u-1');
  });

  it('does not offer passkey to Entra-managed accounts', async () => {
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ localPasswordHash: null, entraObjectId: 'entra-1' })) },
      userPasskeyCredential: { findMany: jest.fn(async () => []) },
    };
    const instance = new PasskeyCredentialService(
      prisma as never,
      new PasskeyChallengeStoreProvider(undefined),
      { audit: jest.fn(), notify: jest.fn() } as never,
    );
    await expect(instance.startRegistration({ id: 'u-1', email: 'a@b.ba' }, rp)).rejects.toThrow(
      new AccountSecurityError('MFA_NOT_AVAILABLE'),
    );
  });
});
