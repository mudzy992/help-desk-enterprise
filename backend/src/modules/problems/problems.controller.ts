import { randomUUID } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Header, Param, Patch, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { runProblem } from './map-problem-error';
import { ProblemAccessService, problemViewerOf, type ProblemViewer } from './problem-access.service';
import {
  CreateProblemArticleDto,
  CreateProblemDto,
  ProblemHandoffDecisionDto,
  ProblemHandoffDto,
  LinkProblemAssetsDto,
  LinkProblemIncidentDto,
  LinkProblemServiceDto,
  LinkProblemTicketsDto,
  ProblemResolutionRunDto,
  ProblemStatusDto,
  UpdateProblemDto,
} from './problems.dto';
import { ProblemNotifier } from './problem-notifier';
import { ProblemHandoffService } from './problem-handoff.service';
import { ProblemTargetReminderService } from './problem-target-reminder.service';
import { ProblemResolutionService } from './problem-resolution.service';
import { ProblemLinksService } from './problem-links.service';
import { ProblemTicketsService } from './problem-tickets.service';
import { problemErrorCodes, problemSeverities, problemStatuses, ProblemError, type ProblemSeverityValue, type ProblemStatusValue } from './problems.constants';
import { ticketFailureCode } from './problem-resolution-support';
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
    overdue: raw.overdue === 'true',
    rootCauseCategory: raw.rootCauseCategory?.trim().slice(0, 80) || undefined,
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
    private readonly notifier: ProblemNotifier,
    private readonly links: ProblemLinksService,
    private readonly reminders: ProblemTargetReminderService,
    private readonly handoffs: ProblemHandoffService,
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
  owners(@Req() request: AuthenticatedHttpRequest, @Query('search') search: string | undefined, @Query('groupId') groupId: string | undefined) {
    const group = typeof groupId === 'string' && groupId.trim().length > 0 && groupId.length <= 64 ? groupId.trim() : null;
    return runProblem(() => this.problems.searchOwners(this.viewer(request), search ?? '', group));
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

  /**
   * §8.1: optional `ticketIds` are linked in the same transaction as creation
   * (W7.26); a command whose tickets all fail to link creates nothing.
   */
  @Post()
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: CreateProblemDto) {
    return runProblem(() => this.problems.create(this.viewer(request), body));
  }

  /** P5b reverse side (asset card, incident card); static paths before ":id". */
  @Get('by-asset/:assetId')
  @Header('Cache-Control', 'no-store')
  byAsset(@Req() request: AuthenticatedHttpRequest, @Param('assetId') assetId: string) {
    return runProblem(() => this.links.forAsset(assetId, this.viewer(request)));
  }

  @Get('by-incident/:incidentId')
  @Header('Cache-Control', 'no-store')
  byIncident(@Req() request: AuthenticatedHttpRequest, @Param('incidentId') incidentId: string) {
    return runProblem(() => this.links.forIncident(incidentId, this.viewer(request)));
  }

  @Get(':id/links')
  @Header('Cache-Control', 'no-store')
  getLinks(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.links.get(id, this.viewer(request)));
  }

  @Get(':id/links/asset-search')
  @Header('Cache-Control', 'no-store')
  searchAssets(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Query('search') search?: string) {
    return runProblem(() => this.links.searchAssets(id, this.viewer(request), search ?? ''));
  }

  @Post(':id/assets')
  linkAssets(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: LinkProblemAssetsDto) {
    return runProblem(() => this.links.linkAssets(id, this.viewer(request), body.assetIds));
  }

  @Delete(':id/assets/:assetId')
  @HttpCode(204)
  async unlinkAsset(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('assetId') assetId: string) {
    await runProblem(() => this.links.unlinkAsset(id, this.viewer(request), assetId));
  }

  @Post(':id/services')
  linkService(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: LinkProblemServiceDto) {
    return runProblem(() => this.links.linkService(id, this.viewer(request), body.serviceId));
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(204)
  async unlinkService(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('serviceId') serviceId: string) {
    await runProblem(() => this.links.unlinkService(id, this.viewer(request), serviceId));
  }

  @Get(':id/links/incident-search')
  @Header('Cache-Control', 'no-store')
  searchIncidents(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Query('search') search?: string) {
    return runProblem(() => this.links.searchIncidents(id, this.viewer(request), search ?? ''));
  }

  @Post(':id/incidents')
  linkIncident(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: LinkProblemIncidentDto) {
    return runProblem(() => this.links.linkIncident(id, this.viewer(request), body.incidentId));
  }

  @Delete(':id/incidents/:incidentId')
  @HttpCode(204)
  async unlinkIncident(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('incidentId') incidentId: string) {
    await runProblem(() => this.links.unlinkIncident(id, this.viewer(request), incidentId));
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
  /** Decision 2026-10-01: a problem manager of the group takes the problem over. */
  @Post(':id/claim')
  claim(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.problems.claim(this.viewer(request), id));
  }

  @Post(':id/status')
  changeStatus(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ProblemStatusDto) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const { resolveTickets, message, closeCode, resolutionRunId, ...status } = body;
      const groupResolve = resolveTickets === true && status.status === 'RESOLVED';
      // P5 (§11): after the group resolution, so only agents of tickets that stayed open hear about it.
      const notify = () => this.notifier.run('status', () => this.notifier.statusChanged(id, status.status, viewer.userId));
      if (!groupResolve) {
        const problem = await this.problems.changeStatus(viewer, id, status);
        notify();
        return { ...problem, ticketResolution: null };
      }
      await this.resolution.assertResolveOptions(id, viewer, { message, closeCode });
      // W7.24: the run is written before the status changes, so a crash between
      // the two leaves a resumable record instead of losing the resolution.
      const runId = resolutionRunId ?? randomUUID();
      const prepared = await this.resolution.prepareRun(id, viewer, { runId, message, closeCode });
      if (prepared.replay !== null) {
        notify();
        return { ...(await this.problems.get(viewer, id)), ticketResolution: prepared.replay };
      }
      if (prepared.status === 'FAILED') throw new ProblemError(problemErrorCodes.resolutionRunClosed);
      try {
        await this.problems.changeStatus(viewer, id, status);
      } catch (error) {
        // Nothing was written on a ticket; the run is kept as evidence but is not resumable.
        await this.resolution.abortRun(runId, ticketFailureCode(error));
        throw error;
      }
      const ticketResolution = await this.resolution.executeRun(id, viewer, runId);
      notify();
      return { ...(await this.problems.get(viewer, id)), ticketResolution };
    });
  }

  /** W7.24: durable group resolution with a caller-chosen run id (its idempotency key). */
  @Post(':id/resolution-runs')
  startResolutionRun(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ProblemResolutionRunDto) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const prepared = await this.resolution.prepareRun(id, viewer, {
        runId: body.runId,
        message: body.message,
        closeCode: body.closeCode,
      });
      if (prepared.status === 'FAILED' && prepared.replay === null) {
        throw new ProblemError(problemErrorCodes.resolutionRunClosed);
      }
      const ticketResolution = prepared.replay ?? (await this.resolution.executeRun(id, viewer, body.runId));
      this.notifier.run('status', () => this.notifier.statusChanged(id, 'RESOLVED', viewer.userId));
      return { ...(await this.problems.get(viewer, id)), ticketResolution };
    });
  }

  /** W7.24: the newest run, so the UI can offer Resume after a reload. */
  @Get(':id/resolution-runs/latest')
  @Header('Cache-Control', 'no-store')
  latestResolutionRun(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.resolution.latestRun(id, this.viewer(request)));
  }

  @Get(':id/resolution-runs/:runId')
  @Header('Cache-Control', 'no-store')
  resolutionRun(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('runId') runId: string) {
    return runProblem(() => this.resolution.runById(id, this.viewer(request), runId));
  }

  /** W7.24: retries exactly the unfinished tickets and replies of a run. */
  @Post(':id/resolution-runs/:runId/resume')
  resumeResolutionRun(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('runId') runId: string) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const ticketResolution = await this.resolution.resumeRun(id, viewer, runId);
      this.notifier.run('status', () => this.notifier.statusChanged(id, 'RESOLVED', viewer.userId));
      return { ...(await this.problems.get(viewer, id)), ticketResolution };
    });
  }

  /**
   * W7.25 (BA-problems-07): the durable target-reminder rows of this problem.
   * `problem.read` in the OU scope decides visibility; `canRetry` says whether
   * the viewer may retry a failed reminder (problem.manage of the group).
   */
  @Get(':id/target-reminders')
  @Header('Cache-Control', 'no-store')
  targetReminders(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.reminders.list(id, this.viewer(request)));
  }

  /**
   * W7.25: one operator-triggered attempt. A manual retry restarts the attempt
   * budget and is only allowed for PENDING/FAILED/DEAD rows; the response is the
   * problem with the refreshed reminder list, exactly like the resolution runs.
   */
  @Post(':id/target-reminders/:reminderId/retry')
  @HttpCode(200)
  retryTargetReminder(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Param('reminderId') reminderId: string,
  ) {
    return runProblem(async () => {
      const viewer = this.viewer(request);
      const targetReminders = await this.reminders.retry(id, reminderId, viewer);
      return { ...(await this.problems.get(viewer, id)), targetReminders };
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

  /**
   * W7.27: the draft and its link are one transaction and a duplicate submit is
   * a replay, so both outcomes answer 200 with the same article body.
   */
  @Post(':id/knowledge-article')
  @HttpCode(200)
  createArticle(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: CreateProblemArticleDto) {
    return runProblem(() => this.resolution.createArticle(id, body, this.viewer(request)));
  }

  /** W7.28: the transfer history of one problem (newest first). */
  @Get(':id/handoffs')
  @Header('Cache-Control', 'no-store')
  handoffsOfProblem(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runProblem(() => this.handoffs.list(this.viewer(request), id));
  }

  /**
   * W7.28 (BA-problems-10): a group change is a command, not a field update.
   * Running the target group makes it immediate; otherwise it waits as PENDING
   * until the receiving group decides. Both answer 200 with the handoff row, so
   * the client reads `handoff.status` instead of guessing from the status code.
   */
  @Post(':id/handoffs')
  @HttpCode(200)
  requestHandoff(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: ProblemHandoffDto) {
    return runProblem(() => this.handoffs.request(this.viewer(request), id, body));
  }

  @Post(':id/handoffs/:handoffId/accept')
  @HttpCode(200)
  acceptHandoff(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('handoffId') handoffId: string) {
    return runProblem(() => this.handoffs.accept(this.viewer(request), id, handoffId));
  }

  @Post(':id/handoffs/:handoffId/reject')
  @HttpCode(200)
  rejectHandoff(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Param('handoffId') handoffId: string,
    @Body() body: ProblemHandoffDecisionDto,
  ) {
    return runProblem(() => this.handoffs.reject(this.viewer(request), id, handoffId, body));
  }

  @Post(':id/handoffs/:handoffId/cancel')
  @HttpCode(200)
  cancelHandoff(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Param('handoffId') handoffId: string,
    @Body() body: ProblemHandoffDecisionDto,
  ) {
    return runProblem(() => this.handoffs.cancel(this.viewer(request), id, handoffId, body));
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
