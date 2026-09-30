import type { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import { applyAssetTypeRouting, resolveCreateTicketAsset } from './resolve-create-ticket-asset';
import { copyTicketAssets } from './transfer-ticket-assets';

function settingsPrisma(settings: Record<string, unknown>, asset: unknown) {
  const findFirst = jest.fn().mockResolvedValue(asset);
  const prisma = {
    appSetting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(where.key in settings ? { value: settings[where.key] } : null),
      ),
    },
    asset: { findFirst },
  } as unknown as PrismaService;
  return { prisma, findFirst };
}

describe('resolveCreateTicketAsset (paket 3.2 §8)', () => {
  it('returns null without an asset', async () => {
    const { prisma, findFirst } = settingsPrisma({}, null);
    await expect(resolveCreateTicketAsset(prisma, undefined, 'u1')).resolves.toBeNull();
    await expect(resolveCreateTicketAsset(prisma, '  ', 'u1')).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects while the module is off', async () => {
    const { prisma } = settingsPrisma({}, { id: 'a1', assetTag: 'IT-1' });
    await expect(resolveCreateTicketAsset(prisma, 'a1', 'u1')).rejects.toEqual(new TicketsError('ASSET_NOT_SELECTABLE'));
  });

  it('rejects when the picker is switched off', async () => {
    const { prisma } = settingsPrisma(
      { 'private.addons.cmdb': true, 'private.assets.ticketPicker.enabled': false },
      { id: 'a1', assetTag: 'IT-1' },
    );
    await expect(resolveCreateTicketAsset(prisma, 'a1', 'u1')).rejects.toBeInstanceOf(TicketsError);
  });

  it("accepts only the requester's own selectable equipment", async () => {
    const { prisma, findFirst } = settingsPrisma({ 'private.addons.cmdb': true }, { id: 'a1', assetTag: 'IT-1', type: { routingGroupId: 'g-print' } });
    await expect(resolveCreateTicketAsset(prisma, 'a1', 'u1')).resolves.toEqual({ id: 'a1', assetTag: 'IT-1', routingGroupId: 'g-print' });
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'a1',
      assignedUserId: 'u1',
      retiredAt: null,
      status: { in: ['IN_USE', 'IN_REPAIR'] },
      type: { isUserSelectable: true },
    });
  });

  it('rejects foreign or retired equipment', async () => {
    const { prisma } = settingsPrisma({ 'private.addons.cmdb': true }, null);
    await expect(resolveCreateTicketAsset(prisma, 'a2', 'u1')).rejects.toBeInstanceOf(TicketsError);
  });
});

describe('copyTicketAssets (merge/split)', () => {
  function linkPrisma(rows: Record<string, { assetId: string; isPrimary: boolean }[]>) {
    const created: unknown[] = [];
    const prisma = {
      ticketAsset: {
        findMany: jest.fn(({ where }: { where: { ticketId: string } }) => Promise.resolve(rows[where.ticketId] ?? [])),
        create: jest.fn(({ data }: { data: unknown }) => {
          created.push(data);
          return Promise.resolve(data);
        }),
      },
    } as unknown as PrismaService;
    return { prisma, created };
  }

  it('skips in-memory harnesses without the delegate', async () => {
    await expect(copyTicketAssets({} as PrismaService, 't1', 't2', 'u')).resolves.toBe(0);
  });

  it('copies missing links and keeps a single primary', async () => {
    const { prisma, created } = linkPrisma({
      child: [
        { assetId: 'a1', isPrimary: true },
        { assetId: 'a2', isPrimary: false },
      ],
      parent: [{ assetId: 'a2', isPrimary: true }],
    });
    await expect(copyTicketAssets(prisma, 'child', 'parent', 'u')).resolves.toBe(1);
    expect(created).toEqual([{ ticketId: 'parent', assetId: 'a1', isPrimary: false, linkedByUserId: 'u' }]);
  });

  it('carries the primary flag to an empty target', async () => {
    const { prisma, created } = linkPrisma({ parent: [{ assetId: 'a1', isPrimary: true }] });
    await copyTicketAssets(prisma, 'parent', 'split', null);
    expect(created).toEqual([{ ticketId: 'split', assetId: 'a1', isPrimary: true, linkedByUserId: null }]);
  });
});

describe('applyAssetTypeRouting (paket 3.2 C9b)', () => {
  const rule = { status: 'UNROUTED' as const, assignedGroupId: null, routedByUnroutedFallback: false };
  it('keeps the rule result without equipment or without a type group', () => {
    expect(applyAssetTypeRouting(rule, null)).toBe(rule);
    expect(applyAssetTypeRouting(rule, { id: 'a1', assetTag: 'IT-1', routingGroupId: null })).toBe(rule);
  });
  it('sends the ticket to the handler group of the asset type', () => {
    expect(applyAssetTypeRouting(rule, { id: 'a1', assetTag: 'IT-1', routingGroupId: 'g-print' })).toEqual({
      status: 'PENDING',
      assignedGroupId: 'g-print',
      routedByUnroutedFallback: false,
    });
  });
});
