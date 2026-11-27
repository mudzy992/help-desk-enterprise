import { createEmailChannelTestConfiguration } from '../notifications/email/email-channel-test-configuration';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';

let channel: EmailChannelConfiguration = createEmailChannelTestConfiguration();
let addonEnabled = true;
jest.mock('../settings/read-email-addon-enabled', () => ({
  readEmailAddonEnabled: jest.fn(async () => addonEnabled),
}));
jest.mock('../notifications/email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(async () => channel),
}));

import { resolveTemporaryPasswordChannel } from './send-temporary-password-email';

/*
  W2.26 (`BA-users-02`): the channel has to be decided **before** the account
  transaction commits, because it decides whether the transaction stores a hash (the
  secret goes back in the response) or only a durable delivery intent (the secret is
  mailed later and never persisted). This spec pins the predicate to the one the
  sender applies — a mismatch here would produce either a stored password with no
  recipient or an account with no way in.
*/
const resolve = (email: string) =>
  resolveTemporaryPasswordChannel({ settingsService: {} as never, email });

describe('resolveTemporaryPasswordChannel', () => {
  beforeEach(() => {
    addonEnabled = true;
    channel = createEmailChannelTestConfiguration();
    delete process.env.RESERVED_NO_EMAIL_DOMAINS;
  });

  it('uses e-mail when the channel is configured and the address is allowed', async () => {
    // Not a reserved domain, but inside the recipient policy: this is the production
    // shape (real staff address, SMTP configured).
    channel = createEmailChannelTestConfiguration({ internalDomains: ['firma.ba'] });
    await expect(resolve('agent@firma.ba')).resolves.toBe('email');
  });

  it('keeps reserved test domains on the in-band channel', async () => {
    // The e2e suite depends on this: it reads the password from the response.
    await expect(resolve('e2e.user@example.com')).resolves.toBe('ui');
    process.env.RESERVED_NO_EMAIL_DOMAINS = 'corp.ba';
    await expect(resolve('user@corp.ba')).resolves.toBe('ui');
    await expect(resolve('user@example.com')).resolves.toBe('email');
  });

  it('falls back to in-band delivery when the add-on is off', async () => {
    addonEnabled = false;
    await expect(resolve('agent@firma.ba')).resolves.toBe('ui');
  });

  it('falls back to in-band delivery when SMTP is not configured', async () => {
    channel = createEmailChannelTestConfiguration({ smtp: null });
    await expect(resolve('agent@example.com')).resolves.toBe('ui');
  });

  it('falls back to in-band delivery when the recipient policy rejects the address', async () => {
    channel = createEmailChannelTestConfiguration({
      internalOnly: true,
      internalDomains: ['example.com'],
    });
    await expect(resolve('outsider@example.org')).resolves.toBe('ui');
  });
});
