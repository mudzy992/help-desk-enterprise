import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { ChangeAccessService, changeViewerOf, type ChangeViewer } from './change-access.service';
import { ChangeApprovalsService } from './change-approvals.service';
import { ChangeScheduleService } from './change-schedule.service';
import { ChangeTemplatesService } from './change-templates.service';
import { ChangeActionDto, ChangeConflictPreviewDto, ChangeTemplateDto, ChangeVoteDto, CreateChangeDto, UpdateChangeDto } from './changes.dto';
import { changeRisks, changeStatuses, changeTypes, type ChangeRiskValue, type ChangeStatusValue, type ChangeTypeValue } from './changes.constants';
import { ChangesService, type ChangeListQuery } from './changes.service';
import { runChange } from './map-change-error';

type RawListQuery = Record<string, string | undefined>;

function csvOf<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => (allowed as readonly string[]).includes(value));
}

function idOf(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && value.length <= 64 ? value : undefined;
}

export function parseChangeListQuery(raw: RawListQuery): ChangeListQuery {
  const limit = raw.limit === undefined ? undefined : Number(raw.limit);
  return {
    search: raw.search?.slice(0, 120),
    status: csvOf<ChangeStatusValue>(raw.status, changeStatuses),
    type: csvOf<ChangeTypeValue>(raw.type, changeTypes),
    risk: csvOf<ChangeRiskValue>(raw.risk, changeRisks),
    ownerUserId: idOf(raw.ownerUserId),
    cabGroupId: idOf(raw.cabGroupId),
    serviceId: idOf(raw.serviceId),
    organizationalUnitId: idOf(raw.organizationalUnitId),
    mine: raw.mine === 'true',
    awaitingMyVote: raw.awaitingMyVote === 'true',
    problemId: idOf(raw.problemId),
    assetId: idOf(raw.assetId),
    cursor: idOf(raw.cursor),
    limit: limit !== undefined && Number.isInteger(limit) ? limit : undefined,
  };
}

/**
 * Paket 3.4 (§15): change management API. RoleGuard is not used because it
 * rejects unit-bound grants on routes without a unit scope; the module switch,
 * permissions and unit scope are enforced in the services.
 */
@Controller('changes')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ChangesController {
  constructor(
    private readonly access: ChangeAccessService,
    private readonly changes: ChangesService,
    private readonly templates: ChangeTemplatesService,
    private readonly approvals: ChangeApprovalsService,
    private readonly schedule: ChangeScheduleService,
  ) {}

  private viewer(request: AuthenticatedHttpRequest): ChangeViewer {
    return changeViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities(@Req() request: AuthenticatedHttpRequest) {
    return this.access.capabilities(this.viewer(request));
  }

  @Get('options')
  @Header('Cache-Control', 'no-store')
  options(@Req() request: AuthenticatedHttpRequest) {
    return runChange(() => this.changes.options(this.viewer(request)));
  }

  @Get('owners')
  @Header('Cache-Control', 'no-store')
  owners(@Req() request: AuthenticatedHttpRequest, @Query('search') search: string | undefined) {
    return runChange(() => this.changes.searchOwners(this.viewer(request), search ?? ''));
  }

  /** §17: changes, downtime windows and freezes in a period. */
  @Get('calendar')
  @Header('Cache-Control', 'no-store')
  calendar(@Req() request: AuthenticatedHttpRequest, @Query('from') from: string | undefined, @Query('to') to: string | undefined) {
    return runChange(() => this.schedule.calendar(this.viewer(request), from, to));
  }

  /** §9: conflicts of an unsaved window (form). */
  @Post('conflicts/preview')
  previewConflicts(@Req() request: AuthenticatedHttpRequest, @Body() body: ChangeConflictPreviewDto) {
    return runChange(() => this.schedule.preview(this.viewer(request), body));
  }

  @Get('templates')
  @Header('Cache-Control', 'no-store')
  listTemplates(@Req() request: AuthenticatedHttpRequest, @Query('includeInactive') includeInactive: string | undefined) {
    return runChange(() => this.templates.list(this.viewer(request), includeInactive === 'true'));
  }

  @Post('templates')
  createTemplate(@Req() request: AuthenticatedHttpRequest, @Body() body: ChangeTemplateDto) {
    return runChange(() => this.templates.create(this.viewer(request), body));
  }

  @Get('templates/:templateId')
  @Header('Cache-Control', 'no-store')
  getTemplate(@Req() request: AuthenticatedHttpRequest, @Param('templateId') templateId: string) {
    return runChange(() => this.templates.get(this.viewer(request), templateId));
  }

  @Put('templates/:templateId')
  updateTemplate(@Req() request: AuthenticatedHttpRequest, @Param('templateId') templateId: string, @Body() body: ChangeTemplateDto) {
    return runChange(() => this.templates.update(this.viewer(request), templateId, body));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest, @Query() query: RawListQuery) {
    return runChange(() => this.changes.list(this.viewer(request), parseChangeListQuery(query)));
  }

  @Post()
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: CreateChangeDto) {
    return runChange(() => this.changes.create(this.viewer(request), body));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runChange(() => this.changes.get(this.viewer(request), id));
  }

  @Get(':id/events')
  @Header('Cache-Control', 'no-store')
  events(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runChange(() => this.changes.events(this.viewer(request), id));
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: UpdateChangeDto) {
    return runChange(() => this.changes.update(this.viewer(request), id, body));
  }

  @Get(':id/conflicts')
  @Header('Cache-Control', 'no-store')
  conflicts(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runChange(() => this.changes.conflicts(this.viewer(request), id));
  }

  @Get(':id/approvals')
  @Header('Cache-Control', 'no-store')
  approvalOverview(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runChange(() => this.approvals.overview(this.viewer(request), id));
  }

  @Post(':id/approvals')
  vote(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ChangeVoteDto) {
    return runChange(() => this.approvals.vote(this.viewer(request), id, body));
  }

  @Post(':id/claim')
  claim(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runChange(() => this.changes.claim(this.viewer(request), id));
  }

  @Post(':id/actions')
  act(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ChangeActionDto) {
    return runChange(() => this.changes.act(this.viewer(request), id, body));
  }
}
