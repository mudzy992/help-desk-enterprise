import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { settingKeys } from '../settings/setting-keys';
import { assetErrorCodes } from './assets.constants';
import { AssetImportService, assetImportLimits, type ImportActor } from './import/asset-import.service';
import type { ImportAssetState, PlannedRow } from './import/plan-asset-import';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset import apply lease and recovery (PostgreSQL acceptance, W7.13)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let imports: AssetImportService;
  let actor: ImportActor;
  let unitId: string;
  let typeId: string;
  let actorId: string;
  let stamp: string;
  let sequence = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    imports = makeService(defaultAccess());
    stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const [unit, user, type] = await Promise.all([
      prisma.organizationalUnit.create({
        data: {
          name: `W7.13 import unit ${stamp}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=W713Import${stamp}`,
          ouPath: `/w713-import-${stamp}`,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: { email: `w713-import-actor-${stamp}@example.invalid`, displayName: 'W7.13 import acceptance' },
        select: { id: true },
      }),
      prisma.assetType.create({
        data: {
          key: `w713-import-${stamp}`,
          nameBs: `W7.13 oprema ${stamp}`,
          nameEn: `W7.13 equipment ${stamp}`,
        },
        select: { id: true },
      }),
    ]);
    unitId = unit.id;
    actorId = user.id;
    typeId = type.id;
    actor = { userId: actorId, scope: { all: true } };
  });

  afterAll(async () => {
    if (!prisma) return;
    if (typeId) {
      await prisma.assetImportJob.deleteMany({ where: { typeId } });
      await prisma.asset.deleteMany({ where: { typeId } });
      await prisma.assetType.deleteMany({ where: { id: typeId } });
    }
    if (actorId) await prisma.user.deleteMany({ where: { id: actorId } });
    if (unitId) await prisma.organizationalUnit.deleteMany({ where: { id: unitId } });
    await prisma.$disconnect();
  });

  function nextTag(label: string) {
    sequence += 1;
    return `W713-${label}-${stamp}-${sequence}`;
  }

  function assetState(assetTag: string, name: string): ImportAssetState {
    return {
      assetTag,
      name,
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
      attributes: {},
    };
  }

  function createRow(row: number, tag: string, name: string): PlannedRow {
    return {
      row,
      action: 'create',
      assetId: null,
      version: null,
      data: assetState(tag, name),
      changes: [],
    };
  }

  async function createJob(
    rows: readonly PlannedRow[],
    options: {
      readonly allOrNothing?: boolean;
      readonly status?: 'PREVIEW' | 'APPLYING';
      readonly progress?: { cursor: number; created: number; updated: number; failed: number; failures: [] };
      readonly expiredLease?: boolean;
      readonly attempts?: number;
      readonly runToken?: string;
    } = {},
  ) {
    const status = options.status ?? 'PREVIEW';
    return prisma.assetImportJob.create({
      data: {
        typeId,
        fileName: `W7.13-${nextTag('file')}.csv`,
        fileSha256: randomUUID().replaceAll('-', ''),
        status,
        mode: 'CREATE_ONLY',
        allOrNothing: options.allOrNothing ?? false,
        rows: { headers: [], mapping: [], planned: rows, errorRows: [] } as unknown as Prisma.InputJsonValue,
        totals: {
          total: rows.length,
          create: rows.filter((row) => row.action === 'create').length,
          update: rows.filter((row) => row.action === 'update').length,
          unchanged: 0,
          skipped: 0,
          errors: 0,
          ...(options.progress
            ? { applied: { created: options.progress.created, updated: options.progress.updated, failed: options.progress.failed } }
            : {}),
        } as Prisma.InputJsonValue,
        errors: [] as Prisma.InputJsonValue,
        createdByUserId: actorId,
        expiresAt: new Date(Date.now() + 60_000),
        ...(status === 'APPLYING'
          ? {
              applyRunToken: options.runToken ?? randomUUID(),
              applyLeaseUntil: new Date(Date.now() - (options.expiredLease ? 1_000 : 0)),
              applyProgress: options.progress
                ? (options.progress as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
              applyAttempts: options.attempts ?? 1,
            }
          : {}),
      },
    });
  }

  function makeService(access: {
    readSetting: <T>(key: string, fallback: T) => Promise<T>;
  }): AssetImportService {
    return new AssetImportService(prisma as never, access as never, {} as never);
  }

  function defaultAccess() {
    return {
      readSetting: async <T>(_key: string, fallback: T): Promise<T> => fallback,
    };
  }

  function gatedAccess() {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      entered,
      release,
      access: {
        readSetting: async <T>(key: string, fallback: T): Promise<T> => {
          if (key === settingKeys.privateAssetsCurrency) {
            enter();
            await gate;
          }
          return fallback;
        },
      },
    };
  }

  async function createPersistedAsset(row: PlannedRow) {
    return prisma.asset.create({
      data: {
        assetTag: row.data.assetTag!,
        typeId,
        name: row.data.name,
        status: row.data.status,
        organizationalUnitId: row.data.organizationalUnitId,
        source: 'IMPORT',
      },
      select: { id: true, assetTag: true },
    });
  }

  it('claims atomically, rejects a concurrent apply, and leaves preview expiry untouched', async () => {
    const row = createRow(2, nextTag('race'), 'Concurrent import row');
    const job = await createJob([row]);
    const gate = gatedAccess();
    const firstApply = makeService(gate.access).apply(job.id, actor);
    await gate.entered;

    const claimed = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(claimed.status).toBe('APPLYING');
    expect(claimed.applyRunToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(claimed.applyLeaseUntil?.getTime()).toBeGreaterThan(
      Date.now() + assetImportLimits.applyLeaseMs - 5_000,
    );
    expect(claimed.expiresAt.getTime()).toBe(job.expiresAt.getTime());
    await expect(imports.apply(job.id, actor)).rejects.toMatchObject({
      code: assetErrorCodes.importApplying,
    });
    await expect(imports.discard(job.id, actor)).rejects.toMatchObject({
      code: assetErrorCodes.importApplying,
    });
    const listed = await imports.list(actor);
    expect(listed.items.find((item) => item.id === job.id)).toMatchObject({
      status: 'APPLYING',
      applyLeaseUntil: expect.any(String),
    });

    gate.release();
    await expect(firstApply).resolves.toMatchObject({
      id: job.id,
      status: 'APPLIED',
      applied: { created: 1, updated: 0, failed: 0 },
    });
    const finished = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('APPLIED');
    expect(finished.applyRunToken).toBeNull();
    expect(finished.applyLeaseUntil).toBeNull();
    expect(finished.applyProgress).toBeNull();
    expect(finished.applyAttempts).toBe(1);
    await expect(prisma.asset.count({ where: { assetTag: row.data.assetTag! } })).resolves.toBe(1);
  });

  it('reclaims an expired lease with a fresh token and fences the stale runner', async () => {
    const row = createRow(2, nextTag('fence'), 'Fenced import row');
    const job = await createJob([row]);
    const staleGate = gatedAccess();
    const staleApply = makeService(staleGate.access).apply(job.id, actor);
    await staleGate.entered;
    const staleClaim = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    const staleToken = staleClaim.applyRunToken;
    expect(staleToken).not.toBeNull();

    await prisma.assetImportJob.update({
      where: { id: job.id },
      data: { applyLeaseUntil: new Date(Date.now() - 1_000) },
    });
    const recoveryGate = gatedAccess();
    const recoveryApply = makeService(recoveryGate.access).apply(job.id, actor);
    await recoveryGate.entered;
    const recoveredClaim = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(recoveredClaim.applyRunToken).not.toBe(staleToken);
    expect(recoveredClaim.applyAttempts).toBe(2);
    expect(recoveredClaim.expiresAt.getTime()).toBe(job.expiresAt.getTime());

    staleGate.release();
    await expect(staleApply).rejects.toMatchObject({ code: assetErrorCodes.importApplying });
    recoveryGate.release();
    await expect(recoveryApply).resolves.toMatchObject({
      id: job.id,
      status: 'APPLIED',
      applied: { created: 1, updated: 0, failed: 0 },
    });
    await expect(prisma.asset.count({ where: { assetTag: row.data.assetTag! } })).resolves.toBe(1);
    await expect(
      prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id }, select: { applyAttempts: true, status: true } }),
    ).resolves.toEqual({ applyAttempts: 2, status: 'APPLIED' });
  });

  it('resumes after a committed batch checkpoint without repeating prior rows', async () => {
    const first = createRow(2, nextTag('checkpoint-a'), 'Previously committed row');
    const second = createRow(3, nextTag('checkpoint-b'), 'Row after recovery');
    const job = await createJob([first, second], {
      status: 'APPLYING',
      expiredLease: true,
      attempts: 1,
      runToken: randomUUID(),
      progress: { cursor: 1, created: 1, updated: 0, failed: 0, failures: [] },
    });
    await createPersistedAsset(first);

    await expect(imports.apply(job.id, actor)).resolves.toMatchObject({
      id: job.id,
      status: 'APPLIED',
      applied: { created: 2, updated: 0, failed: 0 },
    });
    await expect(
      prisma.asset.count({ where: { typeId, assetTag: { in: [first.data.assetTag!, second.data.assetTag!] } } }),
    ).resolves.toBe(2);
    const finished = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.applyAttempts).toBe(2);
    expect(finished.applyProgress).toBeNull();
    expect(finished.status).toBe('APPLIED');
  });

  it('reconciles a fully checkpointed run that crashed before terminal finalization', async () => {
    const first = createRow(2, nextTag('final-a'), 'Final checkpoint row A');
    const second = createRow(3, nextTag('final-b'), 'Final checkpoint row B');
    const job = await createJob([first, second], {
      status: 'APPLYING',
      expiredLease: true,
      attempts: 1,
      runToken: randomUUID(),
      progress: { cursor: 2, created: 2, updated: 0, failed: 0, failures: [] },
    });
    await Promise.all([createPersistedAsset(first), createPersistedAsset(second)]);

    await expect(imports.apply(job.id, actor)).resolves.toMatchObject({
      id: job.id,
      status: 'APPLIED',
      applied: { created: 2, updated: 0, failed: 0 },
    });
    await expect(
      prisma.asset.count({ where: { typeId, assetTag: { in: [first.data.assetTag!, second.data.assetTag!] } } }),
    ).resolves.toBe(2);
    await expect(
      prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id }, select: { status: true, applyAttempts: true } }),
    ).resolves.toEqual({ status: 'APPLIED', applyAttempts: 2 });
  });

  it('rolls back all-or-nothing asset writes and finalizes FAILED after a stale update', async () => {
    const rowToCreate = createRow(2, nextTag('atomic-new'), 'Must roll back');
    const existingTag = nextTag('atomic-existing');
    const existing = await prisma.asset.create({
      data: {
        assetTag: existingTag,
        typeId,
        name: 'Original name',
        status: 'IN_STOCK',
        organizationalUnitId: unitId,
        version: 2,
      },
      select: { id: true },
    });
    const staleUpdate: PlannedRow = {
      row: 3,
      action: 'update',
      assetId: existing.id,
      version: 1,
      changes: ['name'],
      data: assetState(existingTag, 'Must not update'),
    };
    const job = await createJob([rowToCreate, staleUpdate], { allOrNothing: true });

    await expect(imports.apply(job.id, actor)).rejects.toMatchObject({
      code: assetErrorCodes.versionConflict,
    });
    await expect(prisma.asset.count({ where: { assetTag: rowToCreate.data.assetTag! } })).resolves.toBe(0);
    await expect(
      prisma.asset.findUniqueOrThrow({ where: { id: existing.id }, select: { name: true, version: true } }),
    ).resolves.toEqual({ name: 'Original name', version: 2 });
    const finished = await prisma.assetImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe('FAILED');
    expect(finished.totals).toMatchObject({ applied: { created: 0, updated: 0, failed: 2 } });
    expect(finished.applyRunToken).toBeNull();
    expect(finished.applyLeaseUntil).toBeNull();
    expect(finished.rows).toBeNull();
    expect(finished.applyAttempts).toBe(1);
  });
});
