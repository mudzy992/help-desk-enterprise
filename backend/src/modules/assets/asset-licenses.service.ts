import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { AssetAccessService } from './asset-access.service';
import { dateOnly, daysUntil, optionalDate, optionalMoney, optionalText, requiredText } from './asset-fields';
import { decryptLicenseKey, encryptLicenseKey, readLicenseKeyCipherKey, readLicenseKeyDecryptionKeys } from './asset-license-cipher';
import { isPathInScope, unitScopeWhere, type AssetScope, type AssetViewer } from './asset-viewer';
import {
  AssetError,
  assetContractLimits,
  assetErrorCodes,
  assetEventActions,
  softwareLicenseKinds,
  type SoftwareLicenseKindValue,
} from './assets.constants';

export type SaveLicenseInput = {
  readonly productName: string;
  readonly vendor?: string | null;
  readonly kind: SoftwareLicenseKindValue;
  readonly seats?: number | null;
  readonly validUntil?: string | null;
  readonly cost?: number | null;
  readonly notes?: string | null;
  readonly organizationalUnitId: string;
  /** undefined = keep, "" or null = remove, text = replace. */
  readonly licenseKey?: string | null;
};

export type LicenseListQuery = {
  readonly search?: string;
  readonly kind?: SoftwareLicenseKindValue;
  readonly expiringWithinDays?: number;
  readonly overAllocated?: boolean;
};

type LicenseRow = {
  id: string;
  productName: string;
  vendor: string | null;
  kind: SoftwareLicenseKindValue;
  seats: number | null;
  validUntil: Date | null;
  cost: { toString(): string } | null;
  notes: string | null;
  keyEncrypted: string | null;
  organizationalUnit: { id: string; name: string; ouPath: string };
  _count: { assignments: number };
  updatedAt: Date;
};

const licenseSelect = {
  id: true,
  productName: true,
  vendor: true,
  kind: true,
  seats: true,
  validUntil: true,
  cost: true,
  notes: true,
  keyEncrypted: true,
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  _count: { select: { assignments: true } },
  updatedAt: true,
} as const;

/** §9: SITE is never counted; the others count assignments against seats. */
export function licenseCompliance(kind: SoftwareLicenseKindValue, seats: number | null, used: number) {
  if (kind === 'SITE' || seats === null) return { used, seats: null, available: null, overAllocated: false };
  return { used, seats, available: seats - used, overAllocated: used > seats };
}

/** §9: which side a licence kind is assigned to. */
export function licenseAssignmentTarget(kind: SoftwareLicenseKindValue): 'asset' | 'user' | 'either' | 'none' {
  switch (kind) {
    case 'PER_DEVICE':
      return 'asset';
    case 'PER_USER':
      return 'user';
    case 'SUBSCRIPTION':
      return 'either';
    default:
      return 'none';
  }
}

/**
 * Paket 3.2 (§9): software licences. Reading needs `asset.read`, writing
 * `asset.license.manage`, both limited to the licence's unit. The key is
 * encrypted at rest, never listed or exported, and every reveal is audited.
 */
@Injectable()
export class AssetLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  private toItem(row: LicenseRow, now: Date = new Date()) {
    return {
      id: row.id,
      productName: row.productName,
      vendor: row.vendor,
      kind: row.kind,
      validUntil: dateOnly(row.validUntil),
      daysLeft: row.validUntil === null ? null : daysUntil(row.validUntil, now),
      cost: row.cost === null ? null : row.cost.toString(),
      notes: row.notes,
      hasKey: row.keyEncrypted !== null,
      organizationalUnit: { id: row.organizationalUnit.id, name: row.organizationalUnit.name },
      ...licenseCompliance(row.kind, row.seats, row._count.assignments),
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

  private async loadInScope(id: string, scope: AssetScope): Promise<LicenseRow> {
    const row = (await this.prisma.softwareLicense.findUnique({ where: { id }, select: licenseSelect })) as LicenseRow | null;
    if (row === null || !isPathInScope(scope, row.organizationalUnit.ouPath)) throw new AssetError(assetErrorCodes.licenseNotFound);
    return row;
  }

  async list(query: LicenseListQuery, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const unitWhere = unitScopeWhere(scope);
    const search = query.search?.trim();
    const now = new Date();
    const rows = (await this.prisma.softwareLicense.findMany({
      where: {
        ...(unitWhere === null ? {} : { organizationalUnit: unitWhere }),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(search
          ? {
              OR: [
                { productName: { contains: search, mode: 'insensitive' as const } },
                { vendor: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(query.expiringWithinDays !== undefined
          ? { validUntil: { not: null, lte: new Date(now.getTime() + query.expiringWithinDays * 86_400_000) } }
          : {}),
      },
      orderBy: [{ productName: 'asc' }],
      take: assetContractLimits.listMax,
      select: licenseSelect,
    })) as LicenseRow[];
    const items = rows.map((row) => this.toItem(row, now));
    return { items: query.overAllocated ? items.filter((item) => item.overAllocated) : items };
  }

  async detail(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const row = await this.loadInScope(id, scope);
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { licenseId: id },
      orderBy: { assignedAt: 'desc' },
      take: assetContractLimits.assignmentsPerLicense,
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        user: { select: { id: true, displayName: true, email: true, isActive: true } },
      },
    });
    return {
      ...this.toItem(row),
      assignmentTarget: licenseAssignmentTarget(row.kind),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        assignedAt: assignment.assignedAt.toISOString(),
        asset: assignment.asset,
        user: assignment.user,
      })),
    };
  }

  private validate(input: SaveLicenseInput) {
    if (!(softwareLicenseKinds as readonly string[]).includes(input.kind)) throw new AssetError(assetErrorCodes.invalid, 'kind');
    const seats = input.kind === 'SITE' ? null : (input.seats ?? null);
    if (seats !== null && (!Number.isInteger(seats) || seats < 0 || seats > 1_000_000)) {
      throw new AssetError(assetErrorCodes.invalid, 'seats');
    }
    if (input.kind !== 'SITE' && seats === null) throw new AssetError(assetErrorCodes.invalid, 'seats');
    const validUntil = optionalDate(input.validUntil, 'validUntil');
    if (input.kind === 'SUBSCRIPTION' && validUntil === null) throw new AssetError(assetErrorCodes.invalid, 'validUntil');
    return {
      productName: requiredText(input.productName, 160, 'productName'),
      vendor: optionalText(input.vendor, 120, 'vendor'),
      kind: input.kind,
      seats,
      validUntil,
      cost: optionalMoney(input.cost, 'cost'),
      notes: optionalText(input.notes, 4000, 'notes'),
    };
  }

  private encryptKey(value: string | null | undefined): { keyEncrypted?: string | null } {
    if (value === undefined) return {};
    const text = value?.trim() ?? '';
    if (text.length === 0) return { keyEncrypted: null };
    if (text.length > assetContractLimits.keyMax) throw new AssetError(assetErrorCodes.invalid, 'licenseKey');
    const key = readLicenseKeyCipherKey();
    if (key === null) throw new AssetError(assetErrorCodes.licenseKeyUnavailable);
    return { keyEncrypted: encryptLicenseKey(text, key) };
  }

  async create(input: SaveLicenseInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    const created = await this.prisma.softwareLicense.create({
      data: { ...this.validate(input), ...this.encryptKey(input.licenseKey), organizationalUnitId: input.organizationalUnitId },
      select: { id: true },
    });
    await this.audit('asset.license.created', created.id, viewer, { kind: input.kind, hasKey: Boolean(input.licenseKey?.trim()) });
    return this.detail(created.id, viewer);
  }

  async update(id: string, input: SaveLicenseInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    const current = await this.loadInScope(id, scope);
    if (input.organizationalUnitId !== current.organizationalUnit.id) {
      await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    }
    const data = this.validate(input);
    const target = licenseAssignmentTarget(data.kind);
    if (data.kind !== current.kind && current._count.assignments > 0 && target !== 'either') {
      // A kind change must not leave assignments of the wrong side behind.
      const wrong = await this.prisma.licenseAssignment.count({
        where: {
          licenseId: id,
          ...(target === 'asset' ? { userId: { not: null } } : target === 'user' ? { assetId: { not: null } } : {}),
        },
      });
      if (wrong > 0) throw new AssetError(assetErrorCodes.licenseAssignmentInvalid, 'kind');
    }
    await this.prisma.softwareLicense.update({
      where: { id },
      data: {
        ...data,
        ...this.encryptKey(input.licenseKey),
        organizationalUnitId: input.organizationalUnitId,
        // A later validUntil re-arms the reminders.
        ...(dateOnly(data.validUntil) !== dateOnly(current.validUntil) ? { remindersSent: [] } : {}),
      },
    });
    await this.audit('asset.license.updated', id, viewer, {
      keyChanged: input.licenseKey !== undefined,
    });
    return this.detail(id, viewer);
  }

  async remove(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    const current = await this.loadInScope(id, scope);
    await this.prisma.softwareLicense.delete({ where: { id } });
    await this.audit('asset.license.deleted', id, viewer, { productName: current.productName, assignments: current._count.assignments });
    return { deleted: true };
  }

  async revealKey(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    const row = await this.loadInScope(id, scope);
    if (row.keyEncrypted === null) throw new AssetError(assetErrorCodes.licenseNotFound, 'key');
    const key = readLicenseKeyCipherKey();
    if (key === null) throw new AssetError(assetErrorCodes.licenseKeyUnavailable);
    let plain: string;
    try {
      plain = decryptLicenseKey(row.keyEncrypted, readLicenseKeyDecryptionKeys());
    } catch {
      throw new AssetError(assetErrorCodes.licenseKeyUnavailable, 'decrypt');
    }
    await this.audit('asset.license.key_revealed', id, viewer, {});
    return { licenseKey: plain };
  }

  async assign(id: string, input: { assetId?: string; userId?: string }, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    const license = await this.loadInScope(id, scope);
    const target = licenseAssignmentTarget(license.kind);
    const assetId = input.assetId?.trim() || undefined;
    const userId = input.userId?.trim() || undefined;
    if ((assetId === undefined) === (userId === undefined)) throw new AssetError(assetErrorCodes.licenseAssignmentInvalid, 'target');
    if (target === 'none' || (target === 'asset' && !assetId) || (target === 'user' && !userId)) {
      throw new AssetError(assetErrorCodes.licenseAssignmentInvalid, 'kind');
    }
    if (assetId) {
      const readScope = await this.access.scope(viewer, permissionKeys.assetRead);
      const asset = await this.prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, retiredAt: true, organizationalUnit: { select: { ouPath: true } } },
      });
      if (asset === null || !isPathInScope(readScope, asset.organizationalUnit.ouPath)) throw new AssetError(assetErrorCodes.notFound);
      if (asset.retiredAt !== null) throw new AssetError(assetErrorCodes.readOnly);
    }
    if (userId) {
      const user = await this.prisma.user.findFirst({ where: { id: userId, isActive: true, anonymizedAt: null }, select: { id: true } });
      if (user === null) throw new AssetError(assetErrorCodes.userNotFound);
    }
    const existing = await this.prisma.licenseAssignment.findFirst({
      where: { licenseId: id, ...(assetId ? { assetId } : { userId }) },
      select: { id: true },
    });
    if (existing !== null) throw new AssetError(assetErrorCodes.licenseAssignmentExists);
    // Over-allocation is allowed (reality comes before the records) but shown (§9).
    await this.prisma.$transaction(async (transaction) => {
      await transaction.licenseAssignment.create({
        data: { licenseId: id, assetId: assetId ?? null, userId: userId ?? null, assignedByUserId: viewer.userId },
      });
      if (assetId) {
        await transaction.assetEvent.create({
          data: {
            assetId,
            action: assetEventActions.licenseAssigned,
            actorUserId: viewer.userId,
            detail: { licenseId: id, productName: license.productName },
          },
        });
      }
    });
    await this.audit('asset.license.assigned', id, viewer, { target: assetId ? 'asset' : 'user', assetId: assetId ?? null, userId: userId ?? null });
    return this.detail(id, viewer);
  }

  async release(id: string, assignmentId: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetLicenseManage);
    const license = await this.loadInScope(id, scope);
    const assignment = await this.prisma.licenseAssignment.findFirst({ where: { id: assignmentId, licenseId: id } });
    if (assignment === null) throw new AssetError(assetErrorCodes.notFound);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.licenseAssignment.delete({ where: { id: assignmentId } });
      if (assignment.assetId !== null) {
        await transaction.assetEvent.create({
          data: {
            assetId: assignment.assetId,
            action: assetEventActions.licenseReleased,
            actorUserId: viewer.userId,
            detail: { licenseIds: [id], productName: license.productName },
          },
        });
      }
    });
    await this.audit('asset.license.released', id, viewer, { assignmentId });
    return this.detail(id, viewer);
  }

  /** Asset card (§17): licences installed on the device or held by its user. */
  async forAsset(assetId: string, assignedUserId: string | null) {
    const rows = await this.prisma.licenseAssignment.findMany({
      where: { OR: [{ assetId }, ...(assignedUserId ? [{ userId: assignedUserId }] : [])] },
      take: 100,
      include: { license: { select: { id: true, productName: true, vendor: true, kind: true, validUntil: true } } },
    });
    return rows.map((row) => ({
      assignmentId: row.id,
      via: row.assetId === assetId ? ('asset' as const) : ('user' as const),
      license: { ...row.license, validUntil: dateOnly(row.license.validUntil) },
    }));
  }
}
