import { parseEntraAuthenticationConfiguration } from './parse-entra-authentication-configuration';

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';

describe('parseEntraAuthenticationConfiguration', () => {
  it('builds issuer and JWKS URLs from configured tenant and client identifiers', () => {
    expect(
      parseEntraAuthenticationConfiguration({
        tenantId: ` ${tenantId.toUpperCase()} `,
        clientId: ` ${clientId.toUpperCase()} `,
      }),
    ).toEqual({
      tenantId,
      clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      jwksUrl: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    });
  });

  it('fails closed when tenant or client identifiers are missing or invalid', () => {
    expect(() =>
      parseEntraAuthenticationConfiguration({
        tenantId: undefined,
        clientId,
      }),
    ).toThrow(/AUTHENTICATION_UNAVAILABLE/);
    expect(() =>
      parseEntraAuthenticationConfiguration({
        tenantId,
        clientId: '',
      }),
    ).toThrow(/AUTHENTICATION_UNAVAILABLE/);
    expect(() =>
      parseEntraAuthenticationConfiguration({
        tenantId: 'not-a-guid',
        clientId,
      }),
    ).toThrow(/AUTHENTICATION_UNAVAILABLE/);
    expect(() =>
      parseEntraAuthenticationConfiguration({
        tenantId,
        clientId: 'login.microsoftonline.com',
      }),
    ).toThrow(/AUTHENTICATION_UNAVAILABLE/);
  });
});
