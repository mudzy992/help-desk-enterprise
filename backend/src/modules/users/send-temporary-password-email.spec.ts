import { createEmailChannelTestConfiguration } from '../notifications/email/email-channel-test-configuration';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';

let channel: EmailChannelConfiguration = createEmailChannelTestConfiguration();
jest.mock('../settings/read-email-addon-enabled', () => ({ readEmailAddonEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../notifications/email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(async () => channel),
}));

import { sendTemporaryPasswordEmail } from './send-temporary-password-email';

function send(toAddress: string) {
  const mailTransport = { send: jest.fn().mockResolvedValue(undefined) };
  const result = sendTemporaryPasswordEmail({
    settingsService: {} as never,
    mailTransport: mailTransport as never,
    toAddress,
    displayName: 'Test',
    temporaryPassword: 'Temp-Pass-123!',
  });
  return { result, mailTransport };
}

describe('sendTemporaryPasswordEmail recipient policy', () => {
  it('restricted delivery: an address outside the policy is not e-mailed (the UI shows the password)', async () => {
    channel = createEmailChannelTestConfiguration({ internalOnly: true, internalDomains: ['example.com'] });
    const { result, mailTransport } = send('e2e.user@example.org');
    await expect(result).resolves.toBe(false);
    expect(mailTransport.send).not.toHaveBeenCalled();
  });

  it('restricted delivery: an internal address is e-mailed', async () => {
    channel = createEmailChannelTestConfiguration({ internalOnly: true, internalDomains: ['example.com'] });
    const { result, mailTransport } = send('agent@example.com');
    await expect(result).resolves.toBe(true);
    expect(mailTransport.send).toHaveBeenCalledTimes(1);
  });

  it('unrestricted delivery: any valid address is e-mailed', async () => {
    channel = createEmailChannelTestConfiguration({ internalOnly: false, internalDomains: [] });
    const { result } = send('someone@gmail.com');
    await expect(result).resolves.toBe(true);
  });
});
