import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { settingKeys } from '../settings/setting-keys';
import { AssetAccessService } from './asset-access.service';
import { AssetContractsService } from './asset-contracts.service';
import { AssetsService } from './assets.service';
import type { AssetViewer } from './asset-viewer';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('asset relation and contract display scope (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let assets: AssetsService;
  let contracts: AssetContractsService;
  let scopedViewer: AssetViewer;
  let globalViewer: AssetViewer;
  let rootAssetId: string;
  let visibleChildAssetId: string;
  let foreignOutgoingAssetId: string;
  let foreignIncomingAssetId: string;
  let contractId: string;
  let visibleChildTag: string;
  let foreignOutgoingTag: string;
  let foreignIncomingTag: string;
  let foreignOutgoingName: string;
  let foreignIncomingName: string;
  let foreignTypeNameBs: string;
  let foreignTypeNameEn: string;
  let outgoingForeignRelationId: string;
  let incomingForeignRelationId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const settings = {
      getSetting: async (key: string) => (key === settingKeys.privateAddonsCmdb ? true : undefined),
    };
    const access = new AssetAccessService(prisma as never, settings as never);
    assets = new AssetsService(prisma as never, access, {} as never);
    contracts = new AssetContractsService(prisma as never, access);

    const stamp = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const rootPath = `/asset-scope-${stamp}`;
    const rootUnit = await prisma.organizationalUnit.create({
      data: {
        name: `Asset scope root ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=AssetScopeRoot${stamp}`,
        ouPath: rootPath,
      },
    });
    const childUnit = await prisma.organizationalUnit.create({
      data: {
        name: `Asset scope child ${stamp}`,
        type: 'SERVICE',
        distinguishedName: `OU=AssetScopeChild${stamp}`,
        ouPath: `${rootPath}/child`,
        parentId: rootUnit.id,
      },
    });
    const foreignUnit = await prisma.organizationalUnit.create({
      data: {
        name: `Foreign asset scope ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=ForeignAssetScope${stamp}`,
        ouPath: `/foreign-asset-scope-${stamp}`,
      },
    });
    foreignTypeNameBs = `Tajni tip ${stamp}`;
    foreignTypeNameEn = `Foreign type ${stamp}`;
    const [visibleType, foreignType] = await Promise.all([
      prisma.assetType.create({
        data: {
          key: `visible-scope-${stamp}`,
          nameBs: `Vidljivi tip ${stamp}`,
          nameEn: `Visible type ${stamp}`,
        },
      }),
      prisma.assetType.create({
        data: {
          key: `foreign-scope-${stamp}`,
          nameBs: foreignTypeNameBs,
          nameEn: foreignTypeNameEn,
        },
      }),
    ]);

    const createAsset = (input: {
      readonly tag: string;
      readonly name: string;
      readonly organizationalUnitId: string;
      readonly typeId: string;
      readonly status: 'IN_USE' | 'IN_STOCK' | 'LOST' | 'DISPOSED';
    }) =>
      prisma.asset.create({
        data: {
          assetTag: input.tag,
          name: input.name,
          organizationalUnitId: input.organizationalUnitId,
          typeId: input.typeId,
          status: input.status,
        },
        select: { id: true },
      });

    visibleChildTag = `VISIBLE-CHILD-${stamp}`;
    foreignOutgoingTag = `FOREIGN-OUT-${stamp}`;
    foreignIncomingTag = `FOREIGN-IN-${stamp}`;
    foreignOutgoingName = `Foreign outgoing device ${stamp}`;
    foreignIncomingName = `Foreign incoming device ${stamp}`;
    const [rootAsset, visibleChild, foreignOutgoing, foreignIncoming] = await Promise.all([
      createAsset({
        tag: `ASSET-ROOT-${stamp}`,
        name: `Root asset ${stamp}`,
        organizationalUnitId: rootUnit.id,
        typeId: visibleType.id,
        status: 'IN_USE',
      }),
      createAsset({
        tag: visibleChildTag,
        name: `Visible child device ${stamp}`,
        organizationalUnitId: childUnit.id,
        typeId: visibleType.id,
        status: 'IN_STOCK',
      }),
      createAsset({
        tag: foreignOutgoingTag,
        name: foreignOutgoingName,
        organizationalUnitId: foreignUnit.id,
        typeId: foreignType.id,
        status: 'LOST',
      }),
      createAsset({
        tag: foreignIncomingTag,
        name: foreignIncomingName,
        organizationalUnitId: foreignUnit.id,
        typeId: foreignType.id,
        status: 'DISPOSED',
      }),
    ]);
    rootAssetId = rootAsset.id;
    visibleChildAssetId = visibleChild.id;
    foreignOutgoingAssetId = foreignOutgoing.id;
    foreignIncomingAssetId = foreignIncoming.id;

    const [, , outgoingForeignRelation, incomingForeignRelation] = await Promise.all([
      prisma.assetRelation.create({
        data: { fromAssetId: rootAsset.id, toAssetId: visibleChild.id, kind: 'DEPENDS_ON' },
      }),
      prisma.assetRelation.create({
        // Keep the display fixture acyclic while still exercising the incoming direction.
        data: { fromAssetId: visibleChild.id, toAssetId: rootAsset.id, kind: 'CONNECTED_TO' },
      }),
      prisma.assetRelation.create({
        data: { fromAssetId: rootAsset.id, toAssetId: foreignOutgoing.id, kind: 'RUNS_ON' },
      }),
      prisma.assetRelation.create({
        data: { fromAssetId: foreignIncoming.id, toAssetId: rootAsset.id, kind: 'PART_OF' },
      }),
    ]);
    outgoingForeignRelationId = outgoingForeignRelation.id;
    incomingForeignRelationId = incomingForeignRelation.id;

    const contract = await prisma.assetContract.create({
      data: {
        kind: 'SUPPORT',
        supplier: `Scoped supplier ${stamp}`,
        reference: `ASCOPE-${stamp}`,
        endsAt: new Date(Date.now() + 365 * 86_400_000),
        organizationalUnitId: rootUnit.id,
      },
      select: { id: true },
    });
    contractId = contract.id;
    await prisma.assetContractItem.createMany({
      data: [
        { contractId, assetId: rootAsset.id },
        { contractId, assetId: visibleChild.id },
        { contractId, assetId: foreignOutgoing.id },
      ],
    });

    scopedViewer = {
      userId: `asset-scope-viewer-${stamp}`,
      isSuperAdmin: false,
      homeOrganizationalUnitId: rootUnit.id,
      grants: [{ permission: permissionKeys.assetRead, global: false, unitPath: rootPath }],
    };
    globalViewer = {
      ...scopedViewer,
      grants: [{ permission: permissionKeys.assetRead, global: true, unitPath: null }],
    };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('filters both relation directions and only returns a count for foreign endpoints', async () => {
    const detail = await assets.detail(rootAssetId, scopedViewer);
    const payload = JSON.stringify(detail);
    const visibleIds = detail.relations.map((relation) => relation.asset.id);

    expect(visibleIds).toHaveLength(2);
    expect(visibleIds).toEqual(expect.arrayContaining([visibleChildAssetId, visibleChildAssetId]));
    expect(detail.relationHiddenCount).toBe(2);
    expect(payload).toContain(visibleChildTag);
    for (const marker of [
      foreignOutgoingAssetId,
      foreignIncomingAssetId,
      foreignOutgoingTag,
      foreignIncomingTag,
      foreignOutgoingName,
      foreignIncomingName,
      foreignTypeNameBs,
      foreignTypeNameEn,
      'LOST',
      'DISPOSED',
      outgoingForeignRelationId,
      incomingForeignRelationId,
    ]) {
      expect(payload).not.toContain(marker);
    }

    const globalDetail = await assets.detail(rootAssetId, globalViewer);
    expect(globalDetail.relationHiddenCount).toBe(0);
    expect(globalDetail.relations).toHaveLength(4);
    expect(JSON.stringify(globalDetail)).toContain(foreignOutgoingAssetId);
    expect(JSON.stringify(globalDetail)).toContain(foreignIncomingAssetId);
  });

  it('filters contract items by asset scope and keeps their IDs and fields out of the response', async () => {
    const detail = await contracts.detail(contractId, scopedViewer);
    const payload = JSON.stringify(detail);

    expect(detail.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([rootAssetId, visibleChildAssetId]),
    );
    expect(detail.items).toHaveLength(2);
    expect(detail.items.every((item) => item.canOpen)).toBe(true);
    expect(detail.itemCount).toBe(2);
    expect(detail.hiddenItemsCount).toBe(1);
    for (const marker of [
      foreignOutgoingAssetId,
      foreignOutgoingTag,
      foreignOutgoingName,
      foreignTypeNameBs,
      foreignTypeNameEn,
      'LOST',
    ]) {
      expect(payload).not.toContain(marker);
    }

    const globalDetail = await contracts.detail(contractId, globalViewer);
    expect(globalDetail.itemCount).toBe(3);
    expect(globalDetail.hiddenItemsCount).toBe(0);
    expect(globalDetail.items.map((item) => item.id)).toContain(foreignOutgoingAssetId);
  });
});
