import { JwtService } from '@nestjs/jwt';
import { SessionTokenService } from './session-token.service';
import { SessionRevocationStore } from './session-revocation.store';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('session revocation (review 2026-09-25, S1/S2)', () => {
  const secret = 'x'.repeat(40);
  const make = () =>
    new SessionTokenService(new JwtService({}), { load: async () => secret } as never, new SessionRevocationStore());
  const principal = { subjectId: 'u1', email: 'a@b.ba', displayName: 'A', isLocalOnly: true } as never;

  it('issues 1 h tokens with a jti', async () => {
    const service = make();
    const claims = await service.verify(await service.issue(principal));
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.expiresAt - claims.issuedAt).toBe(3600);
  });

  it('logout revokes exactly that token', async () => {
    const service = make();
    const a = await service.issue(principal);
    const b = await service.issue(principal);
    await service.revoke(await service.verify(a));
    await expect(service.verify(a)).rejects.toThrow();
    await expect(service.verify(b)).resolves.toMatchObject({ subjectId: 'u1' });
  });

  it('password change revokes every earlier session of the user', async () => {
    const service = make();
    const old = await service.issue(principal);
    const realNow = Date.now;
    Date.now = () => realNow() + 2000;
    try {
      await service.revokeAllForUser('u1');
      await expect(service.verify(old)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
  });
});
