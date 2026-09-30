import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { AssetAccessService } from './asset-access.service';
import { dateOnly, daysUntil, optionalDate, optionalMoney, optionalText, requiredText } from './asset-fields';
import { isPathInScope, unitScopeWhere, type AssetScope, type AssetViewer } from './asset-viewer';
import {
  AssetError,
  assetContractKinds,
  assetContractLimits,
  assetErrorCodes,
  assetEventActions,
  type AssetContractKindValue,
} from './assets.constants';

export type SaveContractInput = {
  readonly kind: AssetContractKindValue;
  readonly supplier: string;
  readonly reference?: string | null;
  readonly startsAt?: string | null;
  readonly endsAt: string;
  readonly cost?: number | null;
  readonly notes?: string | null;
  readonly organizationalUnitId: string;
};

export type ContractListQuery = {
  readonly search?: string;
  readonly kind?: AssetContractKindValue;
  readonly expiringWithinDays?: number;
  readonly includeExpired?: boolean;
};

const contractSelect = {
  id: true,
  kind: true,
  supplier: true,
  reference: true,
  startsAt: true,
  endsAt: true,
  cost: true,
  notes: true,
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  _count: { select: { items: true } },
  updatedAt: true,
} as const;

type ContractRow = {
  id: string;
  kind: AssetContractKindValue;
  supplier: string;
  reference: string | null;
  startsAt: Date | null;
  endsAt: Date;
  cost: { toString(): string } | null;
  notes: string | null;
  organizationalUnit: { id: string; name: string; ouPath: string };
  _count: { items: number };
  updatedAt: Date;
};

/**
 * Paket 3.2 (§10): warranties and contracts covering several items (extended
 * warranty, support, lease, maintenance). Reading needs `asset.read`,
 * writing `asset.contract.manage`, both limited to the contract's unit;
 * linked items must be readable by the viewer.
 */
@Injectable()
export class AssetContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  private toItem(row: ContractRow, now: Date = new Date()) {
    return {
      id: row.id,
      kind: row.kind,
      supplier: row.supplier,
      reference: row.reference,
      startsAt: dateOnly(row.startsAt),
      endsAt: dateOnly(row.endsAt) as string,
      daysLeft: daysUntil(row.endsAt, now),
      cost: row.cost === null ? null : row.cost.toString(),
      notes: row.notes,
      organizationalUnit: { id: row.organizationalUnit.id, name: row.organizationalUnit.name },
      itemCount: row._count.items,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async audit(action: string, entityId: string, viewer: AssetViewer, metadata: Record<string, unknown>) {
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action,
      entityType: auditLogEntityTypes.asset,
      entityId,
      metadata: metadata as never,
      actorUserId: viewer.userId,
    });
  }

  private async loadInScope(id: string, scope: AssetScope): Promise<ContractRow> {
    const row = (await this.prisma.assetContract.findUnique({ where: { id }, select: contractSelect })) as ContractRow | null;
    if (row === null || !isPathInScope(scope, row.organizationalUnit.ouPath)) throw new AssetError(assetErrorCodes.contractNotFound);
    return row;
  }

  async list(query: ContractListQuery, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const unitWhere = unitScopeWhere(scope);
    const search = query.search?.trim();
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rows = (await this.prisma.assetContract.findMany({
      where: {
        ...(unitWhere === null ? {} : { organizationalUnit: unitWhere }),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(search
          ? {
              OR: [
                { supplier: { contains: search, mode: 'insensitive' as const } },
                { reference: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        endsAt: {
          ...(query.includeExpired === true ? {} : { gte: today }),
          ...(query.expiringWithinDays !== undefined ? { lte: new Date(today.getTime() + query.expiringWithinDays * 86_400_000) } : {}),
        },
      },
      orderBy: [{ endsAt: 'asc' }],
      take: assetContractLimits.listMax,
      select: contractSelect,
    })) as ContractRow[];
    return { items: rows.map((row) => this.toItem(row, now)) };
  }

  async detail(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const row = await this.loadInScope(id, scope);
    const items = await this.prisma.assetContractItem.findMany({
      where: { contractId: id },
      take: assetContractLimits.itemsPerContract,
      include: {
        asset: {
          select: { id: true, assetTag: true, name: true, status: true, organizationalUnit: { select: { ouPath: true } } },
        },
      },
      orderBy: { asset: { assetTag: 'asc' } },
    });
    return {
      ...this.toItem(row),
      items: items.map((item) => ({
        id: item.asset.id,
        assetTag: item.asset.assetTag,
        name: item.asset.name,
        status: item.asset.status,
        canOpen: isPathInScope(scope, item.asset.organizationalUnit.ouPath),
      })),
    };
  }

  private validate(input: SaveContractInput) {
    if (!(assetContractKinds as readonly string[]).includes(input.kind)) throw new AssetError(assetErrorCodes.invalid, 'kind');
    const endsAt = optionalDate(input.endsAt, 'endsAt');
    if (endsAt === null) throw new AssetError(assetErrorCodes.invalid, 'endsAt');
    const startsAt = optionalDate(input.startsAt, 'startsAt');
    if (startsAt !== null && startsAt.getTime() > endsAt.getTime()) throw new AssetError(assetErrorCodes.invalid, 'startsAt');
    return {
      kind: input.kind,
      supplier: requiredText(input.supplier, 160, 'supplier'),
      reference: optionalText(input.reference, 120, 'reference'),
      startsAt,
      endsAt,
      cost: optionalMoney(input.cost, 'cost'),
      notes: optionalText(input.notes, 4000, 'notes'),
    };
  }

  async create(input: SaveContractInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetContractManage);
    await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    const created = await this.prisma.assetContract.create({
      data: { ...this.validate(input), organizationalUnitId: input.organizationalUnitId },
      select: { id: true },
    });
    await this.audit('asset.contract.created', created.id, viewer, { kind: input.kind });
    return this.detail(created.id, viewer);
  }

  async update(id: string, input: SaveContractInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetContractManage);
    const current = await this.loadInScope(id, scope);
    if (input.organizationalUnitId !== current.organizationalUnit.id) {
      await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    }
    const data = this.validate(input);
    await this.prisma.assetContract.update({
      where: { id },
      data: {
        ...data,
        organizationalUnitId: input.organizationalUnitId,
        // A renewed contract (new end date) gets fresh reminders.
        ...(dateOnly(data.endsAt) !== dateOnly(current.endsAt) ? { remindersSent: [] } : {}),
      },
    });
    await this.audit('asset.contract.updated', id, viewer, {});
    return this.detail(id, viewer);
  }

  async remove(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetContractManage);
    const current = await this.loadInScope(id, scope);
    await this.prisma.assetContract.delete({ where: { id } });
    await this.audit('asset.contract.deleted', id, viewer, { supplier: current.supplier, items: current._count.items });
    return { deleted: true };
  }

  async addItem(id: string, assetId: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetContractManage);
    const contract = await this.loadInScope(id, scope);
    if (contract._count.items >= assetContractLimits.itemsPerContract) throw new AssetError(assetErrorCodes.invalid, 'items');
    const readScope = await this.access.scope(viewer, permissionKeys.assetRead);
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, organizationalUnit: { select: { ouPath: true } } },
    });
    if (asset === null || !isPathInScope(readScope, asset.organizationalUnit.ouPath)) throw new AssetError(assetErrorCodes.notFound);
    const existing = await this.prisma.assetContractItem.findUnique({ where: { contractId_assetId: { contractId: id, assetId } } });
    if (existing !== null) throw new AssetError(assetErrorCodes.contractItemExists);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.assetContractItem.create({ data: { contractId: id, assetId } });
      await transaction.assetEvent.create({
        data: {
          assetId,
          action: assetEventActions.contractLinked,
          actorUserId: viewer.userId,
          detail: { contractId: id, supplier: contract.supplier, kind: contract.kind },
        },
      });
    });
    await this.audit('asset.contract.item_added', id, viewer, { assetId });
    return this.detail(id, viewer);
  }

  async removeItem(id: string, assetId: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetContractManage);
    const contract = await this.loadInScope(id, scope);
    const removed = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.assetContractItem.deleteMany({ where: { contractId: id, assetId } });
      if (result.count > 0) {
        await transaction.assetEvent.create({
          data: {
            assetId,
            action: assetEventActions.contractUnlinked,
            actorUserId: viewer.userId,
            detail: { contractId: id, supplier: contract.supplier, kind: contract.kind },
          },
        });
      }
      return result.count;
    });
    if (removed === 0) throw new AssetError(assetErrorCodes.notFound);
    await this.audit('asset.contract.item_removed', id, viewer, { assetId });
    return this.detail(id, viewer);
  }

  /** Asset card (§17): contracts covering the item. */
  async forAsset(assetId: string) {
    const rows = await this.prisma.assetContractItem.findMany({
      where: { assetId },
      take: 50,
      include: { contract: { select: { id: true, kind: true, supplier: true, reference: true, endsAt: true } } },
    });
    const now = new Date();
    return rows.map((row) => ({
      ...row.contract,
      endsAt: dateOnly(row.contract.endsAt) as string,
      daysLeft: daysUntil(row.contract.endsAt, now),
    }));
  }
}
