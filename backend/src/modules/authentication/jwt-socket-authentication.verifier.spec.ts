import { JwtService } from '@nestjs/jwt';
import { JwtSocketAuthenticationVerifier } from './jwt-socket-authentication.verifier';
import { SessionTokenService } from './session-token.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SIGNING_SECRET = 'unit-test-jwt-signing-secret-value!';

describe('JwtSocketAuthenticationVerifier', () => {
  const sessionTokenService = new SessionTokenService(new JwtService({}), {
    load: async () => SIGNING_SECRET,
  } as never);
  const verifier = new JwtSocketAuthenticationVerifier(sessionTokenService);

  it('accepts a valid session token and returns only subjectId', async () => {
    const token = await sessionTokenService.issue({
      subjectId: 'user-1',
      email: 'agent@example.com',
      displayName: 'Agent',
      isLocalOnly: false,
    });
    const result = await verifier.verify({ token });
    expect(result).toEqual({
      status: 'authenticated',
      principal: { subjectId: 'user-1' },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).not.toHaveProperty('provider');
  });

  it('rejects an invalid token without echoing it', async () => {
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
