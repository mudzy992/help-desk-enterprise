import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { problemTakeoverStatuses } from '../tickets/assignment/take-over-ticket-for-problem';
import { TicketCloseCodesConfigurationLoader } from '../tickets/close-codes/ticket-close-codes-configuration.loader';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { assertProblemDelegation } from '../tickets/problem-delegation';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketsService } from '../tickets/tickets.service';
import { canonicalizeJson } from '../change-log/canonicalize-json';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import {
  isRetryableTicketFailure,
  loadProblemForResolution,
  resolutionCandidates,
  ticketFailureCode,
  type ProblemResolutionRunStatusValue,
  type ProblemTicketResolveOutcome,
  type ProblemTicketResolveSkip,
  type ResolutionSupport,
} from './problem-resolution-support';
import { formatProblemNumber } from './problem-rules';
import { problemErrorCodes, problemEventActions, problemLimits, ProblemError } from './problems.constants';
import { ProblemsService } from './problems.service';

/** One ticket of a stored run, as read from the database. */
type StoredRunItem = {
  readonly id: string;
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly ordinal: number;
  readonly status: 'PENDING' | 'RUNNING' | 'RESOLVED' | 'MESSAGE_PENDING' | 'SKIPPED' | 'FAILED';
  readonly reason: string | null;
  readonly errorCode: string | null;
  readonly retryable: boolean | null;
  readonly messageSent: boolean;
  readonly attempts: number;
};

type StoredRun = {
  readonly id: string;
  readonly problemId: string;
  readonly requestHash: string;
  readonly status: ProblemResolutionRunStatusValue;
  readonly number: string | null;
  readonly message: string;
  readonly closeCode: string | null;
  readonly responseBody: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly items: readonly StoredRunItem[];
};

export type ResolutionRunPreparation = {
  readonly runId: string;
  /** Set when the key already produced a finished run; the caller must not run it again. */
  readonly replay: ProblemTicketResolveOutcome | null;
  readonly status: ProblemResolutionRunStatusValue;
  readonly canResume: boolean;
};

export type ResolutionRunView = {
  readonly id: string;
  readonly status: ProblemResolutionRunStatusValue;
  readonly total: number;
  readonly resolved: number;
  readonly messagePending: number;
  readonly failed: number;
  readonly skipped: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly lastError: string | null;
  readonly canResume: boolean;
  readonly items: readonly StoredRunItem[];
};

export function hashResolutionRequest(input: { problemId: string; message: string; closeCode: string | null }): string {
  return createHash('sha256').update(JSON.stringify(canonicalizeJson(input as never))).digest('hex');
}

/**
 * W7.24 (BA-problems-06): durable group resolution.
 *
 * The run row and its per-ticket items are written before the problem status
 * changes and before any ticket is touched, so a crash or a failed ticket write
 * can never lose the intent. Every item carries its own status and attempt
 * counter, the reply uses a stable idempotency key (`runId:ticketId`), and
 * `resume` picks up exactly the items that are not terminal. The run id is the
 * caller's idempotency key: sending the same key twice replays the stored
 * result instead of resolving or messaging again.
 */
@Injectable()
export class ProblemResolutionRunService {
  private readonly support: ResolutionSupport;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly tickets: TicketsService,
    private readonly collaboration: TicketsCollaborationService,
    private readonly closeCodes: TicketCloseCodesConfigurationLoader,
    private readonly problems: ProblemsService,
  ) {
    this.support = { prisma, access, authorizationContextLoader, accessPolicies };
  }

  // ------------------------------------------------------------- validation

  private async assertOptions(options: { message?: string; closeCode?: string }) {
    const message = options.message?.trim() ?? '';
    if (message.length < problemLimits.reasonMin) throw new ProblemError(problemErrorCodes.validation, 'message');
    const closeCodes = await this.closeCodes.load();
    const code = options.closeCode?.trim() ?? '';
    if (closeCodes.enabled && closeCodes.requireOnResolve && code.length === 0) {
      throw new ProblemError(problemErrorCodes.validation, 'closeCode');
    }
    if (code.length > 0 && closeCodes.enabled && !closeCodes.allowedCodes.includes(code)) {
      throw new ProblemError(problemErrorCodes.validation, 'closeCode');
    }
  }

  /** Validated before the problem changes status, so a bad request changes nothing. */
  async assertResolveOptions(problemId: string, viewer: ProblemViewer, options: { message?: string; closeCode?: string }) {
    await loadProblemForResolution(this.support, problemId, viewer);
    await this.assertOptions(options);
  }

  // ------------------------------------------------------------ persistence

  private async loadRun(problemId: string, runId: string): Promise<StoredRun> {
    const run = await this.prisma.problemResolutionRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        problemId: true,
        requestHash: true,
        status: true,
        number: true,
        message: true,
        closeCode: true,
        responseBody: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        items: {
          orderBy: { ordinal: 'asc' },
          select: {
            id: true,
            ticketId: true,
            ticketNumber: true,
            ordinal: true,
            status: true,
            reason: true,
            errorCode: true,
            retryable: true,
            messageSent: true,
            attempts: true,
          },
        },
      },
    });
    // A run of another problem is reported as missing, exactly like a foreign id.
    if (run === null || run.problemId !== problemId) throw new ProblemError(problemErrorCodes.resolutionRunNotFound);
    return run as StoredRun;
  }

  /**
   * Writes the run before anything else happens. An existing row with the same
   * id and payload is a replay (finished) or a resume (unfinished); the same id
   * with a different payload is a conflict.
   */
  async prepare(
    problemId: string,
    viewer: ProblemViewer,
    input: { runId: string; message?: string; closeCode?: string },
  ): Promise<ResolutionRunPreparation> {
    const problem = await loadProblemForResolution(this.support, problemId, viewer);
    await this.assertOptions(input);
    const message = input.message?.trim() ?? '';
    const closeCode = input.closeCode?.trim() || null;
    const requestHash = hashResolutionRequest({ problemId, message, closeCode });

    const existing = await this.existingRun(input.runId, problemId, requestHash);
    if (existing !== null) return existing;

    if (problem.status === 'RESOLVED' || problem.status === 'CLOSED' || problem.status === 'CANCELLED') {
      throw new ProblemError(problemErrorCodes.statusTransition, 'resolutionRun');
    }
    const configuration = await this.access.configuration();
    const number = formatProblemNumber(configuration.numberPrefix, problem.sequence);
    const candidates = await resolutionCandidates(this.support, problemId, viewer, configuration.bulkResolveMax);
    try {
      await this.prisma.problemResolutionRun.create({
        data: {
          id: input.runId,
          problemId,
          actorUserId: viewer.userId,
          requestHash,
          number,
          message,
          closeCode,
          total: candidates.length,
          items: {
            create: candidates.map((candidate, ordinal) => ({
              ticketId: candidate.id,
              ticketNumber: candidate.ticketNumber,
              ordinal,
              status: candidate.resolvable ? 'PENDING' : 'SKIPPED',
              reason: candidate.reason,
              completedAt: candidate.resolvable ? null : new Date(),
            })),
          },
        },
      });
    } catch (error) {
      // Two requests with the same key at the same moment: the loser replays.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const raced = await this.existingRun(input.runId, problemId, requestHash);
      if (raced === null) throw error;
      return raced;
    }
    return { runId: input.runId, replay: null, status: 'PROCESSING', canResume: true };
  }

  private async existingRun(
    runId: string,
    problemId: string,
    requestHash: string,
  ): Promise<ResolutionRunPreparation | null> {
    const stored = await this.prisma.problemResolutionRun.findUnique({
      where: { id: runId },
      select: { id: true, problemId: true, requestHash: true, status: true, responseBody: true },
    });
    if (stored === null) return null;
    if (stored.problemId !== problemId || stored.requestHash !== requestHash) {
      throw new ProblemError(problemErrorCodes.resolutionRunConflict);
    }
    if (stored.status === 'SUCCEEDED' && stored.responseBody !== null) {
      return {
        runId: stored.id,
        replay: stored.responseBody as unknown as ProblemTicketResolveOutcome,
        status: stored.status,
        canResume: false,
      };
    }
    if (stored.status === 'FAILED') {
      return { runId: stored.id, replay: null, status: stored.status, canResume: false };
    }
    return { runId: stored.id, replay: null, status: stored.status, canResume: true };
  }

  /** A run whose status change was rejected never touched a ticket; it stays recorded but is not resumable. */
  async abort(runId: string, code: string) {
    await this.prisma.problemResolutionRun.updateMany({
      where: { id: runId, status: 'PROCESSING' },
      data: { status: 'FAILED', lastError: code.slice(0, 200), completedAt: new Date() },
    });
  }

  // -------------------------------------------------------------- execution

  private async ensureProblemResolved(problemId: string, viewer: ProblemViewer, runId: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.prisma.problem.findUnique({ where: { id: problemId }, select: { version: true, status: true } });
      if (current === null) throw new ProblemError(problemErrorCodes.notFound);
      if (current.status === 'RESOLVED') return;
      try {
        await this.problems.changeStatus(viewer, problemId, { version: current.version, status: 'RESOLVED' });
        return;
      } catch (error) {
        // A concurrent writer moved the version; one retry with the fresh read, then fail.
        const isConflict = error instanceof ProblemError && error.code === problemErrorCodes.versionConflict;
        if (!isConflict || attempt === 1) {
          await this.abort(runId, ticketFailureCode(error));
          throw error;
        }
      }
    }
  }

  /** Only one caller can move an item out of its current status, so two resumes never write twice. */
  private async claim(item: StoredRunItem): Promise<boolean> {
    const result = await this.prisma.problemResolutionRunItem.updateMany({
      where: { id: item.id, status: item.status },
      data: { status: 'RUNNING', attempts: { increment: 1 } },
    });
    return result.count === 1;
  }

  private outcomeOf(
    items: readonly StoredRunItem[],
    runId: string,
    status: ProblemResolutionRunStatusValue,
    canResume: boolean,
  ): ProblemTicketResolveOutcome {
    const resolved = items
      .filter((item) => item.status === 'RESOLVED')
      .map((item) => ({ ticketId: item.ticketId, ticketNumber: item.ticketNumber, messageSent: item.messageSent }));
    const skipped = items
      .filter((item) => item.status === 'SKIPPED')
      .map((item) => ({
        ticketId: item.ticketId,
        ticketNumber: item.ticketNumber,
        reason: (item.reason ?? 'no_access') as ProblemTicketResolveSkip,
      }));
    const failed = items
      .filter((item) => item.status === 'FAILED')
      .map((item) => ({ ticketId: item.ticketId, ticketNumber: item.ticketNumber, code: item.errorCode ?? 'TICKET_OPERATION_FAILED' }));
    return {
      resolved,
      skipped,
      failed,
      runId,
      status,
      canResume,
      messagePending: items.filter((item) => item.status === 'MESSAGE_PENDING').length,
    };
  }

  private hasPendingWork(items: readonly StoredRunItem[]): boolean {
    return items.some(
      (item) =>
        item.status === 'PENDING' ||
        item.status === 'RUNNING' ||
        item.status === 'MESSAGE_PENDING' ||
        (item.status === 'FAILED' && item.retryable === true),
    );
  }

  /**
   * Executes the unfinished items of a run. Safe to call twice: every item is
   * claimed atomically, the ticket update is idempotent for an already resolved
   * ticket, and the reply carries a stable idempotency key.
   */
  async execute(problemId: string, viewer: ProblemViewer, runId: string): Promise<ProblemTicketResolveOutcome> {
    const problem = await loadProblemForResolution(this.support, problemId, viewer);
    let run = await this.loadRun(problemId, runId);
    if (run.status === 'FAILED') throw new ProblemError(problemErrorCodes.resolutionRunClosed);
    if (run.status === 'SUCCEEDED') return this.outcomeOf(run.items, runId, 'SUCCEEDED', false);

    await this.ensureProblemResolved(problemId, viewer, runId);

    const configuration = await this.access.configuration();
    const number = run.number ?? formatProblemNumber(configuration.numberPrefix, problem.sequence);
    const message = run.message;
    const closeCode = run.closeCode ?? undefined;
    const context = { actorUserId: viewer.userId, problemDelegation: { problemId } };
    const gated = await this.accessPolicies.bind({ actorUserId: viewer.userId });

    await this.prisma.problemResolutionRun.updateMany({
      where: { id: runId, status: { in: ['PROCESSING', 'PARTIAL'] } },
      data: { status: 'PROCESSING' },
    });
    const startedAs = run.status;
    let attempted = 0;
    for (const item of run.items) {
      const claimable =
        item.status === 'PENDING' ||
        item.status === 'RUNNING' ||
        item.status === 'MESSAGE_PENDING' ||
        (item.status === 'FAILED' && item.retryable === true);
      if (!claimable) continue;
      if (!(await this.claim(item))) continue;
      attempted += 1;

      let messageOnly = item.status === 'MESSAGE_PENDING' || item.messageSent;
      if (!messageOnly && item.status === 'RUNNING') {
        const stored = await this.prisma.ticket.findUnique({ where: { id: item.ticketId }, select: { status: true } });
        messageOnly = stored !== null && stored.status === 'RESOLVED';
      }
      if (!messageOnly) {
        const prepared = await this.resolveTicket(problemId, viewer, item, { number, closeCode, context, gated });
        if (prepared === 'failed') continue;
        if (prepared === 'skipped') continue;
      }
      const delivered = await this.sendResolutionReply(item, runId, message, context);
      if (!delivered) continue;
      await this.prisma.problemResolutionRunItem.update({
        where: { id: item.id },
        data: { status: 'RESOLVED', messageSent: true, errorCode: null, retryable: null, completedAt: new Date() },
      });
    }

    run = await this.loadRun(problemId, runId);
    const pending = this.hasPendingWork(run.items);
    const counts = this.counts(run.items);
    const status: ProblemResolutionRunStatusValue = pending
      ? 'PARTIAL'
      : counts.failed > 0 && counts.resolved === 0 && counts.messagePending === 0
        ? 'FAILED'
        : counts.failed > 0 || counts.messagePending > 0
          ? 'PARTIAL'
          : 'SUCCEEDED';
    const outcome = this.outcomeOf(run.items, runId, status, pending);
    await this.prisma.problemResolutionRun.update({
      where: { id: runId },
      data: {
        status,
        resolved: counts.resolved,
        messageFailed: counts.messagePending,
        failed: counts.failed,
        skipped: counts.skipped,
        responseBody: outcome as unknown as Prisma.InputJsonValue,
        lastError: this.lastError(run.items),
        completedAt: pending ? null : new Date(),
      },
    });
    if (attempted > 0) await this.recordAttempt(problemId, viewer, runId, startedAs !== 'PROCESSING', counts);
    return outcome;
  }

  private counts(items: readonly StoredRunItem[]) {
    return {
      resolved: items.filter((item) => item.status === 'RESOLVED').length,
      messagePending: items.filter((item) => item.status === 'MESSAGE_PENDING').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
    };
  }

  private lastError(items: readonly StoredRunItem[]): string | null {
    const item = items.find((entry) => entry.status === 'FAILED' || entry.status === 'MESSAGE_PENDING');
    return item?.errorCode?.slice(0, 200) ?? null;
  }

  private async resolveTicket(
    problemId: string,
    viewer: ProblemViewer,
    item: StoredRunItem,
    input: {
      number: string;
      closeCode: string | undefined;
      context: { actorUserId: string; problemDelegation: { problemId: string } };
      gated: Awaited<ReturnType<TicketAccessPolicyBinder['bind']>>;
    },
  ): Promise<'moved' | 'failed' | 'skipped'> {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: item.ticketId },
        select: { status: true, isConfidential: true, mergedIntoTicketId: true },
      });
      if (ticket === null) throw new ProblemError(problemErrorCodes.ticketNotFound);
      if (ticket.mergedIntoTicketId !== null) {
        await this.prisma.problemResolutionRunItem.update({
          where: { id: item.id },
          data: { status: 'SKIPPED', reason: 'merged', completedAt: new Date(), retryable: null },
        });
        return 'skipped';
      }
      if (ticket.status === 'RESOLVED') return 'moved';
      if ((problemTakeoverStatuses as readonly string[]).includes(ticket.status)) {
        // The takeover is a real write, so authorization is proven again here:
        // the delegation never covers confidential tickets.
        if (ticket.isConfidential) {
          await loadAccessibleTicket(this.prisma, this.authorizationContextLoader, item.ticketId, input.gated, { writable: true });
        } else {
          await assertProblemDelegation(this.prisma, { problemId, ticketId: item.ticketId, actorUserId: viewer.userId });
        }
        await this.tickets.takeOverForProblem(item.ticketId, { actorUserId: viewer.userId });
      }
      await this.tickets.update(
        item.ticketId,
        { status: 'RESOLVED', closeCode: input.closeCode, resolutionNote: input.number },
        input.context,
      );
    } catch (error) {
      const code = ticketFailureCode(error);
      const retryable = isRetryableTicketFailure(code);
      await this.prisma.problemResolutionRunItem.update({
        where: { id: item.id },
        data: { status: 'FAILED', errorCode: code.slice(0, 64), retryable, completedAt: retryable ? null : new Date() },
      });
      return 'failed';
    }
    // The status change is durable before the reply: a crash from here on
    // resumes as "message only".
    await this.prisma.problemResolutionRunItem.update({
      where: { id: item.id },
      data: { status: 'MESSAGE_PENDING', messageSent: false, errorCode: null, retryable: null },
    });
    return 'moved';
  }

  private async sendResolutionReply(
    item: StoredRunItem,
    runId: string,
    message: string,
    context: { actorUserId: string; problemDelegation: { problemId: string } },
  ): Promise<boolean> {
    try {
      await this.collaboration.createMessage(
        item.ticketId,
        { type: 'AGENT_REPLY', body: message, idempotencyKey: `${runId}:${item.ticketId}` },
        context,
      );
      return true;
    } catch (error) {
      const code = ticketFailureCode(error);
      await this.prisma.problemResolutionRunItem.update({
        where: { id: item.id },
        data: { status: 'MESSAGE_PENDING', messageSent: false, errorCode: code.slice(0, 64), retryable: true },
      });
      return false;
    }
  }

  private async recordAttempt(
    problemId: string,
    viewer: ProblemViewer,
    runId: string,
    resumed: boolean,
    counts: ReturnType<ProblemResolutionRunService['counts']>,
  ) {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId }, select: { organizationalUnitId: true } });
    if (problem === null) return;
    const detail = {
      resolved: counts.resolved,
      skipped: counts.skipped,
      failed: counts.failed,
      messagePending: counts.messagePending,
      runId,
      ...(resumed ? { resumed: true } : {}),
    };
    await this.prisma.$transaction(async (transaction) => {
      await transaction.problemEvent.create({
        data: { problemId, action: problemEventActions.ticketsResolved, actorUserId: viewer.userId, detail },
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.problemTicketsResolved,
        entityType: auditLogEntityTypes.problem,
        entityId: problemId,
        organizationalUnitId: problem.organizationalUnitId,
        metadata: detail as never,
        actorUserId: viewer.userId,
      });
    });
  }

  // ------------------------------------------------------------------- API

  /** §8.4 with a caller-chosen key: same key + same payload replays, other payload conflicts. */
  async resolveTickets(
    problemId: string,
    viewer: ProblemViewer,
    options: { message: string; closeCode?: string; runId?: string },
  ): Promise<ProblemTicketResolveOutcome> {
    const runId = options.runId ?? randomUUID();
    const prepared = await this.prepare(problemId, viewer, { runId, message: options.message, closeCode: options.closeCode });
    if (prepared.replay !== null) return prepared.replay;
    return this.execute(problemId, viewer, runId);
  }

  async resume(problemId: string, viewer: ProblemViewer, runId: string): Promise<ProblemTicketResolveOutcome> {
    const run = await this.loadRun(problemId, runId);
    if (run.status === 'FAILED') throw new ProblemError(problemErrorCodes.resolutionRunClosed);
    return this.execute(problemId, viewer, runId);
  }

  async view(problemId: string, viewer: ProblemViewer, runId: string): Promise<ResolutionRunView> {
    await loadProblemForResolution(this.support, problemId, viewer);
    const run = await this.loadRun(problemId, runId);
    return this.viewOf(run);
  }

  /** The newest run of the problem, so the UI can offer Resume after a reload. */
  async latest(problemId: string, viewer: ProblemViewer): Promise<{ run: ResolutionRunView | null }> {
    await loadProblemForResolution(this.support, problemId, viewer);
    const newest = await this.prisma.problemResolutionRun.findFirst({
      where: { problemId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (newest === null) return { run: null };
    return { run: this.viewOf(await this.loadRun(problemId, newest.id)) };
  }

  private viewOf(run: StoredRun): ResolutionRunView {
    const counts = this.counts(run.items);
    return {
      id: run.id,
      status: run.status,
      total: run.items.length,
      resolved: counts.resolved,
      messagePending: counts.messagePending,
      failed: counts.failed,
      skipped: counts.skipped,
      canResume: run.status !== 'SUCCEEDED' && run.status !== 'FAILED' && this.hasPendingWork(run.items),
      items: run.items,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      lastError: this.lastError(run.items),
    };
  }
}
