import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedPrincipal } from './authentication.types';
import { readSessionSubjectId } from './read-session-subject-id';
import { SessionTokenService } from './session-token.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const SIGNING_SECRET = 'unit-test-jwt-signing-secret-value!';

const principal: AuthenticatedPrincipal = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isLocalOnly: false,
};

describe('SessionTokenService', () => {
  const load = jest.fn(async () => SIGNING_SECRET);
  const service = new SessionTokenService(new JwtService({}), { load } as never);

  beforeEach(() => {
    load.mockReset();
    load.mockResolvedValue(SIGNING_SECRET);
  });

  it('issues a signed token with only the subject claim', async () => {
    const accessToken = await service.issue(principal);
    const claims = await service.verify(accessToken);
    expect(claims).toMatchObject({ subjectId: 'user-1', jti: expect.any(String) });
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({ sub: 'user-1' });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('provider');
    expect(JSON.stringify(payload)).not.toContain(SIGNING_SECRET);
  });

  it('rejects password-change tokens as session tokens', async () => {
    const passwordChangeToken = await service.issuePasswordChangeToken('user-1');
    await expect(service.verify(passwordChangeToken)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    const claims = await service.verifyPasswordChangeToken(passwordChangeToken);
    expect(claims).toEqual({
      subjectId: 'user-1',
      purpose: 'password_change',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const accessToken = await service.issue(principal);
    load.mockResolvedValue('different-jwt-signing-secret-value!!');
    await expect(service.verify(accessToken)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects expired tokens', async () => {
    const jwtService = new JwtService({});
    const expiredToken = await jwtService.signAsync(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 30 },
      { secret: SIGNING_SECRET },
    );
    await expect(service.verify(expiredToken)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('readSessionSubjectId', () => {
  it('reads a provider-neutral subject', () => {
    expect(readSessionSubjectId({ sub: 'user-1', exp: 1 })).toBe('user-1');
  });

  it('rejects payloads that contain credentials', () => {
    expect(() =>
      readSessionSubjectId({ sub: 'user-1', password: 'secret' }),
    ).toThrow(/invalid/);
  });

  it('rejects payloads that carry provider or authorization claims', () => {
    expect(() =>
      readSessionSubjectId({ sub: 'user-1', roles: ['SUPER_ADMIN'], oid: 'oid-1' }),
    ).toThrow(/invalid/);
    expect(() =>
      readSessionSubjectId({ sub: 'user-1', provider: 'entra_ad' }),
    ).toThrow(/invalid/);
  });
});
