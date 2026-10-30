import type Redis from 'ioredis';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { DirectoryBackoff } from '../../directory-sync/ldaps/directory-backoff';
import type { LdapClientFactory } from '../../directory-sync/ldaps/ldap-directory-client';
import type { LdapsSyncConfigurationLoader } from '../../directory-sync/ldaps/ldaps-sync-configuration.loader';
import { settingKeys } from '../../settings/setting-keys';
import type { AssetAccessService } from '../asset-access.service';
import { assetErrorCodes } from '../assets.constants';
import { AssetDirectorySyncLeaseError } from './asset-directory-sync-lease';
import { AssetDirectorySyncService } from './asset-directory-sync.service';

const base = 'OU=Korisnici,DC=example,DC=com';
const guid = Buffer.from('78563412bc9af0de0123456789abcdef', 'hex');

function createSharedRedis() {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  return {
    set: jest.fn(async (key: string, value: string, _mode: 'PX', ttl: number, _condition: 'NX') => {
      const existing = entries.get(key);
      if (existing !== undefined && existing.expiresAt > Date.now()) return null;
      entries.set(key, { value, expiresAt: Date.now() + ttl });
      return 'OK';
    }),
    eval: jest.fn(async (script: string, _keyCount: number, key: string, value: string, ttl?: number) => {
      const existing = entries.get(key);
      if (existing === undefined || existing.expiresAt <= Date.now() || existing.value !== value) return 0;
      if (script.includes('PEXPIRE')) {
        existing.expiresAt = Date.now() + Number(ttl);
        return 1;
      }
      if (script.includes('DEL')) {
        entries.delete(key);
        return 1;
      }
      return 0;
    }),
  } as unknown as Redis & { set: jest.Mock; eval: jest.Mock };
}

function setup(
  options: { syncEnabled?: boolean; ldapsEnabled?: boolean } = {},
  redis: Redis = createSharedRedis(),
) {
  const settings: Record<string, unknown> = {
    [settingKeys.privateAssetsDirectorySyncEnabled]: options.syncEnabled ?? false,
    [settingKeys.privateAssetsDirectorySyncNamePattern]: '^PC-(?<login>[a-z.]+)$',
  };
  const access = {
    requireEnabled: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(true),
    readSetting: jest.fn(async (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback)),
  } as unknown as AssetAccessService;
  const loader = {
    load: jest.fn().mockResolvedValue({
      source: 'ldaps',
      enabled: options.ldapsEnabled ?? true,
      connection: { urls: ['ldaps://dc1.example.com'], bindDn: 'CN=svc,OU=Svc,DC=example,DC=com', bindPassword: 'x', caCertificatePem: null, connectTimeoutMilliseconds: 1, operationTimeoutMilliseconds: 1 },
      usersBaseDn: base,
      groupsBaseDn: '',
      pageSize: 500,
      retryBackoffMilliseconds: 0,
      maxDeactivationPercent: 10,
      ouMappingOverrides: [],
    }),
  } as unknown as LdapsSyncConfigurationLoader;
  const search = jest.fn().mockResolvedValue([
    { objectGUID: guid, distinguishedName: `CN=PC-AMRA.H,OU=Direkcija,${base}`, cn: 'PC-AMRA.H', operatingSystem: 'Windows 11 Pro', userAccountControl: '4096' },
  ]);
  const factory: LdapClientFactory = jest.fn().mockResolvedValue({ search, close: jest.fn().mockResolvedValue(undefined) });
  const prisma = {
    assetType: { findMany: jest.fn().mockResolvedValue([{ id: 'type-computer', key: 'computer', attributes: [{ key: 'hostname' }, { key: 'os' }] }]) },
    asset: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), createMany: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-amra', email: 'amra.h@example.com', distinguishedName: null, isActive: true }]) },
    organizationalUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-dir', ouPath: '/Korisnici/Direkcija', distinguishedName: `OU=Direkcija,${base}` }]) },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (work: (client: unknown) => unknown) => work({ auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() }, $executeRaw: jest.fn() })),
  };
  const service = new AssetDirectorySyncService(prisma as unknown as PrismaService, access, loader, new DirectoryBackoff(), redis, factory);
  return { service, prisma, search, redis };
}

describe('AssetDirectorySyncService (paket 3.2 §12)', () => {
  it('dry-runs while the sync is still off and writes nothing', async () => {
    const { service, prisma, search } = setup();
    const report = await service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ baseDn: base, filter: expect.stringContaining('objectCategory=computer') }));
    expect(report).toMatchObject({ dryRun: true, applied: null, domainController: 'ldaps://dc1.example.com', totals: { seen: 1, create: 1, suggestions: 1 } });
    expect(report.preview).toEqual([{ name: 'PC-AMRA.H', action: 'create', changes: [] }]);
    expect(prisma.asset.createMany).not.toHaveBeenCalled();
  });

  it('serializes manual runs across two service instances and releases the lease afterwards', async () => {
    const redis = createSharedRedis();
    const first = setup({}, redis);
    const second = setup({}, redis);
    let signalStarted!: () => void;
    let releaseSearch!: () => void;
    const searchStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
    const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
    first.search.mockImplementationOnce(async () => {
      signalStarted();
      await searchGate;
      return [{
        objectGUID: guid,
        distinguishedName: `CN=PC-AMRA.H,OU=Direkcija,${base}`,
        cn: 'PC-AMRA.H',
        operatingSystem: 'Windows 11 Pro',
        userAccountControl: '4096',
      }];
    });

    const firstRun = first.service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' });
    await searchStarted;
    await expect(second.service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({
      code: assetErrorCodes.directoryUnavailable,
      detail: 'busy',
    });
    expect(second.search).not.toHaveBeenCalled();

    releaseSearch();
    await expect(firstRun).resolves.toMatchObject({ dryRun: true });
    await expect(second.service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' })).resolves.toMatchObject({ dryRun: true });
    expect(second.search).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Redis cannot grant a distributed lease', async () => {
    const { service, search, redis } = setup();
    redis.set.mockRejectedValue(new Error('connection refused'));

    await expect(service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({
      code: assetErrorCodes.directoryUnavailable,
      detail: 'lease_unavailable',
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('stops before planning when it loses the lease after the directory read', async () => {
    const { service, prisma, redis } = setup({ syncEnabled: true });
    redis.eval.mockImplementationOnce(async () => 0);

    await expect(service.run({ dryRun: false, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({
      code: assetErrorCodes.directoryUnavailable,
      detail: 'lease_lost',
    });
    expect(prisma.assetType.findMany).not.toHaveBeenCalled();
  });

  it('propagates lease loss from an update transaction instead of counting it as an asset failure', async () => {
    const { service, prisma } = setup();
    const transaction = {
      asset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      assetEvent: { create: jest.fn().mockResolvedValue(undefined) },
    };
    prisma.$transaction.mockImplementationOnce(async (work) => work(transaction));
    let ownershipChecks = 0;
    const leaseLost = new AssetDirectorySyncLeaseError('lost');
    const assertLeaseHealthy = () => {
      ownershipChecks += 1;
      if (ownershipChecks === 2) throw leaseLost;
    };
    const apply = (service as unknown as {
      apply: (
        plan: never,
        actorUserId: string | null,
        assertLease: () => Promise<void>,
        assertLeaseHealthy: () => void,
      ) => Promise<unknown>;
    }).apply.bind(service);

    await expect(apply({
      creates: [],
      updates: [{
        assetId: 'asset-1',
        version: 1,
        data: { name: 'PC-AMRA.H' },
        changes: ['name'],
        kind: 'updated',
        userMatchedBy: 'namePattern',
      }],
    } as never, 'admin', async () => undefined, assertLeaseHealthy)).rejects.toBe(leaseLost);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.asset.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to apply while the sync setting is off', async () => {
    const { service } = setup();
    await expect(service.run({ dryRun: false, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({ code: assetErrorCodes.directorySyncDisabled });
  });

  it('reports a missing LDAPS configuration as not configured', async () => {
    const { service } = setup({ ldapsEnabled: false });
    await expect(service.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({ code: assetErrorCodes.directoryNotConfigured });
  });

  it('turns an LDAP failure into a secret-free unavailable error', async () => {
    const { service, redis } = setup();
    const failing = new AssetDirectorySyncService(
      (service as unknown as { prisma: PrismaService }).prisma,
      (service as unknown as { access: AssetAccessService }).access,
      (service as unknown as { ldapsConfiguration: LdapsSyncConfigurationLoader }).ldapsConfiguration,
      new DirectoryBackoff(),
      redis,
      jest.fn().mockRejectedValue(Object.assign(new Error('bad'), { code: 49, name: 'InvalidCredentialsError' })),
    );
    await expect(failing.run({ dryRun: true, actorUserId: 'admin', trigger: 'manual' })).rejects.toMatchObject({
      code: assetErrorCodes.directoryUnavailable,
      detail: 'INVALID_BIND_CREDENTIALS',
    });
  });

  it('scheduled tick does nothing while the sync is off', async () => {
    const { service, search } = setup();
    await expect(service.runIfDue()).resolves.toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});
