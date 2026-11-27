import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import type { JwtSigningSecretLoader } from '../authentication/jwt-signing-secret.loader';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { RolesService } from './roles.service';

/*
  W2.29 (`BA-rbac-01`): the impact preview proves *what* was reviewed, the
  baseline proves *since when*. Two SuperAdmins preview the same role, the first
  commits, the second must not be able to overwrite that commit with a review
  that predates it.

  The unit specs cover the service's ordering with a mocked client; this file
  proves the same thing on real PostgreSQL, where the two writers actually race:
  the advisory lock serializes them, and the compare-and-swap inside the
  transaction is what decides. No row and no audit entry may come from the
  request that lost.
*/
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('role permission preview baseline (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  const roleKey = `IT_CAS_${suffix}`;
  const usedPermissionKeys = [permissionKeys.ticketMerge, permissionKeys.settingsWrite];
  const createdPermissionKeys: string[] = [];
  let roleId = '';
  let service: RolesService;

  const previewSigningSecret = 'it-preview-signing-secret-value-0123456789';

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  async function currentKeys(): Promise<readonly string[]> {
    const rows = await database().rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
      orderBy: { permission: { key: 'asc' } },
    });
    return rows.map((row) => row.permission.key);
  }

  async function auditRows(): Promise<
    { metadata: unknown }[]
  > {
    return database().auditLog.findMany({
      where: {
        action: auditLogActions.rolePermissionReplace,
        entityType: auditLogEntityTypes.role,
        entityId: roleKey,
      },
      select: { metadata: true },
      // Two writes can land in the same millisecond; `id` (cuid) keeps the order
      // deterministic so "the last row" really is the newest one.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    for (const key of usedPermissionKeys) {
      const existing = await database().permission.findUnique({ where: { key } });
      if (existing === null) {
        await database().permission.create({ data: { key, description: `IT ${key}` } });
        createdPermissionKeys.push(key);
      }
    }
    const role = await database().role.create({
      data: { key: roleKey, name: `IT CAS role ${suffix}` },
    });
    roleId = role.id;
    const basePermission = await database().permission.findUniqueOrThrow({
      where: { key: permissionKeys.ticketMerge },
    });
    await database().rolePermission.create({
      data: { roleId, permissionId: basePermission.id },
    });

    const harness = createTestAuthorizationHarness();
    service = new RolesService(
      prisma as unknown as PrismaService,
      { loadBySubjectId: harness.loadBySubjectId } as unknown as AuthorizationContextLoader,
      harness.shadowAuthorizationService as unknown as ShadowAuthorizationService,
      undefined,
      { load: async () => previewSigningSecret } as unknown as JwtSigningSecretLoader,
    );
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.auditLog.deleteMany({ where: { entityId: roleKey } });
    await db.rolePermissionPreviewClaim.deleteMany({ where: { roleKey } });
    if (roleId !== '') await db.role.delete({ where: { id: roleId } });
    if (createdPermissionKeys.length > 0) {
      await db.permission.deleteMany({
        where: { key: { in: createdPermissionKeys }, rolePermissions: { none: {} } },
      });
    }
    await db.$disconnect();
  });

  function replaceInput(
    previewToken: string,
    keys: readonly string[],
    actorUserId: string,
    requestId: string,
  ) {
    return {
      roleKey,
      permissionKeys: keys,
      previewToken,
      reason: 'IT: provjera baseline compare-and-swap-a',
      actorUserId,
      requestId,
    };
  }

  it('refuses the older preview after a newer commit lands, and audits only the winner', async () => {
    const auditBefore = (await auditRows()).length;
    // A previews while the role holds [ticket.merge] and proposes [settings.write].
    const previewA = await service.preview(roleKey, [permissionKeys.settingsWrite], 'it-super-a');
    expect(previewA.currentPermissionKeys).toEqual([permissionKeys.ticketMerge]);

    // B previews the same baseline and commits [ticket.merge, settings.write].
    const previewB = await service.preview(
      roleKey,
      [permissionKeys.ticketMerge, permissionKeys.settingsWrite],
      'it-super-b',
    );
    const committed = await service.replace(
      replaceInput(
        previewB.previewToken,
        [permissionKeys.ticketMerge, permissionKeys.settingsWrite],
        'it-super-b',
        `it-req-b-${suffix}`,
      ),
    );
    expect(committed).toEqual([permissionKeys.settingsWrite, permissionKeys.ticketMerge]);

    // A's PUT is still signed for A, for A's set, and well inside its 15 minutes.
    await expect(
      service.replace(
        replaceInput(
          previewA.previewToken,
          [permissionKeys.settingsWrite],
          'it-super-a',
          `it-req-a-${suffix}`,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_STALE' } });

    // B's commit is intact and it is the only one in the log.
    expect(await currentKeys()).toEqual([
      permissionKeys.settingsWrite,
      permissionKeys.ticketMerge,
    ]);
    const rows = await auditRows();
    expect(rows).toHaveLength(auditBefore + 1);
    expect(rows[rows.length - 1]?.metadata).toMatchObject({
      roleKey,
      previousPermissionKeys: [permissionKeys.ticketMerge],
      nextPermissionKeys: [permissionKeys.settingsWrite, permissionKeys.ticketMerge],
    });
  });

  it('refuses the same preview token twice, even when the set does not change (BA-rbac-02)', async () => {
    // A no-op set is the one replay the W2.29 baseline CAS cannot catch: after the
    // first write the role still holds the baseline. The durable claim is what
    // makes the token single-use, so the second PUT must not reach the audit log.
    const before = await currentKeys();
    const auditBefore = (await auditRows()).length;

    const preview = await service.preview(roleKey, before, 'it-super-a');
    const committed = await service.replace(
      replaceInput(preview.previewToken, before, 'it-super-a', `it-once-1-${suffix}`),
    );
    // Set comparison: the returned order is the catalog sort, the stored order is
    // the database sort — neither is what this test is about.
    expect(new Set(committed)).toEqual(new Set(before));
    expect(await currentKeys()).toEqual(before);

    await expect(
      service.replace(
        replaceInput(preview.previewToken, before, 'it-super-a', `it-once-2-${suffix}`),
      ),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_CONSUMED' } });

    expect(await currentKeys()).toEqual(before);
    expect(await auditRows()).toHaveLength(auditBefore + 1);
  });

  it('lets exactly one of two parallel submissions of one token through', async () => {
    const before = await currentKeys();
    const auditBefore = (await auditRows()).length;
    const preview = await service.preview(roleKey, before, 'it-super-a');

    const results = await Promise.allSettled([
      service.replace(
        replaceInput(preview.previewToken, before, 'it-super-a', `it-double-1-${suffix}`),
      ),
      service.replace(
        replaceInput(preview.previewToken, before, 'it-super-a', `it-double-2-${suffix}`),
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ response: { code: 'PREVIEW_CONSUMED' } });
    expect(await auditRows()).toHaveLength(auditBefore + 1);
  });

  it('allows exactly one of two concurrent commits that share a baseline', async () => {
    const baseline = await currentKeys();
    expect(baseline.length).toBeGreaterThan(0);
    const auditBefore = (await auditRows()).length;

    // Two previews of the same baseline, two different intentions that both
    // differ from it: A drops ticket.merge, B drops settings.write. A no-op set
    // would be a bad witness — it leaves the baseline intact and would let both
    // requests through.
    const previewA = await service.preview(roleKey, [permissionKeys.settingsWrite], 'it-super-a');
    const previewB = await service.preview(roleKey, [permissionKeys.ticketMerge], 'it-super-b');
    expect(previewA.currentPermissionKeys).toEqual(previewB.currentPermissionKeys);

    const results = await Promise.allSettled([
      service.replace(
        replaceInput(
          previewA.previewToken,
          [permissionKeys.settingsWrite],
          'it-super-a',
          `it-race-a-${suffix}`,
        ),
      ),
      service.replace(
        replaceInput(
          previewB.previewToken,
          [permissionKeys.ticketMerge],
          'it-super-b',
          `it-race-b-${suffix}`,
        ),
      ),
    ]);

    const winnerSets = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(winnerSets).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ response: { code: 'PREVIEW_STALE' } });

    // The winner's set is the role's set, and the log gained exactly one row.
    expect(await currentKeys()).toEqual(winnerSets[0] ?? []);
    const rows = await auditRows();
    expect(rows).toHaveLength(auditBefore + 1);
    expect(rows[rows.length - 1]?.metadata).toMatchObject({
      roleKey,
      previousPermissionKeys: baseline,
    });
  });
});
