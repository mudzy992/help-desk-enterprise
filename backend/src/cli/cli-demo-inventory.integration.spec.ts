import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { auditLogActions } from '../modules/audit-log/audit-log.constants';
import {
  demoAssetTypeKeys,
  planDemoInventory,
  removeDemoInventory,
  runDemoRemoval,
  runDemoSeed,
} from './assets-demo-inventory';
import { resolveCliOperatorId, type CliOperatorClient } from './safety/cli-operator-audit';

/*
  W1.5 (`BA-xcut-08`), real PostgreSQL: the destructive demo command used to be
  `assets-seed-demo.js --remove` — no reason, no confirmation, no audit row and
  no record of what it removed. This suite proves the replacement end to end:

  - a seed run leaves two audit rows (`started`, `completed`) with the operator
    as actor and the counts the run committed;
  - a second seed writes nothing and says so (it does not stack demo data);
  - `--remove` deletes the demo inventory, keeps the assets tickets still
    reference, and writes its `completed` row **inside the same transaction** as
    the deletes, on the same hash chain;
  - a removal that is rolled back leaves no `completed` row at all.
*/

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('CLI demo inventory guard and operator audit (PostgreSQL, W1.5)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let operatorId: string;
  /** `null` when the install already seeded ADMIN, so the fixture must not delete it. */
  let fixtureRoleKey: string | null = null;
  let unitId: string;
  let serviceId: string;
  let formVersionId: string;
  let stamp: string;
  const command = 'assets-seed-demo';
  const reason = 'demo inventar za W1.5 integracioni dokaz';

  const audit = (outcomeTarget: { environment: 'staging' | 'production'; fingerprint: string }) => ({
    command,
    target: outcomeTarget,
    reason,
    operatorUserId: operatorId,
    confirmation: `${command}@${outcomeTarget.environment}:${outcomeTarget.fingerprint}`,
  });
  const target = { environment: 'staging' as const, fingerprint: 'w15prooffp01' };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    stamp = randomUUID().replaceAll('-', '').slice(0, 12);

    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `W1.5 demo ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=W15Demo${stamp}`,
        ouPath: `/w15-demo-${stamp}`,
      },
      select: { id: true },
    });
    unitId = unit.id;

    const category = await prisma.serviceCategory.create({
      data: { name: `W1.5 demo category ${stamp}`, slug: `w15-demo-cat-${stamp}` },
      select: { id: true },
    });
    const service = await prisma.service.create({
      data: {
        name: `W1.5 demo service ${stamp}`,
        slug: `w15-demo-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: 'ACTIVE',
      },
      select: { id: true },
    });
    serviceId = service.id;
    formVersionId = (
      await prisma.formVersion.create({ data: { serviceId, version: 1, schema: {} }, select: { id: true } })
    ).id;

    // The install seeds the asset-type catalogue, so the fixture must reuse it.
    for (const key of demoAssetTypeKeys) {
      await prisma.assetType.upsert({
        where: { key },
        update: {},
        create: { key, nameBs: `${key} ${stamp}`, nameEn: `${key} ${stamp}` },
      });
    }
    const operator = await prisma.user.create({
      data: { email: `w15-operator-${stamp}@example.invalid`, displayName: 'W1.5 operator' },
      select: { id: true },
    });
    operatorId = operator.id;
    // The guard looks for an administrative role *key*: reuse the seeded ADMIN
    // role when the install created one, otherwise name the fixture role ADMIN.
    const seededAdmin = await prisma.role.findUnique({ where: { key: 'ADMIN' }, select: { id: true } });
    if (seededAdmin !== null) {
      await prisma.userRole.create({ data: { userId: operator.id, roleId: seededAdmin.id } });
      fixtureRoleKey = null;
    } else {
      const role = await prisma.role.create({ data: { key: 'ADMIN', name: 'W1.5 admin' } });
      await prisma.userRole.create({ data: { userId: operator.id, roleId: role.id } });
      fixtureRoleKey = 'ADMIN';
    }
  });

  afterAll(async () => {
    // The suites above remove the inventory through the command itself; this is
    // only the safety net for a failure earlier in the file.
    await prisma.licenseAssignment.deleteMany({ where: { asset: { notes: 'DEMO' } } });
    await prisma.assetContractItem.deleteMany({ where: { asset: { notes: 'DEMO' } } });
    await prisma.assetRelation.deleteMany({
      where: { OR: [{ from: { notes: 'DEMO' } }, { to: { notes: 'DEMO' } }] },
    });
    await prisma.asset.deleteMany({ where: { notes: 'DEMO' } });
    await prisma.assetLocation.deleteMany({ where: { code: { startsWith: 'DEMO-' } } });
    await prisma.licenseAssignment.deleteMany({ where: { license: { notes: 'DEMO' } } });
    await prisma.softwareLicense.deleteMany({ where: { notes: 'DEMO' } });
    await prisma.assetContract.deleteMany({ where: { notes: 'DEMO' } });
    await prisma.auditLog.deleteMany({ where: { action: auditLogActions.cliCommandExecuted } });
    await prisma.userRole.deleteMany({ where: { userId: operatorId } });
    await prisma.user.deleteMany({ where: { id: operatorId } });
    if (fixtureRoleKey !== null) {
      await prisma.role.deleteMany({ where: { key: fixtureRoleKey } });
    }
    // Asset types are part of the install's catalogue: reused, never deleted here.
    await prisma.formVersion.deleteMany({ where: { serviceId } });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
    await prisma.$disconnect();
  });

  it('resolves the operator through its administrative role, not through free text', async () => {
    await expect(
      resolveCliOperatorId(prisma as unknown as CliOperatorClient, `W15-OPERATOR-${stamp}@example.invalid`),
    ).resolves.toBe(operatorId);
    await expect(
      resolveCliOperatorId(prisma as unknown as CliOperatorClient, `missing-${stamp}@example.invalid`),
    ).rejects.toThrow(expect.objectContaining({ reason: 'CLI_OPERATOR_NOT_FOUND' }));
  });

  it('seeds the demo inventory, then audits start and completion with the committed counts', async () => {
    const before = await prisma.auditLog.count({ where: { action: auditLogActions.cliCommandExecuted } });
    const seeded = await runDemoSeed(prisma, audit(target));

    expect(seeded).toMatchObject({ alreadyPresent: false, unitPath: `/w15-demo-${stamp}`, missingAssetTypes: [] });
    expect(seeded.assets).toBeGreaterThan(30);
    expect(seeded.locations).toBe(4);
    expect(seeded.licenses).toBe(4);
    expect(seeded.contracts).toBe(2);

    const rows = await prisma.auditLog.findMany({
      where: { action: auditLogActions.cliCommandExecuted },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        entityType: true,
        entityId: true,
        actorUserId: true,
        organizationalUnitId: true,
        chainPartition: true,
        metadata: true,
        previousHash: true,
        hash: true,
      },
    });
    expect(rows).toHaveLength(before + 2);
    const [started, completed] = rows.slice(-2);
    expect(started).toMatchObject({
      entityType: 'cli_command',
      entityId: `${command}@staging:w15prooffp01`,
      actorUserId: operatorId,
      organizationalUnitId: null,
      chainPartition: 'global',
      metadata: expect.objectContaining({ outcome: 'started', mode: 'apply', targetFingerprint: 'w15prooffp01' }),
    });
    expect((started?.metadata as { counts?: unknown }).counts).toBeUndefined();
    expect(completed?.metadata).toMatchObject({
      outcome: 'completed',
      counts: { assets: seeded.assets, locations: 4, licenses: 4, contracts: 2 },
    });
    // One chain: the completion row commits to the start row it follows.
    expect(completed?.previousHash).toBe(started?.hash);
    expect(await prisma.asset.count({ where: { notes: 'DEMO', assetTag: { startsWith: 'DEMO-' } } })).toBe(seeded.assets);
  });

  it('refuses to stack a second inventory and still records the attempt', async () => {
    const demoBefore = await prisma.asset.count({ where: { notes: 'DEMO' } });
    const second = await runDemoSeed(prisma, audit(target));
    expect(second).toMatchObject({ alreadyPresent: true, assets: 0 });
    expect(await prisma.asset.count({ where: { notes: 'DEMO' } })).toBe(demoBefore);
    const rows = await prisma.auditLog.findMany({
      where: { action: auditLogActions.cliCommandExecuted },
      orderBy: [{ createdAt: 'desc' }],
      take: 1,
      select: { metadata: true },
    });
    expect(rows[0]?.metadata).toMatchObject({ outcome: 'started' });
    await expect(planDemoInventory(prisma)).resolves.toMatchObject({ alreadyPresent: true });
  });

  it('removes the inventory, keeps ticket-referenced demo assets and audits the counts in the same transaction', async () => {
    const demoAssets = await prisma.asset.findMany({
      where: { notes: 'DEMO' },
      select: { id: true },
      orderBy: { assetTag: 'asc' },
    });
    const linked = demoAssets[0]!;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `W15-${stamp}`,
        title: `W1.5 linked demo asset ${stamp}`,
        description: 'ticket that keeps a demo asset alive',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        status: 'PENDING',
        serviceId,
        formVersionId,
        requesterId: operatorId,
        originUnitId: unitId,
      } as never,
      select: { id: true },
    });
    await prisma.ticketAsset.create({ data: { ticketId: ticket.id, assetId: linked.id, isPrimary: true } });

    const removed = await runDemoRemoval(prisma, audit(target));
    expect(removed.retainedReferencedAssets).toBe(1);
    expect(removed.assets).toBe(demoAssets.length - 1);
    // Licences assigned to people are never unlinked: they are counted, not deleted.
    expect(removed.licenses + removed.retainedLicenses).toBe(4);
    expect(removed.retainedLicenses).toBeGreaterThan(0);
    expect(removed.locations).toBeGreaterThan(0);
    expect(await prisma.asset.findMany({ where: { notes: 'DEMO' }, select: { id: true } })).toEqual([{ id: linked.id }]);

    const completed = await prisma.auditLog.findFirst({
      where: { action: auditLogActions.cliCommandExecuted, metadata: { path: ['outcome'], equals: 'completed' } },
      orderBy: [{ createdAt: 'desc' }],
      select: { metadata: true, actorUserId: true, entityId: true, hash: true, previousHash: true },
    });
    expect(completed?.actorUserId).toBe(operatorId);
    expect(completed?.entityId).toBe(`${command}@staging:w15prooffp01`);
    expect(completed?.metadata).toMatchObject({
      outcome: 'completed',
      counts: { assets: removed.assets, locations: removed.locations, retainedAssets: 1 },
    });
    const previous = await prisma.auditLog.findFirst({
      where: { hash: completed?.previousHash ?? 'missing' },
      select: { hash: true },
    });
    expect(previous?.hash).toBe(completed?.previousHash);

    // Once the ticket no longer references it, the same command finishes the job:
    // the second run removes the kept asset and reports nothing retained.
    await prisma.ticketAsset.deleteMany({ where: { ticketId: ticket.id } });
    const second = await runDemoRemoval(prisma, audit(target));
    expect(second).toMatchObject({ assets: 1, retainedReferencedAssets: 0, totalDemoAssets: 1 });
    expect(await prisma.asset.count({ where: { notes: 'DEMO' } })).toBe(0);
    expect(await prisma.assetLocation.count({ where: { code: { startsWith: 'DEMO-' } } })).toBe(0);

    await prisma.ticket.deleteMany({ where: { id: ticket.id } });
  });

  it('leaves no completion row when the destructive transaction is rolled back', async () => {
    await prisma.asset.create({
      data: {
        assetTag: 'DEMO-9999',
        typeId: (await prisma.assetType.findFirstOrThrow({ where: { key: 'laptop' }, select: { id: true } })).id,
        name: 'W1.5 rollback asset',
        status: 'IN_STOCK',
        organizationalUnitId: unitId,
        source: 'IMPORT',
        notes: 'DEMO',
      },
    });
    const completedBefore = await prisma.auditLog.count({
      where: { action: auditLogActions.cliCommandExecuted, metadata: { path: ['outcome'], equals: 'completed' } },
    });
    await expect(
      prisma.$transaction(async (transaction) => {
        await removeDemoInventory(transaction);
        // A failure after the deletes must take them back with the audit row.
        throw new Error('W1_5_FORCED_ROLLBACK');
      }),
    ).rejects.toThrow('W1_5_FORCED_ROLLBACK');
    expect(await prisma.asset.count({ where: { assetTag: 'DEMO-9999' } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: auditLogActions.cliCommandExecuted, metadata: { path: ['outcome'], equals: 'completed' } },
      }),
    ).toBe(completedBefore);
  });
});
