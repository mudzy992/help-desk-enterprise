import { AuthenticationProvidersService } from './authentication-providers.service';

/*
  Paket 5.4.1 (M3): the public half of the CAPTCHA configuration reaches the
  sign-in page through `GET /auth/providers` — the endpoint that already tells
  the page which sign-in options exist. The secret key must never appear in that
  answer, and a provider that cannot be read must not switch the check on.
*/
describe('AuthenticationProvidersService.describe (5.4.1 M3)', () => {
  const modeLoader = { load: async () => 'local' } as never;
  const entraLoader = { load: async () => null } as never;
  const settings = { getSetting: async () => true } as never;

  it('carries the captcha description next to the local mode', async () => {
    const captcha = {
      describe: async () => ({
        provider: 'turnstile',
        siteKey: '1x00000000000000000000AA',
        afterFailures: 5,
      }),
    } as never;
    const service = new AuthenticationProvidersService(modeLoader, entraLoader, settings, captcha);

    await expect(service.describe()).resolves.toEqual({
      mode: 'local',
      entra: null,
      captcha: { provider: 'turnstile', siteKey: '1x00000000000000000000AA', afterFailures: 5 },
    });
  });

  it('falls back to none, without a site key, when the description is unreadable', async () => {
    const captcha = {
      describe: async () => {
        throw new Error('settings database down');
      },
    } as never;
    const service = new AuthenticationProvidersService(modeLoader, entraLoader, settings, captcha);

    await expect(service.describe()).resolves.toMatchObject({
      captcha: { provider: 'none', siteKey: null },
    });
  });

  it('a service without the captcha dependency still answers with none', async () => {
    const service = new AuthenticationProvidersService(modeLoader, entraLoader, settings);
    await expect(service.describe()).resolves.toMatchObject({
      captcha: { provider: 'none', siteKey: null, afterFailures: 5 },
    });
  });
});
