import { JwtService } from '@nestjs/jwt';
import { JwtSocketAuthenticationVerifier } from './jwt-socket-authentication.verifier';
import { SessionRevocationStore } from './session-revocation.store';
import { SessionTokenService } from './session-token.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SIGNING_SECRET = 'unit-test-jwt-signing-secret-value!';

function createVerifier() {
  const redis = { mget: jest.fn(async () => [null, null, null]) };
  const prisma = {
    userSession: {
      findFirst: jest.fn(async () => ({
        user: {
          id: 'user-1',
          authzVersion: 7,
          isActive: true,
          mustChangePassword: false,
        },
      })),
    },
  };
  const revocation = new SessionRevocationStore(redis as never, prisma as never);
  const sessionTokenService = new SessionTokenService(
    new JwtService({}),
    { load: async () => SIGNING_SECRET } as never,
    revocation,
  );
  return { verifier: new JwtSocketAuthenticationVerifier(sessionTokenService), redis, prisma };
}

describe('JwtSocketAuthenticationVerifier', () => {
  it('accepts a valid session token and returns the verified socket lease fields', async () => {
    const { verifier } = createVerifier();
    const service = new SessionTokenService(
      new JwtService({}),
      { load: async () => SIGNING_SECRET } as never,
      new SessionRevocationStore(
        { mget: jest.fn(async () => [null, null, null]) } as never,
        {
          userSession: {
            findFirst: jest.fn(async () => ({
              user: {
                id: 'user-1',
                authzVersion: 7,
                isActive: true,
                mustChangePassword: false,
              },
            })),
          },
        } as never,
      ),
    );
    const token = await service.issue(
      {
        subjectId: 'user-1',
        email: 'agent@example.com',
        displayName: 'Agent',
        isLocalOnly: false,
      },
      'session-1',
    );
    const result = await verifier.verify({ token });
    expect(result).toMatchObject({
      status: 'authenticated',
      principal: {
        subjectId: 'user-1',
        sessionId: 'session-1',
        jti: expect.any(String),
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
        authzVersion: 7,
      },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).not.toHaveProperty('provider');
  });

  it('rejects an invalid token without echoing it', async () => {
    const { verifier } = createVerifier();
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
