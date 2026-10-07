jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { SessionRegistryService } from './session-registry.service';

describe('SessionRegistryService.revokeAll (5.2.1 M2 #6)', () => {
  it('sets a cutoff before database work and exempts only the current sid/jti', async () => {
    const sequence: string[] = [];
    const prisma = {
      userSession: {
        findMany: jest.fn(async () => {
          sequence.push('find-active');
          return [{ id: 'sid-other' }];
        }),
        updateMany: jest.fn(async () => {
          sequence.push('mark-revoked');
          return { count: 1 };
        }),
      },
    };
    const sessionTokenService = {
      revokeAllForUser: jest.fn(async () => {
        sequence.push('cutoff');
      }),
      revokeSession: jest.fn(async () => {
        sequence.push('revoke-sid');
      }),
    };
    const notifier = { audit: jest.fn().mockResolvedValue(undefined) };
    const service = new SessionRegistryService(prisma as never, sessionTokenService as never, notifier as never);

    await expect(service.revokeAll({
      userId: 'user-1',
      reason: 'user',
      actorUserId: 'user-1',
      exceptSessionId: 'sid-current',
      exceptJti: 'jti-current',
    })).resolves.toBe(1);

    expect(sequence).toEqual(['cutoff', 'find-active', 'mark-revoked', 'revoke-sid']);
    expect(sessionTokenService.revokeAllForUser).toHaveBeenCalledWith('user-1', {
      sessionId: 'sid-current',
      jti: 'jti-current',
    });
    expect(prisma.userSession.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
        id: { not: 'sid-current' },
      },
      select: { id: true },
    });
    expect(sessionTokenService.revokeSession).toHaveBeenCalledWith('sid-other');
  });
});
