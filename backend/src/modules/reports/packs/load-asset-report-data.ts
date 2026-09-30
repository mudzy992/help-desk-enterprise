import { PrismaService } from '../../../common/prisma/prisma.service';
import { terminalTicketStatuses } from '../../tickets/merge/merge.constants';
import type { AssetReportData } from './build-asset-reports';

export type AssetReportPart = 'inventory' | 'expiring' | 'licenses' | 'ticketLinks' | 'holders';

type Unit = { readonly id: string; readonly name: string; readonly ouPath: string };

/**
 * Paket 3.2 C9b: loads only the parts a CMDB pack (or the overview) needs.
 * `unitIds` is the report scope (null = every unit); equipment, contracts and
 * licences are scoped by their own organizational unit. Disposed equipment is
 * left out everywhere; the ticket window applies to `ticketLinks` only.
 */
export async function loadAssetReportData(
  prisma: PrismaService,
  input: {
    readonly unitIds: readonly string[] | null;
    readonly parts: ReadonlySet<AssetReportPart>;
    readonly window: { readonly from: Date; readonly to: Date };
    readonly now: Date;
    readonly locale: 'bs' | 'en';
    /** Upper bound of the expiry horizon in days (packs 90, overview 30). */
    readonly horizonDays: number;
  },
): Promise<AssetReportData> {
  const unitFilter = input.unitIds === null ? {} : { organizationalUnitId: { in: [...input.unitIds] } };
  if (input.unitIds !== null && input.unitIds.length === 0) {
    return { now: input.now, inventory: [], expiring: [], licenses: [], ticketLinks: [], holders: [] };
  }
  const units = new Map<string, Unit>(
    (
      await prisma.organizationalUnit.findMany({
        where: input.unitIds === null ? {} : { id: { in: [...input.unitIds] } },
        select: { id: true, name: true, ouPath: true },
      })
    ).map((unit) => [unit.id, unit]),
  );
  const unitName = (id: string) => units.get(id)?.name ?? id;
  const typeName = (type: { nameBs: string; nameEn: string }) => (input.locale === 'en' ? type.nameEn : type.nameBs);
  const horizonEnd = new Date(input.now.getTime() + (input.horizonDays + 1) * 86_400_000);
  const today = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()));
  const has = (part: AssetReportPart) => input.parts.has(part);

  const [inventory, expiringAssets, contracts, licenses, links, holders] = await Promise.all([
    has('inventory')
      ? prisma.asset.groupBy({
          by: ['organizationalUnitId', 'typeId', 'status'],
          where: { ...unitFilter, status: { not: 'DISPOSED' } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    has('expiring')
      ? prisma.asset.findMany({
          where: { ...unitFilter, status: { notIn: ['DISPOSED', 'RETIRED'] }, warrantyEndsAt: { gte: today, lte: horizonEnd } },
          select: { assetTag: true, name: true, organizationalUnitId: true, warrantyEndsAt: true },
          take: 5000,
        })
      : Promise.resolve([]),
    has('expiring')
      ? prisma.assetContract.findMany({
          where: { ...unitFilter, endsAt: { gte: today, lte: horizonEnd } },
          select: { kind: true, supplier: true, reference: true, organizationalUnitId: true, endsAt: true },
          take: 5000,
        })
      : Promise.resolve([]),
    has('licenses') || has('expiring')
      ? prisma.softwareLicense.findMany({
          where: unitFilter,
          select: {
            productName: true,
            vendor: true,
            kind: true,
            seats: true,
            validUntil: true,
            organizationalUnitId: true,
            _count: { select: { assignments: true } },
          },
          take: 5000,
        })
      : Promise.resolve([]),
    has('ticketLinks')
      ? prisma.ticketAsset.findMany({
          where: {
            asset: input.unitIds === null ? {} : { organizationalUnitId: { in: [...input.unitIds] } },
            ticket: { createdAt: { gte: input.window.from, lt: input.window.to } },
          },
          select: {
            ticketId: true,
            ticket: { select: { status: true } },
            asset: { select: { id: true, assetTag: true, name: true, organizationalUnitId: true, type: { select: { nameBs: true, nameEn: true } } } },
          },
          take: 50_000,
        })
      : Promise.resolve([]),
    has('holders')
      ? prisma.asset.findMany({
          where: { ...unitFilter, assignedUserId: { not: null }, status: { notIn: ['DISPOSED', 'RETIRED'] } },
          select: {
            assetTag: true,
            name: true,
            organizationalUnitId: true,
            assignedUser: { select: { displayName: true, email: true, isActive: true, organizationalUnit: { select: { name: true, ouPath: true } } } },
          },
          take: 20_000,
        })
      : Promise.resolve([]),
  ]);

  const typeIds = [...new Set(inventory.map((row) => row.typeId))];
  const types = new Map(
    typeIds.length === 0
      ? []
      : (await prisma.assetType.findMany({ where: { id: { in: typeIds } }, select: { id: true, nameBs: true, nameEn: true } })).map((type) => [type.id, type]),
  );
  const terminal = new Set<string>(terminalTicketStatuses);

  return {
    now: input.now,
    inventory: inventory.map((row) => ({
      unitName: unitName(row.organizationalUnitId),
      typeName: types.has(row.typeId) ? typeName(types.get(row.typeId)!) : row.typeId,
      status: row.status,
      count: row._count._all,
    })),
    expiring: [
      ...expiringAssets
        .filter((row) => row.warrantyEndsAt !== null)
        .map((row) => ({
          kind: 'warranty' as const,
          name: row.name,
          reference: row.assetTag,
          unitName: unitName(row.organizationalUnitId),
          endsAt: row.warrantyEndsAt as Date,
        })),
      ...contracts.map((row) => ({
        kind: 'contract' as const,
        name: `${row.supplier} (${row.kind})`,
        reference: row.reference,
        unitName: unitName(row.organizationalUnitId),
        endsAt: row.endsAt,
      })),
      ...licenses
        .filter((row) => row.validUntil !== null && row.validUntil >= today && row.validUntil <= horizonEnd)
        .map((row) => ({
          kind: 'license' as const,
          name: row.productName,
          reference: row.vendor,
          unitName: unitName(row.organizationalUnitId),
          endsAt: row.validUntil as Date,
        })),
    ],
    licenses: has('licenses')
      ? licenses.map((row) => ({
          productName: row.productName,
          vendor: row.vendor,
          kind: row.kind,
          unitName: unitName(row.organizationalUnitId),
          seats: row.seats,
          used: row._count.assignments,
          validUntil: row.validUntil,
        }))
      : [],
    ticketLinks: links.map((link) => ({
      assetId: link.asset.id,
      assetTag: link.asset.assetTag,
      assetName: link.asset.name,
      typeName: typeName(link.asset.type),
      unitName: unitName(link.asset.organizationalUnitId),
      ticketId: link.ticketId,
      isOpen: !terminal.has(link.ticket.status),
    })),
    holders: holders
      .filter((row) => row.assignedUser !== null)
      .map((row) => {
        const holder = row.assignedUser!;
        return {
          assetTag: row.assetTag,
          assetName: row.name,
          holderName: holder.displayName || holder.email,
          holderActive: holder.isActive,
          holderUnitPath: holder.organizationalUnit?.ouPath ?? null,
          holderUnitName: holder.organizationalUnit?.name ?? null,
          assetUnitPath: units.get(row.organizationalUnitId)?.ouPath ?? '',
          assetUnitName: unitName(row.organizationalUnitId),
        };
      }),
  };
}
