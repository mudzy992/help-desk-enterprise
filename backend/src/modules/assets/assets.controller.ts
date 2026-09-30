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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetTicketsService } from './asset-tickets.service';
import { assetViewerOf, type AssetViewer } from './asset-viewer';
import {
  AddAssetRelationDto,
  ArchiveDto,
  AssetStatusDto,
  AssignAssetDto,
  LinkTicketAssetDto,
  SaveAssetAttributeDto,
  SaveAssetDto,
  SaveAssetLocationDto,
  SaveAssetTypeDto,
  UnassignAssetDto,
} from './assets.dto';
import { assetStatuses, type AssetStatusValue } from './assets.constants';
import { AssetsService, type AssetListQuery } from './assets.service';
import { runAsset } from './map-asset-error';

type RawListQuery = Record<string, string | undefined>;

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
    return runAsset(() => this.assets.detail(id, this.viewer(request)));
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
