import { UnavailableSocketAuthenticationVerifier } from './unavailable-socket-authentication.verifier';

describe('UnavailableSocketAuthenticationVerifier', () => {
  it('rejects credentials without treating them as authenticated', async () => {
    const verifier = new UnavailableSocketAuthenticationVerifier();
    const result = await verifier.verify({
      token: 'synthetic-handshake-token-test-only',
    });
    expect(result).toEqual({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    });
    expect(JSON.stringify(result)).not.toContain(
      'synthetic-handshake-token-test-only',
    );
  });
});
