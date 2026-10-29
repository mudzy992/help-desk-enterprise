import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { AssetsService } from './assets.service';
import { AssetError, assetErrorCodes } from './assets.constants';
import type { AssetViewer } from './asset-viewer';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset version/CAS custody contract (PostgreSQL integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let assets: AssetsService;
  let viewer: AssetViewer;
  let unitId: string;
  let typeId: string;
  let firstUserId: string;
  let secondUserId: string;
  let stamp: string;
  let sequence = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = {
      getSetting: async (key: string) => (key === settingKeys.privateAddonsCmdb ? true : undefined),
    };
    const access = new AssetAccessService(prisma as never, settings as never);
    const transfers = { assertDirectMoveAllowed: async () => undefined };
    assets = new AssetsService(prisma as never, access, transfers as never);

    stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Asset CAS unit ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=AssetCAS${stamp}`,
        ouPath: `/asset-cas-${stamp}`,
      },
      select: { id: true },
    });
    unitId = unit.id;
    const type = await prisma.assetType.create({
      data: {
        key: `asset-cas-${stamp}`,
        nameBs: `CAS oprema ${stamp}`,
        nameEn: `CAS equipment ${stamp}`,
      },
      select: { id: true },
    });
    typeId = type.id;
    const [actor, firstUser, secondUser] = await Promise.all([
      prisma.user.create({
        data: { email: `asset-cas-actor-${stamp}@example.invalid`, displayName: 'CAS operator' },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `asset-cas-first-${stamp}@example.invalid`,
          displayName: 'First custodian',
          organizationalUnitId: unitId,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          email: `asset-cas-second-${stamp}@example.invalid`,
          displayName: 'Second custodian',
          organizationalUnitId: unitId,
        },
        select: { id: true },
      }),
    ]);
    firstUserId = firstUser.id;
    secondUserId = secondUser.id;
    viewer = {
      userId: actor.id,
      isSuperAdmin: false,
      homeOrganizationalUnitId: unitId,
      grants: [{ permission: permissionKeys.assetManage, global: true, unitPath: null }],
    };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createAsset(input: {
    readonly status: 'IN_STOCK' | 'IN_USE';
    readonly assignedUserId?: string;
  }): Promise<string> {
    sequence += 1;
    const row = await prisma.asset.create({
      data: {
        assetTag: `CAS-${stamp}-${sequence}`,
        name: `CAS test asset ${sequence}`,
        typeId,
        organizationalUnitId: unitId,
        status: input.status,
        ...(input.assignedUserId
          ? { assignedUserId: input.assignedUserId, assignedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    return row.id;
  }

  async function stateOf(id: string) {
    return prisma.asset.findUniqueOrThrow({
      where: { id },
      select: { status: true, version: true, assignedUserId: true, assignedAt: true },
    });
  }

  async function eventsOf(id: string) {
    return prisma.assetEvent.findMany({
      where: { assetId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { action: true, detail: true },
    });
  }

  /** Forces competing service requests to use the same real PostgreSQL snapshot. */
  async function runFromSameSnapshot<T>(
    assetId: string,
    tasks: readonly (() => Promise<T>)[],
  ): Promise<PromiseSettledResult<T>[]> {
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const internal = assets as unknown as {
      loadInScope: (id: string, scope: unknown) => Promise<{ id: string }>;
    };
    const original = internal.loadInScope;
    internal.loadInScope = async (id, scope) => {
      const current = await original.call(assets, id, scope);
      if (id === assetId) {
        arrivals += 1;
        if (arrivals === tasks.length) release();
        await barrier;
      }
      return current;
    };
    try {
      return await Promise.allSettled(tasks.map((task) => task()));
    } finally {
      internal.loadInScope = original;
    }
  }

  function winningRequest<T>(outcomes: readonly PromiseSettledResult<T>[]) {
    const successes = outcomes.flatMap((outcome, index) =>
      outcome.status === 'fulfilled' ? [{ index, value: outcome.value }] : [],
    );
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(AssetError);
    expect(failures[0]?.reason).toMatchObject({ code: assetErrorCodes.versionConflict });
    const winner = successes[0];
    if (!winner) throw new Error('Nije pronađen pobjednički CAS zahtjev.');
    return winner;
  }

  it('requires a fresh version for general PUT and rejects a stale overwrite without another event', async () => {
    const id = await createAsset({ status: 'IN_STOCK' });
    const current = await prisma.asset.findUniqueOrThrow({
      where: { id },
      select: { assetTag: true, typeId: true, organizationalUnitId: true, version: true },
    });
    const first = await assets.update(
      id,
      {
        assetTag: current.assetTag,
        typeId: current.typeId,
        name: 'Versioned first edit',
        organizationalUnitId: current.organizationalUnitId,
        notes: 'Pobjednička izmjena',
        attributes: {},
        version: current.version,
      },
      viewer,
    );
    expect(first).toEqual({ id, version: current.version + 1 });

    await expect(
      assets.update(
        id,
        {
          assetTag: current.assetTag,
          typeId: current.typeId,
          name: 'Stale overwrite',
          organizationalUnitId: current.organizationalUnitId,
          notes: 'Ova izmjena ne smije proći',
          attributes: {},
          version: current.version,
        },
        viewer,
      ),
    ).rejects.toMatchObject({ code: assetErrorCodes.versionConflict });

    const [state, events] = await Promise.all([stateOf(id), eventsOf(id)]);
    expect(state).toMatchObject({ version: 2, status: 'IN_STOCK', assignedUserId: null });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id }, select: { name: true, notes: true } }))).toEqual({
      name: 'Versioned first edit',
      notes: 'Pobjednička izmjena',
    });
    expect(events.map((event) => event.action)).toEqual(['updated']);
  });

  it('rejects a stale status request without a second status or custody event', async () => {
    const id = await createAsset({ status: 'IN_STOCK' });
    await expect(
      assets.changeStatus(id, { status: 'IN_REPAIR', version: 1 }, viewer),
    ).resolves.toEqual({ id, status: 'IN_REPAIR', version: 2 });
    await expect(
      assets.changeStatus(id, { status: 'LOST', reason: 'Stari zahtjev', version: 1 }, viewer),
    ).rejects.toMatchObject({ code: assetErrorCodes.versionConflict });

    const [state, events] = await Promise.all([stateOf(id), eventsOf(id)]);
    expect(state).toMatchObject({ status: 'IN_REPAIR', version: 2, assignedUserId: null });
    expect(events.map((event) => event.action)).toEqual(['status']);
    expect(events[0]?.detail).toMatchObject({ from: 'IN_STOCK', to: 'IN_REPAIR' });
  });

  it('rejects a stale assignment and preserves the winning holder and sole assignment event', async () => {
    const id = await createAsset({ status: 'IN_STOCK' });
    await expect(
      assets.assign(id, { userId: firstUserId, version: 1 }, viewer),
    ).resolves.toEqual({ id, version: 2 });
    await expect(
      assets.assign(id, { userId: secondUserId, version: 1 }, viewer),
    ).rejects.toMatchObject({ code: assetErrorCodes.versionConflict });

    const [state, events] = await Promise.all([stateOf(id), eventsOf(id)]);
    expect(state).toMatchObject({ status: 'IN_USE', version: 2, assignedUserId: firstUserId });
    expect(events.map((event) => event.action)).toEqual(['assigned']);
    expect(events[0]?.detail).toMatchObject({ userId: firstUserId, statusFrom: 'IN_STOCK', statusTo: 'IN_USE' });
  });

  it('rejects a stale unassignment and does not clear or re-event the current custody', async () => {
    const id = await createAsset({ status: 'IN_USE', assignedUserId: firstUserId });
    await expect(
      assets.unassign(id, { status: 'IN_STOCK', version: 1 }, viewer),
    ).resolves.toEqual({ id, version: 2 });
    await expect(
      assets.unassign(id, { status: 'IN_REPAIR', note: 'Stari zahtjev', version: 1 }, viewer),
    ).rejects.toMatchObject({ code: assetErrorCodes.versionConflict });

    const [state, events] = await Promise.all([stateOf(id), eventsOf(id)]);
    expect(state).toMatchObject({ status: 'IN_STOCK', version: 2, assignedUserId: null, assignedAt: null });
    expect(events.map((event) => event.action)).toEqual(['unassigned']);
    expect(events[0]?.detail).toMatchObject({ userId: firstUserId, statusFrom: 'IN_USE', statusTo: 'IN_STOCK' });
  });

  it('rejects a racing stale retirement without clearing the holder or releasing an installed license', async () => {
    const id = await createAsset({ status: 'IN_USE', assignedUserId: firstUserId });
    const license = await prisma.softwareLicense.create({
      data: { productName: `CAS license ${stamp}`, kind: 'PER_DEVICE', organizationalUnitId: unitId },
      select: { id: true },
    });
    await prisma.licenseAssignment.create({ data: { licenseId: license.id, assetId: id } });

    let markStaleRequestLoaded!: () => void;
    const staleRequestLoaded = new Promise<void>((resolve) => {
      markStaleRequestLoaded = resolve;
    });
    let releaseStaleRequest!: () => void;
    const staleRequestGate = new Promise<void>((resolve) => {
      releaseStaleRequest = resolve;
    });
    const internal = assets as unknown as {
      loadInScope: (assetId: string, scope: unknown) => Promise<{ id: string }>;
    };
    const original = internal.loadInScope;
    let pauseFirstLoad = true;
    internal.loadInScope = async (assetId, scope) => {
      const current = await original.call(assets, assetId, scope);
      if (assetId === id && pauseFirstLoad) {
        pauseFirstLoad = false;
        markStaleRequestLoaded();
        await staleRequestGate;
      }
      return current;
    };

    const staleRetirement = assets.changeStatus(
      id,
      { status: 'RETIRED', reason: 'Zastarjeli retirement', version: 1 },
      viewer,
    );
    try {
      await staleRequestLoaded;
      await expect(
        assets.changeStatus(id, { status: 'IN_REPAIR', version: 1 }, viewer),
      ).resolves.toEqual({ id, status: 'IN_REPAIR', version: 2 });
      releaseStaleRequest();
      await expect(staleRetirement).rejects.toMatchObject({ code: assetErrorCodes.versionConflict });
    } finally {
      releaseStaleRequest();
      internal.loadInScope = original;
    }

    const [state, events, assignmentCount] = await Promise.all([
      stateOf(id),
      eventsOf(id),
      prisma.licenseAssignment.count({ where: { assetId: id } }),
    ]);
    expect(state).toMatchObject({ status: 'IN_REPAIR', version: 2, assignedUserId: firstUserId });
    expect(assignmentCount).toBe(1);
    expect(events.map((event) => event.action)).toEqual(['status']);
    expect(events[0]?.detail).toMatchObject({ from: 'IN_USE', to: 'IN_REPAIR' });
  });

  it('allows only one parallel status CAS; the losing LOST request cannot release the holder', async () => {
    const id = await createAsset({ status: 'IN_USE', assignedUserId: firstUserId });
    const outcomes = await runFromSameSnapshot(id, [
      () => assets.changeStatus(id, { status: 'LOST', reason: 'Paralelna promjena', version: 1 }, viewer),
      () => assets.changeStatus(id, { status: 'IN_REPAIR', version: 1 }, viewer),
    ]);
    const winner = winningRequest(outcomes);
    const finalState = await stateOf(id);
    const events = await eventsOf(id);
    const winningStatus = winner.index === 0 ? 'LOST' : 'IN_REPAIR';

    expect(winner.value).toEqual({ id, status: winningStatus, version: 2 });
    expect(finalState).toMatchObject({ status: winningStatus, version: 2 });
    expect(events.filter((event) => event.action === 'status')).toHaveLength(1);
    expect(events.find((event) => event.action === 'status')?.detail).toMatchObject({
      from: 'IN_USE',
      to: winningStatus,
    });
    if (winningStatus === 'LOST') {
      expect(finalState.assignedUserId).toBeNull();
      expect(events.map((event) => event.action).sort()).toEqual(['status', 'unassigned']);
      expect(events.find((event) => event.action === 'unassigned')?.detail).toMatchObject({
        userId: firstUserId,
        automatic: true,
      });
    } else {
      expect(finalState.assignedUserId).toBe(firstUserId);
      expect(events.map((event) => event.action)).toEqual(['status']);
    }
  });

  it('allows only one parallel assignment CAS and records only the final custodian', async () => {
    const id = await createAsset({ status: 'IN_STOCK' });
    const outcomes = await runFromSameSnapshot(id, [
      () => assets.assign(id, { userId: firstUserId, version: 1 }, viewer),
      () => assets.assign(id, { userId: secondUserId, version: 1 }, viewer),
    ]);
    const winner = winningRequest(outcomes);
    const winningUserId = winner.index === 0 ? firstUserId : secondUserId;
    const [finalState, events] = await Promise.all([stateOf(id), eventsOf(id)]);

    expect(winner.value).toEqual({ id, version: 2 });
    expect(finalState).toMatchObject({ status: 'IN_USE', version: 2, assignedUserId: winningUserId });
    expect(events.map((event) => event.action)).toEqual(['assigned']);
    expect(events[0]?.detail).toMatchObject({ userId: winningUserId });
  });

  it('allows only one parallel unassignment CAS and records one matching custody transition', async () => {
    const id = await createAsset({ status: 'IN_USE', assignedUserId: firstUserId });
    const outcomes = await runFromSameSnapshot(id, [
      () => assets.unassign(id, { status: 'IN_STOCK', version: 1 }, viewer),
      () => assets.unassign(id, { status: 'IN_REPAIR', version: 1 }, viewer),
    ]);
    const winner = winningRequest(outcomes);
    const winningStatus = winner.index === 0 ? 'IN_STOCK' : 'IN_REPAIR';
    const [finalState, events] = await Promise.all([stateOf(id), eventsOf(id)]);

    expect(winner.value).toEqual({ id, version: 2 });
    expect(finalState).toMatchObject({ status: winningStatus, version: 2, assignedUserId: null, assignedAt: null });
    expect(events.map((event) => event.action)).toEqual(['unassigned']);
    expect(events[0]?.detail).toMatchObject({
      userId: firstUserId,
      statusFrom: 'IN_USE',
      statusTo: winningStatus,
    });
  });
});
