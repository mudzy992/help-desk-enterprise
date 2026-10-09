import { parseWebAuthnRpConfiguration, WebAuthnConfigurationError } from './webauthn-rp.configuration';

/*
  Paket 5.4.0-a (M1): the RP configuration is derived from the same CORS
  origin the browser talks to, so the two layers cannot drift. Pure parser —
  runs without I/O like the other configuration matrices.
*/

describe('parseWebAuthnRpConfiguration', () => {
  it('derives the RP ID and expected origin from the primary CORS origin', () => {
    const config = parseWebAuthnRpConfiguration({
      CORS_ORIGIN: 'https://helpdesk.example,http://localhost:3000',
    });
    expect(config).toEqual({
      rpID: 'helpdesk.example',
      expectedOrigins: ['https://helpdesk.example'],
      rpName: 'Service Desk',
    });
  });

  it('prefers explicit WEBAUTHN_RP_ID (subdomain hosting)', () => {
    const config = parseWebAuthnRpConfiguration({
      CORS_ORIGIN: 'https://helpdesk.example',
      WEBAUTHN_RP_ID: 'example',
    });
    expect(config.rpID).toBe('example');
    expect(config.expectedOrigins).toEqual(['https://helpdesk.example']);
  });

  it('accepts explicit extra expected origins (staging + production host)', () => {
    const config = parseWebAuthnRpConfiguration({
      CORS_ORIGIN: 'https://helpdesk.example',
      WEBAUTHN_EXPECTED_ORIGIN: 'https://helpdesk.example, https://staging.example',
    });
    expect(config.rpID).toBe('helpdesk.example');
    expect(config.expectedOrigins).toEqual(['https://helpdesk.example', 'https://staging.example']);
  });

  it('uses APP_NAME for the human-readable RP name', () => {
    const config = parseWebAuthnRpConfiguration({
      CORS_ORIGIN: 'https://helpdesk.example',
      APP_NAME: 'Kanton Service Desk',
    });
    expect(config.rpName).toBe('Kanton Service Desk');
  });

  it('refuses to start WebAuthn without any origin', () => {
    expect(() => parseWebAuthnRpConfiguration({})).toThrow(WebAuthnConfigurationError);
    expect(() => parseWebAuthnRpConfiguration({ CORS_ORIGIN: '  ,  ' })).toThrow(WebAuthnConfigurationError);
  });

  it('refuses origins without a scheme', () => {
    expect(() =>
      parseWebAuthnRpConfiguration({ CORS_ORIGIN: 'helpdesk.example', WEBAUTHN_EXPECTED_ORIGIN: 'helpdesk.example' }),
    ).toThrow(WebAuthnConfigurationError);
  });
});
