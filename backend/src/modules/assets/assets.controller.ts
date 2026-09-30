import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { permissionKeys } from '../authorization/authorization.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssetImportService } from './import/asset-import.service';
import { AssetDirectorySyncService } from './directory/asset-directory-sync.service';
import type { ImportLocale } from './import/asset-import-columns';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetTicketsService } from './asset-tickets.service';
import { AssetContractsService } from './asset-contracts.service';
import { AssetLicensesService } from './asset-licenses.service';
import { assetViewerOf, type AssetViewer } from './asset-viewer';
import {
  AddAssetRelationDto,
  ArchiveDto,
  AssetStatusDto,
  AssignAssetDto,
  AssignLicenseDto,
  ContractItemDto,
  ImportPreviewDto,
  SaveContractDto,
  SaveLicenseDto,
  LinkTicketAssetDto,
  SaveAssetAttributeDto,
  SaveAssetDto,
  SaveAssetLocationDto,
  SaveAssetTypeDto,
  UnassignAssetDto,
} from './assets.dto';
import { AssetError, assetContractKinds, assetErrorCodes, assetStatuses, softwareLicenseKinds, type AssetStatusValue } from './assets.constants';
import { AssetsService, type AssetListQuery } from './assets.service';
import { runAsset } from './map-asset-error';

type RawListQuery = Record<string, string | undefined>;

const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Hard upload ceiling; the configurable limit (1–20 MB) is checked in the service. */
const importUploadMaxBytes = 20 * 1024 * 1024;

function readLocale(value: string | undefined): ImportLocale {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'bs';
}

function fileResponse(file: { fileName: string; buffer: Buffer }, type: string): StreamableFile {
  const ascii = file.fileName.replace(/[^\w.-]/g, '_');
  return new StreamableFile(file.buffer, {
    type,
    disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    length: file.buffer.length,
  });
}

/** Multer hands the name over as latin1; browsers send UTF-8. */
function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (decoded.includes('\uFFFD') ? name : decoded).slice(0, 255);
}

function parseMapping(raw: string | undefined): (string | null)[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AssetError(assetErrorCodes.importMappingInvalid, 'json');
  }
  if (!Array.isArray(parsed) || parsed.length > 200 || !parsed.every((entry) => entry === null || (typeof entry === 'string' && entry.length <= 120))) {
    throw new AssetError(assetErrorCodes.importMappingInvalid, 'shape');
  }
  return parsed as (string | null)[];
}

function parseListQuery(raw: RawListQuery): AssetListQuery {
  const status = (raw.status ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is AssetStatusValue => (assetStatuses as readonly string[]).includes(value));
  const limit = raw.limit === undefined ? undefined : Number(raw.limit);
  const within = raw.warrantyWithinDays === undefined ? undefined : Number(raw.warrantyWithinDays);
  const source = ['MANUAL', 'IMPORT', 'DIRECTORY'].includes(raw.source ?? '') ? (raw.source as AssetListQuery['source']) : undefined;
  return {
    search: raw.search?.slice(0, 120),
    typeId: raw.typeId || undefined,
    status,
    organizationalUnitId: raw.organizationalUnitId || undefined,
    locationId: raw.locationId || undefined,
    assignedUserId: raw.assignedUserId || undefined,
    unassigned: raw.unassigned === 'true',
    warrantyWithinDays: within !== undefined && Number.isInteger(within) && within >= 0 && within <= 3650 ? within : undefined,
    source,
    serviceId: raw.serviceId || undefined,
    cursor: raw.cursor || undefined,
    limit: limit !== undefined && Number.isInteger(limit) ? limit : undefined,
  };
}

function parseDays(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 0 && days <= 3650 ? days : undefined;
}

/**
 * Paket 3.2 (§14): CMDB API. RoleGuard denies routes without a permission
 * requirement, so every check (module switch, permission, unit scope) is in
 * the services; "My equipment" is open to every signed-in user.
 */
@Controller('assets')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AssetsController {
  constructor(
    private readonly access: AssetAccessService,
    private readonly catalogService: AssetCatalogService,
    private readonly assets: AssetsService,
    private readonly tickets: AssetTicketsService,
    private readonly licenses: AssetLicensesService,
    private readonly contracts: AssetContractsService,
    private readonly importer: AssetImportService,
    private readonly prisma: PrismaService,
    private readonly directorySync: AssetDirectorySyncService,
  ) {}

  private viewer(request: AuthenticatedHttpRequest): AssetViewer {
    return assetViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities(@Req() request: AuthenticatedHttpRequest) {
    return this.access.capabilities(this.viewer(request));
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  mine(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.assets.mine(this.viewer(request)));
  }

  /** §8: the requester's own equipment for the create form. */
  @Get('ticket-picker')
  @Header('Cache-Control', 'no-store')
  ticketPicker(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.tickets.picker(this.viewer(request)));
  }

  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  ticketAssets(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.tickets.list(ticketId, this.viewer(request)));
  }

  @Post('tickets/:ticketId/links')
  @HttpCode(200)
  linkTicketAsset(@Param('ticketId') ticketId: string, @Body() body: LinkTicketAssetDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.tickets.link(ticketId, body, this.viewer(request)));
  }

  @Delete('tickets/:ticketId/links/:assetId')
  unlinkTicketAsset(@Param('ticketId') ticketId: string, @Param('assetId') assetId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.tickets.unlink(ticketId, assetId, this.viewer(request)));
  }

  @Post('tickets/:ticketId/links/:assetId/primary')
  @HttpCode(200)
  setPrimaryTicketAsset(@Param('ticketId') ticketId: string, @Param('assetId') assetId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.tickets.setPrimary(ticketId, assetId, this.viewer(request)));
  }

  // ------------------------------------------------------------ import / export (§11, §13)

  @Get('import/template')
  @Header('Cache-Control', 'no-store')
  importTemplate(@Req() request: AuthenticatedHttpRequest, @Query('typeId') typeId = '', @Query('locale') locale?: string) {
    return runAsset(async () => {
      const actor = await this.importer.actorFor(this.viewer(request));
      return fileResponse(await this.importer.template(typeId, readLocale(locale), actor), xlsxType);
    });
  }

  @Get('import')
  @Header('Cache-Control', 'no-store')
  importJobs(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(async () => this.importer.list(await this.importer.actorFor(this.viewer(request))));
  }

  @Post('import/preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: importUploadMaxBytes } }))
  importPreview(
    @Req() request: AuthenticatedHttpRequest,
    @UploadedFile() file: { originalname?: string; buffer?: Buffer } | undefined,
    @Body() body: ImportPreviewDto,
  ) {
    return runAsset(async () => {
      const actor = await this.importer.actorFor(this.viewer(request));
      if (!file?.buffer || file.buffer.length === 0) throw new AssetError(assetErrorCodes.importFileInvalid, 'missing');
      return this.importer.preview(
        { fileName: decodeFileName(file.originalname ?? 'import'), buffer: file.buffer },
        { typeId: body.typeId, mode: body.mode, allOrNothing: body.allOrNothing === 'true', mapping: parseMapping(body.mapping) },
        actor,
      );
    });
  }

  // ------------------------------------------------------------ AD computers (§12)

  /** Admins only (asset.type.manage, whole installation). */
  private async requireDirectoryAdmin(request: AuthenticatedHttpRequest) {
    await this.access.requireEnabled();
    const viewer = this.viewer(request);
    const scope = await this.access.require(viewer, permissionKeys.assetTypeManage);
    if (!scope.all) throw new AssetError(assetErrorCodes.forbidden);
    return viewer;
  }

  @Get('directory-sync')
  directorySyncStatus(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(async () => {
      await this.requireDirectoryAdmin(request);
      return this.directorySync.status();
    });
  }

  @Post('directory-sync/dry-run')
  @HttpCode(200)
  directorySyncDryRun(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(async () => {
      const viewer = await this.requireDirectoryAdmin(request);
      return this.directorySync.run({ dryRun: true, actorUserId: viewer.userId, trigger: 'manual' });
    });
  }

  @Post('directory-sync/run')
  @HttpCode(200)
  directorySyncRun(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(async () => {
      const viewer = await this.requireDirectoryAdmin(request);
      return this.directorySync.run({ dryRun: false, actorUserId: viewer.userId, trigger: 'manual' });
    });
  }

  @Post('import/:jobId/apply')
  @HttpCode(200)
  importApply(@Req() request: AuthenticatedHttpRequest, @Param('jobId') jobId: string) {
    return runAsset(async () => this.importer.apply(jobId, await this.importer.actorFor(this.viewer(request))));
  }

  @Delete('import/:jobId')
  importDiscard(@Req() request: AuthenticatedHttpRequest, @Param('jobId') jobId: string) {
    return runAsset(async () => this.importer.discard(jobId, await this.importer.actorFor(this.viewer(request))));
  }

  @Get('import/:jobId/errors')
  @Header('Cache-Control', 'no-store')
  importErrors(@Req() request: AuthenticatedHttpRequest, @Param('jobId') jobId: string, @Query('locale') locale?: string) {
    return runAsset(async () => {
      const actor = await this.importer.actorFor(this.viewer(request));
      return fileResponse(await this.importer.errorWorkbook(jobId, readLocale(locale), actor), xlsxType);
    });
  }

  /** §13: current filter as .xlsx/.csv (≤ 10 000 rows); licence keys are never exported. */
  @Get('export')
  @Header('Cache-Control', 'no-store')
  exportAssets(@Req() request: AuthenticatedHttpRequest, @Query() raw: RawListQuery) {
    return runAsset(async () => {
      const viewer = this.viewer(request);
      const actor = await this.importer.actorFor(viewer, permissionKeys.assetRead);
      const format = raw.format === 'csv' ? 'csv' : 'xlsx';
      const exported = await this.importer.export(parseListQuery(raw), format, readLocale(raw.locale), actor);
      await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
        action: 'asset.export',
        entityType: auditLogEntityTypes.asset,
        entityId: 'export',
        metadata: { format, fileName: exported.fileName } as never,
        actorUserId: viewer.userId,
      }).catch(() => undefined);
      return fileResponse(exported, exported.contentType);
    });
  }

  // ------------------------------------------------------------ licences (§9)

  @Get('licenses')
  @Header('Cache-Control', 'no-store')
  listLicenses(@Query() raw: RawListQuery, @Req() request: AuthenticatedHttpRequest) {
    const kind = (softwareLicenseKinds as readonly string[]).includes(raw.kind ?? '') ? (raw.kind as (typeof softwareLicenseKinds)[number]) : undefined;
    return runAsset(() =>
      this.licenses.list(
        {
          search: raw.search?.slice(0, 120),
          kind,
          expiringWithinDays: parseDays(raw.expiringWithinDays),
          overAllocated: raw.overAllocated === 'true',
        },
        this.viewer(request),
      ),
    );
  }

  @Post('licenses')
  createLicense(@Body() body: SaveLicenseDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.create(body, this.viewer(request)));
  }

  @Get('licenses/:licenseId')
  @Header('Cache-Control', 'no-store')
  license(@Param('licenseId') licenseId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.detail(licenseId, this.viewer(request)));
  }

  @Put('licenses/:licenseId')
  updateLicense(@Param('licenseId') licenseId: string, @Body() body: SaveLicenseDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.update(licenseId, body, this.viewer(request)));
  }

  @Delete('licenses/:licenseId')
  removeLicense(@Param('licenseId') licenseId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.remove(licenseId, this.viewer(request)));
  }

  @Post('licenses/:licenseId/key')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  revealLicenseKey(@Param('licenseId') licenseId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.revealKey(licenseId, this.viewer(request)));
  }

  @Post('licenses/:licenseId/assignments')
  @HttpCode(200)
  assignLicense(@Param('licenseId') licenseId: string, @Body() body: AssignLicenseDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.licenses.assign(licenseId, body, this.viewer(request)));
  }

  @Delete('licenses/:licenseId/assignments/:assignmentId')
  releaseLicense(
    @Param('licenseId') licenseId: string,
    @Param('assignmentId') assignmentId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return runAsset(() => this.licenses.release(licenseId, assignmentId, this.viewer(request)));
  }

  // ------------------------------------------------------------ contracts (§10)

  @Get('contracts')
  @Header('Cache-Control', 'no-store')
  listContracts(@Query() raw: RawListQuery, @Req() request: AuthenticatedHttpRequest) {
    const kind = (assetContractKinds as readonly string[]).includes(raw.kind ?? '') ? (raw.kind as (typeof assetContractKinds)[number]) : undefined;
    return runAsset(() =>
      this.contracts.list(
        {
          search: raw.search?.slice(0, 120),
          kind,
          expiringWithinDays: parseDays(raw.expiringWithinDays),
          includeExpired: raw.includeExpired === 'true',
        },
        this.viewer(request),
      ),
    );
  }

  @Post('contracts')
  createContract(@Body() body: SaveContractDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.create(body, this.viewer(request)));
  }

  @Get('contracts/:contractId')
  @Header('Cache-Control', 'no-store')
  contract(@Param('contractId') contractId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.detail(contractId, this.viewer(request)));
  }

  @Put('contracts/:contractId')
  updateContract(@Param('contractId') contractId: string, @Body() body: SaveContractDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.update(contractId, body, this.viewer(request)));
  }

  @Delete('contracts/:contractId')
  removeContract(@Param('contractId') contractId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.remove(contractId, this.viewer(request)));
  }

  @Post('contracts/:contractId/items')
  @HttpCode(200)
  addContractItem(@Param('contractId') contractId: string, @Body() body: ContractItemDto, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.addItem(contractId, body.assetId, this.viewer(request)));
  }

  @Delete('contracts/:contractId/items/:assetId')
  removeContractItem(@Param('contractId') contractId: string, @Param('assetId') assetId: string, @Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.contracts.removeItem(contractId, assetId, this.viewer(request)));
  }

  @Get('options')
  @Header('Cache-Control', 'no-store')
  options(@Req() request: AuthenticatedHttpRequest) {
    return runAsset(() => this.assets.options(this.viewer(request)));
  }

  @Get('users')
  @Header('Cache-Control', 'no-store')
  users(@Req() request: AuthenticatedHttpRequest, @Query('search') search = '') {
    return runAsset(() => this.assets.searchUsers(search.slice(0, 120), this.viewer(request)));
  }

  // ------------------------------------------------------------ catalog

  @Get('catalog')
  @Header('Cache-Control', 'no-store')
  catalog(@Req() request: AuthenticatedHttpRequest, @Query('includeArchived') includeArchived?: string) {
    return runAsset(() => this.catalogService.catalog(includeArchived === 'true', this.viewer(request)));
  }

  @Post('catalog/types')
  createType(@Req() request: AuthenticatedHttpRequest, @Body() body: SaveAssetTypeDto) {
    return runAsset(() => this.catalogService.createType(body, this.viewer(request)));
  }

  @Put('catalog/types/:id')
  updateType(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAssetTypeDto) {
    return runAsset(() => this.catalogService.updateType(id, body, this.viewer(request)));
  }

  @Post('catalog/types/:id/archive')
  @HttpCode(200)
  archiveType(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ArchiveDto) {
    return runAsset(() => this.catalogService.setTypeArchived(id, body.archived, this.viewer(request)));
  }

  @Post('catalog/types/:id/attributes')
  createAttribute(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAssetAttributeDto) {
    return runAsset(() => this.catalogService.createAttribute(id, body, this.viewer(request)));
  }

  @Put('catalog/attributes/:id')
  updateAttribute(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAssetAttributeDto) {
    return runAsset(() => this.catalogService.updateAttribute(id, body, this.viewer(request)));
  }

  @Post('catalog/attributes/:id/archive')
  @HttpCode(200)
  archiveAttribute(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ArchiveDto) {
    return runAsset(() => this.catalogService.setAttributeArchived(id, body.archived, this.viewer(request)));
  }

  @Post('catalog/locations')
  createLocation(@Req() request: AuthenticatedHttpRequest, @Body() body: SaveAssetLocationDto) {
    return runAsset(() => this.catalogService.createLocation(body, this.viewer(request)));
  }

  @Put('catalog/locations/:id')
  updateLocation(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAssetLocationDto) {
    return runAsset(() => this.catalogService.updateLocation(id, body, this.viewer(request)));
  }

  @Post('catalog/locations/:id/archive')
  @HttpCode(200)
  archiveLocation(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ArchiveDto) {
    return runAsset(() => this.catalogService.setLocationArchived(id, body.archived, this.viewer(request)));
  }

  // ------------------------------------------------------------ register

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest, @Query() query: RawListQuery) {
    return runAsset(() => this.assets.list(parseListQuery(query), this.viewer(request)));
  }

  @Get('lookup')
  @Header('Cache-Control', 'no-store')
  lookup(@Req() request: AuthenticatedHttpRequest, @Query('search') search = '', @Query('excludeId') excludeId?: string) {
    return runAsset(() => this.assets.lookup(search.slice(0, 120), this.viewer(request), excludeId));
  }

  @Post()
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: SaveAssetDto) {
    return runAsset(() => this.assets.create(body, this.viewer(request)));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(async () => {
      const asset = await this.assets.detail(id, this.viewer(request));
      const [licenses, contracts] = await Promise.all([
        this.licenses.forAsset(asset.id, asset.assignedUser?.id ?? null),
        this.contracts.forAsset(asset.id),
      ]);
      return { ...asset, licenses, contracts };
    });
  }

  @Put(':id')
  update(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAssetDto) {
    return runAsset(() => this.assets.update(id, body, this.viewer(request)));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runAsset(() => this.assets.remove(id, this.viewer(request)));
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: AssetStatusDto) {
    return runAsset(() => this.assets.changeStatus(id, body.status, body.reason, this.viewer(request)));
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: AssignAssetDto) {
    return runAsset(() => this.assets.assign(id, body, this.viewer(request)));
  }

  @Post(':id/unassign')
  @HttpCode(200)
  unassign(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: UnassignAssetDto) {
    return runAsset(() => this.assets.unassign(id, body, this.viewer(request)));
  }

  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  history(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Query('cursor') cursor?: string) {
    return runAsset(() => this.assets.history(id, this.viewer(request), cursor));
  }

  @Get(':id/impact')
  @Header('Cache-Control', 'no-store')
  impact(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAsset(() => this.assets.impact(id, this.viewer(request)));
  }

  @Post(':id/relations')
  addRelation(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: AddAssetRelationDto) {
    return runAsset(() => this.assets.addRelation(id, body, this.viewer(request)));
  }

  @Delete(':id/relations/:relationId')
  @HttpCode(204)
  async removeRelation(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Param('relationId') relationId: string,
  ) {
    await runAsset(() => this.assets.removeRelation(id, relationId, this.viewer(request)));
  }
}
