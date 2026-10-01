import { Body, Controller, Delete, Get, HttpCode, Header, Param, Patch, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { runProblem } from './map-problem-error';
import { ProblemAccessService, problemViewerOf, type ProblemViewer } from './problem-access.service';
import { CreateProblemArticleDto, CreateProblemDto, LinkProblemTicketsDto, ProblemStatusDto, UpdateProblemDto } from './problems.dto';
import { ProblemResolutionService } from './problem-resolution.service';
import { ProblemTicketsService } from './problem-tickets.service';
import { problemSeverities, problemStatuses, type ProblemSeverityValue, type ProblemStatusValue } from './problems.constants';
import { ProblemsService, type ProblemListQuery } from './problems.service';

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

export function parseProblemListQuery(raw: RawListQuery): ProblemListQuery {
  const limit = raw.limit === undefined ? undefined : Number(raw.limit);
  const status: ProblemStatusValue[] = raw.knownErrors === 'true' ? ['KNOWN_ERROR'] : csvOf(raw.status, problemStatuses);
  return {
    search: raw.search?.slice(0, 120),
    status,
    priority: csvOf<ProblemSeverityValue>(raw.priority, problemSeverities),
    ownerUserId: idOf(raw.ownerUserId),
    groupId: idOf(raw.groupId),
    organizationalUnitId: idOf(raw.organizationalUnitId),
    serviceId: idOf(raw.serviceId),
    cursor: idOf(raw.cursor),
    limit: limit !== undefined && Number.isInteger(limit) ? limit : undefined,
  };
}

/**
 * Paket 3.3 (§12): problem management API. RoleGuard is not used because it
 * rejects unit-bound grants on routes without a unit scope; the module switch,
 * permissions and unit scope are enforced in the services.
 */
@Controller('problems')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ProblemsController {
  constructor(
    private readonly access: ProblemAccessService,
    private readonly problems: ProblemsService,
    private readonly problemTickets: ProblemTicketsService,
    private readonly resolution: ProblemResolutionService,
  ) {}

  private viewer(request: AuthenticatedHttpRequest): ProblemViewer {
    return problemViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('options')
  @Header('Cache-Control', 'no-store')
  options(@Req() request: AuthenticatedHttpRequest) {
    return runProblem(() => this.problems.options(this.viewer(request)));
  }

  @Get('owners')
  @Header('Cache-Control', 'no-store')
  owners(@Req() request: AuthenticatedHttpRequest, @Query('search') search: string | undefined) {
    return runProblem(() => this.problems.searchOwners(this.viewer(request), search ?? ''));
  }

  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities(@Req() request: AuthenticatedHttpRequest) {
    return this.access.capabilities(this.viewer(request));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest, @Query() query: RawListQuery) {
    return runProblem(() => this.problems.list(this.viewer(request), parseProblemListQuery(query)));
  }

  /** Ticket panel (§8.3); static path, declared before ":id". */
  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  ticketPanel(@Req() request: AuthenticatedHttpRequest, @Param('ticketId') ticketId: string) {
    return runProblem(() => this.problemTickets.panel(ticketId, this.viewer(request)));
  }

  /** §8.1: optional `ticketIds` are linked right after creation. */
  @Post()
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: CreateProblemDto) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const { ticketIds, ...input } = body;
      const created = await this.problems.create(viewer, input);
      if (!ticketIds || ticketIds.length === 0) return { ...created, ticketLinks: null };
      const ticketLinks = await this.problemTickets.link(created.id, ticketIds, viewer, { singleAsError: false });
      return { ...(await this.problems.get(viewer, created.id)), ticketLinks };
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.problems.get(this.viewer(request), id));
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: UpdateProblemDto) {
    return runProblem(() => this.problems.update(this.viewer(request), id, body));
  }

  /**
   * §8.4: RESOLVED may carry `resolveTickets` + `message` (+ `closeCode`). The
   * options are validated first; the tickets are resolved after the status.
   */
  @Post(':id/status')
  changeStatus(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ProblemStatusDto) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const { resolveTickets, message, closeCode, ...status } = body;
      const groupResolve = resolveTickets === true && status.status === 'RESOLVED';
      if (groupResolve) await this.resolution.assertResolveOptions(id, viewer, { message, closeCode });
      const problem = await this.problems.changeStatus(viewer, id, status);
      if (!groupResolve) return { ...problem, ticketResolution: null };
      const ticketResolution = await this.resolution.resolveTickets(id, viewer, { message: message ?? '', closeCode });
      return { ...(await this.problems.get(viewer, id)), ticketResolution };
    });
  }

  @Get(':id/resolve-preview')
  @Header('Cache-Control', 'no-store')
  resolvePreview(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.resolution.resolvePreview(id, this.viewer(request)));
  }

  @Get(':id/knowledge-article/draft')
  @Header('Cache-Control', 'no-store')
  articleDraft(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.resolution.articleDraft(id, this.viewer(request)));
  }

  @Post(':id/knowledge-article')
  createArticle(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: CreateProblemArticleDto) {
    return runProblem(() => this.resolution.createArticle(id, body, this.viewer(request)));
  }

  @Get(':id/events')
  @Header('Cache-Control', 'no-store')
  events(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.problems.events(this.viewer(request), id));
  }

  @Get(':id/tickets')
  @Header('Cache-Control', 'no-store')
  tickets(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.problemTickets.listForProblem(id, this.viewer(request)));
  }

  @Post(':id/tickets')
  linkTickets(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: LinkProblemTicketsDto) {
    return runProblem(() => this.problemTickets.link(id, body.ticketIds, this.viewer(request)));
  }

  @Delete(':id/tickets/:ticketId')
  @HttpCode(204)
  async unlinkTicket(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('ticketId') ticketId: string) {
    await runProblem(() => this.problemTickets.unlink(id, ticketId, this.viewer(request)));
  }
}
