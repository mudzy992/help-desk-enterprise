import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService, type SaveAssetAttributeInput } from './asset-catalog.service';
import type { AssetAttributeDefinition } from './asset-attributes';
import { assetErrorCodes } from './assets.constants';
import type { AssetViewer } from './asset-viewer';
import { AssetImportService, type ImportActor } from './import/asset-import.service';
import type { ImportAssetState, PlannedRow } from './import/plan-asset-import';
import { AssetsService } from './assets.service';
import { isUniqueAssetAttributeValueConflict } from './asset-unique-attributes';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset unique custom attributes (PostgreSQL concurrency acceptance, W7.5)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let access: AssetAccessService;
  let assets: AssetsService;
  let catalog: AssetCatalogService;
  let imports: AssetImportService;
  let viewer: AssetViewer;
  let importActor: ImportActor;
  let unitId: string;
  let typeId: string;
  let actorId: string;
  let hostnameAttributeId: string;
  let catalogAttributeId: string;
  let stamp: string;
  let sequence = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = {
      getSetting: async (key: string) => (key === settingKeys.privateAddonsCmdb ? true : undefined),
    };
    access = new AssetAccessService(prisma as never, settings as never);
    assets = new AssetsService(prisma as never, access, { assertDirectMoveAllowed: async () => undefined } as never);
    catalog = new AssetCatalogService(prisma as never, access);
    imports = new AssetImportService(prisma as never, access, assets);

    stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const [unit, actor, type] = await Promise.all([
      prisma.organizationalUnit.create({
        data: {
          name: `W7.5 unique unit ${stamp}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=W75Unique${stamp}`,
          ouPath: `/w75-unique-${stamp}`,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: { email: `w75-unique-actor-${stamp}@example.invalid`, displayName: 'W7.5 unique acceptance' },
        select: { id: true },
      }),
      prisma.assetType.create({
        data: {
          key: `w75-unique-${stamp}`,
          nameBs: `W7.5 oprema ${stamp}`,
          nameEn: `W7.5 equipment ${stamp}`,
        },
        select: { id: true },
      }),
    ]);
    unitId = unit.id;
    actorId = actor.id;
    typeId = type.id;
    viewer = {
      userId: actorId,
      isSuperAdmin: false,
      homeOrganizationalUnitId: unitId,
      grants: [
        { permission: permissionKeys.assetManage, global: true, unitPath: null },
        { permission: permissionKeys.assetTypeManage, global: true, unitPath: null },
        { permission: permissionKeys.assetImport, global: true, unitPath: null },
      ],
    };
    importActor = { userId: actorId, scope: { all: true } };

    const [hostname, catalogCode] = await Promise.all([
      prisma.assetAttribute.create({
        data: {
          typeId,
          key: 'hostname',
          labelBs: 'Naziv računara',
          labelEn: 'Hostname',
          dataType: 'TEXT',
          isUnique: true,
        },
        select: { id: true },
      }),
      prisma.assetAttribute.create({
        data: {
          typeId,
          key: 'catalogCode',
          labelBs: 'Kataloški kod',
          labelEn: 'Catalog code',
          dataType: 'TEXT',
          isUnique: false,
        },
        select: { id: true },
      }),
    ]);
    hostnameAttributeId = hostname.id;
    catalogAttributeId = catalogCode.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (typeId) {
        await prisma.assetImportJob.deleteMany({ where: { typeId } });
        await prisma.asset.deleteMany({ where: { typeId } });
        await prisma.assetType.deleteMany({ where: { id: typeId } });
      }
      if (actorId) await prisma.user.deleteMany({ where: { id: actorId } });
      if (unitId) await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
      await prisma.$disconnect();
    }
  });

  function nextTag(prefix = 'MANUAL') {
    sequence += 1;
    return `W75-${prefix}-${stamp}-${sequence}`;
  }

  async function createManual(attributes: Record<string, unknown>, prefix = 'MANUAL') {
    return assets.create(
      {
        assetTag: nextTag(prefix),
        typeId,
        name: `W7.5 unique asset ${sequence}`,
        status: 'IN_STOCK',
        organizationalUnitId: unitId,
        attributes,
      },
      viewer,
    );
  }

  async function updateManual(id: string, attributes: Record<string, unknown>) {
    const current = await prisma.asset.findUniqueOrThrow({
      where: { id },
      select: { assetTag: true, typeId: true, name: true, status: true, organizationalUnitId: true, version: true },
    });
    return assets.update(
      id,
      {
        assetTag: current.assetTag,
        typeId: current.typeId,
        name: current.name,
        status: current.status,
        organizationalUnitId: current.organizationalUnitId,
        attributes,
        version: current.version,
      },
      viewer,
    );
  }

  function catalogInput(isUnique: boolean): SaveAssetAttributeInput {
    return {
      key: 'catalogCode',
      labelBs: 'Kataloški kod',
      labelEn: 'Catalog code',
      dataType: 'TEXT',
      isRequired: false,
      isUnique,
      sortOrder: 0,
    };
  }

  function importState(assetTag: string, hostname: string): ImportAssetState {
    return {
      assetTag,
      name: `Imported ${assetTag}`,
      status: 'IN_STOCK',
      serialNumber: null,
      manufacturer: null,
      model: null,
      organizationalUnitId: unitId,
      assignedUserId: null,
      locationId: null,
      serviceId: null,
      purchaseDate: null,
      purchaseCost: null,
      supplier: null,
      warrantyEndsAt: null,
      notes: null,
      attributes: { hostname },
    };
  }

  async function createImportJob(row: PlannedRow, mode: 'CREATE_ONLY' | 'UPSERT', totals: Prisma.InputJsonValue) {
    const tag = row.data.assetTag ?? `W75-IMPORT-${stamp}`;
    return prisma.assetImportJob.create({
      data: {
        typeId,
        fileName: `${tag}.csv`,
        fileSha256: `${stamp}${tag}`.slice(0, 64).padEnd(64, '0'),
        status: 'PREVIEW',
        mode,
        allOrNothing: true,
        rows: { headers: [], mapping: [], planned: [row], errorRows: [] } as unknown as Prisma.InputJsonValue,
        totals,
        errors: [] as Prisma.InputJsonValue,
        createdByUserId: actorId,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
  }

  async function transactionsFromSameBarrier<T>(
    tasks: readonly ((transaction: Prisma.TransactionClient) => Promise<T>)[],
  ): Promise<PromiseSettledResult<T>[]> {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    return Promise.allSettled(
      tasks.map((task) =>
        prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT pg_backend_pid()`;
          arrivals += 1;
          if (arrivals === tasks.length) release();
          await barrier;
          return task(transaction);
        }),
      ),
    );
  }

  it('uses the PostgreSQL unique index as the final arbiter for simultaneous direct writes', async () => {
    const canonicalValue = `pg-race-${stamp}`;
    const outcomes = await transactionsFromSameBarrier([
      (transaction) =>
        transaction.asset.create({
          data: {
            assetTag: nextTag('PG-A'),
            typeId,
            name: 'Direct PostgreSQL contender A',
            organizationalUnitId: unitId,
            attributes: { hostname: canonicalValue },
          },
          select: { id: true },
        }),
      (transaction) =>
        transaction.asset.create({
          data: {
            assetTag: nextTag('PG-B'),
            typeId,
            name: 'Direct PostgreSQL contender B',
            organizationalUnitId: unitId,
            attributes: { hostname: canonicalValue.toUpperCase() },
          },
          select: { id: true },
        }),
    ]);
    const winners = outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ id: string }> => outcome.status === 'fulfilled');
    const losers = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(isUniqueAssetAttributeValueConflict(losers[0]?.reason)).toBe(true);
    await expect(
      prisma.assetUniqueAttributeValue.count({ where: { attributeId: hostnameAttributeId, canonicalValue } }),
    ).resolves.toBe(1);
  });

  it('keeps manual create/update values in sync and translates DB conflicts to the domain error', async () => {
    const first = await createManual({ hostname: `manual-first-${stamp}` });
    const second = await createManual({ hostname: `manual-second-${stamp}` });

    await expect(
      updateManual(first.id, { hostname: `MANUAL-SECOND-${stamp}` }),
    ).rejects.toMatchObject({ code: assetErrorCodes.attributeNotUnique });
    await expect(
      prisma.assetUniqueAttributeValue.findMany({
        where: { attributeId: hostnameAttributeId },
        orderBy: { canonicalValue: 'asc' },
        select: { assetId: true, canonicalValue: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { assetId: first.id, canonicalValue: `manual-first-${stamp}` },
        { assetId: second.id, canonicalValue: `manual-second-${stamp}` },
      ]),
    );

    await updateManual(first.id, { hostname: `manual-updated-${stamp}` });
    await expect(
      prisma.assetUniqueAttributeValue.findFirst({
        where: { attributeId: hostnameAttributeId, canonicalValue: `manual-updated-${stamp}` },
        select: { assetId: true },
      }),
    ).resolves.toEqual({ assetId: first.id });
    await expect(createManual({ hostname: `MANUAL-UPDATED-${stamp}` })).rejects.toMatchObject({
      code: assetErrorCodes.attributeNotUnique,
    });
  });

  it('lets only one racing manual update claim a canonical value', async () => {
    const first = await createManual({ hostname: `update-race-first-${stamp}` });
    const second = await createManual({ hostname: `update-race-second-${stamp}` });
    const target = `update-race-target-${stamp}`;
    const internal = assets as unknown as {
      assertUniqueAttributes: (
        checkedTypeId: string,
        definitions: readonly AssetAttributeDefinition[],
        attributes: Readonly<Record<string, unknown>>,
        selfId: string | null,
      ) => Promise<void>;
    };
    const original = internal.assertUniqueAttributes;
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    internal.assertUniqueAttributes = async (checkedTypeId, definitions, attributes, selfId) => {
      await original.call(assets, checkedTypeId, definitions, attributes, selfId);
      arrivals += 1;
      if (arrivals === 2) release();
      await barrier;
    };

    let outcomes: PromiseSettledResult<{ id: string; version: number }>[] = [];
    try {
      outcomes = await Promise.allSettled([
        updateManual(first.id, { hostname: target }),
        updateManual(second.id, { hostname: target.toUpperCase() }),
      ]);
    } finally {
      internal.assertUniqueAttributes = original;
      release();
    }

    const winners = outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ id: string; version: number }> => outcome.status === 'fulfilled');
    const losers = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.reason).toMatchObject({ code: assetErrorCodes.attributeNotUnique });
    await expect(
      prisma.assetUniqueAttributeValue.count({ where: { attributeId: hostnameAttributeId, canonicalValue: target } }),
    ).resolves.toBe(1);
    await expect(
      prisma.assetUniqueAttributeValue.count({
        where: { attributeId: hostnameAttributeId, assetId: { in: [first.id, second.id] } },
      }),
    ).resolves.toBe(2);
  });

  it('serializes import create apply with a stale manual pre-check and retains one canonical value', async () => {
    const hostname = `import-race-${stamp}`;
    const importTag = nextTag('IMPORT');
    const job = await createImportJob(
      {
        row: 2,
        action: 'create',
        assetId: null,
        version: null,
        data: importState(importTag, hostname),
        changes: [],
      },
      'CREATE_ONLY',
      { total: 1, create: 1, update: 0, unchanged: 0, skipped: 0, errors: 0 },
    );
    const internal = assets as unknown as {
      assertUniqueAttributes: (
        checkedTypeId: string,
        definitions: readonly AssetAttributeDefinition[],
        attributes: Readonly<Record<string, unknown>>,
        selfId: string | null,
      ) => Promise<void>;
    };
    const original = internal.assertUniqueAttributes;
    let markPrechecked!: () => void;
    const prechecked = new Promise<void>((resolve) => {
      markPrechecked = resolve;
    });
    let releaseManual!: () => void;
    const manualGate = new Promise<void>((resolve) => {
      releaseManual = resolve;
    });
    internal.assertUniqueAttributes = async (checkedTypeId, definitions, attributes, selfId) => {
      await original.call(assets, checkedTypeId, definitions, attributes, selfId);
      markPrechecked();
      await manualGate;
    };

    const manual = assets.create(
      {
        assetTag: nextTag('MANUAL-RACE'),
        typeId,
        name: 'Manual race contender',
        organizationalUnitId: unitId,
        attributes: { hostname: hostname.toUpperCase() },
      },
      viewer,
    );
    try {
      await prechecked;
      await expect(imports.apply(job.id, importActor)).resolves.toMatchObject({
        id: job.id,
        status: 'APPLIED',
        applied: { created: 1, updated: 0, failed: 0 },
      });
      releaseManual();
      await expect(manual).rejects.toMatchObject({ code: assetErrorCodes.attributeNotUnique });
    } finally {
      releaseManual();
      internal.assertUniqueAttributes = original;
    }

    await expect(
      prisma.assetUniqueAttributeValue.count({ where: { attributeId: hostnameAttributeId, canonicalValue: hostname } }),
    ).resolves.toBe(1);
    await expect(
      prisma.asset.count({ where: { typeId, attributes: { path: ['hostname'], equals: hostname } } }),
    ).resolves.toBe(1);
  });

  it('reports the existing duplicate error when an import preview loses to a later manual create', async () => {
    const hostname = `manual-wins-import-${stamp}`;
    const importTag = nextTag('STALE-IMPORT');
    const job = await createImportJob(
      {
        row: 2,
        action: 'create',
        assetId: null,
        version: null,
        data: importState(importTag, hostname),
        changes: [],
      },
      'CREATE_ONLY',
      { total: 1, create: 1, update: 0, unchanged: 0, skipped: 0, errors: 0 },
    );
    const manual = await createManual({ hostname: hostname.toUpperCase() });

    await expect(imports.apply(job.id, importActor)).rejects.toMatchObject({ code: assetErrorCodes.attributeNotUnique });
    await expect(prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } })).resolves.toEqual({ status: 'FAILED' });
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: hostnameAttributeId, canonicalValue: hostname } })).resolves.toBe(1);
    await expect(prisma.asset.count({ where: { assetTag: importTag } })).resolves.toBe(0);
    await expect(prisma.assetUniqueAttributeValue.findFirst({
      where: { attributeId: hostnameAttributeId, canonicalValue: hostname },
      select: { assetId: true },
    })).resolves.toEqual({ assetId: manual.id });
  });

  it('rewrites the canonical value when import apply updates an existing asset', async () => {
    const created = await createManual({ hostname: `import-update-before-${stamp}` });
    const current = await prisma.asset.findUniqueOrThrow({ where: { id: created.id }, select: { assetTag: true, version: true } });
    const nextHostname = `import-update-after-${stamp}`;
    const job = await createImportJob(
      {
        row: 2,
        action: 'update',
        assetId: created.id,
        version: current.version,
        data: importState(current.assetTag, nextHostname),
        changes: ['attributes.hostname'],
      },
      'UPSERT',
      { total: 1, create: 0, update: 1, unchanged: 0, skipped: 0, errors: 0 },
    );

    await expect(imports.apply(job.id, importActor)).resolves.toMatchObject({
      id: job.id,
      status: 'APPLIED',
      applied: { created: 0, updated: 1, failed: 0 },
    });
    await expect(
      prisma.assetUniqueAttributeValue.findFirst({
        where: { attributeId: hostnameAttributeId, canonicalValue: `import-update-before-${stamp}` },
        select: { assetId: true },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.assetUniqueAttributeValue.findFirst({
        where: { attributeId: hostnameAttributeId, canonicalValue: nextHostname },
        select: { assetId: true },
      }),
    ).resolves.toEqual({ assetId: created.id });
  });

  it('backfills and removes canonical rows atomically when isUnique or archivedAt changes', async () => {
    const first = await createManual({ hostname: `catalog-host-a-${stamp}`, catalogCode: `duplicate-${stamp}` });
    const second = await createManual({ hostname: `catalog-host-b-${stamp}`, catalogCode: `DUPLICATE-${stamp}` });

    await expect(catalog.updateAttribute(catalogAttributeId, catalogInput(true), viewer)).rejects.toMatchObject({
      code: assetErrorCodes.attributeNotUnique,
    });
    await expect(prisma.assetAttribute.findUniqueOrThrow({ where: { id: catalogAttributeId }, select: { isUnique: true } })).resolves.toEqual({ isUnique: false });
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(0);

    await updateManual(second.id, { hostname: `catalog-host-b-${stamp}`, catalogCode: `catalog-code-b-${stamp}` });
    await catalog.updateAttribute(catalogAttributeId, catalogInput(true), viewer);
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(2);

    await catalog.updateAttribute(catalogAttributeId, catalogInput(false), viewer);
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(0);
    await catalog.updateAttribute(catalogAttributeId, catalogInput(true), viewer);
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(2);

    await catalog.setAttributeArchived(catalogAttributeId, true, viewer);
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(0);
    const secondAttributes = (await prisma.asset.findUniqueOrThrow({ where: { id: second.id }, select: { attributes: true } })).attributes as Record<string, unknown>;
    await prisma.asset.update({
      where: { id: second.id },
      data: { attributes: { ...secondAttributes, catalogCode: `duplicate-${stamp}` } as Prisma.InputJsonValue },
    });
    await expect(catalog.setAttributeArchived(catalogAttributeId, false, viewer)).rejects.toMatchObject({
      code: assetErrorCodes.attributeNotUnique,
    });
    await expect(prisma.assetAttribute.findUniqueOrThrow({ where: { id: catalogAttributeId }, select: { archivedAt: true } })).resolves.toMatchObject({ archivedAt: expect.any(Date) });

    await prisma.asset.update({
      where: { id: second.id },
      data: { attributes: { ...secondAttributes, catalogCode: `catalog-code-b-${stamp}` } as Prisma.InputJsonValue },
    });
    await catalog.setAttributeArchived(catalogAttributeId, false, viewer);
    await expect(prisma.assetUniqueAttributeValue.count({ where: { attributeId: catalogAttributeId } })).resolves.toBe(2);
    expect(first.id).not.toBe(second.id);
  });
});
