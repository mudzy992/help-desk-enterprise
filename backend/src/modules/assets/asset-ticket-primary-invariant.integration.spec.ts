import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { AssetTicketsService } from './asset-tickets.service';
import type { AssetScope, AssetViewer } from './asset-viewer';
import { lockTicketAssetPrimaryGroups } from './asset-ticket-primary-lock';
import { copyTicketAssets } from '../tickets/assets/transfer-ticket-assets';
import { AssetAccessService } from './asset-access.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset ticket primary invariant (PostgreSQL acceptance, W7.8)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let unitId: string;
  let categoryId: string;
  let serviceId: string;
  let formVersionId: string;
  let actorId: string;
  let typeId: string;
  let stamp: string;
  let ticketSequence = 0;
  let assetSequence = 0;
  const ticketIds = new Set<string>();
  const assetIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `W7.8 primary unit ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=W78Primary${stamp}`,
        ouPath: `/w78-primary-${stamp}`,
      },
      select: { id: true },
    });
    const category = await prisma.serviceCategory.create({
      data: { name: `W7.8 primary category ${stamp}`, slug: `w78-primary-cat-${stamp}` },
      select: { id: true },
    });
    const service = await prisma.service.create({
      data: {
        name: `W7.8 primary service ${stamp}`,
        slug: `w78-primary-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: 'ACTIVE',
      },
      select: { id: true },
    });
    const form = await prisma.formVersion.create({
      data: { serviceId: service.id, version: 1, schema: {} },
      select: { id: true },
    });
    const actor = await prisma.user.create({
      data: {
        email: `w78-primary-${stamp}@example.invalid`,
        displayName: 'W7.8 primary acceptance',
      },
      select: { id: true },
    });
    const type = await prisma.assetType.create({
      data: {
        key: `w78-primary-${stamp}`,
        nameBs: `W7.8 primarna veza ${stamp}`,
        nameEn: `W7.8 primary link ${stamp}`,
      },
      select: { id: true },
    });

    unitId = unit.id;
    categoryId = category.id;
    serviceId = service.id;
    formVersionId = form.id;
    actorId = actor.id;
    typeId = type.id;
  });

  afterEach(async () => {
    const currentTickets = [...ticketIds];
    if (currentTickets.length > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: currentTickets } } });
      ticketIds.clear();
    }
    const currentAssets = [...assetIds];
    if (currentAssets.length > 0) {
      await prisma.asset.deleteMany({ where: { id: { in: currentAssets } } });
      assetIds.clear();
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.asset.deleteMany({ where: { typeId } });
      await prisma.assetType.deleteMany({ where: { id: typeId } });
      await prisma.formVersion.deleteMany({ where: { id: formVersionId } });
      await prisma.service.deleteMany({ where: { id: serviceId } });
      await prisma.serviceCategory.deleteMany({ where: { id: categoryId } });
      await prisma.user.deleteMany({ where: { id: actorId } });
      await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
      await prisma.$disconnect();
    }
  });

  async function createTicket(): Promise<string> {
    ticketSequence += 1;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `W78-${stamp}-${ticketSequence}`,
        title: `W7.8 primary ticket ${ticketSequence}`,
        description: 'TicketAsset primary invariant acceptance fixture',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        status: 'PENDING',
        serviceId,
        formVersionId,
        requesterId: actorId,
        originUnitId: unitId,
      } as never,
      select: { id: true },
    });
    ticketIds.add(ticket.id);
    return ticket.id;
  }

  async function createAssets(count: number): Promise<string[]> {
    const created = await Promise.all(
      Array.from({ length: count }, async () => {
        assetSequence += 1;
        const sequence = assetSequence;
        const asset = await prisma.asset.create({
          data: {
            assetTag: `W78-TAP-${stamp}-${sequence}`,
            typeId,
            name: `W7.8 primary asset ${sequence}`,
            organizationalUnitId: unitId,
          },
          select: { id: true },
        });
        assetIds.add(asset.id);
        return asset.id;
      }),
    );
    return created;
  }

  function makeService(scope: () => Promise<AssetScope> = async () => ({ all: true })) {
    const access = {
      isEnabled: async () => true,
      requireEnabled: async () => undefined,
      scope,
    } as unknown as AssetAccessService;
    const service = new AssetTicketsService(prisma as never, access, {} as never, {} as never, {} as never);
    const testable = service as unknown as {
      loadTicket: (
        ticketId: string,
        viewer: AssetViewer,
        writable: boolean,
      ) => Promise<{ ticket: unknown; access: { visibility: string } }>;
      afterWrite: (...args: unknown[]) => Promise<void>;
      list: (...args: unknown[]) => Promise<unknown>;
    };
    testable.loadTicket = async (ticketId) => ({
      ticket: await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      access: { visibility: 'staff' },
    });
    testable.afterWrite = async () => undefined;
    testable.list = async () => ({ enabled: true, canEdit: true, items: [] });
    return service;
  }

  const viewer = (): AssetViewer => ({
    userId: actorId,
    isSuperAdmin: false,
    homeOrganizationalUnitId: unitId,
    grants: [{ permission: permissionKeys.assetRead, global: true, unitPath: null }],
  });

  async function primaryRows(ticketId: string) {
    return prisma.ticketAsset.findMany({
      where: { ticketId },
      orderBy: [{ linkedAt: 'asc' }, { assetId: 'asc' }],
      select: { assetId: true, isPrimary: true },
    });
  }

  it('rejects a transaction that commits links without a primary and rolls it back', async () => {
    const ticketId = await createTicket();
    const [assetId] = await createAssets(1);

    await expect(
      prisma.$transaction((transaction) =>
        transaction.ticketAsset.create({
          data: { ticketId, assetId: assetId!, isPrimary: false, linkedByUserId: actorId },
        }),
      ),
    ).rejects.toBeDefined();
    expect(await prisma.ticketAsset.count({ where: { ticketId } })).toBe(0);
  });

  it('rejects two primary rows through the partial unique index', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);

    await expect(
      prisma.ticketAsset.createMany({
        data: [
          { ticketId, assetId: firstAssetId!, isPrimary: true, linkedByUserId: actorId },
          { ticketId, assetId: secondAssetId!, isPrimary: true, linkedByUserId: actorId },
        ],
      }),
    ).rejects.toBeDefined();
    expect(await prisma.ticketAsset.count({ where: { ticketId } })).toBe(0);
  });

  it('permits an atomic primary switch but rejects a committed zero-primary intermediate state', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    await prisma.ticketAsset.createMany({
      data: [
        { ticketId, assetId: firstAssetId!, isPrimary: true, linkedByUserId: actorId },
        { ticketId, assetId: secondAssetId!, isPrimary: false, linkedByUserId: actorId },
      ],
    });

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.ticketAsset.updateMany({ where: { ticketId }, data: { isPrimary: false } });
      }),
    ).rejects.toBeDefined();
    expect((await primaryRows(ticketId)).filter((row) => row.isPrimary).map((row) => row.assetId)).toEqual([firstAssetId]);

    await prisma.$transaction(async (transaction) => {
      await lockTicketAssetPrimaryGroups(transaction, [ticketId]);
      await transaction.ticketAsset.updateMany({ where: { ticketId }, data: { isPrimary: false } });
      await transaction.ticketAsset.update({
        where: { ticketId_assetId: { ticketId, assetId: secondAssetId! } },
        data: { isPrimary: true },
      });
    });
    expect((await primaryRows(ticketId)).filter((row) => row.isPrimary).map((row) => row.assetId)).toEqual([secondAssetId]);
  });

  it('serializes simultaneous application links and keeps both links with one primary', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    let arrivals = 0;
    let release!: () => void;
    const bothScopesReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = makeService(async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothScopesReady;
      return { all: true };
    });

    const results = await Promise.allSettled([
      service.link(ticketId, { assetId: firstAssetId! }, viewer()),
      service.link(ticketId, { assetId: secondAssetId! }, viewer()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const rows = await primaryRows(ticketId);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.isPrimary)).toHaveLength(1);
  });

  it('serializes direct concurrent primary inserts at the database boundary', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    let arrivals = 0;
    let release!: () => void;
    const bothTransactionsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcomes = await Promise.allSettled(
      [firstAssetId!, secondAssetId!].map((assetId) =>
        prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT pg_backend_pid()`;
          arrivals += 1;
          if (arrivals === 2) release();
          await bothTransactionsReady;
          return transaction.ticketAsset.create({
            data: { ticketId, assetId, isPrimary: true, linkedByUserId: actorId },
          });
        }),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await primaryRows(ticketId)).filter((row) => row.isPrimary)).toHaveLength(1);
  });

  it('sets a requested primary and promotes the oldest remaining link when it is unlinked', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    const now = Date.now();
    await prisma.ticketAsset.createMany({
      data: [
        {
          ticketId,
          assetId: firstAssetId!,
          isPrimary: true,
          linkedByUserId: actorId,
          linkedAt: new Date(now - 2_000),
        },
        {
          ticketId,
          assetId: secondAssetId!,
          isPrimary: false,
          linkedByUserId: actorId,
          linkedAt: new Date(now - 1_000),
        },
      ],
    });
    const service = makeService();

    await service.setPrimary(ticketId, secondAssetId!, viewer());
    expect((await primaryRows(ticketId)).filter((row) => row.isPrimary).map((row) => row.assetId)).toEqual([secondAssetId]);

    await service.unlink(ticketId, secondAssetId!, viewer());
    expect((await primaryRows(ticketId)).filter((row) => row.isPrimary).map((row) => row.assetId)).toEqual([firstAssetId]);
  });

  it('copies merge/split links under ordered source/target locks without replacing an existing primary', async () => {
    const sourceTicketId = await createTicket();
    const targetTicketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    await prisma.ticketAsset.createMany({
      data: [
        { ticketId: sourceTicketId, assetId: firstAssetId!, isPrimary: true, linkedByUserId: actorId },
        { ticketId: sourceTicketId, assetId: secondAssetId!, isPrimary: false, linkedByUserId: actorId },
        { ticketId: targetTicketId, assetId: secondAssetId!, isPrimary: true, linkedByUserId: actorId },
      ],
    });

    await prisma.$transaction((transaction) =>
      copyTicketAssets(transaction as never, sourceTicketId, targetTicketId, actorId),
    );
    const targetRows = await primaryRows(targetTicketId);
    expect(targetRows).toHaveLength(2);
    expect(targetRows.filter((row) => row.isPrimary).map((row) => row.assetId)).toEqual([secondAssetId]);
  });

  it('allows a ticket cascade to remove all links without a false primary violation', async () => {
    const ticketId = await createTicket();
    const [firstAssetId, secondAssetId] = await createAssets(2);
    await prisma.ticketAsset.createMany({
      data: [
        { ticketId, assetId: firstAssetId!, isPrimary: true, linkedByUserId: actorId },
        { ticketId, assetId: secondAssetId!, isPrimary: false, linkedByUserId: actorId },
      ],
    });

    await prisma.ticket.delete({ where: { id: ticketId } });
    expect(await prisma.ticketAsset.count({ where: { ticketId } })).toBe(0);
  });
});
