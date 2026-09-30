import { Injectable } from '@nestjs/common';
import { buildLocationPaths, locationSubtreeIds } from './asset-locations';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { assetDefaults } from '../settings/definitions/asset-settings';
import { settingKeys } from '../settings/setting-keys';
import { terminalTicketStatuses } from '../tickets/merge/merge.constants';
import { AssetAccessService } from './asset-access.service';
import { dateOnly, optionalDate, optionalText } from './asset-fields';
import { validateAssetAttributes, type AssetAttributeDefinition, type AttributeIssue } from './asset-attributes';
import { collectRelationImpact, isDirectedRelation, wouldCreateRelationCycle, type RelationEdge } from './asset-relations';
import { isPathInScope, unitScopeWhere, viewerHasPermission, type AssetScope, type AssetViewer } from './asset-viewer';
import {
  AssetError,
  assetAssignableStatuses,
  assetErrorCodes,
  assetEventActions,
  assetLimits,
  assetStatusesNeedingReason,
  assetUserVisibleStatuses,
  canTransitionAssetStatus,
  type AssetRelationKindValue,
  type AssetStatusValue,
} from './assets.constants';

export type SaveAssetInput = {
  readonly assetTag?: string | null;
  readonly typeId: string;
  readonly name: string;
  readonly status?: AssetStatusValue;
  readonly serialNumber?: string | null;
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly organizationalUnitId: string;
  readonly locationId?: string | null;
  readonly serviceId?: string | null;
  readonly purchaseDate?: string | null;
  readonly purchaseCost?: number | null;
  readonly supplier?: string | null;
  readonly warrantyEndsAt?: string | null;
  readonly notes?: string | null;
  readonly attributes?: Readonly<Record<string, unknown>>;
  /** Optimistic concurrency on update. */
  readonly version?: number;
};

export type AssetListQuery = {
  readonly search?: string;
  readonly typeId?: string;
  readonly status?: readonly AssetStatusValue[];
  readonly organizationalUnitId?: string;
  readonly locationId?: string;
  readonly assignedUserId?: string;
  readonly unassigned?: boolean;
  readonly warrantyWithinDays?: number;
  readonly source?: 'MANUAL' | 'IMPORT' | 'DIRECTORY';
  readonly serviceId?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

const listInclude = {
  type: { select: { id: true, key: true, nameBs: true, nameEn: true, icon: true } },
  assignedUser: { select: { id: true, displayName: true, email: true, isActive: true } },
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  location: { select: { id: true, name: true } },
} as const;

type ListRow = Prisma.AssetGetPayload<{ include: typeof listInclude }>;

function locationLabel(location: ListRow['location'], paths: ReadonlyMap<string, string>): string | null {
  if (location === null) return null;
  return paths.get(location.id) ?? location.name;
}

function attributeIssueDetail(issues: readonly AttributeIssue[]): string {
  return issues.map((issue) => `${issue.key}:${issue.problem}`).join(',');
}

/**
 * Paket 3.2 (§3, §5, §6, §7, §16): the asset register. Every read and write
 * is limited to the viewer's unit scope for the permission involved; USERs
 * only see their own equipment through `mine()`, with a reduced field set.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  // ------------------------------------------------------------ helpers

  /** §7: full "A › B › C" labels; the location table is small. */
  private async locationNodes() {
    return this.prisma.assetLocation.findMany({ select: { id: true, name: true, parentId: true } });
  }

  private async locationPaths(): Promise<Map<string, string>> {
    return buildLocationPaths(await this.locationNodes());
  }

  private toListItem(row: ListRow, openTicketCount: number, paths: ReadonlyMap<string, string>) {
    return {
      id: row.id,
      assetTag: row.assetTag,
      name: row.name,
      status: row.status,
      type: row.type,
      serialNumber: row.serialNumber,
      manufacturer: row.manufacturer,
      model: row.model,
      assignedUser: row.assignedUser,
      organizationalUnit: { id: row.organizationalUnit.id, name: row.organizationalUnit.name },
      location: row.location === null ? null : { id: row.location.id, label: locationLabel(row.location, paths) },
      warrantyEndsAt: dateOnly(row.warrantyEndsAt),
      source: row.source,
      missingFromDirectoryAt: row.missingFromDirectoryAt?.toISOString() ?? null,
      openTicketCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async openTicketCounts(assetIds: readonly string[]): Promise<Map<string, number>> {
    if (assetIds.length === 0) return new Map();
    const groups = await this.prisma.ticketAsset.groupBy({
      by: ['assetId'],
      where: { assetId: { in: [...assetIds] }, ticket: { status: { notIn: [...terminalTicketStatuses] } } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.assetId, group._count._all]));
  }

  private async event(
    client: Prisma.TransactionClient | PrismaService,
    assetId: string,
    action: string,
    viewer: AssetViewer | null,
    detail: Record<string, unknown>,
  ) {
    await client.assetEvent.create({
      data: { assetId, action, actorUserId: viewer?.userId ?? null, detail: detail as Prisma.InputJsonValue },
    });
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

  /** Loads an asset and checks the unit scope; out of scope reads as not found. */
  private async loadInScope(id: string, scope: AssetScope) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { organizationalUnit: { select: { id: true, ouPath: true, name: true } } },
    });
    if (asset === null || !isPathInScope(scope, asset.organizationalUnit.ouPath)) {
      throw new AssetError(assetErrorCodes.notFound);
    }
    return asset;
  }

  private async attributeDefinitions(typeId: string): Promise<AssetAttributeDefinition[]> {
    return this.prisma.assetAttribute.findMany({
      where: { typeId },
      select: { key: true, dataType: true, options: true, isRequired: true, isUnique: true, archivedAt: true },
    });
  }

  private async assertUniqueAttributes(
    typeId: string,
    definitions: readonly AssetAttributeDefinition[],
    attributes: Readonly<Record<string, unknown>>,
    selfId: string | null,
  ) {
    for (const definition of definitions) {
      if (!definition.isUnique || definition.archivedAt !== null) continue;
      const value = attributes[definition.key];
      if (value === undefined) continue;
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Asset"
        WHERE "typeId" = ${typeId}
          AND lower("attributes"->>${definition.key}) = lower(${String(value)})
          AND (${selfId}::text IS NULL OR "id" <> ${selfId})
        LIMIT 1`;
      if (rows.length > 0) throw new AssetError(assetErrorCodes.attributeNotUnique, definition.key);
    }
  }

  /** §15: `{prefix}{year}-{00001}`; the unique index resolves races (retry). */
  private async generateTag(): Promise<string> {
    const prefix = await this.access.readSetting<string>(settingKeys.privateAssetsTagPrefix, assetDefaults.tagPrefix);
    const base = `${prefix}${new Date().getUTCFullYear()}-`;
    const rows = await this.prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(substring("assetTag" FROM ${base.length + 1}) AS INTEGER)) AS "max"
      FROM "Asset"
      WHERE "assetTag" LIKE ${`${base.replace(/[%_\\]/g, '\\$&')}%`}
        AND substring("assetTag" FROM ${base.length + 1}) ~ '^[0-9]{1,9}$'`;
    const next = (rows[0]?.max ?? 0) + 1;
    return `${base}${String(next).padStart(5, '0')}`;
  }

  private async resolveTag(input: string | null | undefined): Promise<string> {
    const given = optionalText(input, 64, 'assetTag');
    if (given !== null) {
      if (!/^[\p{L}\p{N}._/-]+$/u.test(given)) throw new AssetError(assetErrorCodes.invalid, 'assetTag');
      return given;
    }
    const auto = await this.access.readSetting<unknown>(settingKeys.privateAssetsTagAutoGenerate, assetDefaults.tagAutoGenerate);
    if (auto !== true) throw new AssetError(assetErrorCodes.invalid, 'assetTag');
    return this.generateTag();
  }

  private async validateReferences(input: SaveAssetInput) {
    const type = await this.prisma.assetType.findUnique({ where: { id: input.typeId }, select: { id: true, archivedAt: true } });
    if (type === null) throw new AssetError(assetErrorCodes.typeNotFound);
    if (input.locationId) {
      const location = await this.prisma.assetLocation.findUnique({ where: { id: input.locationId }, select: { id: true } });
      if (location === null) throw new AssetError(assetErrorCodes.locationNotFound);
    }
    if (input.serviceId) {
      const service = await this.prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } });
      if (service === null) throw new AssetError(assetErrorCodes.serviceNotFound);
    }
    return type;
  }

  private baseData(input: SaveAssetInput) {
    const cost = input.purchaseCost;
    if (cost !== undefined && cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 9_999_999_999)) {
      throw new AssetError(assetErrorCodes.invalid, 'purchaseCost');
    }
    const name = input.name.trim();
    if (name.length === 0 || name.length > 160) throw new AssetError(assetErrorCodes.invalid, 'name');
    return {
      name,
      serialNumber: optionalText(input.serialNumber, 120, 'serialNumber'),
      manufacturer: optionalText(input.manufacturer, 120, 'manufacturer'),
      model: optionalText(input.model, 120, 'model'),
      locationId: input.locationId || null,
      serviceId: input.serviceId || null,
      purchaseDate: optionalDate(input.purchaseDate, 'purchaseDate'),
      purchaseCost: cost === undefined || cost === null ? null : new Prisma.Decimal(cost.toFixed(2)),
      supplier: optionalText(input.supplier, 160, 'supplier'),
      warrantyEndsAt: optionalDate(input.warrantyEndsAt, 'warrantyEndsAt'),
      notes: optionalText(input.notes, 4000, 'notes'),
    };
  }

  // ------------------------------------------------------------ list / detail

  async list(query: AssetListQuery, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const limit = Math.min(Math.max(query.limit ?? assetLimits.listPageDefault, 1), assetLimits.listPageMax);
    const where: Prisma.AssetWhereInput = {};
    const and: Prisma.AssetWhereInput[] = [];
    const unitWhere = unitScopeWhere(scope);
    if (unitWhere !== null) and.push({ organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput });
    const search = query.search?.trim() ?? '';
    if (search.length >= assetLimits.searchMin) {
      and.push({
        OR: [
          { assetTag: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { serialNumber: { contains: search, mode: 'insensitive' } },
          { assignedUser: { displayName: { contains: search, mode: 'insensitive' } } },
          { assignedUser: { email: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.typeId) and.push({ typeId: query.typeId });
    if (query.status && query.status.length > 0) and.push({ status: { in: [...query.status] } });
    if (query.organizationalUnitId) {
      const unit = await this.prisma.organizationalUnit.findUnique({
        where: { id: query.organizationalUnitId },
        select: { ouPath: true },
      });
      and.push(
        unit === null
          ? { id: '\u0000none' }
          : { organizationalUnit: { OR: [{ ouPath: unit.ouPath }, { ouPath: { startsWith: `${unit.ouPath}/` } }] } },
      );
    }
    if (query.locationId) and.push({ locationId: { in: locationSubtreeIds(await this.locationNodes(), query.locationId) } });
    if (query.assignedUserId) and.push({ assignedUserId: query.assignedUserId });
    if (query.unassigned === true) and.push({ assignedUserId: null });
    if (query.source) and.push({ source: query.source });
    if (query.serviceId) and.push({ serviceId: query.serviceId });
    if (query.warrantyWithinDays !== undefined) {
      const now = new Date();
      and.push({ warrantyEndsAt: { gte: now, lte: new Date(now.getTime() + query.warrantyWithinDays * 86_400_000) } });
    }
    if (and.length > 0) where.AND = and;
    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: listInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.asset.count({ where }),
    ]);
    const page = rows.slice(0, limit);
    const [counts, paths] = await Promise.all([this.openTicketCounts(page.map((row) => row.id)), this.locationPaths()]);
    return {
      items: page.map((row) => this.toListItem(row, counts.get(row.id) ?? 0, paths)),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      total,
    };
  }

  /** Small search for pickers (relations, ticket panel): tag, name or serial. */
  async lookup(search: string, viewer: AssetViewer, excludeId?: string) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const text = search.trim();
    if (text.length < assetLimits.searchMin) return { items: [] };
    const unitWhere = unitScopeWhere(scope);
    const rows = await this.prisma.asset.findMany({
      where: {
        AND: [
          ...(unitWhere === null ? [] : [{ organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput }]),
          ...(excludeId ? [{ id: { not: excludeId } }] : []),
          {
            OR: [
              { assetTag: { contains: text, mode: 'insensitive' } },
              { name: { contains: text, mode: 'insensitive' } },
              { serialNumber: { contains: text, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: listInclude,
      orderBy: [{ assetTag: 'asc' }],
      take: 20,
    });
    const paths = await this.locationPaths();
    return { items: rows.map((row) => this.toListItem(row, 0, paths)) };
  }

  async detail(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    await this.loadInScope(id, scope);
    const asset = await this.prisma.asset.findUniqueOrThrow({
      where: { id },
      include: {
        ...listInclude,
        service: { select: { id: true, name: true } },
        type: {
          select: {
            id: true,
            key: true,
            nameBs: true,
            nameEn: true,
            icon: true,
            attributes: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
          },
        },
      },
    });
    const [relations, ticketStats, recentTickets, frequent, manageScope] = await Promise.all([
      this.relationsOf(id),
      this.ticketStats(id),
      this.recentTickets(id, viewer),
      this.frequentFailure(id),
      this.access.scope(viewer, permissionKeys.assetManage),
    ]);
    const values = (asset.attributes ?? {}) as Record<string, unknown>;
    const canManage =
      viewerHasPermission(viewer, permissionKeys.assetManage) && isPathInScope(manageScope, asset.organizationalUnit.ouPath);
    return {
      ...this.toListItem(asset, ticketStats.open, await this.locationPaths()),
      version: asset.version,
      organizationalUnit: { id: asset.organizationalUnit.id, name: asset.organizationalUnit.name, path: asset.organizationalUnit.ouPath },
      service: asset.service,
      assignedAt: asset.assignedAt?.toISOString() ?? null,
      purchaseDate: dateOnly(asset.purchaseDate),
      purchaseCost: asset.purchaseCost === null ? null : Number(asset.purchaseCost),
      currency: asset.currency,
      supplier: asset.supplier,
      notes: asset.notes,
      externalId: asset.externalId,
      lastSeenAt: asset.lastSeenAt?.toISOString() ?? null,
      assignmentSuggested: asset.assignmentSuggested,
      retiredAt: asset.retiredAt?.toISOString() ?? null,
      createdAt: asset.createdAt.toISOString(),
      attributeDefinitions: asset.type.attributes
        .filter((attribute) => attribute.archivedAt === null || values[attribute.key] !== undefined)
        .map((attribute) => ({
          key: attribute.key,
          labelBs: attribute.labelBs,
          labelEn: attribute.labelEn,
          dataType: attribute.dataType,
          options: Array.isArray(attribute.options) ? attribute.options : [],
          isRequired: attribute.isRequired,
          archived: attribute.archivedAt !== null,
        })),
      attributes: values,
      relations,
      tickets: { ...ticketStats, recent: recentTickets },
      frequentFailure: frequent,
      canManage,
    };
  }

  private async ticketStats(assetId: string) {
    const [total, open] = await Promise.all([
      this.prisma.ticketAsset.count({ where: { assetId } }),
      this.prisma.ticketAsset.count({ where: { assetId, ticket: { status: { notIn: [...terminalTicketStatuses] } } } }),
    ]);
    return { total, open };
  }

  /**
   * Latest linked tickets. Confidential tickets are counted but listed only
   * for SUPER_ADMIN (the full check lives in the ticket module, §8).
   */
  private async recentTickets(assetId: string, viewer: AssetViewer) {
    const links = await this.prisma.ticketAsset.findMany({
      where: { assetId, ...(viewer.isSuperAdmin ? {} : { ticket: { isConfidential: false } }) },
      orderBy: { linkedAt: 'desc' },
      take: 20,
      include: {
        ticket: { select: { id: true, ticketNumber: true, title: true, status: true, priority: true, createdAt: true } },
      },
    });
    return links.map((link) => ({
      id: link.ticket.id,
      ticketNumber: link.ticket.ticketNumber,
      title: link.ticket.title,
      status: link.ticket.status,
      priority: link.ticket.priority,
      createdAt: link.ticket.createdAt.toISOString(),
      linkedAt: link.linkedAt.toISOString(),
      isPrimary: link.isPrimary,
    }));
  }

  /** §8: N linked tickets within M days. */
  private async frequentFailure(assetId: string) {
    const [count, days] = await Promise.all([
      this.access.readSetting<number>(settingKeys.privateAssetsFrequentFailureCount, assetDefaults.frequentFailureCount),
      this.access.readSetting<number>(settingKeys.privateAssetsFrequentFailureDays, assetDefaults.frequentFailureDays),
    ]);
    const since = new Date(Date.now() - days * 86_400_000);
    const recent = await this.prisma.ticketAsset.count({ where: { assetId, ticket: { createdAt: { gte: since } } } });
    return { flagged: recent >= count, count: recent, threshold: count, days };
  }

  /**
   * Form options for readers: units in the read scope (writes re-check the
   * manage scope) and services that can be linked (§7, §8).
   */
  async options(viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const unitWhere = unitScopeWhere(scope);
    const [units, services] = await Promise.all([
      this.prisma.organizationalUnit.findMany({
        where: (unitWhere ?? {}) as Prisma.OrganizationalUnitWhereInput,
        select: { id: true, name: true, ouPath: true },
        orderBy: { ouPath: 'asc' },
        take: 2000,
      }),
      this.prisma.service.findMany({
        where: { lifecycle: { not: 'DEPRECATED' } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
    ]);
    return { units: units.map((unit) => ({ id: unit.id, name: unit.name, path: unit.ouPath })), services };
  }

  /** §7: active, not anonymized users to assign equipment to (asset.manage). */
  async searchUsers(search: string, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetManage);
    const text = search.trim();
    if (text.length < assetLimits.searchMin) return { items: [] };
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        OR: [{ displayName: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }],
      },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return { items: users };
  }

  // ------------------------------------------------------------ user side

  /** §14: the viewer's own equipment, reduced fields, with own linked tickets. */
  async mine(viewer: AssetViewer) {
    await this.access.requireEnabled();
    const rows = await this.prisma.asset.findMany({
      where: { assignedUserId: viewer.userId, status: { in: [...assetUserVisibleStatuses] } },
      include: listInclude,
      orderBy: [{ assignedAt: 'desc' }, { assetTag: 'asc' }],
      take: 200,
    });
    const paths = await this.locationPaths();
    const links = await this.prisma.ticketAsset.findMany({
      where: { assetId: { in: rows.map((row) => row.id) }, ticket: { requesterId: viewer.userId } },
      orderBy: { linkedAt: 'desc' },
      include: { ticket: { select: { id: true, ticketNumber: true, title: true, status: true, createdAt: true } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        assetTag: row.assetTag,
        name: row.name,
        status: row.status,
        type: row.type,
        manufacturer: row.manufacturer,
        model: row.model,
        location: row.location === null ? null : { id: row.location.id, label: locationLabel(row.location, paths) },
        assignedAt: row.assignedAt?.toISOString() ?? null,
        warrantyEndsAt: dateOnly(row.warrantyEndsAt),
        tickets: links
          .filter((link) => link.assetId === row.id)
          .slice(0, 20)
          .map((link) => ({
            id: link.ticket.id,
            ticketNumber: link.ticket.ticketNumber,
            title: link.ticket.title,
            status: link.ticket.status,
            createdAt: link.ticket.createdAt.toISOString(),
          })),
      })),
    };
  }

  // ------------------------------------------------------------ writes

  async create(input: SaveAssetInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    const type = await this.validateReferences(input);
    if (type.archivedAt !== null) throw new AssetError(assetErrorCodes.typeArchived);
    const status = input.status ?? 'IN_STOCK';
    if (status === 'DISPOSED' || status === 'RETIRED' || status === 'LOST') throw new AssetError(assetErrorCodes.invalid, 'status');
    const data = this.baseData(input);
    const definitions = await this.attributeDefinitions(input.typeId);
    const validated = validateAssetAttributes({ definitions, values: input.attributes ?? {} });
    if (validated.issues.length > 0) {
      throw new AssetError(assetErrorCodes.attributeInvalid, attributeIssueDetail(validated.issues));
    }
    await this.assertUniqueAttributes(input.typeId, definitions, validated.attributes, null);
    const currency = await this.access.readSetting<string>(settingKeys.privateAssetsCurrency, assetDefaults.currency);
    const explicitTag = optionalText(input.assetTag, 64, 'assetTag');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const assetTag = await this.resolveTag(input.assetTag);
      try {
        const created = await this.prisma.$transaction(async (transaction) => {
          const row = await transaction.asset.create({
            data: {
              ...data,
              assetTag,
              typeId: input.typeId,
              status,
              organizationalUnitId: input.organizationalUnitId,
              currency: data.purchaseCost === null ? null : currency,
              attributes: validated.attributes as Prisma.InputJsonValue,
              source: 'MANUAL',
            },
          });
          await this.event(transaction, row.id, assetEventActions.created, viewer, { assetTag, status });
          return row;
        });
        return { id: created.id, assetTag: created.assetTag };
      } catch (error) {
        const known = error as { code?: string; meta?: unknown };
        const isTagConflict = known.code === 'P2002' && JSON.stringify(known.meta ?? {}).includes('assetTag');
        if (!isTagConflict) throw error;
        if (explicitTag !== null) throw new AssetError(assetErrorCodes.tagTaken);
      }
    }
    throw new AssetError(assetErrorCodes.tagTaken);
  }

  async update(id: string, input: SaveAssetInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    const current = await this.loadInScope(id, scope);
    if (current.status === 'DISPOSED') throw new AssetError(assetErrorCodes.readOnly);
    if (input.version !== undefined && input.version !== current.version) throw new AssetError(assetErrorCodes.versionConflict);
    if (input.typeId !== current.typeId) {
      // Changing the type would orphan attribute values; allowed only without values.
      if (Object.keys((current.attributes ?? {}) as object).length > 0) throw new AssetError(assetErrorCodes.invalid, 'typeId');
    }
    if (input.organizationalUnitId !== current.organizationalUnitId) {
      await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    }
    await this.validateReferences(input);
    const data = this.baseData(input);
    if (current.source === 'DIRECTORY') {
      // §12: the directory owns the name; everything else stays editable.
      (data as { name: string }).name = current.name;
    }
    const definitions = await this.attributeDefinitions(input.typeId);
    const validated = validateAssetAttributes({
      definitions,
      values: input.attributes ?? {},
      current: input.typeId === current.typeId ? ((current.attributes ?? {}) as Record<string, unknown>) : {},
      partial: true,
    });
    if (validated.issues.length > 0) {
      throw new AssetError(assetErrorCodes.attributeInvalid, attributeIssueDetail(validated.issues));
    }
    await this.assertUniqueAttributes(input.typeId, definitions, validated.attributes, id);
    let assetTag = current.assetTag;
    const requestedTag = optionalText(input.assetTag, 64, 'assetTag');
    if (requestedTag !== null && requestedTag !== current.assetTag) {
      assetTag = await this.resolveTag(requestedTag);
      const taken = await this.prisma.asset.findUnique({ where: { assetTag }, select: { id: true } });
      if (taken !== null) throw new AssetError(assetErrorCodes.tagTaken);
    }
    const currency = await this.access.readSetting<string>(settingKeys.privateAssetsCurrency, assetDefaults.currency);
    const next = {
      ...data,
      assetTag,
      typeId: input.typeId,
      organizationalUnitId: input.organizationalUnitId,
      currency: data.purchaseCost === null ? null : (current.currency ?? currency),
      attributes: validated.attributes,
    };
    const changes = diffAsset(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
    if (Object.keys(changes).length === 0) return { id, version: current.version };
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.asset.updateMany({
        where: { id, version: current.version },
        data: {
          ...next,
          attributes: next.attributes as Prisma.InputJsonValue,
          // A changed warranty date re-arms its reminders.
          ...(changes.warrantyEndsAt ? { warrantyRemindersSent: [] } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new AssetError(assetErrorCodes.versionConflict);
      await this.event(transaction, id, assetEventActions.updated, viewer, { changes });
      return current.version + 1;
    });
    return { id, version: updated };
  }

  async changeStatus(id: string, status: AssetStatusValue, reason: string | undefined, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    const current = await this.loadInScope(id, scope);
    if (current.status === status) return { id, status };
    if (!canTransitionAssetStatus(current.status, status)) throw new AssetError(assetErrorCodes.statusTransition);
    const text = reason?.trim() ?? '';
    if (text.length > assetLimits.reasonMax) throw new AssetError(assetErrorCodes.invalid, 'reason');
    if (assetStatusesNeedingReason.includes(status) && text.length === 0) throw new AssetError(assetErrorCodes.reasonRequired);
    const releasesUser = status === 'RETIRED' || status === 'DISPOSED' || status === 'LOST';
    const releasedLicenses = await this.prisma.$transaction(async (transaction) => {
      await transaction.asset.update({
        where: { id },
        data: {
          status,
          version: { increment: 1 },
          ...(status === 'RETIRED' ? { retiredAt: new Date() } : {}),
          ...(status === 'IN_STOCK' && current.status === 'RETIRED' ? { retiredAt: null } : {}),
          ...(releasesUser && current.assignedUserId !== null
            ? { assignedUserId: null, assignedAt: null, assignmentSuggested: false }
            : {}),
        },
      });
      await this.event(transaction, id, assetEventActions.status, viewer, { from: current.status, to: status, reason: text || null });
      if (releasesUser && current.assignedUserId !== null) {
        await this.event(transaction, id, assetEventActions.unassigned, viewer, {
          userId: current.assignedUserId,
          reason: text || null,
          automatic: true,
        });
      }
      // §9: licences installed on a retired/disposed device are released.
      if (status === 'RETIRED' || status === 'DISPOSED') {
        const assignments = await transaction.licenseAssignment.findMany({ where: { assetId: id }, select: { id: true, licenseId: true } });
        if (assignments.length > 0) {
          await transaction.licenseAssignment.deleteMany({ where: { assetId: id } });
          await this.event(transaction, id, assetEventActions.licenseReleased, viewer, {
            licenseIds: assignments.map((assignment) => assignment.licenseId),
            automatic: true,
          });
        }
        return assignments.length;
      }
      return 0;
    });
    if (status === 'RETIRED' || status === 'DISPOSED') {
      await this.audit(status === 'RETIRED' ? auditLogActions.assetRetired : auditLogActions.assetDisposed, id, viewer, {
        assetTag: current.assetTag,
        reason: text,
        releasedLicenses,
      });
    }
    return { id, status };
  }

  async assign(id: string, input: { userId: string; organizationalUnitId?: string; note?: string }, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    const current = await this.loadInScope(id, scope);
    if (!assetAssignableStatuses.includes(current.status)) throw new AssetError(assetErrorCodes.statusTransition);
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true, anonymizedAt: true, organizationalUnitId: true },
    });
    if (user === null || !user.isActive || user.anonymizedAt !== null) throw new AssetError(assetErrorCodes.userNotFound);
    const organizationalUnitId = input.organizationalUnitId ?? current.organizationalUnitId;
    if (organizationalUnitId !== current.organizationalUnitId) await this.access.requireUnitInScope(scope, organizationalUnitId);
    const note = input.note?.trim() ?? '';
    if (note.length > assetLimits.reasonMax) throw new AssetError(assetErrorCodes.invalid, 'note');
    const nextStatus: AssetStatusValue = current.status === 'IN_REPAIR' ? 'IN_REPAIR' : 'IN_USE';
    await this.prisma.$transaction(async (transaction) => {
      await transaction.asset.update({
        where: { id },
        data: {
          assignedUserId: user.id,
          assignedAt: new Date(),
          assignmentSuggested: false,
          organizationalUnitId,
          status: nextStatus,
          version: { increment: 1 },
        },
      });
      if (current.assignedUserId !== null && current.assignedUserId !== user.id) {
        await this.event(transaction, id, assetEventActions.unassigned, viewer, { userId: current.assignedUserId, reassigned: true });
      }
      await this.event(transaction, id, assetEventActions.assigned, viewer, {
        userId: user.id,
        note: note || null,
        ...(nextStatus !== current.status ? { statusFrom: current.status, statusTo: nextStatus } : {}),
      });
    });
    return { id };
  }

  async unassign(id: string, input: { status?: AssetStatusValue; note?: string }, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    const current = await this.loadInScope(id, scope);
    if (current.assignedUserId === null) return { id };
    const nextStatus: AssetStatusValue = input.status ?? (current.status === 'IN_USE' ? 'IN_STOCK' : current.status);
    if (!canTransitionAssetStatus(current.status, nextStatus) || !['IN_STOCK', 'IN_REPAIR', 'IN_USE'].includes(nextStatus)) {
      throw new AssetError(assetErrorCodes.statusTransition);
    }
    const note = input.note?.trim() ?? '';
    if (note.length > assetLimits.reasonMax) throw new AssetError(assetErrorCodes.invalid, 'note');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.asset.update({
        where: { id },
        data: { assignedUserId: null, assignedAt: null, assignmentSuggested: false, status: nextStatus, version: { increment: 1 } },
      });
      await this.event(transaction, id, assetEventActions.unassigned, viewer, {
        userId: current.assignedUserId,
        note: note || null,
        ...(nextStatus !== current.status ? { statusFrom: current.status, statusTo: nextStatus } : {}),
      });
    });
    return { id };
  }

  /** §3: hard delete, SUPER_ADMIN only, never for an item with tickets or relations. */
  async remove(id: string, viewer: AssetViewer) {
    await this.access.requireEnabled();
    if (!viewer.isSuperAdmin) throw new AssetError(assetErrorCodes.forbidden);
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        assetTag: true,
        _count: { select: { tickets: true, relationsFrom: true, relationsTo: true } },
      },
    });
    if (asset === null) throw new AssetError(assetErrorCodes.notFound);
    if (asset._count.tickets + asset._count.relationsFrom + asset._count.relationsTo > 0) {
      throw new AssetError(assetErrorCodes.hasDependents);
    }
    await this.prisma.asset.delete({ where: { id } });
    await this.audit(auditLogActions.assetDeleted, id, viewer, { assetTag: asset.assetTag });
  }

  // ------------------------------------------------------------ history

  async history(id: string, viewer: AssetViewer, cursor?: string) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    await this.loadInScope(id, scope);
    const rows = await this.prisma.assetEvent.findMany({
      where: { assetId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: assetLimits.historyPage + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, assetLimits.historyPage);
    const userIds = new Set<string>();
    for (const row of page) {
      if (row.actorUserId) userIds.add(row.actorUserId);
      const detail = row.detail as Record<string, unknown>;
      if (typeof detail.userId === 'string') userIds.add(detail.userId);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, displayName: true, anonymizedAt: true },
    });
    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action,
        actorUserId: row.actorUserId,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
      })),
      users: Object.fromEntries(users.map((user) => [user.id, user.anonymizedAt === null ? user.displayName : null])),
      nextCursor: rows.length > assetLimits.historyPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // ------------------------------------------------------------ relations

  private loadEdges = async (assetIds: readonly string[], direction: 'out' | 'in'): Promise<RelationEdge[]> =>
    this.prisma.assetRelation.findMany({
      where: direction === 'out' ? { fromAssetId: { in: [...assetIds] } } : { toAssetId: { in: [...assetIds] } },
      select: { fromAssetId: true, toAssetId: true, kind: true },
    });

  private async relationsOf(assetId: string) {
    const summary = { select: { id: true, assetTag: true, name: true, status: true, type: { select: { icon: true, nameBs: true, nameEn: true } } } };
    const [outgoing, incoming] = await Promise.all([
      this.prisma.assetRelation.findMany({ where: { fromAssetId: assetId }, include: { to: summary }, orderBy: { createdAt: 'asc' } }),
      this.prisma.assetRelation.findMany({ where: { toAssetId: assetId }, include: { from: summary }, orderBy: { createdAt: 'asc' } }),
    ]);
    return [
      ...outgoing.map((relation) => ({ id: relation.id, kind: relation.kind, direction: 'out' as const, asset: relation.to })),
      ...incoming.map((relation) => ({ id: relation.id, kind: relation.kind, direction: 'in' as const, asset: relation.from })),
    ];
  }

  async addRelation(id: string, input: { toAssetId: string; kind: AssetRelationKindValue }, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    await this.loadInScope(id, scope);
    if (input.toAssetId === id) throw new AssetError(assetErrorCodes.relationSelf);
    const readScope = await this.access.scope(viewer, permissionKeys.assetRead);
    await this.loadInScope(input.toAssetId, readScope);
    const existing = await this.prisma.assetRelation.findFirst({
      where: {
        OR: [
          { fromAssetId: id, toAssetId: input.toAssetId, kind: input.kind },
          // CONNECTED_TO is symmetric: one row is enough.
          ...(input.kind === 'CONNECTED_TO' ? [{ fromAssetId: input.toAssetId, toAssetId: id, kind: input.kind }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing !== null) throw new AssetError(assetErrorCodes.relationExists);
    if (isDirectedRelation(input.kind) && (await wouldCreateRelationCycle(id, input.toAssetId, this.loadEdges))) {
      throw new AssetError(assetErrorCodes.relationCycle);
    }
    const relation = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.assetRelation.create({
        data: { fromAssetId: id, toAssetId: input.toAssetId, kind: input.kind, createdByUserId: viewer.userId },
      });
      await this.event(transaction, id, assetEventActions.relationAdded, viewer, { kind: input.kind, toAssetId: input.toAssetId, direction: 'out' });
      await this.event(transaction, input.toAssetId, assetEventActions.relationAdded, viewer, { kind: input.kind, fromAssetId: id, direction: 'in' });
      return created;
    });
    return { id: relation.id };
  }

  async removeRelation(id: string, relationId: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    await this.loadInScope(id, scope);
    const relation = await this.prisma.assetRelation.findUnique({ where: { id: relationId } });
    if (relation === null || (relation.fromAssetId !== id && relation.toAssetId !== id)) throw new AssetError(assetErrorCodes.notFound);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.assetRelation.delete({ where: { id: relationId } });
      const detail = { kind: relation.kind, fromAssetId: relation.fromAssetId, toAssetId: relation.toAssetId };
      await this.event(transaction, relation.fromAssetId, assetEventActions.relationRemoved, viewer, detail);
      await this.event(transaction, relation.toAssetId, assetEventActions.relationRemoved, viewer, detail);
    });
  }

  /** §6: what depends on the asset (in) and what it depends on (out), depth 3. */
  async impact(id: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    await this.loadInScope(id, scope);
    const [dependents, dependencies] = await Promise.all([
      collectRelationImpact(id, 'in', this.loadEdges),
      collectRelationImpact(id, 'out', this.loadEdges),
    ]);
    const ids = [...new Set([...dependents, ...dependencies].map((node) => node.assetId))];
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        assetTag: true,
        name: true,
        status: true,
        type: { select: { icon: true, nameBs: true, nameEn: true } },
        organizationalUnit: { select: { ouPath: true } },
      },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    // Items outside the read scope are shown as a count only.
    const shape = (nodes: typeof dependents) => {
      let hidden = 0;
      const visible = nodes.flatMap((node) => {
        const asset = byId.get(node.assetId);
        if (asset === undefined || !isPathInScope(scope, asset.organizationalUnit.ouPath)) {
          hidden += 1;
          return [];
        }
        const { organizationalUnit: _unit, ...rest } = asset;
        return [{ ...node, asset: rest }];
      });
      return { items: visible, hidden };
    };
    return { dependents: shape(dependents), dependencies: shape(dependencies) };
  }
}

const trackedFields = [
  'assetTag',
  'typeId',
  'name',
  'serialNumber',
  'manufacturer',
  'model',
  'organizationalUnitId',
  'locationId',
  'serviceId',
  'purchaseDate',
  'purchaseCost',
  'supplier',
  'warrantyEndsAt',
  'notes',
] as const;

function comparable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toFixed' in value) return Number(value as never).toFixed(2);
  return String(value);
}

/** Field-level diff for the history (§16): { field: [old, new] }. */
export function diffAsset(current: Record<string, unknown>, next: Record<string, unknown>): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const field of trackedFields) {
    const before = comparable(current[field]);
    const after = comparable(next[field]);
    if (before !== after) changes[field] = [before, after];
  }
  const beforeAttributes = (current.attributes ?? {}) as Record<string, unknown>;
  const afterAttributes = (next.attributes ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(beforeAttributes), ...Object.keys(afterAttributes)])) {
    const before = comparable(beforeAttributes[key]);
    const after = comparable(afterAttributes[key]);
    if (before !== after) changes[`attributes.${key}`] = [before, after];
  }
  return changes;
}
