import { Injectable } from '@nestjs/common';
import { checkLocationParent } from './asset-locations';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { permissionKeys } from '../authorization/authorization.constants';
import { AssetAccessService } from './asset-access.service';
import type { AssetViewer } from './asset-viewer';
import {
  AssetError,
  assetAttributeKeyPattern,
  assetErrorCodes,
  assetKeyPattern,
  assetLimits,
  assetTypeIconNames,
  type AssetAttributeDataTypeValue,
} from './assets.constants';

export type SaveAssetTypeInput = {
  readonly key?: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
  readonly category: 'HARDWARE' | 'SOFTWARE' | 'NETWORK' | 'INFRASTRUCTURE' | 'OTHER';
  readonly isUserSelectable: boolean;
  readonly routingGroupId?: string | null;
  readonly sortOrder: number;
};

export type SaveAssetAttributeInput = {
  readonly key?: string;
  readonly labelBs: string;
  readonly labelEn: string;
  readonly dataType: AssetAttributeDataTypeValue;
  readonly options?: readonly string[];
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly sortOrder: number;
};

export type SaveAssetLocationInput = {
  readonly parentId?: string | null;
  readonly name: string;
  readonly code?: string | null;
  readonly sortOrder: number;
};

function trimmed(value: string, max: number, field: string): string {
  const text = value.trim();
  if (text.length === 0 || text.length > max) throw new AssetError(assetErrorCodes.invalid, field);
  return text;
}

function cleanOptions(options: readonly string[] | undefined): string[] {
  const values = [...new Set((options ?? []).map((option) => option.trim()).filter((option) => option.length > 0))];
  if (values.length === 0 || values.length > assetLimits.selectOptionsMax || values.some((value) => value.length > 80)) {
    throw new AssetError(assetErrorCodes.invalid, 'options');
  }
  return values;
}

/**
 * Paket 3.2 (§4, §7): asset types with their attributes, and locations.
 * Reading is open to every signed-in user while the module is on (the
 * "My equipment" page and the ticket picker need names and icons); writing
 * needs asset.type.manage. Nothing is deleted: types, attributes and
 * locations are archived so stored values and history stay readable.
 */
@Injectable()
export class AssetCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  async catalog(includeArchived: boolean, viewer: AssetViewer) {
    await this.access.requireEnabled();
    const canSeeArchived = includeArchived && (await this.canManageTypes(viewer));
    const canManageTypes = await this.canManageTypes(viewer);
    const [types, locations, groups] = await Promise.all([
      this.prisma.assetType.findMany({
        where: canSeeArchived ? {} : { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { nameBs: 'asc' }],
        include: {
          attributes: {
            where: canSeeArchived ? {} : { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
          },
          _count: { select: { assets: true } },
        },
      }),
      this.prisma.assetLocation.findMany({
        where: canSeeArchived ? {} : { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { assets: true } } },
      }),
      // C9b: handler groups for "tickets about this type" (type managers only).
      canManageTypes
        ? this.prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    return {
      types: types.map((type) => ({
        id: type.id,
        key: type.key,
        nameBs: type.nameBs,
        nameEn: type.nameEn,
        icon: type.icon,
        category: type.category,
        isUserSelectable: type.isUserSelectable,
        routingGroupId: type.routingGroupId,
        sortOrder: type.sortOrder,
        archivedAt: type.archivedAt?.toISOString() ?? null,
        assetCount: type._count.assets,
        attributes: type.attributes.map((attribute) => ({
          id: attribute.id,
          key: attribute.key,
          labelBs: attribute.labelBs,
          labelEn: attribute.labelEn,
          dataType: attribute.dataType,
          options: Array.isArray(attribute.options) ? attribute.options : [],
          isRequired: attribute.isRequired,
          isUnique: attribute.isUnique,
          sortOrder: attribute.sortOrder,
          archivedAt: attribute.archivedAt?.toISOString() ?? null,
        })),
      })),
      groups,
      locations: locations.map((location) => ({
        id: location.id,
        parentId: location.parentId,
        name: location.name,
        code: location.code,
        sortOrder: location.sortOrder,
        archivedAt: location.archivedAt?.toISOString() ?? null,
        assetCount: location._count.assets,
      })),
      iconNames: assetTypeIconNames,
    };
  }

  private async canManageTypes(viewer: AssetViewer): Promise<boolean> {
    try {
      await this.access.require(viewer, permissionKeys.assetTypeManage);
      return true;
    } catch {
      return false;
    }
  }

  private async audit(action: string, entityType: string, entityId: string, viewer: AssetViewer, metadata: Record<string, unknown>) {
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action,
      entityType,
      entityId,
      metadata: metadata as never,
      actorUserId: viewer.userId,
    });
  }

  private async validateType(input: SaveAssetTypeInput) {
    const routingGroupId = input.routingGroupId?.trim() || null;
    if (routingGroupId !== null && (await this.prisma.group.findUnique({ where: { id: routingGroupId }, select: { id: true } })) === null) {
      throw new AssetError(assetErrorCodes.invalid, 'routingGroupId');
    }
    if (!(assetTypeIconNames as readonly string[]).includes(input.icon)) throw new AssetError(assetErrorCodes.invalid, 'icon');
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999) {
      throw new AssetError(assetErrorCodes.invalid, 'sortOrder');
    }
    return {
      nameBs: trimmed(input.nameBs, 80, 'nameBs'),
      nameEn: trimmed(input.nameEn, 80, 'nameEn'),
      icon: input.icon,
      category: input.category,
      isUserSelectable: input.isUserSelectable,
      routingGroupId,
      sortOrder: input.sortOrder,
    };
  }

  async createType(input: SaveAssetTypeInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const key = (input.key ?? '').trim();
    if (!assetKeyPattern.test(key)) throw new AssetError(assetErrorCodes.invalid, 'key');
    const data = await this.validateType(input);
    if ((await this.prisma.assetType.findUnique({ where: { key }, select: { id: true } })) !== null) {
      throw new AssetError(assetErrorCodes.typeKeyTaken);
    }
    const created = await this.prisma.assetType.create({ data: { key, ...data } });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, created.id, viewer, { key, created: true });
    return { id: created.id };
  }

  async updateType(id: string, input: SaveAssetTypeInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const existing = await this.prisma.assetType.findUnique({ where: { id }, select: { id: true, key: true } });
    if (existing === null) throw new AssetError(assetErrorCodes.typeNotFound);
    await this.prisma.assetType.update({ where: { id }, data: await this.validateType(input) });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, id, viewer, { key: existing.key, routingGroupId: input.routingGroupId ?? null });
    return { id };
  }

  async setTypeArchived(id: string, archived: boolean, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const existing = await this.prisma.assetType.findUnique({ where: { id }, select: { id: true, key: true } });
    if (existing === null) throw new AssetError(assetErrorCodes.typeNotFound);
    await this.prisma.assetType.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, id, viewer, { key: existing.key, archived });
    return { id };
  }

  private validateAttribute(input: SaveAssetAttributeInput) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999) {
      throw new AssetError(assetErrorCodes.invalid, 'sortOrder');
    }
    if (input.isUnique && input.dataType === 'BOOLEAN') throw new AssetError(assetErrorCodes.invalid, 'isUnique');
    return {
      labelBs: trimmed(input.labelBs, 80, 'labelBs'),
      labelEn: trimmed(input.labelEn, 80, 'labelEn'),
      dataType: input.dataType,
      options: input.dataType === 'SELECT' ? cleanOptions(input.options) : undefined,
      isRequired: input.isRequired,
      isUnique: input.isUnique,
      sortOrder: input.sortOrder,
    };
  }

  /** Whether any asset of the type has a value for the attribute key. */
  private async attributeHasValues(typeId: string, key: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "Asset" WHERE "typeId" = ${typeId} AND "attributes" ? ${key}
      ) AS "found"`;
    return rows[0]?.found === true;
  }

  async createAttribute(typeId: string, input: SaveAssetAttributeInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const type = await this.prisma.assetType.findUnique({
      where: { id: typeId },
      select: { id: true, key: true, _count: { select: { attributes: true } } },
    });
    if (type === null) throw new AssetError(assetErrorCodes.typeNotFound);
    if (type._count.attributes >= assetLimits.attributesPerType) throw new AssetError(assetErrorCodes.invalid, 'attributes');
    const key = (input.key ?? '').trim();
    if (!assetAttributeKeyPattern.test(key)) throw new AssetError(assetErrorCodes.invalid, 'key');
    const data = this.validateAttribute(input);
    const taken = await this.prisma.assetAttribute.findUnique({ where: { typeId_key: { typeId, key } }, select: { id: true } });
    if (taken !== null) throw new AssetError(assetErrorCodes.attributeKeyTaken);
    const created = await this.prisma.assetAttribute.create({
      data: { typeId, key, ...data, options: data.options ?? undefined },
    });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, typeId, viewer, {
      key: type.key,
      attribute: key,
      created: true,
    });
    return { id: created.id };
  }

  async updateAttribute(id: string, input: SaveAssetAttributeInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const existing = await this.prisma.assetAttribute.findUnique({ where: { id } });
    if (existing === null) throw new AssetError(assetErrorCodes.typeNotFound);
    const data = this.validateAttribute(input);
    // §4: the data type changes only while nobody stored a value.
    if (data.dataType !== existing.dataType && (await this.attributeHasValues(existing.typeId, existing.key))) {
      throw new AssetError(assetErrorCodes.attributeHasValues);
    }
    await this.prisma.assetAttribute.update({
      where: { id },
      data: { ...data, options: data.options ?? (data.dataType === 'SELECT' ? undefined : []) },
    });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, existing.typeId, viewer, {
      attribute: existing.key,
    });
    return { id };
  }

  async setAttributeArchived(id: string, archived: boolean, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const existing = await this.prisma.assetAttribute.findUnique({ where: { id }, select: { id: true, typeId: true, key: true } });
    if (existing === null) throw new AssetError(assetErrorCodes.typeNotFound);
    await this.prisma.assetAttribute.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit(auditLogActions.assetTypeSaved, auditLogEntityTypes.assetType, existing.typeId, viewer, {
      attribute: existing.key,
      archived,
    });
    return { id };
  }

  private async validateLocation(input: SaveAssetLocationInput, selfId: string | null) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999) {
      throw new AssetError(assetErrorCodes.invalid, 'sortOrder');
    }
    const name = trimmed(input.name, 120, 'name');
    const code = input.code === undefined || input.code === null || input.code.trim() === '' ? null : input.code.trim();
    if (code !== null && !/^[A-Za-z0-9._/-]{1,32}$/.test(code)) throw new AssetError(assetErrorCodes.invalid, 'code');
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      if (parentId === selfId) throw new AssetError(assetErrorCodes.invalid, 'parentId');
      const nodes = await this.prisma.assetLocation.findMany({ select: { id: true, name: true, parentId: true } });
      if (!nodes.some((node) => node.id === parentId)) throw new AssetError(assetErrorCodes.locationNotFound);
      // §7: a tree up to locationDepthMax levels, never a cycle.
      const problem = checkLocationParent(nodes, selfId, parentId, assetLimits.locationDepthMax);
      if (problem !== null) throw new AssetError(assetErrorCodes.invalid, problem === 'depth' ? 'parentId:depth' : 'parentId');
    }
    if (code !== null) {
      const taken = await this.prisma.assetLocation.findUnique({ where: { code }, select: { id: true } });
      if (taken !== null && taken.id !== selfId) throw new AssetError(assetErrorCodes.locationCodeTaken);
    }
    return { name, code, parentId, sortOrder: input.sortOrder };
  }

  async createLocation(input: SaveAssetLocationInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const created = await this.prisma.assetLocation.create({ data: await this.validateLocation(input, null) });
    await this.audit(auditLogActions.assetLocationSaved, auditLogEntityTypes.assetLocation, created.id, viewer, { created: true });
    return { id: created.id };
  }

  async updateLocation(id: string, input: SaveAssetLocationInput, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    if ((await this.prisma.assetLocation.findUnique({ where: { id }, select: { id: true } })) === null) {
      throw new AssetError(assetErrorCodes.locationNotFound);
    }
    await this.prisma.assetLocation.update({ where: { id }, data: await this.validateLocation(input, id) });
    await this.audit(auditLogActions.assetLocationSaved, auditLogEntityTypes.assetLocation, id, viewer, {});
    return { id };
  }

  async setLocationArchived(id: string, archived: boolean, viewer: AssetViewer) {
    await this.access.require(viewer, permissionKeys.assetTypeManage);
    const existing = await this.prisma.assetLocation.findUnique({
      where: { id },
      select: { id: true, _count: { select: { children: { where: { archivedAt: null } } } } },
    });
    if (existing === null) throw new AssetError(assetErrorCodes.locationNotFound);
    if (archived && existing._count.children > 0) throw new AssetError(assetErrorCodes.locationInUse);
    await this.prisma.assetLocation.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit(auditLogActions.assetLocationSaved, auditLogEntityTypes.assetLocation, id, viewer, { archived });
    return { id };
  }
}
