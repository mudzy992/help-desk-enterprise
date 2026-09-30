import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { permissionKeys } from '../../authorization/authorization.constants';
import { assetDefaults } from '../../settings/definitions/asset-settings';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { detectFileSignature } from '../../tickets/attachments/detect-file-signature';
import { resolveContainedStoragePath, resolveUploadRoot } from '../../tickets/attachments/resolve-upload-root';
import { scanAttachmentWithClamav } from '../../tickets/attachments/scan-attachment-with-clamav';
import { TicketsError } from '../../tickets/tickets.error';
import { AssetAccessService } from '../asset-access.service';
import { buildLocationPaths } from '../asset-locations';
import { isPathInScope, unitScopeWhere, viewerHasPermission, type AssetScope, type AssetViewer } from '../asset-viewer';
import { AssetError, assetErrorCodes, assetEventActions, canTransitionAssetStatus, type AssetStatusValue } from '../assets.constants';
import {
  assetTransferLimits,
  resolveSignatory,
  scrubSnapshotParty,
  signatoryUnitOwner,
  transferDocumentData,
  validateMove,
  warehouseParty,
  sampleTransferSnapshot,
  type AssetTransferScenarioValue,
  type MoveProblem,
  type ResolvedSignatory,
  type SignatoryEntry,
  type SignatoryUnit,
  type TransferParty,
  type TransferSnapshot,
  type TransferSnapshotItem,
} from './plan-asset-transfer';
import {
  TransferRenderError,
  buildDefaultTransferTemplate,
  inspectTransferTemplate,
  renderTransferDocument,
  transferTemplateLimits,
  type TransferLocale,
} from './transfer-document';
import { defaultTransferNumberFormat, formatTransferNumber, localDateParts } from './transfer-number';

export type MoveInput = {
  readonly scenario: AssetTransferScenarioValue;
  readonly assetIds: readonly string[];
  readonly toUserId?: string | null;
  readonly fromLabel?: string | null;
  readonly toLabel?: string | null;
  readonly organizationalUnitId?: string | null;
  readonly locationId?: string | null;
  readonly returnStatus?: 'IN_STOCK' | 'IN_REPAIR' | null;
  readonly note?: string | null;
  readonly issueDocument?: boolean;
  readonly signatoryUserId?: string | null;
};

export type TransferListQuery = {
  readonly search?: string;
  readonly status?: 'ISSUED' | 'SIGNED' | 'CANCELLED';
  readonly scenario?: AssetTransferScenarioValue;
  readonly userId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

export type UploadedFile = { readonly fileName: string; readonly buffer: Buffer };

const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const signedMimeExtensions: Readonly<Record<string, string>> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const transferStorageRoot = 'assets/transfers';
const assignableForIssue = new Set<string>(['ORDERED', 'IN_STOCK', 'IN_REPAIR']);

const userSelect = {
  id: true,
  displayName: true,
  email: true,
  isActive: true,
  anonymizedAt: true,
  organizationalUnitId: true,
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
} as const;

type PartyUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const transferListSelect = {
  id: true,
  number: true,
  scenario: true,
  status: true,
  fromUserId: true,
  toUserId: true,
  fromLabel: true,
  toLabel: true,
  issuedAt: true,
  signedAt: true,
  cancelledAt: true,
  cancelReason: true,
  signedFileName: true,
  snapshot: true,
  _count: { select: { items: true } },
} as const;

type TransferListRow = Prisma.AssetTransferGetPayload<{ select: typeof transferListSelect }>;

function party(user: PartyUser, title = ''): TransferParty {
  return { userId: user.id, name: user.displayName, title, unit: user.organizationalUnit?.name ?? '', email: user.email };
}

function cleanText(value: string | null | undefined, max: number, field: string): string {
  const text = (value ?? '').trim();
  if (text.length > max) throw new AssetError(assetErrorCodes.transferInvalid, field);
  return text;
}

function problemDetail(problem: MoveProblem): string {
  return 'assetTag' in problem ? `${problem.code}:${problem.assetTag}` : problem.code;
}

function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = Array.from(name, (char) => (char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '_' : char)).join('').trim();
  return (cleaned || fallback).slice(0, 200);
}

/**
 * Paket 3.2 C9 (§7a): equipment moves with transfer records. A move and its
 * record are one transaction (asset rows, history events, monthly number,
 * record). The DOCX is rendered on demand from the frozen snapshot, so a
 * re-download always shows what was issued.
 */
@Injectable()
export class AssetTransfersService {
  private readonly logger = new Logger(AssetTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------ configuration

  async configuration() {
    const [enabled, required, numberFormat, warehouseLabel, place, defaultSignatoryUserId] = await Promise.all([
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferEnabled, assetDefaults.transferEnabled),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferRequired, assetDefaults.transferRequired),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferNumberFormat, assetDefaults.transferNumberFormat),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferWarehouseLabel, assetDefaults.transferWarehouseLabel),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferPlace, assetDefaults.transferPlace),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTransferDefaultSignatoryUserId, assetDefaults.transferDefaultSignatoryUserId),
    ]);
    const isEnabled = enabled === true;
    return {
      enabled: isEnabled,
      required: isEnabled && required === true,
      numberFormat: typeof numberFormat === 'string' && numberFormat ? numberFormat : defaultTransferNumberFormat,
      warehouseLabel: typeof warehouseLabel === 'string' ? warehouseLabel : '',
      place: typeof place === 'string' ? place : '',
      defaultSignatoryUserId: typeof defaultSignatoryUserId === 'string' && defaultSignatoryUserId.trim() ? defaultSignatoryUserId.trim() : null,
    };
  }

  /** Old assign/unassign endpoints: refused when every move needs a record. */
  async assertDirectMoveAllowed(): Promise<void> {
    if ((await this.configuration()).required) throw new AssetError(assetErrorCodes.transferRequired);
  }

  private async documentLocale(): Promise<TransferLocale> {
    const value = await this.access.readSetting<unknown>(settingKeys.privateI18nDefaultLocale, 'bs');
    return typeof value === 'string' && value.toLowerCase().startsWith('en') ? 'en' : 'bs';
  }

  // ------------------------------------------------------------ signatory

  private async signatoryIndex() {
    const [units, signatories] = await Promise.all([
      this.prisma.organizationalUnit.findMany({ select: { id: true, parentId: true } }),
      this.prisma.assetSignatory.findMany({ select: { organizationalUnitId: true, userId: true, title: true, user: { select: { isActive: true, anonymizedAt: true } } } }),
    ]);
    const unitMap = new Map<string, SignatoryUnit>(units.map((unit) => [unit.id, unit]));
    const signatoryMap = new Map<string, SignatoryEntry>(
      signatories.map((entry) => [entry.organizationalUnitId, { userId: entry.userId, title: entry.title, isActive: entry.user.isActive && entry.user.anonymizedAt === null }]),
    );
    return { units: unitMap, signatories: signatoryMap };
  }

  private async resolveSignatoryFor(unitId: string | null, defaultUserId: string | null): Promise<ResolvedSignatory> {
    const index = await this.signatoryIndex();
    return resolveSignatory({ unitId, units: index.units, signatories: index.signatories, defaultUserId });
  }

  // ------------------------------------------------------------ moves

  private async loadMove(input: MoveInput, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    const ids = [...new Set(input.assetIds)];
    if (ids.length === 0 || ids.length > assetTransferLimits.itemsMax) throw new AssetError(assetErrorCodes.transferInvalid, 'assetIds');
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      include: {
        type: { select: { nameBs: true, nameEn: true } },
        organizationalUnit: { select: { id: true, ouPath: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const ordered = ids.map((id) => byId.get(id));
    if (ordered.some((asset) => asset === undefined || !isPathInScope(scope, asset.organizationalUnit.ouPath))) {
      throw new AssetError(assetErrorCodes.notFound);
    }
    const loaded = ordered as NonNullable<(typeof ordered)[number]>[];
    const toUser = input.toUserId ? await this.prisma.user.findUnique({ where: { id: input.toUserId }, select: userSelect }) : null;
    if (input.toUserId && (toUser === null || !toUser.isActive || toUser.anonymizedAt !== null)) throw new AssetError(assetErrorCodes.userNotFound);
    const receiverId = input.scenario === 'USER_TO_WAREHOUSE' ? null : (toUser?.id ?? null);
    const returnStatus = input.scenario === 'USER_TO_WAREHOUSE' ? (input.returnStatus ?? null) : null;
    const validation = validateMove({
      scenario: input.scenario,
      assets: loaded.map((asset) => ({ id: asset.id, assetTag: asset.assetTag, status: asset.status, assignedUserId: asset.assignedUserId })),
      toUserId: receiverId,
      returnStatus,
    });
    const fromUser = validation.fromUserId ? await this.prisma.user.findUnique({ where: { id: validation.fromUserId }, select: userSelect }) : null;
    let unit: { id: string; ouPath: string; name: string } | null = null;
    if (input.organizationalUnitId) unit = await this.access.requireUnitInScope(scope, input.organizationalUnitId);
    if (input.locationId) {
      const location = await this.prisma.assetLocation.findUnique({ where: { id: input.locationId }, select: { id: true, archivedAt: true } });
      if (location === null || location.archivedAt !== null) throw new AssetError(assetErrorCodes.locationNotFound);
    }
    return { scope, assets: loaded, toUser: input.scenario === 'USER_TO_WAREHOUSE' ? null : toUser, fromUser, unit, problems: validation.problems };
  }

  private nextStatus(scenario: AssetTransferScenarioValue, current: AssetStatusValue, returnStatus: 'IN_STOCK' | 'IN_REPAIR' | null | undefined): AssetStatusValue {
    if (scenario === 'USER_TO_WAREHOUSE') return returnStatus ?? (current === 'IN_REPAIR' ? 'IN_REPAIR' : 'IN_STOCK');
    return current === 'IN_REPAIR' ? 'IN_REPAIR' : 'IN_USE';
  }

  private async signatoryParty(
    scenario: AssetTransferScenarioValue,
    fromUser: PartyUser | null,
    toUser: PartyUser | null,
    overrideUserId: string | null | undefined,
    defaultUserId: string | null,
  ): Promise<{ party: TransferParty; resolved: ResolvedSignatory | null }> {
    const empty: TransferParty = { userId: null, name: '', title: '', unit: '', email: '' };
    if (overrideUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: overrideUserId }, select: userSelect });
      if (user === null || !user.isActive || user.anonymizedAt !== null) throw new AssetError(assetErrorCodes.userNotFound);
      const own = await this.prisma.assetSignatory.findFirst({ where: { userId: user.id }, select: { title: true } });
      return { party: party(user, own?.title ?? ''), resolved: null };
    }
    const owner = signatoryUnitOwner(scenario) === 'from' ? fromUser : toUser;
    const resolved = await this.resolveSignatoryFor(owner?.organizationalUnitId ?? null, defaultUserId);
    if (resolved.userId === null) return { party: empty, resolved };
    const user = await this.prisma.user.findUnique({ where: { id: resolved.userId }, select: userSelect });
    if (user === null) return { party: empty, resolved: { userId: null, source: 'none' } };
    return { party: party(user, resolved.source === 'unit' ? (resolved.title ?? '') : ''), resolved };
  }

  async preview(input: MoveInput, viewer: AssetViewer) {
    const configuration = await this.configuration();
    const locale = await this.documentLocale();
    const loaded = await this.loadMove(input, viewer);
    const signatory = await this.signatoryParty(input.scenario, loaded.fromUser, loaded.toUser, input.signatoryUserId, configuration.defaultSignatoryUserId);
    const from = loaded.fromUser ? party(loaded.fromUser) : warehouseParty(input.fromLabel, configuration.warehouseLabel, locale);
    const to = loaded.toUser ? party(loaded.toUser) : warehouseParty(input.toLabel, configuration.warehouseLabel, locale);
    return {
      scenario: input.scenario,
      transferEnabled: configuration.enabled,
      transferRequired: configuration.required,
      from,
      to,
      signatory: signatory.party,
      signatorySource: signatory.resolved?.source ?? 'manual',
      suggestedOrganizationalUnitId: loaded.toUser?.organizationalUnitId ?? null,
      problems: loaded.problems.map(problemDetail),
      items: loaded.assets.map((asset) => ({
        id: asset.id,
        assetTag: asset.assetTag,
        name: asset.name,
        status: asset.status,
        nextStatus: this.nextStatus(input.scenario, asset.status, input.returnStatus),
        assignedUserId: asset.assignedUserId,
      })),
    };
  }

  async move(input: MoveInput, viewer: AssetViewer) {
    const configuration = await this.configuration();
    const issue = configuration.enabled && (configuration.required || input.issueDocument !== false);
    const note = cleanText(input.note, assetTransferLimits.noteMax, 'note');
    const fromLabel = cleanText(input.fromLabel, assetTransferLimits.labelMax, 'fromLabel');
    const toLabel = cleanText(input.toLabel, assetTransferLimits.labelMax, 'toLabel');
    const loaded = await this.loadMove(input, viewer);
    if (loaded.problems.length > 0) {
      const statusProblem = loaded.problems.some((problem) => problem.code === 'not_in_stock' || problem.code === 'return_status');
      throw new AssetError(statusProblem ? assetErrorCodes.statusTransition : assetErrorCodes.transferInvalid, loaded.problems.map(problemDetail).join(','));
    }
    const plans = loaded.assets.map((asset) => {
      const next = this.nextStatus(input.scenario, asset.status, input.returnStatus);
      if (next !== asset.status && !canTransitionAssetStatus(asset.status, next)) throw new AssetError(assetErrorCodes.statusTransition, asset.assetTag);
      if (input.scenario === 'WAREHOUSE_TO_USER' && !assignableForIssue.has(asset.status)) throw new AssetError(assetErrorCodes.statusTransition, asset.assetTag);
      return { asset, next };
    });

    const locale = await this.documentLocale();
    const timeZone = await readInstallationTimeZone(this.settings);
    const signatory = issue
      ? await this.signatoryParty(input.scenario, loaded.fromUser, loaded.toUser, input.signatoryUserId, configuration.defaultSignatoryUserId)
      : null;
    const issuer = await this.prisma.user.findUnique({ where: { id: viewer.userId }, select: userSelect });
    const template = issue ? await this.prisma.assetTransferTemplate.findFirst({ orderBy: { version: 'desc' }, select: { id: true, version: true } }) : null;
    const locationPaths = buildLocationPaths(await this.prisma.assetLocation.findMany({ select: { id: true, name: true, parentId: true } }));
    const now = new Date();
    const date = localDateParts(now, timeZone);

    const result = await this.prisma.$transaction(async (transaction) => {
      let transfer: { id: string; number: string } | null = null;
      if (issue && signatory) {
        const rows = await transaction.$queryRaw<{ lastNumber: number }[]>`
          INSERT INTO "AssetTransferSequence" ("year", "month", "lastNumber") VALUES (${date.year}, ${date.month}, 1)
          ON CONFLICT ("year", "month") DO UPDATE SET "lastNumber" = "AssetTransferSequence"."lastNumber" + 1
          RETURNING "lastNumber"`;
        const sequence = Number(rows[0]?.lastNumber ?? 1);
        const number = formatTransferNumber(configuration.numberFormat, { ...date, sequence });
        const items: TransferSnapshotItem[] = plans.map(({ asset }) => ({
          assetId: asset.id,
          name: asset.name,
          assetTag: asset.assetTag,
          serialNumber: asset.serialNumber ?? '',
          type: locale === 'en' ? asset.type.nameEn : asset.type.nameBs,
          manufacturer: asset.manufacturer ?? '',
          model: asset.model ?? '',
          location: asset.location ? (locationPaths.get(asset.location.id) ?? asset.location.name) : '',
          note: '',
        }));
        const snapshot: TransferSnapshot = {
          version: 1,
          locale,
          number,
          scenario: input.scenario,
          issuedAt: now.toISOString(),
          timeZone,
          place: configuration.place,
          from: loaded.fromUser ? party(loaded.fromUser) : warehouseParty(fromLabel, configuration.warehouseLabel, locale),
          to: loaded.toUser ? party(loaded.toUser) : warehouseParty(toLabel, configuration.warehouseLabel, locale),
          signatory: signatory.party,
          issuedBy: issuer ? party(issuer) : { userId: viewer.userId, name: '', title: '', unit: '', email: '' },
          note,
          items,
        };
        transfer = await transaction.assetTransfer.create({
          data: {
            number,
            year: date.year,
            month: date.month,
            sequence,
            scenario: input.scenario,
            fromUserId: loaded.fromUser?.id ?? null,
            fromLabel: loaded.fromUser ? null : snapshot.from.name,
            toUserId: loaded.toUser?.id ?? null,
            toLabel: loaded.toUser ? null : snapshot.to.name,
            signatoryUserId: signatory.party.userId,
            issuedByUserId: viewer.userId,
            note: note || null,
            templateId: template?.id ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            issuedAt: now,
            items: { create: plans.map(({ asset }, index) => ({ assetId: asset.id, position: index + 1 })) },
          },
          select: { id: true, number: true },
        });
      }
      for (const { asset, next } of plans) {
        const receiving = input.scenario !== 'USER_TO_WAREHOUSE';
        const updated = await transaction.asset.updateMany({
          where: { id: asset.id, version: asset.version, assignedUserId: asset.assignedUserId },
          data: {
            assignedUserId: receiving ? loaded.toUser?.id : null,
            assignedAt: receiving ? now : null,
            assignmentSuggested: false,
            status: next,
            ...(loaded.unit ? { organizationalUnitId: loaded.unit.id } : {}),
            ...(input.locationId ? { locationId: input.locationId } : {}),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new AssetError(assetErrorCodes.versionConflict, asset.assetTag);
        const link = transfer ? { transferId: transfer.id, transferNumber: transfer.number } : {};
        const statusChange = next !== asset.status ? { statusFrom: asset.status, statusTo: next } : {};
        if (asset.assignedUserId !== null) {
          await transaction.assetEvent.create({
            data: {
              assetId: asset.id,
              action: assetEventActions.unassigned,
              actorUserId: viewer.userId,
              detail: { userId: asset.assignedUserId, note: note || null, reassigned: receiving, ...link, ...(receiving ? {} : statusChange) } as Prisma.InputJsonValue,
            },
          });
        }
        if (receiving && loaded.toUser) {
          await transaction.assetEvent.create({
            data: {
              assetId: asset.id,
              action: assetEventActions.assigned,
              actorUserId: viewer.userId,
              detail: { userId: loaded.toUser.id, note: note || null, ...link, ...statusChange } as Prisma.InputJsonValue,
            },
          });
        }
      }
      return transfer;
    });

    if (result) {
      await this.audit(auditLogActions.assetTransferIssued, result.id, viewer, {
        number: result.number,
        scenario: input.scenario,
        assetCount: plans.length,
        fromUserId: loaded.fromUser?.id ?? null,
        toUserId: loaded.toUser?.id ?? null,
      });
    }
    return { transferId: result?.id ?? null, number: result?.number ?? null, movedAssetIds: plans.map(({ asset }) => asset.id) };
  }

  // ------------------------------------------------------------ records

  /**
   * Managers see records that touch an asset in their scope; everybody sees
   * records where they hand over or receive (My equipment).
   */
  private async visibility(viewer: AssetViewer): Promise<{ manager: AssetScope | null }> {
    await this.access.requireEnabled();
    if (!viewerHasPermission(viewer, permissionKeys.assetRead)) return { manager: null };
    return { manager: await this.access.scope(viewer, permissionKeys.assetRead) };
  }

  private visibleWhere(viewer: AssetViewer, manager: AssetScope | null): Prisma.AssetTransferWhereInput {
    const own: Prisma.AssetTransferWhereInput = { OR: [{ fromUserId: viewer.userId }, { toUserId: viewer.userId }] };
    if (manager === null) return own;
    if (manager.all) return {};
    const unitWhere = unitScopeWhere(manager);
    if (unitWhere === null) return own;
    return { OR: [own, { items: { some: { asset: { organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput } } } }, { issuedByUserId: viewer.userId }] };
  }

  private listItem(row: TransferListRow) {
    const snapshot = row.snapshot as unknown as TransferSnapshot;
    return {
      id: row.id,
      number: row.number,
      scenario: row.scenario,
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
      signedAt: row.signedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      from: { userId: row.fromUserId, name: snapshot.from?.name ?? row.fromLabel ?? '' },
      to: { userId: row.toUserId, name: snapshot.to?.name ?? row.toLabel ?? '' },
      signatoryName: snapshot.signatory?.name ?? '',
      itemCount: row._count.items,
      items: (snapshot.items ?? []).slice(0, 5).map((item) => ({ assetId: item.assetId, assetTag: item.assetTag, name: item.name })),
      hasSignedCopy: row.signedFileName !== null,
    };
  }

  async list(query: TransferListQuery, viewer: AssetViewer) {
    const { manager } = await this.visibility(viewer);
    if (manager === null) throw new AssetError(assetErrorCodes.forbidden);
    const limit = Math.min(Math.max(query.limit ?? 25, 1), assetTransferLimits.listMax);
    const search = query.search?.trim();
    const where: Prisma.AssetTransferWhereInput = {
      AND: [
        this.visibleWhere(viewer, manager),
        query.status ? { status: query.status } : {},
        query.scenario ? { scenario: query.scenario } : {},
        query.userId ? { OR: [{ fromUserId: query.userId }, { toUserId: query.userId }] } : {},
        query.from || query.to
          ? { issuedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
          : {},
        search
          ? {
              OR: [
                { number: { contains: search, mode: 'insensitive' } },
                { fromLabel: { contains: search, mode: 'insensitive' } },
                { toLabel: { contains: search, mode: 'insensitive' } },
                { fromUser: { displayName: { contains: search, mode: 'insensitive' } } },
                { toUser: { displayName: { contains: search, mode: 'insensitive' } } },
                { items: { some: { asset: { assetTag: { contains: search, mode: 'insensitive' } } } } },
              ],
            }
          : {},
      ],
    };
    const rows = await this.prisma.assetTransfer.findMany({
      where,
      select: transferListSelect,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return { items: page.map((row) => this.listItem(row)), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
  }

  async mine(viewer: AssetViewer) {
    await this.access.requireEnabled();
    const rows = await this.prisma.assetTransfer.findMany({
      where: { OR: [{ fromUserId: viewer.userId }, { toUserId: viewer.userId }], status: { not: 'CANCELLED' } },
      select: transferListSelect,
      orderBy: { issuedAt: 'desc' },
      take: assetTransferLimits.listMax,
    });
    return rows.map((row) => this.listItem(row));
  }

  async forAsset(assetId: string, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetRead);
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { organizationalUnit: { select: { ouPath: true } } } });
    if (asset === null || !isPathInScope(scope, asset.organizationalUnit.ouPath)) throw new AssetError(assetErrorCodes.notFound);
    const rows = await this.prisma.assetTransfer.findMany({
      where: { items: { some: { assetId } } },
      select: transferListSelect,
      orderBy: { issuedAt: 'desc' },
      take: assetTransferLimits.listMax,
    });
    return rows.map((row) => this.listItem(row));
  }

  private async loadVisible(id: string, viewer: AssetViewer) {
    const { manager } = await this.visibility(viewer);
    const transfer = await this.prisma.assetTransfer.findFirst({
      where: { AND: [{ id }, this.visibleWhere(viewer, manager)] },
      include: { template: { select: { id: true, version: true, content: true } }, items: { select: { assetId: true, position: true }, orderBy: { position: 'asc' } } },
    });
    if (transfer === null) throw new AssetError(assetErrorCodes.transferNotFound);
    return { transfer, manager };
  }

  /** Managing a record (cancel, signed copy) needs asset.manage over every item. */
  private async requireManage(transfer: { items: { assetId: string | null }[] }, viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetManage);
    if (scope.all) return;
    const ids = transfer.items.map((item) => item.assetId).filter((id): id is string => id !== null);
    const assets = await this.prisma.asset.findMany({ where: { id: { in: ids } }, select: { organizationalUnit: { select: { ouPath: true } } } });
    if (assets.some((asset) => !isPathInScope(scope, asset.organizationalUnit.ouPath))) throw new AssetError(assetErrorCodes.forbidden);
  }

  async get(id: string, viewer: AssetViewer) {
    const { transfer, manager } = await this.loadVisible(id, viewer);
    const snapshot = transfer.snapshot as unknown as TransferSnapshot;
    let canManage = false;
    if (manager !== null && viewerHasPermission(viewer, permissionKeys.assetManage)) {
      canManage = await this.requireManage(transfer, viewer).then(
        () => true,
        () => false,
      );
    }
    return {
      id: transfer.id,
      number: transfer.number,
      scenario: transfer.scenario,
      status: transfer.status,
      issuedAt: transfer.issuedAt.toISOString(),
      snapshot,
      templateVersion: transfer.template?.version ?? null,
      cancelledAt: transfer.cancelledAt?.toISOString() ?? null,
      cancelReason: transfer.cancelReason,
      signedAt: transfer.signedAt?.toISOString() ?? null,
      signedFileName: transfer.signedFileName,
      signedMimeType: transfer.signedMimeType,
      signedSizeBytes: transfer.signedSizeBytes,
      canManage,
    };
  }

  async document(id: string, viewer: AssetViewer): Promise<{ fileName: string; buffer: Buffer; type: string }> {
    const { transfer } = await this.loadVisible(id, viewer);
    const snapshot = transfer.snapshot as unknown as TransferSnapshot;
    const template = transfer.template ? Buffer.from(transfer.template.content) : buildDefaultTransferTemplate(snapshot.locale);
    try {
      const buffer = renderTransferDocument(template, transferDocumentData(snapshot));
      const prefix = snapshot.locale === 'en' ? 'Transfer' : 'Prenosnica';
      return { fileName: `${prefix}-${transfer.number}.docx`.replace(/[\\/]/g, '-'), buffer, type: docxMime };
    } catch (error) {
      if (error instanceof TransferRenderError) {
        this.logger.warn(`transfer ${transfer.id} render failed: ${error.errors.join('; ')}`);
        throw new AssetError(assetErrorCodes.transferRenderFailed, error.errors[0]);
      }
      throw error;
    }
  }

  async cancel(id: string, reason: string, viewer: AssetViewer) {
    const { transfer } = await this.loadVisible(id, viewer);
    await this.requireManage(transfer, viewer);
    const text = reason.trim();
    if (text.length < assetTransferLimits.cancelReasonMin || text.length > assetTransferLimits.cancelReasonMax) {
      throw new AssetError(assetErrorCodes.transferInvalid, 'reason');
    }
    const updated = await this.prisma.assetTransfer.updateMany({
      where: { id, status: 'ISSUED' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: viewer.userId, cancelReason: text },
    });
    if (updated.count !== 1) throw new AssetError(assetErrorCodes.transferNotIssued);
    await this.audit(auditLogActions.assetTransferCancelled, id, viewer, { number: transfer.number, reason: text });
    return { id, status: 'CANCELLED' as const };
  }

  // ------------------------------------------------------------ signed copy

  private uploadRoot(): string {
    return resolveUploadRoot();
  }

  async uploadSigned(id: string, file: UploadedFile, viewer: AssetViewer) {
    const { transfer } = await this.loadVisible(id, viewer);
    await this.requireManage(transfer, viewer);
    if (transfer.status === 'CANCELLED') throw new AssetError(assetErrorCodes.transferNotIssued);
    if (file.buffer.length === 0) throw new AssetError(assetErrorCodes.transferFileInvalid, 'empty');
    if (file.buffer.length > assetTransferLimits.signedMaxBytes) throw new AssetError(assetErrorCodes.transferFileTooLarge);
    const signature = detectFileSignature(file.buffer);
    const extension = signature ? signedMimeExtensions[signature.mimeType] : undefined;
    if (!signature || !extension) throw new AssetError(assetErrorCodes.transferFileInvalid, 'type');
    try {
      await scanAttachmentWithClamav(file.buffer);
    } catch (error) {
      if (error instanceof TicketsError) {
        throw new AssetError(error.code === 'ATTACHMENT_INFECTED' ? assetErrorCodes.transferFileInfected : assetErrorCodes.transferScanUnavailable);
      }
      throw error;
    }
    const root = this.uploadRoot();
    const storagePath = `${transferStorageRoot}/${transfer.id}/${randomUUID()}.${extension}`;
    const absolute = resolveContainedStoragePath(root, storagePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.buffer, { flag: 'wx' });
    const fileName = sanitizeFileName(file.fileName, `${transfer.number}.${extension}`);
    try {
      await this.prisma.assetTransfer.update({
        where: { id },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          signedByUserId: viewer.userId,
          signedStoragePath: storagePath,
          signedFileName: fileName,
          signedMimeType: signature.mimeType,
          signedSizeBytes: file.buffer.length,
        },
      });
    } catch (error) {
      await rm(absolute, { force: true });
      throw error;
    }
    if (transfer.signedStoragePath) {
      await rm(resolveContainedStoragePath(root, transfer.signedStoragePath), { force: true }).catch(() => undefined);
    }
    await this.audit(auditLogActions.assetTransferSigned, id, viewer, {
      number: transfer.number,
      fileName,
      sizeBytes: file.buffer.length,
      replaced: transfer.signedStoragePath !== null,
    });
    return { id, status: 'SIGNED' as const, signedFileName: fileName };
  }

  async signedCopy(id: string, viewer: AssetViewer): Promise<{ fileName: string; buffer: Buffer; type: string }> {
    const { transfer } = await this.loadVisible(id, viewer);
    if (!transfer.signedStoragePath || !transfer.signedMimeType) throw new AssetError(assetErrorCodes.transferNoSignedCopy);
    let buffer: Buffer;
    try {
      buffer = await readFile(resolveContainedStoragePath(this.uploadRoot(), transfer.signedStoragePath));
    } catch {
      throw new AssetError(assetErrorCodes.transferNoSignedCopy);
    }
    return { fileName: transfer.signedFileName ?? `${transfer.number}`, buffer, type: transfer.signedMimeType };
  }

  // ------------------------------------------------------------ signatories (catalog)

  private async requireCatalogAdmin(viewer: AssetViewer) {
    const scope = await this.access.require(viewer, permissionKeys.assetTypeManage);
    if (!scope.all) throw new AssetError(assetErrorCodes.forbidden);
  }

  async signatories(viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    const configuration = await this.configuration();
    const [units, entries, index] = await Promise.all([
      this.prisma.organizationalUnit.findMany({ select: { id: true, name: true, parentId: true, ouPath: true }, orderBy: { ouPath: 'asc' } }),
      this.prisma.assetSignatory.findMany({ include: { user: { select: { id: true, displayName: true, email: true, isActive: true, anonymizedAt: true } } } }),
      this.signatoryIndex(),
    ]);
    const own = new Map(entries.map((entry) => [entry.organizationalUnitId, entry]));
    const users = new Map(entries.map((entry) => [entry.userId, entry.user]));
    const defaultUser = configuration.defaultSignatoryUserId
      ? await this.prisma.user.findUnique({ where: { id: configuration.defaultSignatoryUserId }, select: { id: true, displayName: true, email: true } })
      : null;
    return {
      defaultSignatory: defaultUser,
      units: units.map((unit) => {
        const entry = own.get(unit.id);
        const effective = resolveSignatory({ unitId: unit.id, units: index.units, signatories: index.signatories, defaultUserId: configuration.defaultSignatoryUserId });
        const effectiveUser = effective.userId ? (users.get(effective.userId) ?? (defaultUser?.id === effective.userId ? defaultUser : null)) : null;
        return {
          id: unit.id,
          name: unit.name,
          parentId: unit.parentId,
          depth: unit.ouPath.split('/').filter(Boolean).length - 1,
          own: entry
            ? { userId: entry.userId, displayName: entry.user.displayName, email: entry.user.email, title: entry.title, isActive: entry.user.isActive && entry.user.anonymizedAt === null }
            : null,
          effective: {
            source: effective.source,
            userId: effective.userId,
            displayName: effectiveUser?.displayName ?? null,
            inheritedFromUnitId: effective.source === 'unit' ? effective.inheritedFromUnitId : null,
          },
        };
      }),
    };
  }

  async setSignatory(organizationalUnitId: string, input: { userId: string; title?: string | null }, viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    const unit = await this.prisma.organizationalUnit.findUnique({ where: { id: organizationalUnitId }, select: { id: true } });
    if (unit === null) throw new AssetError(assetErrorCodes.unitNotFound);
    const user = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true, anonymizedAt: true } });
    if (user === null || !user.isActive || user.anonymizedAt !== null) throw new AssetError(assetErrorCodes.userNotFound);
    const title = cleanText(input.title, 160, 'title') || null;
    await this.prisma.assetSignatory.upsert({
      where: { organizationalUnitId },
      create: { organizationalUnitId, userId: user.id, title },
      update: { userId: user.id, title },
    });
    await this.audit(auditLogActions.assetSignatorySaved, organizationalUnitId, viewer, { userId: user.id, title }, auditLogEntityTypes.assetSignatory);
    return { organizationalUnitId, userId: user.id, title };
  }

  async removeSignatory(organizationalUnitId: string, viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    await this.prisma.assetSignatory.deleteMany({ where: { organizationalUnitId } });
    await this.audit(auditLogActions.assetSignatorySaved, organizationalUnitId, viewer, { removed: true }, auditLogEntityTypes.assetSignatory);
  }

  // ------------------------------------------------------------ templates (catalog)

  async templates(viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    const rows = await this.prisma.assetTransferTemplate.findMany({
      orderBy: { version: 'desc' },
      take: 20,
      select: { id: true, version: true, fileName: true, sizeBytes: true, sha256: true, tags: true, notes: true, uploadedByUserId: true, createdAt: true },
    });
    return rows.map((row, index) => ({ ...row, createdAt: row.createdAt.toISOString(), isActive: index === 0 }));
  }

  async uploadTemplate(file: UploadedFile, notes: string | undefined, viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    if (file.buffer.length === 0) throw new AssetError(assetErrorCodes.transferTemplateInvalid, 'empty');
    if (file.buffer.length > transferTemplateLimits.maxBytes) throw new AssetError(assetErrorCodes.transferFileTooLarge);
    if (!file.fileName.toLowerCase().endsWith('.docx')) throw new AssetError(assetErrorCodes.transferTemplateInvalid, 'extension');
    const inspection = inspectTransferTemplate(file.buffer);
    if (!inspection.ok) throw new AssetError(assetErrorCodes.transferTemplateInvalid, inspection.errors.slice(0, 5).join(' | ').slice(0, 500));
    // Render once with sample data so a template that parses but cannot render never becomes active.
    try {
      renderTransferDocument(file.buffer, transferDocumentData(sampleTransferSnapshot(await this.documentLocale(), 'UTC')));
    } catch (error) {
      if (error instanceof TransferRenderError) throw new AssetError(assetErrorCodes.transferTemplateInvalid, error.errors.join(' | ').slice(0, 500));
      throw error;
    }
    try {
      await scanAttachmentWithClamav(file.buffer);
    } catch (error) {
      if (error instanceof TicketsError) {
        throw new AssetError(error.code === 'ATTACHMENT_INFECTED' ? assetErrorCodes.transferFileInfected : assetErrorCodes.transferScanUnavailable);
      }
      throw error;
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const cleanNotes = cleanText(notes, 500, 'notes') || null;
    const created = await this.prisma.$transaction(async (transaction) => {
      const latest = await transaction.assetTransferTemplate.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
      return transaction.assetTransferTemplate.create({
        data: {
          version: (latest?.version ?? 0) + 1,
          fileName: sanitizeFileName(file.fileName, 'prenosnica.docx'),
          content: new Uint8Array(file.buffer),
          sizeBytes: file.buffer.length,
          sha256,
          tags: [...inspection.tags],
          notes: cleanNotes,
          uploadedByUserId: viewer.userId,
        },
        select: { id: true, version: true },
      });
    });
    await this.audit(auditLogActions.assetTransferTemplateUploaded, created.id, viewer, { version: created.version, sha256, unknownTags: inspection.unknownTags }, auditLogEntityTypes.assetTransfer);
    return { id: created.id, version: created.version, tags: inspection.tags, unknownTags: inspection.unknownTags };
  }

  /** version = null → the built-in default template (starting point for Word). */
  async templateFile(version: number | null, locale: TransferLocale | null, viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    if (version === null) {
      const effective = locale ?? (await this.documentLocale());
      return { fileName: effective === 'en' ? 'transfer-template-default.docx' : 'prenosnica-sablon-zadani.docx', buffer: buildDefaultTransferTemplate(effective), type: docxMime };
    }
    const row = await this.prisma.assetTransferTemplate.findUnique({ where: { version }, select: { fileName: true, content: true } });
    if (row === null) throw new AssetError(assetErrorCodes.transferTemplateNotFound);
    return { fileName: row.fileName, buffer: Buffer.from(row.content), type: docxMime };
  }

  /** Active template filled with sample data ("test document"). */
  async templateSample(viewer: AssetViewer) {
    await this.requireCatalogAdmin(viewer);
    const locale = await this.documentLocale();
    const active = await this.prisma.assetTransferTemplate.findFirst({ orderBy: { version: 'desc' }, select: { content: true } });
    const template = active ? Buffer.from(active.content) : buildDefaultTransferTemplate(locale);
    try {
      const buffer = renderTransferDocument(template, transferDocumentData(sampleTransferSnapshot(locale, await readInstallationTimeZone(this.settings))));
      return { fileName: locale === 'en' ? 'transfer-sample.docx' : 'prenosnica-primjer.docx', buffer, type: docxMime };
    } catch (error) {
      if (error instanceof TransferRenderError) throw new AssetError(assetErrorCodes.transferRenderFailed, error.errors[0]);
      throw error;
    }
  }

  // ------------------------------------------------------------ shared

  private async audit(action: string, entityId: string, viewer: AssetViewer, metadata: Record<string, unknown>, entityType: string = auditLogEntityTypes.assetTransfer) {
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action,
      entityType,
      entityId,
      metadata: metadata as never,
      actorUserId: viewer.userId,
    });
  }
}

/**
 * Anonymization (2.6): names in frozen transfer snapshots are replaced by the
 * pseudonym inside the anonymization transaction. Numbers and items stay.
 */
export async function scrubAssetTransferSnapshots(
  client: Pick<Prisma.TransactionClient, 'assetTransfer'>,
  userId: string,
  pseudonym: string,
): Promise<number> {
  const rows = await client.assetTransfer.findMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }, { signatoryUserId: userId }, { issuedByUserId: userId }] },
    select: { id: true, snapshot: true },
  });
  let changed = 0;
  for (const row of rows) {
    const next = scrubSnapshotParty(row.snapshot as unknown as TransferSnapshot, userId, pseudonym);
    if (next === null) continue;
    await client.assetTransfer.update({ where: { id: row.id }, data: { snapshot: next as unknown as Prisma.InputJsonValue } });
    changed += 1;
  }
  return changed;
}
