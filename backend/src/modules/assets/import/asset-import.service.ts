import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { permissionKeys } from '../../authorization/authorization.constants';
import { assetDefaults } from '../../settings/definitions/asset-settings';
import { settingKeys } from '../../settings/setting-keys';
import { AssetAccessService } from '../asset-access.service';
import type { AssetAttributeDefinition, AttributeValue } from '../asset-attributes';
import { buildLocationPaths } from '../asset-locations';
import { isPathInScope, type AssetScope, type AssetViewer } from '../asset-viewer';
import { AssetError, assetErrorCodes, assetEventActions, type AssetStatusValue } from '../assets.constants';
import { AssetsService, type AssetListQuery } from '../assets.service';
import {
  assetColumnLabels,
  assetFixedColumnKeys,
  assetStatusLabels,
  attributeColumnPrefix,
  isKnownColumnKey,
  suggestColumnMapping,
  type AssetColumnKey,
  type ImportAttributeColumn,
  type ImportLocale,
} from './asset-import-columns';
import { allocateAssetTags } from '../asset-tags';
import { buildCsv, buildWorkbook, type HelpSection, type SheetColumn } from './asset-spreadsheet';
import {
  planAssetImport,
  type ExistingAsset,
  type ImportAssetState,
  type ImportMode,
  type ImportRowError,
  type ImportTotals,
  type PlannedRow,
} from './plan-asset-import';
import { readAssetSheet } from './read-asset-sheet';

export const assetImportLimits = {
  previewTtlMs: 24 * 60 * 60 * 1000,
  batchSize: 500,
  errorsInResponse: 500,
  exportMaxRows: 10_000,
  listJobs: 20,
  allOrNothingTimeoutMs: 180_000,
} as const;

export type ImportActor = { readonly userId: string | null; readonly scope: AssetScope };

export type ImportFile = { readonly fileName: string; readonly buffer: Buffer };

export type ImportOptions = {
  readonly typeId: string;
  readonly mode: ImportMode;
  readonly allOrNothing: boolean;
  /** One entry per header; null = ignore. Omitted = automatic recognition. */
  readonly mapping?: readonly (string | null)[];
};

type StoredJobRows = {
  readonly headers: readonly string[];
  readonly mapping: readonly (AssetColumnKey | null)[];
  readonly planned: readonly PlannedRow[];
  readonly errorRows: readonly { readonly row: number; readonly cells: readonly string[] }[];
};

type ApplyResult = { created: number; updated: number; failed: number; failures: ImportRowError[] };

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

function mergeResult(target: ApplyResult, source: ApplyResult) {
  target.created += source.created;
  target.updated += source.updated;
  target.failed += source.failed;
  target.failures.push(...source.failures);
}

const toDate = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00Z`));

function dateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

/**
 * Paket 3.2 (§11, §13): template, preview, apply and export. The preview is
 * computed synchronously (bulk lookups, no per-row query) and stored as an
 * `AssetImportJob`; apply writes it in batches of 500. Decision recorded in
 * the plan: no separate BullMQ queue — the limits (5 MB / 5 000 rows) keep a
 * request in seconds and the CLI shares the same code.
 */
@Injectable()
export class AssetImportService {
  private readonly logger = new Logger(AssetImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly assets: AssetsService,
  ) {}

  async actorFor(viewer: AssetViewer, permission: string = permissionKeys.assetImport): Promise<ImportActor> {
    return { userId: viewer.userId, scope: await this.access.require(viewer, permission) };
  }

  // ------------------------------------------------------------ shared lookups

  private async loadType(typeId: string) {
    const type = await this.prisma.assetType.findUnique({
      where: { id: typeId },
      select: {
        id: true,
        key: true,
        nameBs: true,
        nameEn: true,
        archivedAt: true,
        attributes: {
          orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
          select: { key: true, labelBs: true, labelEn: true, dataType: true, options: true, isRequired: true, isUnique: true, archivedAt: true },
        },
      },
    });
    if (type === null) throw new AssetError(assetErrorCodes.typeNotFound);
    return type;
  }

  private async loadUnits(scope: AssetScope) {
    const units = await this.prisma.organizationalUnit.findMany({
      select: { id: true, name: true, ouPath: true, distinguishedName: true },
      orderBy: { ouPath: 'asc' },
    });
    return units.map((unit) => ({ ...unit, inScope: isPathInScope(scope, unit.ouPath) }));
  }

  private async loadLocations() {
    const rows = await this.prisma.assetLocation.findMany({ select: { id: true, name: true, code: true, parentId: true, archivedAt: true } });
    const paths = buildLocationPaths(rows);
    return rows
      .filter((row) => row.archivedAt === null)
      .map((row) => ({ id: row.id, name: row.name, code: row.code, path: paths.get(row.id) ?? row.name }));
  }

  private async loadServices() {
    return this.prisma.service.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } });
  }

  // ------------------------------------------------------------ template (§11.1)

  async template(typeId: string, locale: ImportLocale, actor: ImportActor): Promise<{ fileName: string; buffer: Buffer }> {
    const type = await this.loadType(typeId);
    if (type.archivedAt !== null) throw new AssetError(assetErrorCodes.typeArchived);
    const attributes = type.attributes.filter((attribute) => attribute.archivedAt === null);
    const locationsEnabled = await this.access.locationsEnabled();
    const columns = this.columnsFor(attributes, locale, true, locationsEnabled);
    const [units, locations, services] = await Promise.all([this.loadUnits(actor.scope), this.loadLocations(), this.loadServices()]);
    const bs = locale === 'bs';
    const help: HelpSection[] = [
      {
        title: bs ? `Uvoz opreme — tip: ${type.nameBs} (${type.key})` : `Asset import — type: ${type.nameEn} (${type.key})`,
        lines: bs
          ? [
              'Jedan red = jedna stavka. Prvi red su zaglavlja; ne mijenjajte ih (bilješka na zaglavlju sadrži tehnički ključ).',
              'Ključ uparivanja je inventarni broj; ako ga nema, serijski broj unutar istog tipa.',
              'Režim „samo novo" preskače postojeće stavke. Režim „ažuriraj" mijenja samo popunjene ćelije; prazna ćelija znači „ne mijenjaj", a #PRAZNO briše vrijednost.',
              'Datumi: 2026-10-01 ili 1.10.2026. Cijena: 1234,50 ili 1234.50.',
              'Korisnik: e-mail ili login (dio e-maila prije @). Popunjen korisnik znači status „U upotrebi".',
              'Uvoz ne pravi nove organizacione jedinice, korisnike ni lokacije; nepoznata vrijednost je greška reda.',
            ]
          : [
              'One row = one asset. The first row holds the headers; keep them (the header note has the technical key).',
              'Rows are matched by asset tag, or by serial number within the same type when the tag is empty.',
              '"Create only" skips existing assets. "Update" changes filled cells only; an empty cell means "keep", #EMPTY clears the value.',
              'Dates: 2026-10-01 or 1.10.2026. Cost: 1234.50 or 1234,50.',
              'User: e-mail or login (the part before @). A user means the status "In use".',
              'The import never creates units, users or locations; an unknown value is a row error.',
            ],
      },
      {
        title: bs ? 'Statusi' : 'Statuses',
        lines: (['ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR'] as const).map((status) => `${assetStatusLabels[status][locale]} (${status})`),
      },
      { title: bs ? 'Organizacione jedinice (vaš opseg)' : 'Organisational units (your scope)', lines: units.filter((unit) => unit.inScope).slice(0, 2000).map((unit) => unit.name === unit.ouPath ? unit.name : `${unit.name} — ${unit.ouPath}`) },
      ...(locationsEnabled
        ? [{ title: bs ? 'Lokacije (šifra ili puna putanja)' : 'Locations (code or full path)', lines: locations.slice(0, 2000).map((location) => (location.code ? `${location.code} — ${location.path}` : location.path)) }]
        : []),
      { title: bs ? 'Servisi' : 'Services', lines: services.slice(0, 1000).map((service) => `${service.name} (${service.slug})`) },
      ...attributes
        .filter((attribute) => attribute.dataType === 'SELECT')
        .map((attribute) => ({
          title: `${bs ? attribute.labelBs : attribute.labelEn} — ${bs ? 'dozvoljene vrijednosti' : 'allowed values'}`,
          lines: Array.isArray(attribute.options) ? attribute.options.map(String) : [],
        })),
    ];
    const buffer = await buildWorkbook({ sheetName: bs ? 'Oprema' : 'Assets', columns, rows: [], helpSheetName: bs ? 'Uputa' : 'Help', help });
    return { fileName: `asset-import-${type.key}.xlsx`, buffer };
  }

  private columnsFor(
    attributes: readonly { key: string; labelBs: string; labelEn: string; dataType: string; isRequired: boolean }[],
    locale: ImportLocale,
    forImport: boolean,
    locationsEnabled: boolean,
  ): SheetColumn[] {
    const fixed = assetFixedColumnKeys.filter((key) => !(forImport && key === 'type') && (locationsEnabled || key !== 'location'));
    return [
      ...fixed.map((key) => ({ key, header: assetColumnLabels[key][locale], note: key })),
      ...attributes.map((attribute) => ({
        key: `${attributeColumnPrefix}${attribute.key}`,
        header: locale === 'bs' ? attribute.labelBs : attribute.labelEn,
        note: `${attributeColumnPrefix}${attribute.key} (${attribute.dataType}${attribute.isRequired ? ', *' : ''})`,
      })),
    ];
  }

  // ------------------------------------------------------------ preview (§11.2–4)

  async preview(file: ImportFile, options: ImportOptions, actor: ImportActor) {
    const [maxRows, maxFileMb, autoTag] = await Promise.all([
      this.access.readSetting<number>(settingKeys.privateAssetsImportMaxRows, assetDefaults.importMaxRows),
      this.access.readSetting<number>(settingKeys.privateAssetsImportMaxFileMb, assetDefaults.importMaxFileMb),
      this.access.readSetting<unknown>(settingKeys.privateAssetsTagAutoGenerate, assetDefaults.tagAutoGenerate),
    ]);
    if (file.buffer.length > maxFileMb * 1024 * 1024) throw new AssetError(assetErrorCodes.importFileTooLarge, String(maxFileMb));
    if (options.mode !== 'CREATE_ONLY' && options.mode !== 'UPSERT') throw new AssetError(assetErrorCodes.invalid, 'mode');
    const type = await this.loadType(options.typeId);
    if (type.archivedAt !== null) throw new AssetError(assetErrorCodes.typeArchived);
    const sheet = await readAssetSheet(file.fileName, file.buffer, maxRows);
    const attributeColumns: ImportAttributeColumn[] = type.attributes.filter((attribute) => attribute.archivedAt === null);
    const suggested = suggestColumnMapping(sheet.headers, attributeColumns);
    const mapping = this.resolveMapping(options.mapping, sheet.headers.length, suggested, attributeColumns);
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Expire old previews on the way (no cron needed).
    await this.prisma.assetImportJob.updateMany({ where: { status: 'PREVIEW', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED', rows: Prisma.DbNull } });

    const duplicateOf =
      options.mode === 'CREATE_ONLY'
        ? await this.prisma.assetImportJob.findFirst({
            where: { fileSha256, typeId: type.id, status: 'APPLIED', mode: 'CREATE_ONLY' },
            select: { id: true, appliedAt: true },
            orderBy: { appliedAt: 'desc' },
          })
        : null;

    const column = (key: AssetColumnKey) => mapping.indexOf(key);
    const valuesOf = (key: AssetColumnKey) => {
      const index = column(key);
      return index === -1 ? [] : [...new Set(sheet.rows.map((row) => row[index]?.trim() ?? '').filter((value) => value !== ''))];
    };
    const definitions: AssetAttributeDefinition[] = type.attributes;
    const locationsEnabled = await this.access.locationsEnabled();
    const [units, locations, services, users, existing, uniqueValues] = await Promise.all([
      this.loadUnits(actor.scope),
      this.loadLocations(),
      this.loadServices(),
      this.loadUsers(valuesOf('assignedUser')),
      this.loadExisting(type.id, valuesOf('assetTag'), valuesOf('serialNumber'), actor.scope),
      this.loadUniqueValues(type.id, definitions, mapping, sheet.rows),
    ]);
    const plan = planAssetImport({
      mapping,
      rows: sheet.rows,
      rowNumbers: sheet.rowNumbers,
      context: {
        typeId: type.id,
        typeKey: type.key,
        mode: options.mode,
        autoTag: autoTag === true,
        definitions,
        units,
        users,
        locations,
        locationsEnabled,
        services,
        existingByTag: existing.byTag,
        existingBySerial: existing.bySerial,
        uniqueValues,
      },
    });
    // §11: the same file again in "create only" creates nothing new.
    const planned = duplicateOf !== null ? plan.planned.filter((entry) => entry.action !== 'create') : plan.planned;
    const totals: ImportTotals & { duplicateSkipped?: number } =
      duplicateOf !== null
        ? { ...plan.totals, create: 0, skipped: plan.totals.skipped + plan.totals.create, duplicateSkipped: plan.totals.create }
        : plan.totals;
    const errorRowSet = new Set(plan.errorRows);
    const stored: StoredJobRows = {
      headers: sheet.headers,
      mapping,
      planned,
      errorRows: sheet.rows.flatMap((cells, index) => (errorRowSet.has(sheet.rowNumbers[index]) ? [{ row: sheet.rowNumbers[index], cells }] : [])),
    };
    const job = await this.prisma.assetImportJob.create({
      data: {
        typeId: type.id,
        fileName: file.fileName.slice(0, 255),
        fileSha256,
        status: 'PREVIEW',
        mode: options.mode,
        allOrNothing: options.allOrNothing,
        rows: stored as unknown as Prisma.InputJsonValue,
        totals: totals as unknown as Prisma.InputJsonValue,
        errors: plan.errors.slice(0, 5000) as unknown as Prisma.InputJsonValue,
        createdByUserId: actor.userId,
        expiresAt: new Date(Date.now() + assetImportLimits.previewTtlMs),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      id: job.id,
      status: 'PREVIEW' as const,
      type: { id: type.id, key: type.key, nameBs: type.nameBs, nameEn: type.nameEn },
      fileName: file.fileName,
      mode: options.mode,
      allOrNothing: options.allOrNothing,
      headers: sheet.headers,
      mapping,
      suggestedMapping: suggested,
      columns: [
        ...assetFixedColumnKeys.filter((key) => locationsEnabled || key !== 'location').map((key) => ({ key, labelBs: assetColumnLabels[key].bs, labelEn: assetColumnLabels[key].en })),
        ...attributeColumns.map((attribute) => ({ key: `${attributeColumnPrefix}${attribute.key}`, labelBs: attribute.labelBs, labelEn: attribute.labelEn })),
      ],
      totals,
      errors: plan.errors.slice(0, assetImportLimits.errorsInResponse),
      errorCount: plan.errors.length,
      duplicateOfJobId: duplicateOf?.id ?? null,
      expiresAt: job.expiresAt.toISOString(),
    };
  }

  private resolveMapping(
    requested: readonly (string | null)[] | undefined,
    headerCount: number,
    suggested: readonly (AssetColumnKey | null)[],
    attributes: readonly ImportAttributeColumn[],
  ): (AssetColumnKey | null)[] {
    if (requested === undefined) return [...suggested];
    if (requested.length !== headerCount) throw new AssetError(assetErrorCodes.importMappingInvalid, 'length');
    const used = new Set<string>();
    return requested.map((value) => {
      if (value === null || value === '') return null;
      if (!isKnownColumnKey(value, attributes)) throw new AssetError(assetErrorCodes.importMappingInvalid, value.slice(0, 80));
      if (used.has(value)) throw new AssetError(assetErrorCodes.importMappingInvalid, `duplicate:${value.slice(0, 80)}`);
      used.add(value);
      return value;
    });
  }

  private async loadUsers(values: readonly string[]) {
    if (values.length === 0) return [];
    const emails = values.filter((value) => value.includes('@')).map((value) => value.toLowerCase());
    const logins = values.filter((value) => !value.includes('@')).map((value) => value.toLowerCase());
    const select = { id: true, email: true, isActive: true } as const;
    const results = await Promise.all([
      ...chunk(emails, 1000).map((part) => this.prisma.user.findMany({ where: { email: { in: part, mode: 'insensitive' }, anonymizedAt: null }, select })),
      ...chunk(logins, 200).map((part) =>
        this.prisma.user.findMany({
          where: { anonymizedAt: null, OR: part.map((login) => ({ email: { startsWith: `${login}@`, mode: 'insensitive' as const } })) },
          select,
        }),
      ),
    ]);
    const byId = new Map(results.flat().map((user) => [user.id, user]));
    return [...byId.values()];
  }

  private async loadExisting(typeId: string, tags: readonly string[], serials: readonly string[], scope: AssetScope) {
    const select = {
      id: true,
      assetTag: true,
      typeId: true,
      version: true,
      source: true,
      name: true,
      status: true,
      serialNumber: true,
      manufacturer: true,
      model: true,
      organizationalUnitId: true,
      assignedUserId: true,
      locationId: true,
      serviceId: true,
      purchaseDate: true,
      purchaseCost: true,
      supplier: true,
      warrantyEndsAt: true,
      notes: true,
      attributes: true,
      organizationalUnit: { select: { ouPath: true } },
    } as const;
    const rows = (
      await Promise.all([
        ...chunk(tags, 1000).map((part) => this.prisma.asset.findMany({ where: { assetTag: { in: part, mode: 'insensitive' } }, select })),
        ...chunk(serials, 1000).map((part) => this.prisma.asset.findMany({ where: { typeId, serialNumber: { in: part, mode: 'insensitive' } }, select })),
      ])
    ).flat();
    const byTag = new Map<string, ExistingAsset>();
    const bySerial = new Map<string, ExistingAsset>();
    for (const row of rows) {
      const asset: ExistingAsset = {
        id: row.id,
        assetTag: row.assetTag,
        typeId: row.typeId,
        version: row.version,
        source: row.source,
        inScope: isPathInScope(scope, row.organizationalUnit.ouPath),
        name: row.name,
        status: row.status as AssetStatusValue,
        serialNumber: row.serialNumber,
        manufacturer: row.manufacturer,
        model: row.model,
        organizationalUnitId: row.organizationalUnitId,
        assignedUserId: row.assignedUserId,
        locationId: row.locationId,
        serviceId: row.serviceId,
        purchaseDate: dateOnly(row.purchaseDate),
        purchaseCost: row.purchaseCost === null ? null : row.purchaseCost.toFixed(2),
        supplier: row.supplier,
        warrantyEndsAt: dateOnly(row.warrantyEndsAt),
        notes: row.notes,
        attributes: (row.attributes ?? {}) as Record<string, AttributeValue>,
      };
      byTag.set(row.assetTag.toLowerCase(), asset);
      if (row.typeId === typeId && row.serialNumber) {
        // Serial matching only when unambiguous within the type.
        const key = row.serialNumber.toLowerCase();
        const current = bySerial.get(key);
        if (current === undefined) bySerial.set(key, asset);
        else if (current.id !== asset.id) bySerial.delete(key);
      }
    }
    return { byTag, bySerial };
  }

  private async loadUniqueValues(
    typeId: string,
    definitions: readonly AssetAttributeDefinition[],
    mapping: readonly (AssetColumnKey | null)[],
    rows: readonly (readonly string[])[],
  ) {
    const result = new Map<string, Map<string, string>>();
    for (const definition of definitions) {
      if (!definition.isUnique || definition.archivedAt !== null) continue;
      const index = mapping.indexOf(`${attributeColumnPrefix}${definition.key}`);
      if (index === -1) continue;
      const values = [...new Set(rows.map((row) => (row[index] ?? '').trim().toLowerCase()).filter((value) => value !== ''))];
      const owners = new Map<string, string>();
      for (const part of chunk(values, 1000)) {
        const found = await this.prisma.$queryRaw<{ id: string; value: string }[]>`
          SELECT "id", lower("attributes"->>${definition.key}) AS "value"
          FROM "Asset"
          WHERE "typeId" = ${typeId} AND lower("attributes"->>${definition.key}) = ANY(${part}::text[])`;
        for (const row of found) owners.set(row.value, row.id);
      }
      result.set(definition.key, owners);
    }
    return result;
  }

  // ------------------------------------------------------------ jobs

  async list(actor: ImportActor) {
    const jobs = await this.prisma.assetImportJob.findMany({
      where: actor.scope.all ? {} : { createdByUserId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: assetImportLimits.listJobs,
      select: { id: true, fileName: true, status: true, mode: true, allOrNothing: true, totals: true, createdAt: true, appliedAt: true, expiresAt: true, typeId: true, createdByUserId: true },
    });
    const [types, users] = await Promise.all([
      this.prisma.assetType.findMany({ where: { id: { in: [...new Set(jobs.map((job) => job.typeId))] } }, select: { id: true, key: true, nameBs: true, nameEn: true } }),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(jobs.map((job) => job.createdByUserId).filter((id): id is string => id !== null))] } },
        select: { id: true, displayName: true },
      }),
    ]);
    const typeById = new Map(types.map((type) => [type.id, type]));
    const userById = new Map(users.map((user) => [user.id, user.displayName]));
    const now = Date.now();
    return {
      items: jobs.map((job) => ({
        id: job.id,
        fileName: job.fileName,
        status: job.status === 'PREVIEW' && job.expiresAt.getTime() < now ? 'EXPIRED' : job.status,
        mode: job.mode,
        allOrNothing: job.allOrNothing,
        totals: job.totals,
        type: typeById.get(job.typeId) ?? null,
        createdBy: job.createdByUserId === null ? null : (userById.get(job.createdByUserId) ?? null),
        createdAt: job.createdAt.toISOString(),
        appliedAt: job.appliedAt?.toISOString() ?? null,
        expiresAt: job.expiresAt.toISOString(),
      })),
    };
  }

  private async loadJob(id: string, actor: ImportActor) {
    const job = await this.prisma.assetImportJob.findUnique({ where: { id } });
    if (job === null) throw new AssetError(assetErrorCodes.importNotFound);
    // Only the author (or a global scope) sees a job: it may hold data of their units only.
    if (!actor.scope.all && job.createdByUserId !== actor.userId) throw new AssetError(assetErrorCodes.importNotFound);
    return job;
  }

  /** §11.4: the rows with errors plus an error column, to fix and import again. */
  async errorWorkbook(id: string, locale: ImportLocale, actor: ImportActor): Promise<{ fileName: string; buffer: Buffer }> {
    const job = await this.loadJob(id, actor);
    const stored = job.rows as unknown as StoredJobRows | null;
    if (stored === null) throw new AssetError(assetErrorCodes.importExpired);
    const errors = (job.errors ?? []) as unknown as ImportRowError[];
    const byRow = new Map<number, string[]>();
    for (const error of errors) {
      const list = byRow.get(error.row) ?? [];
      list.push(`${error.column ?? '-'}: ${error.code}${error.value ? ` (${error.value})` : ''}`);
      byRow.set(error.row, list);
    }
    const columns: SheetColumn[] = [
      ...stored.headers.map((header, index) => ({ key: `c${index}`, header, note: stored.mapping[index] ?? undefined })),
      { key: 'error', header: locale === 'bs' ? 'Greška' : 'Error', width: 60 },
      { key: 'row', header: locale === 'bs' ? 'Red u izvornom fajlu' : 'Row in source file', width: 12 },
    ];
    const rows = stored.errorRows.map((entry) => [...stored.headers.map((_, index) => entry.cells[index] ?? ''), (byRow.get(entry.row) ?? []).join('; '), String(entry.row)]);
    const buffer = await buildWorkbook({ sheetName: locale === 'bs' ? 'Greške' : 'Errors', columns, rows });
    return { fileName: `asset-import-errors-${job.id}.xlsx`, buffer };
  }

  async discard(id: string, actor: ImportActor) {
    const job = await this.loadJob(id, actor);
    if (job.status !== 'PREVIEW') throw new AssetError(assetErrorCodes.importNotPending);
    await this.prisma.assetImportJob.update({ where: { id }, data: { status: 'EXPIRED', rows: Prisma.DbNull } });
    return { discarded: true };
  }

  // ------------------------------------------------------------ apply (§11.5)

  async apply(id: string, actor: ImportActor) {
    const job = await this.loadJob(id, actor);
    if (job.status !== 'PREVIEW') throw new AssetError(assetErrorCodes.importNotPending);
    if (job.expiresAt.getTime() < Date.now() || job.rows === null) {
      await this.prisma.assetImportJob.update({ where: { id }, data: { status: 'EXPIRED', rows: Prisma.DbNull } });
      throw new AssetError(assetErrorCodes.importExpired);
    }
    const totals = job.totals as unknown as ImportTotals;
    if (job.allOrNothing && totals.errors > 0) throw new AssetError(assetErrorCodes.importHasErrors, String(totals.errors));
    // Claim the job first, so a double click cannot apply it twice.
    const claimed = await this.prisma.assetImportJob.updateMany({ where: { id, status: 'PREVIEW' }, data: { expiresAt: new Date() } });
    if (claimed.count === 0) throw new AssetError(assetErrorCodes.importNotPending);
    const stored = job.rows as unknown as StoredJobRows;
    // Scope may have shrunk since the preview: re-check every target unit.
    const unitPaths = new Map(
      (await this.prisma.organizationalUnit.findMany({
        where: { id: { in: [...new Set(stored.planned.map((entry) => entry.data.organizationalUnitId))] } },
        select: { id: true, ouPath: true },
      })).map((unit) => [unit.id, unit.ouPath]),
    );
    const allowed = stored.planned.filter((entry) => isPathInScope(actor.scope, unitPaths.get(entry.data.organizationalUnitId) ?? null));
    const outOfScope: ImportRowError[] = stored.planned
      .filter((entry) => !allowed.includes(entry))
      .map((entry) => ({ row: entry.row, column: 'organizationalUnit', code: 'unit_out_of_scope' }));
    const currency = await this.access.readSetting<string>(settingKeys.privateAssetsCurrency, assetDefaults.currency);
    const prefix = await this.access.readSetting<string>(settingKeys.privateAssetsTagPrefix, assetDefaults.tagPrefix);
    const result: ApplyResult = { created: 0, updated: 0, failed: outOfScope.length, failures: [...outOfScope] };
    try {
      if (job.allOrNothing) {
        if (outOfScope.length > 0) throw new AssetError(assetErrorCodes.importHasErrors, String(outOfScope.length));
        const batchResult = await this.prisma.$transaction(
          async (transaction) => this.applyBatch(transaction, allowed, job.typeId, job.id, actor, currency, prefix, true),
          { timeout: assetImportLimits.allOrNothingTimeoutMs, maxWait: 10_000 },
        );
        mergeResult(result, batchResult);
      } else {
        for (const batch of chunk(allowed, assetImportLimits.batchSize)) {
          try {
            const batchResult = await this.prisma.$transaction(
              async (transaction) => this.applyBatch(transaction, batch, job.typeId, job.id, actor, currency, prefix, false),
              { timeout: 60_000, maxWait: 10_000 },
            );
            mergeResult(result, batchResult);
          } catch (error) {
            this.logger.warn(`asset_import_batch_failed job=${job.id} reason=${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
            result.failed += batch.length;
            result.failures.push(...batch.map((entry) => ({ row: entry.row, column: null, code: 'batch_failed' })));
          }
        }
      }
    } catch (error) {
      await this.prisma.assetImportJob.update({
        where: { id },
        data: {
          status: 'FAILED',
          rows: Prisma.DbNull,
          totals: { ...totals, applied: { created: 0, updated: 0, failed: allowed.length + outOfScope.length } } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.auditApply(job.id, actor, { status: 'FAILED', allOrNothing: true });
      if (error instanceof AssetError) throw error;
      throw new AssetError(assetErrorCodes.importHasErrors, 'rolled_back');
    }
    const applied = { created: result.created, updated: result.updated, failed: result.failed };
    const nothingApplied = result.created + result.updated === 0 && result.failed > 0;
    await this.prisma.assetImportJob.update({
      where: { id },
      data: {
        status: nothingApplied ? 'FAILED' : 'APPLIED',
        appliedAt: new Date(),
        rows: Prisma.DbNull,
        totals: { ...totals, applied } as unknown as Prisma.InputJsonValue,
        errors: [...((job.errors ?? []) as unknown as ImportRowError[]), ...result.failures].slice(0, 5000) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.auditApply(job.id, actor, { status: nothingApplied ? 'FAILED' : 'APPLIED', ...applied, fileName: job.fileName, mode: job.mode });
    return { id: job.id, status: nothingApplied ? 'FAILED' : 'APPLIED', applied, failures: result.failures.slice(0, assetImportLimits.errorsInResponse) };
  }

  private async auditApply(jobId: string, actor: ImportActor, metadata: Record<string, unknown>) {
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.assetImportApplied,
      entityType: auditLogEntityTypes.assetImport,
      entityId: jobId,
      metadata: metadata as never,
      actorUserId: actor.userId,
    }).catch(() => undefined);
  }

  private columnsData(data: ImportAssetState, currency: string, currentCurrency: string | null = null) {
    return {
      name: data.name,
      status: data.status,
      serialNumber: data.serialNumber,
      manufacturer: data.manufacturer,
      model: data.model,
      organizationalUnitId: data.organizationalUnitId,
      assignedUserId: data.assignedUserId,
      locationId: data.locationId,
      serviceId: data.serviceId,
      purchaseDate: toDate(data.purchaseDate),
      purchaseCost: data.purchaseCost === null ? null : new Prisma.Decimal(data.purchaseCost),
      currency: data.purchaseCost === null ? null : (currentCurrency ?? currency),
      supplier: data.supplier,
      warrantyEndsAt: toDate(data.warrantyEndsAt),
      notes: data.notes,
      attributes: data.attributes as Prisma.InputJsonValue,
    };
  }

  private async applyBatch(
    transaction: Prisma.TransactionClient,
    batch: readonly PlannedRow[],
    typeId: string,
    jobId: string,
    actor: ImportActor,
    currency: string,
    prefix: string,
    strict: boolean,
  ): Promise<ApplyResult> {
    // Counted locally and merged by the caller only after the commit.
    const result: ApplyResult = { created: 0, updated: 0, failed: 0, failures: [] };
    const now = new Date();
    const creates = batch.filter((entry) => entry.action === 'create');
    if (creates.length > 0) {
      const tags = await this.assignTags(transaction, creates, prefix);
      await transaction.asset.createMany({
        data: creates.map((entry, index) => ({
          ...this.columnsData(entry.data, currency),
          assetTag: tags[index],
          typeId,
          source: 'IMPORT' as const,
          assignedAt: entry.data.assignedUserId === null ? null : now,
        })),
      });
      const createdRows = await transaction.asset.findMany({ where: { assetTag: { in: tags } }, select: { id: true, assetTag: true, status: true, assignedUserId: true } });
      await transaction.assetEvent.createMany({
        data: createdRows.flatMap((row) => [
          { assetId: row.id, action: assetEventActions.imported, actorUserId: actor.userId, detail: { jobId, assetTag: row.assetTag, status: row.status } as Prisma.InputJsonValue },
          ...(row.assignedUserId === null
            ? []
            : [{ assetId: row.id, action: assetEventActions.assigned, actorUserId: actor.userId, detail: { userId: row.assignedUserId, jobId } as Prisma.InputJsonValue }]),
        ]),
      });
      result.created += createdRows.length;
    }
    for (const entry of batch) {
      if (entry.action !== 'update' || entry.assetId === null || entry.version === null) continue;
      const current = await transaction.asset.findUnique({ where: { id: entry.assetId }, select: { assignedUserId: true, currency: true, warrantyEndsAt: true } });
      const updated = await transaction.asset.updateMany({
        where: { id: entry.assetId, version: entry.version },
        data: {
          ...this.columnsData(entry.data, currency, current?.currency ?? null),
          ...(current !== null && current.assignedUserId !== entry.data.assignedUserId ? { assignedAt: entry.data.assignedUserId === null ? null : now } : {}),
          ...(entry.changes.includes('warrantyEndsAt') ? { warrantyRemindersSent: [] } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        // Changed by someone else since the preview.
        if (strict) throw new AssetError(assetErrorCodes.versionConflict, String(entry.row));
        result.failed += 1;
        result.failures.push({ row: entry.row, column: null, code: 'changed_since_preview' });
        continue;
      }
      const events: Prisma.AssetEventCreateManyInput[] = [
        { assetId: entry.assetId, action: assetEventActions.updated, actorUserId: actor.userId, detail: { jobId, fields: entry.changes } as Prisma.InputJsonValue },
      ];
      if (current !== null && current.assignedUserId !== entry.data.assignedUserId) {
        events.push({
          assetId: entry.assetId,
          action: entry.data.assignedUserId === null ? assetEventActions.unassigned : assetEventActions.assigned,
          actorUserId: actor.userId,
          detail: { userId: entry.data.assignedUserId ?? current.assignedUserId, jobId } as Prisma.InputJsonValue,
        });
      }
      await transaction.assetEvent.createMany({ data: events });
      result.updated += 1;
    }
    return result;
  }

  /** Tags for new rows: the given one, or the next free `{prefix}{year}-{00001}`. */
  private async assignTags(transaction: Prisma.TransactionClient, creates: readonly PlannedRow[], prefix: string): Promise<string[]> {
    const generated = await allocateAssetTags(transaction, creates.filter((entry) => entry.data.assetTag === null).length, prefix);
    let next = 0;
    return creates.map((entry) => entry.data.assetTag ?? generated[next++]);
  }

  // ------------------------------------------------------------ export (§13)

  async export(query: AssetListQuery, format: 'xlsx' | 'csv', locale: ImportLocale, actor: ImportActor): Promise<{ fileName: string; buffer: Buffer; contentType: string }> {
    const where = await this.assets.listWhere(query, actor.scope);
    const total = await this.prisma.asset.count({ where });
    if (total > assetImportLimits.exportMaxRows) throw new AssetError(assetErrorCodes.exportTooLarge, String(assetImportLimits.exportMaxRows));
    const [rows, units, locations, services, type] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: [{ assetTag: 'asc' }],
        take: assetImportLimits.exportMaxRows,
        select: {
          assetTag: true,
          name: true,
          status: true,
          serialNumber: true,
          manufacturer: true,
          model: true,
          organizationalUnitId: true,
          locationId: true,
          serviceId: true,
          purchaseDate: true,
          purchaseCost: true,
          supplier: true,
          warrantyEndsAt: true,
          notes: true,
          attributes: true,
          type: { select: { key: true } },
          assignedUser: { select: { email: true } },
        },
      }),
      this.loadUnits({ all: true }),
      this.loadLocations(),
      this.loadServices(),
      query.typeId ? this.loadType(query.typeId) : Promise.resolve(null),
    ]);
    const nameCount = (names: readonly string[]) => names.reduce((map, name) => map.set(name.toLowerCase(), (map.get(name.toLowerCase()) ?? 0) + 1), new Map<string, number>());
    const unitNames = nameCount(units.map((unit) => unit.name));
    const serviceNames = nameCount(services.map((service) => service.name));
    // Unambiguous, re-importable references: name when unique, otherwise path/code/slug.
    const unitLabel = new Map(units.map((unit) => [unit.id, (unitNames.get(unit.name.toLowerCase()) ?? 0) > 1 ? unit.ouPath : unit.name]));
    const locationLabel = new Map(locations.map((location) => [location.id, location.code ?? location.path]));
    const serviceLabel = new Map(services.map((service) => [service.id, (serviceNames.get(service.name.toLowerCase()) ?? 0) > 1 ? service.slug : service.name]));
    const attributes = type?.attributes.filter((attribute) => attribute.archivedAt === null) ?? [];
    const columns = this.columnsFor(attributes, locale, false, await this.access.locationsEnabled());
    const data = rows.map((row) => {
      const values: Record<string, string> = {
        assetTag: row.assetTag,
        name: row.name,
        type: row.type.key,
        status: assetStatusLabels[row.status as AssetStatusValue][locale],
        serialNumber: row.serialNumber ?? '',
        manufacturer: row.manufacturer ?? '',
        model: row.model ?? '',
        organizationalUnit: unitLabel.get(row.organizationalUnitId) ?? '',
        assignedUser: row.assignedUser?.email ?? '',
        location: row.locationId ? (locationLabel.get(row.locationId) ?? '') : '',
        service: row.serviceId ? (serviceLabel.get(row.serviceId) ?? '') : '',
        purchaseDate: dateOnly(row.purchaseDate) ?? '',
        purchaseCost: row.purchaseCost === null ? '' : row.purchaseCost.toFixed(2),
        supplier: row.supplier ?? '',
        warrantyEndsAt: dateOnly(row.warrantyEndsAt) ?? '',
        notes: row.notes ?? '',
      };
      const stored = (row.attributes ?? {}) as Record<string, unknown>;
      for (const attribute of attributes) {
        const value = stored[attribute.key];
        values[`${attributeColumnPrefix}${attribute.key}`] = value === undefined || value === null ? '' : String(value);
      }
      return columns.map((column) => values[column.key] ?? '');
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `assets-${type?.key ?? 'all'}-${stamp}`;
    if (format === 'csv') {
      return { fileName: `${baseName}.csv`, buffer: buildCsv(columns, data, locale === 'bs' ? ';' : ','), contentType: 'text/csv; charset=utf-8' };
    }
    return {
      fileName: `${baseName}.xlsx`,
      buffer: await buildWorkbook({ sheetName: locale === 'bs' ? 'Oprema' : 'Assets', columns, rows: data }),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
