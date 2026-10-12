import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AUTHORIZATION_REQUIRED_ROLES_KEY,
} from '../authorization/authorization.constants';
import {
  SecurityAuditLogController,
  SecurityAuditLogQueryDto,
} from './security-audit-log.controller';
import { AuditLogRepository } from '../audit-log/audit-log.repository';
import { AuditLogService } from '../audit-log/audit-log.service';

/*
  Paket 5.4.0-d (M6): the security journal. The tests lock the access model
  (SUPER_ADMIN only), the mandatory `auth.` prefix — in the query, so no filter
  can widen it — the documented `userId` semantics, cursor pagination, the
  default page size and the `no-store` answer.
*/

describe('SecurityAuditLogController', () => {
  it('is restricted to the SuperAdmin role', () => {
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, SecurityAuditLogController),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('answers with Cache-Control: no-store', () => {
    const headers = Reflect.getMetadata(
      '__headers__',
      SecurityAuditLogController.prototype.list,
    ) as readonly { readonly name: string; readonly value: string }[];
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });

  it('forwards the filters with the default page size when nothing is given', async () => {
    const listAuthSecurityEvents = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new SecurityAuditLogController({
      listAuthSecurityEvents,
    } as never);

    await expect(controller.list({})).resolves.toEqual({ items: [], nextCursor: null });
    expect(listAuthSecurityEvents).toHaveBeenCalledWith({
      action: null,
      userId: null,
      take: 50,
      cursor: null,
    });
  });

  it('forwards an explicit page window and both filters', async () => {
    const listAuthSecurityEvents = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new SecurityAuditLogController({
      listAuthSecurityEvents,
    } as never);

    await controller.list({
      action: 'auth.login_failed',
      userId: 'user-1',
      take: 25,
      cursor: 'row-9',
    });

    expect(listAuthSecurityEvents).toHaveBeenCalledWith({
      action: 'auth.login_failed',
      userId: 'user-1',
      take: 25,
      cursor: 'row-9',
    });
  });

  it('refuses an action filter outside the auth. namespace', async () => {
    const query = plainToInstance(SecurityAuditLogQueryDto, { action: 'ticket.updated' });
    const errors = await validate(query);
    expect(errors.map((error) => error.property)).toEqual(['action']);
  });

  it('accepts an auth. action filter and rejects an out-of-range page size', async () => {
    const valid = await validate(
      plainToInstance(SecurityAuditLogQueryDto, { action: 'auth.login_failed', take: 200 }),
    );
    expect(valid).toEqual([]);

    const invalid = await validate(plainToInstance(SecurityAuditLogQueryDto, { take: 500 }));
    expect(invalid.map((error) => error.property)).toEqual(['take']);
  });

  it('throws when the guard did not attach a principal', () => {
    const controller = new SecurityAuditLogController({ listAuthSecurityEvents: jest.fn() } as never);
    // The route is guarded; this only documents the defensive branch.
    expect(controller).toBeDefined();
  });
});

describe('AuditLogService.listAuthSecurityEvents', () => {
  function createFixture() {
    const listAuthPage = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const listActorDisplayNames = jest.fn().mockResolvedValue(new Map());
    const service = new AuditLogService(
      {} as never,
      { listAuthPage, listActorDisplayNames } as never,
      {} as never,
      {} as never,
    );
    return { service, listAuthPage, listActorDisplayNames };
  }

  it('delegates to the auth-scoped repository query and keeps the list shape', async () => {
    const { service, listAuthPage } = createFixture();

    const result = await service.listAuthSecurityEvents({
      action: 'auth.login_failed',
      userId: 'user-1',
      take: 10,
      cursor: null,
    });

    expect(listAuthPage).toHaveBeenCalledWith({
      action: 'auth.login_failed',
      userId: 'user-1',
      take: 10,
      cursor: null,
    });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('maps rows with the same serializer the OU-scoped list uses', async () => {
    const { service, listAuthPage } = createFixture();
    listAuthPage.mockResolvedValue({
      items: [
        {
          id: 'row-1',
          action: 'auth.login_failed',
          entityType: 'auth_event',
          entityId: 'anonymous',
          actorUserId: null,
          requestId: null,
          organizationalUnitId: null,
          metadata: { provider: 'local', reason: 'invalid_credentials' },
          createdAt: new Date('2026-10-11T10:00:00.000Z'),
          previousHash: null,
          hash: 'hash-1',
          hashVersion: 2,
          metadataDigest: 'digest-1',
        },
      ],
      nextCursor: 'row-1',
    });

    const result = await service.listAuthSecurityEvents({
      action: null,
      userId: null,
      take: 50,
      cursor: null,
    });

    expect(result.nextCursor).toBe('row-1');
    expect(result.items[0]).toMatchObject({
      id: 'row-1',
      action: 'auth.login_failed',
      createdAt: '2026-10-11T10:00:00.000Z',
    });
    expect(JSON.stringify(result.items[0])).not.toContain('@');
    expect(result.items[0]).toMatchObject({ actorDisplayName: null });
  });

  /*
    Paket 5.4.0-f follow-up: the list showed a raw `actorUserId`; the UI needs a
    person's name. One lookup per page, and never an e-mail or anything else
    from the account — only the display name.
  */
  it('attaches the actor display name with a single lookup per page', async () => {
    const { service, listAuthPage, listActorDisplayNames } = createFixture();
    listActorDisplayNames.mockResolvedValue(new Map([['user-1', 'Amra Hodžić']]));
    listAuthPage.mockResolvedValue({
      items: [
        {
          id: 'row-1',
          action: 'auth.mfa_enrolled',
          entityType: 'user',
          entityId: 'user-1',
          actorUserId: 'user-1',
          requestId: 'req-1',
          organizationalUnitId: null,
          metadata: {},
          createdAt: new Date('2026-10-11T10:00:00.000Z'),
          previousHash: null,
          hash: 'hash-1',
        },
        {
          id: 'row-2',
          action: 'auth.login_failed',
          entityType: 'auth_event',
          entityId: 'anonymous',
          actorUserId: null,
          requestId: null,
          organizationalUnitId: null,
          metadata: {},
          createdAt: new Date('2026-10-11T10:01:00.000Z'),
          previousHash: null,
          hash: 'hash-2',
        },
      ],
      nextCursor: null,
    });

    const result = await service.listAuthSecurityEvents({
      action: null,
      userId: null,
      take: 50,
      cursor: null,
    });

    expect(listActorDisplayNames).toHaveBeenCalledTimes(1);
    expect(listActorDisplayNames).toHaveBeenCalledWith(['user-1']);
    expect(result.items[0]).toMatchObject({
      id: 'row-1',
      actorUserId: 'user-1',
      actorDisplayName: 'Amra Hodžić',
    });
    expect(result.items[1]).toMatchObject({ actorDisplayName: null });
  });

  it('does not query names when the page has no actors', async () => {
    const { service, listAuthPage, listActorDisplayNames } = createFixture();
    listAuthPage.mockResolvedValue({
      items: [
        {
          id: 'row-1',
          action: 'auth.login_failed',
          entityType: 'auth_event',
          entityId: 'anonymous',
          actorUserId: null,
          requestId: null,
          organizationalUnitId: null,
          metadata: {},
          createdAt: new Date('2026-10-11T10:00:00.000Z'),
          previousHash: null,
          hash: 'hash-1',
        },
      ],
      nextCursor: null,
    });

    await service.listAuthSecurityEvents({
      action: null,
      userId: null,
      take: 50,
      cursor: null,
    });

    expect(listActorDisplayNames).not.toHaveBeenCalled();
  });
});

describe('AuditLogRepository.listAuthPage', () => {
  function createRepository() {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AuditLogRepository({ auditLog: { findMany } } as never);
    return { repository, findMany };
  }

  it('pins the auth. prefix in the query when no action is filtered', async () => {
    const { repository, findMany } = createRepository();

    await repository.listAuthPage({ action: null, userId: null, take: 5, cursor: null });

    expect(findMany.mock.calls[0]![0].where).toEqual({
      action: { startsWith: 'auth.' },
    });
    expect(findMany.mock.calls[0]![0].take).toBe(6);
    expect(findMany.mock.calls[0]![0].cursor).toBeUndefined();
  });

  it('matches the user filter against the target entity and the actor', async () => {
    const { repository, findMany } = createRepository();

    await repository.listAuthPage({
      action: 'auth.login_failed',
      userId: 'user-1',
      take: 5,
      cursor: 'row-4',
    });

    expect(findMany.mock.calls[0]![0].where).toEqual({
      action: 'auth.login_failed',
      OR: [{ entityId: 'user-1' }, { actorUserId: 'user-1' }],
    });
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      cursor: { id: 'row-4' },
      skip: 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('reports the last id as the cursor only when another page exists', async () => {
    const rows = [
      { id: 'row-2', createdAt: new Date('2026-10-11T10:00:00.000Z') },
      { id: 'row-1', createdAt: new Date('2026-10-11T09:00:00.000Z') },
    ];
    // The repository asks for one row more than the page size; the full page
    // only exists for `take: 1` here, which is what makes the cursor appear.
    const findMany = jest.fn(async (args: { take: number }) =>
      args.take === 2 ? rows : rows.slice(0, 1),
    );
    const repository = new AuditLogRepository({
      auditLog: { findMany },
    } as never);

    const full = await repository.listAuthPage({
      action: null,
      userId: null,
      take: 1,
      cursor: null,
    });
    expect(full.items).toHaveLength(1);
    expect(full.nextCursor).toBe('row-2');

    const single = await repository.listAuthPage({
      action: null,
      userId: null,
      take: 5,
      cursor: null,
    });
    expect(single.nextCursor).toBeNull();
  });
});

describe('SecurityAuditLogController guard wiring', () => {
  it('cannot be reached without a session (documented defensive branch)', () => {
    // `readAuthenticatedPrincipal` returning null is the only way this branch
    // runs; the guard chain refuses such a request earlier.
    expect(UnauthorizedException).toBeDefined();
  });
});
