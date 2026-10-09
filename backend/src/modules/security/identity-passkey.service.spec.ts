jest.mock('../authentication/security/passkey-credential.service', () => {
  const actual = jest.requireActual('../authentication/security/passkey-credential.service');
  return { ...actual, PasskeyCredentialService: class PasskeyCredentialService {} };
});
jest.mock('../authentication/security/webauthn-rp.loader', () => ({
  WebAuthnRpLoader: class WebAuthnRpLoader {},
}));

import { generateAuthenticationOptions } from '@simplewebauthn/server';
import {
  PasskeyChallengeStoreProvider,
} from '../authentication/security/passkey-challenge.store';
import { PasskeyCredentialService } from '../authentication/security/passkey-credential.service';
import { WebAuthnRpLoader } from '../authentication/security/webauthn-rp.loader';
import { IdentityPasskeyService, PasskeyIdentityError } from './identity-passkey.service';

/*
  Paket 5.4.0-a (M1): the step-up flow for sensitive actions. Pinned here: no
  options for an account without passkeys, `userVerification: 'required'` on
  the ceremony, and a single-use marker the privacy confirmer consumes.
*/

const rp = { rpID: 'helpdesk.example', expectedOrigins: ['https://helpdesk.example'], rpName: 'Service Desk' };

function identityService(credentialCount = 1) {
  const prisma = {
    userPasskeyCredential: {
      findMany: jest.fn(async () =>
        Array.from({ length: credentialCount }, (_, index) => ({ credentialId: `cred-${index}` })),
      ),
    },
  } as never;
  const store = new PasskeyChallengeStoreProvider(undefined);
  const passkeyCredentialService = {
    verifyAssertion: jest.fn(async () => ({ credentialRowId: 'row-1' })),
  } as unknown as PasskeyCredentialService;
  const webAuthnRpLoader = { load: jest.fn(() => rp) } as unknown as WebAuthnRpLoader;
  const instance = new IdentityPasskeyService(
    prisma,
    store,
    passkeyCredentialService,
    webAuthnRpLoader,
  );
  return { instance, store, passkeyCredentialService };
}

describe('IdentityPasskeyService', () => {
  it('issues options with userVerification required when passkeys exist', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'step-challenge' });
    const { instance } = identityService(2);
    const { options } = await instance.start('session-1', 'u-1', 'identity-confirmation');
    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'helpdesk.example',
        userVerification: 'required',
        allowCredentials: [{ id: 'cred-0' }, { id: 'cred-1' }],
      }),
    );
    expect(options.challenge).toBe('step-challenge');
  });

  it('refuses to start when the account has no passkey', async () => {
    const { instance } = identityService(0);
    await expect(instance.start('session-1', 'u-1', 'identity-confirmation')).rejects.toThrow(
      new PasskeyIdentityError('IDENTITY_CONFIRMATION_REQUIRED'),
    );
  });

  it('leaves a single-use marker after a verified assertion', async () => {
    const { instance, store } = identityService();
    await instance.start('session-1', 'u-1', 'identity-confirmation');
    await instance.verify('session-1', 'u-1', 'identity-confirmation', { id: 'cred-0' }, '1.2.3.4');
    await expect(instance.consumeFreshConfirmation('session-1', 'identity-confirmation')).resolves.toBe(true);
    // Single-use: the second confirmation attempt finds nothing.
    await expect(instance.consumeFreshConfirmation('session-1', 'identity-confirmation')).resolves.toBe(false);
    await expect(store.store.peek('webauthn:step-ok:session-1:identity-confirmation')).resolves.toBeNull();
  });

  it('fails closed when the assertion does not verify', async () => {
    const { instance, passkeyCredentialService } = identityService();
    await instance.start('session-1', 'u-1', 'identity-confirmation');
    (passkeyCredentialService.verifyAssertion as jest.Mock).mockRejectedValueOnce(new Error('bad assertion'));
    await expect(
      instance.verify('session-1', 'u-1', 'identity-confirmation', { id: 'cred-0' }, null),
    ).rejects.toThrow(new PasskeyIdentityError('IDENTITY_CONFIRMATION_FAILED'));
    await expect(instance.consumeFreshConfirmation('session-1', 'identity-confirmation')).resolves.toBe(false);
  });

  it('isolates purposes: a marker for one purpose never confirms another', async () => {
    const { instance } = identityService();
    await instance.start('session-1', 'u-1', 'identity-confirmation');
    await instance.verify('session-1', 'u-1', 'identity-confirmation', { id: 'cred-0' }, null);
    await expect(instance.consumeFreshConfirmation('session-1', 'bulk-password-reset')).resolves.toBe(false);
  });
});
