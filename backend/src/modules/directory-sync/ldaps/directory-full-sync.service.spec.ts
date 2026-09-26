jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { DirectorySyncError } from '../directory-sync.error';
import { DirectoryBackoff } from './directory-backoff';
import { DirectoryFullSyncService } from './directory-full-sync.service';
import { withLdapsSession } from './ldaps-directory-reader';
import type { LdapsSyncConfiguration } from './ldaps-directory.types';

function configuration(overrides: Partial<LdapsSyncConfiguration> = {}): LdapsSyncConfiguration {
  return {
    source: 'ldaps',
    enabled: true,
    strategy: 'manual_only',
    connection: {
      urls: ['ldaps://dc1:636'], bindDn: 'CN=svc,OU=Servis,DC=epbih,DC=ba', bindPassword: 'secret',
      caCertificatePem: null, connectTimeoutMilliseconds: 1, operationTimeoutMilliseconds: 1,
    },
    usersBaseDn: 'OU=Korisnici,DC=epbih,DC=ba',
    groupsBaseDn: 'OU=Grupe,DC=epbih,DC=ba',
    pageSize: 500,
    userFilter: '(objectClass=user)',
    retryBackoffMilliseconds: 180_000,
    syncCooldownMilliseconds: 900_000,
    maxDeactivationPercent: 10,
    scheduleCron: '30 2 * * *',
    ouMappingStrategy: 'by_dn_ou_path',
    ouMappingOverrides: [],
    roleSource: 'local_db',
    adminGroupDn: null,
    agentGroupDn: null,
    ...overrides,
  };
}

describe('withLdapsSession (paket 1.8)', () => {
  it('rejects a forest-wide base DN before connecting', async () => {
    const factory = jest.fn();
    await expect(
      withLdapsSession({
        configuration: configuration({ usersBaseDn: 'DC=epbih,DC=ba' }),
        backoff: new DirectoryBackoff(),
        now: () => 0,
        factory,
        work: async () => 1,
      }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_NOT_CONFIGURED', details: { missing: ['private.auth.adRead.usersBaseDn'] } });
    expect(factory).not.toHaveBeenCalled();
  });

  it('opens the backoff window after a failure and always unbinds', async () => {
    const backoff = new DirectoryBackoff();
    const close = jest.fn();
    const factory = jest.fn().mockResolvedValue({
      search: jest.fn().mockRejectedValue(Object.assign(new Error('busy'), { name: 'BusyError' })),
      close,
    });
    await expect(
      withLdapsSession({
        configuration: configuration(),
        backoff,
        now: () => 1_000,
        factory,
        work: (reader) => reader.readUsers(),
      }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_CONNECTION_FAILED' });
    expect(close).toHaveBeenCalled();
    await expect(
      withLdapsSession({ configuration: configuration(), backoff, now: () => 2_000, factory, work: async () => 1 }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_BACKOFF' });
    expect(factory).toHaveBeenCalledTimes(1);
    // After the window the next attempt goes out again.
    await withLdapsSession({
      configuration: configuration(),
      backoff,
      now: () => 1_000 + 180_001,
      factory: jest.fn().mockResolvedValue({ search: jest.fn().mockResolvedValue([]), close: jest.fn() }),
      work: (reader) => reader.readUsers(),
    });
    expect(backoff.snapshot(180_000)).toEqual({ retryAt: null, lastErrorCode: null });
  });
});

describe('DirectoryFullSyncService.apply guards', () => {
  function create(run: Record<string, unknown> | null) {
    const prisma = {
      directorySyncRun: {
        findUnique: jest.fn().mockResolvedValue(run),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'apply-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async () => undefined),
    };
    const service = new DirectoryFullSyncService(
      prisma as never,
      { load: async () => configuration() } as never,
      new DirectoryBackoff(),
    );
    return { service, prisma };
  }
  const plan = { safeguard: { tripped: false } };

  it('rejects unknown, expired, already applied and tripped plans', async () => {
    await expect(create(null).service.apply('x', 'actor')).rejects.toMatchObject({ code: 'DIRECTORY_PLAN_NOT_FOUND' });
    await expect(
      create({ id: 'd', kind: 'DRY_RUN', status: 'SUCCEEDED', plan, appliedByRunId: 'other', startedAt: new Date() })
        .service.apply('d', 'actor'),
    ).rejects.toMatchObject({ code: 'DIRECTORY_PLAN_ALREADY_APPLIED' });
    await expect(
      create({ id: 'd', kind: 'DRY_RUN', status: 'SUCCEEDED', plan, appliedByRunId: null, startedAt: new Date(Date.now() - 2 * 3_600_000) })
        .service.apply('d', 'actor'),
    ).rejects.toMatchObject({ code: 'DIRECTORY_PLAN_EXPIRED' });
    await expect(
      create({ id: 'd', kind: 'DRY_RUN', status: 'SUCCEEDED', plan: { safeguard: { tripped: true, deactivations: 9 } }, appliedByRunId: null, startedAt: new Date() })
        .service.apply('d', 'actor'),
    ).rejects.toMatchObject({ code: 'DIRECTORY_SAFEGUARD_TRIPPED' });
  });

  it('loses the race cleanly when a parallel click already claimed the plan', async () => {
    const { service, prisma } = create({
      id: 'd', kind: 'DRY_RUN', status: 'SUCCEEDED', plan, appliedByRunId: null, startedAt: new Date(),
    });
    await expect(service.apply('d', 'actor')).rejects.toBeInstanceOf(DirectorySyncError);
    expect(prisma.directorySyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', errorCode: 'DIRECTORY_PLAN_ALREADY_APPLIED' }) }),
    );
  });

  it('refuses LDAPS operations when the source is the manual catalog', async () => {
    const service = new DirectoryFullSyncService(
      {} as never,
      { load: async () => configuration({ source: 'manual_catalog' }) } as never,
      new DirectoryBackoff(),
    );
    await expect(service.dryRun('actor')).rejects.toMatchObject({ code: 'DIRECTORY_SOURCE_NOT_LDAPS' });
  });
});
