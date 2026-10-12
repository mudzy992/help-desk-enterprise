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

/*
  Paket 5.4.0-c (M3): "remember me on this device". The TTL is decided once, when
  the row is created, and a refresh re-derives it from the flag that was stored —
  so a client that loses the answer cannot turn a 1 h session into a 30-day one,
  and a SUPER_ADMIN whose remember-me was forced off (authentication.service)
  stays inside the short TTL for the whole life of the session.
*/
describe('SessionRegistryService remember me (5.4.0-c)', () => {
  const policy = { sessionsNewDeviceAlert: false, sessionsMaxPerUser: 0 };

  function createRegistry() {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      userSession: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `sid-${created.length}` };
        }),
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const sessionTokenService = { revokeAllForUser: jest.fn(), revokeSession: jest.fn() };
    const notifier = { audit: jest.fn(), notify: jest.fn() };
    return {
      service: new SessionRegistryService(prisma as never, sessionTokenService as never, notifier as never),
      prisma,
      created,
    };
  }

  const context = { ipAddress: '10.0.0.7', userAgent: 'jest' };

  it('gives a remembered device 30 days and a plain sign-in one hour', async () => {
    const { service, created } = createRegistry();
    const before = Date.now();
    await service.create({
      userId: 'user-1', provider: 'local', mfaMethod: 'totp', context, policy,
      isAdmin: false, rememberMe: true,
    });
    await service.create({
      userId: 'user-1', provider: 'local', mfaMethod: 'totp', context, policy,
      isAdmin: false, rememberMe: false,
    });
    const after = Date.now();

    const secondsUntil = (index: number) =>
      Math.round((new Date(created[index]!.expiresAt as Date).getTime() - before) / 1000);

    expect(created[0]!.rememberMe).toBe(true);
    expect(created[1]!.rememberMe).toBe(false);
    // 30 days against 1 h — the constants, with a second of slack for the clock.
    expect(secondsUntil(0)).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1);
    expect(secondsUntil(0)).toBeLessThanOrEqual(Math.round((after - before) / 1000) + 30 * 24 * 60 * 60);
    expect(secondsUntil(0)).toBeGreaterThan(secondsUntil(1) * 24);
    expect(secondsUntil(1)).toBeGreaterThanOrEqual(3600 - 1);
  });

  /** Refresh: the flag stored on the session — not the request — decides the TTL. */
  it('re-derives the TTL on refresh and only writes when the row is older than 5 minutes', async () => {
    const { service, prisma } = createRegistry();
    await service.touch('sid-1', context, true);
    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(1);
    const [call] = prisma.userSession.updateMany.mock.calls as unknown as [[{
      where: Record<string, unknown>;
      data: { expiresAt: Date };
    }]];
    expect(call[0].where).toMatchObject({ id: 'sid-1', revokedAt: null, lastSeenAt: { lt: expect.any(Date) } });
    const fromNow = (call[0].data.expiresAt.getTime() - Date.now()) / 1000;
    expect(fromNow).toBeGreaterThan(30 * 24 * 60 * 60 - 5);
    expect(fromNow).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  it('keeps a plain session at one hour on refresh', async () => {
    const { service, prisma } = createRegistry();
    await service.touch('sid-2', context);
    const [call] = prisma.userSession.updateMany.mock.calls as unknown as [[{ data: { expiresAt: Date } }]];
    const fromNow = (call[0].data.expiresAt.getTime() - Date.now()) / 1000;
    expect(fromNow).toBeGreaterThan(3600 - 5);
    expect(fromNow).toBeLessThanOrEqual(3600);
  });

  it('lists the flag and marks exactly the calling session as current', async () => {
    const { service, prisma } = createRegistry();
    prisma.userSession.findMany.mockResolvedValue([
      {
        id: 'sid-current', provider: 'local', mfaMethod: 'passkey', ipAddress: '10.0.0.0',
        userAgent: 'jest', createdAt: new Date('2026-10-12T08:00:00Z'),
        lastSeenAt: new Date('2026-10-12T09:00:00Z'), expiresAt: new Date('2026-11-11T09:00:00Z'),
        rememberMe: true,
      },
      {
        id: 'sid-other', provider: 'local', mfaMethod: null, ipAddress: '10.0.0.1',
        userAgent: 'phone', createdAt: new Date('2026-10-12T07:00:00Z'),
        lastSeenAt: new Date('2026-10-12T08:00:00Z'), expiresAt: new Date('2026-10-12T10:00:00Z'),
        rememberMe: false,
      },
    ] as never);
    const listed = await service.list('user-1', 'sid-current');
    expect(listed.map((row) => ({ id: row.id, current: row.current, rememberMe: row.rememberMe }))).toEqual([
      { id: 'sid-current', current: true, rememberMe: true },
      { id: 'sid-other', current: false, rememberMe: false },
    ]);
  });
});
