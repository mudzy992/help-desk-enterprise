import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ProblemLinksService } from './problem-links.service';
import { problemErrorCodes } from './problems.constants';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/**
 * The gate itself is unit tested (problem-asset-access.spec.ts); this suite
 * proves that the Prisma filters it produces really keep foreign CMDB rows out
 * of the problem pickers, the linked-asset card and the reverse asset card.
 */
const mockScope: { where: Record<string, unknown> | null } = { where: null };
jest.mock('./problem-asset-access', () => ({
  problemAssetAccess: async () => ({ allowed: mockScope.where !== null, where: mockScope.where }),
  assetWhereOf: (access: { allowed: boolean; where: unknown }) => (access.allowed ? (access.where ?? {}) : { id: { in: [] } }),
}));
jest.mock('./problem-ticket-visibility', () => ({ problemTicketVisibility: jest.fn(async () => ({})) }));

describeIfDatabase('problem CMDB link scope (BA-problems-03, integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let links: ProblemLinksService;
  let insideUnitId: string;
  let insidePath: string;
  let insideAssetId: string;
  let secondInsideAssetId: string;
  let foreignAssetId: string;
  let foreignTag: string;
  let problemId: string;
  let ticketId: string;
  let requesterId: string;
  const stamp = `${Date.now()}-${process.pid}`;
  const viewer = { userId: 'u1' } as never;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    insidePath = `/problem-assets-${stamp}`;
    const insideUnit = await prisma.organizationalUnit.create({
      data: { name: `Problem assets ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=ProblemAssets${stamp}`, ouPath: insidePath },
    });
    insideUnitId = insideUnit.id;
    const foreignUnit = await prisma.organizationalUnit.create({
      data: { name: `Foreign problem assets ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=ForeignProblemAssets${stamp}`, ouPath: `/foreign-problem-assets-${stamp}` },
    });
    const type = await prisma.assetType.create({ data: { key: `problem-scope-${stamp}`, nameBs: `Tip ${stamp}`, nameEn: `Type ${stamp}` } });
    const createAsset = async (tag: string, name: string, organizationalUnitId: string) =>
      (await prisma.asset.create({ data: { assetTag: tag, name, organizationalUnitId, typeId: type.id, status: 'IN_USE' }, select: { id: true } })).id;
    insideAssetId = await createAsset(`INSIDE-ONE-${stamp}`, `Inside one ${stamp}`, insideUnitId);
    secondInsideAssetId = await createAsset(`INSIDE-TWO-${stamp}`, `Inside two ${stamp}`, insideUnitId);
    foreignTag = `FOREIGN-${stamp}`;
    foreignAssetId = await createAsset(foreignTag, `Foreign ${stamp}`, foreignUnit.id);

    const category = await prisma.serviceCategory.create({ data: { name: `Problem assets ${stamp}`, slug: `problem-assets-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Problem assets ${stamp}`, slug: `problem-assets-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    requesterId = (await prisma.user.create({ data: { email: `problem-assets-${stamp}@example.test`, displayName: 'Requester' } })).id;
    const sequence = (Date.now() % 1_000_000_000) + 1;
    problemId = (await prisma.problem.create({ data: { sequence, title: `Problem assets ${stamp}`, description: 'Integration', organizationalUnitId: insideUnitId } })).id;
    ticketId = (await prisma.ticket.create({
      data: {
        ticketNumber: `PROBLEM-ASSETS-${stamp}`, title: 'Ticket', description: 'Integration', formData: {},
        priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS',
        serviceId: service.id, formVersionId: form.id, requesterId, originUnitId: insideUnitId,
      } as never,
    })).id;
    await prisma.problemTicket.create({ data: { problemId, ticketId } });
    await prisma.ticketAsset.createMany({
      data: [
        { ticketId, assetId: secondInsideAssetId, isPrimary: true },
        { ticketId, assetId: foreignAssetId, isPrimary: false },
      ],
    });

    const access = {
      require: jest.fn(async () => ({ all: true, paths: [] })),
      configuration: jest.fn(async () => ({ numberPrefix: 'P-' })),
      cmdbEnabled: jest.fn(async () => true),
      statusPageEnabled: jest.fn(async () => false),
      hasGroupAuthority: jest.fn(async () => true),
      requireGroupAuthority: jest.fn(async () => undefined),
      capabilities: jest.fn(async () => ({ enabled: true, canRead: true, configuration: { numberPrefix: 'P-' } })),
    };
    // W7.29: the link card also asks the service catalog and the status page
    // what this user may read; the most restrictive context keeps the focus of
    // this suite on the CMDB scope.
    const loader = { loadBySubjectId: jest.fn(async () => null) };
    links = new ProblemLinksService(prisma as never, access as never, loader as never, {} as never);
  });

  beforeEach(async () => {
    await prisma.problemAsset.deleteMany({ where: { problemId } });
    await prisma.problemEvent.deleteMany({ where: { problemId } });
    mockScope.where = { organizationalUnit: { OR: [{ ouPath: insidePath }, { ouPath: { startsWith: `${insidePath}/` } }] } };
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('searches only CMDB items inside the asset scope', async () => {
    const result = await links.searchAssets(problemId, viewer, 'INSIDE');
    // Picker order is the asset tag, not the id.
    expect(result.items.map((item) => item.assetTag)).toEqual([`INSIDE-ONE-${stamp}`, `INSIDE-TWO-${stamp}`]);
    const foreign = await links.searchAssets(problemId, viewer, foreignTag);
    expect(foreign.items).toEqual([]);
  });

  it('refuses to link a foreign item by id', async () => {
    await expect(links.linkAssets(problemId, viewer, [foreignAssetId])).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    expect(await prisma.problemAsset.count({ where: { problemId, assetId: foreignAssetId } })).toBe(0);
    expect(await prisma.problemEvent.count({ where: { problemId } })).toBe(0);
  });

  it('links an in-scope item with one history event', async () => {
    expect(await links.linkAssets(problemId, viewer, [insideAssetId])).toEqual({ linked: 1 });
    expect(await prisma.problemAsset.count({ where: { problemId, assetId: insideAssetId } })).toBe(1);
    expect(await prisma.problemEvent.count({ where: { problemId, action: 'asset_linked' } })).toBe(1);
  });

  it('hides foreign linked items and foreign suggestions on the link card', async () => {
    await prisma.problemAsset.create({ data: { problemId, assetId: foreignAssetId } });
    await prisma.problemAsset.create({ data: { problemId, assetId: insideAssetId } });
    const card = await links.get(problemId, viewer);
    expect(card.assets.map((asset) => asset.id)).toEqual([insideAssetId]);
    expect(card.suggestedAssets.map((asset) => asset.id)).toEqual([secondInsideAssetId]);
  });

  it('refuses to unlink a foreign item and keeps the link', async () => {
    await prisma.problemAsset.create({ data: { problemId, assetId: foreignAssetId } });
    await expect(links.unlinkAsset(problemId, viewer, foreignAssetId)).rejects.toMatchObject({ code: problemErrorCodes.assetNotFound });
    expect(await prisma.problemAsset.count({ where: { problemId, assetId: foreignAssetId } })).toBe(1);
  });

  it('answers the reverse card only for a readable item', async () => {
    await prisma.problemAsset.create({ data: { problemId, assetId: insideAssetId } });
    const inside = await links.forAsset(insideAssetId, viewer);
    expect(inside.items.map((item) => item.id)).toEqual([problemId]);
    expect(await links.forAsset(foreignAssetId, viewer)).toEqual({ items: [] });
  });
});
