import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import type { TicketPersistedMessageSink } from '../tickets/collaboration.types';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { publishPersistedTicketMessages } from '../tickets/publish-persisted-ticket-messages';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import type { TicketRecord } from '../tickets/tickets.types';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { formatProblemNumber } from './problem-rules';
import { problemErrorCodes, problemEventActions, problemLimits, problemOpenStatuses, problemOpenTicketStatuses, ProblemError } from './problems.constants';
import { problemVisibilityWhere } from './problem-visibility';
import { ProblemNotifier } from './problem-notifier';

/** P5 (§11): tickets may still join a RESOLVED problem; the owner gets a recurrence signal. */
const problemLinkableStatuses: readonly string[] = [...problemOpenStatuses, 'RESOLVED'];

export { problemOpenTicketStatuses };
const readOnlyTicketStatuses = new Set(['ARCHIVED']);

export type ProblemTicketSkipReason = 'not_found' | 'merged' | 'already_linked' | 'other_problem' | 'read_only';

export type ProblemTicketLinkResult = {
  readonly linked: readonly { ticketId: string; ticketNumber: string }[];
  readonly skipped: readonly { ticketId: string; ticketNumber: string | null; reason: ProblemTicketSkipReason }[];
};

export type TicketProblemPanel = {
  readonly enabled: boolean;
  /** Staff with `problem.read` see the panel; requesters never do (§8.3). */
  readonly visible: boolean;
  readonly canLink: boolean;
  readonly canUnlink: boolean;
  readonly problem: {
    readonly id: string;
    readonly number: string;
    readonly title: string;
    readonly status: string;
    readonly priority: string;
    readonly workaround: string | null;
    readonly workaroundAt: string | null;
    /** The viewer may open the problem record. */
    readonly canOpen: boolean;
  } | null;
};

const skipErrorCode: Record<ProblemTicketSkipReason, (typeof problemErrorCodes)[keyof typeof problemErrorCodes]> = {
  not_found: problemErrorCodes.ticketNotFound,
  merged: problemErrorCodes.validation,
  already_linked: problemErrorCodes.validation,
  other_problem: problemErrorCodes.ticketInOtherProblem,
  read_only: problemErrorCodes.validation,
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Paket 3.3 (§8): tickets grouped under a problem. A ticket belongs to at most
 * one problem; links are internal system events on the ticket (staff only)
 * and history rows on the problem. Linking needs `problem.manage` and staff
 * access to every ticket; merged tickets are linked through their target.
 */
@Injectable()
export class ProblemTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    @Optional() private readonly notifier?: ProblemNotifier,
  ) {}

  /** Staff access to a ticket, or null (not found, requester-only, archived when writing). */
  private async staffTicket(ticketId: string, viewer: ProblemViewer, writable: boolean): Promise<TicketRecord | null> {
    try {
      const gated = await this.accessPolicies.bind({ actorUserId: viewer.userId });
      const { ticket, access } = await loadAccessibleTicket(this.prisma, this.authorizationContextLoader, ticketId, gated, { writable });
      return access.visibility === 'staff' ? ticket : null;
    } catch {
      return null;
    }
  }

  /** The problem must be visible to the viewer in the given permission's scope. */
  private async loadProblem(problemId: string, viewer: ProblemViewer, permission: string) {
    const scope = await this.access.require(viewer, permission);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(visible === null ? {} : visible) },
      select: { id: true, sequence: true, title: true, status: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    return problem;
  }

  async listForProblem(problemId: string, viewer: ProblemViewer) {
    await this.loadProblem(problemId, viewer, permissionKeys.problemRead);
    const links = await this.prisma.problemTicket.findMany({
      where: { problemId },
      orderBy: { linkedAt: 'desc' },
      take: 500,
      select: {
        linkedAt: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            priority: true,
            isConfidential: true,
            createdAt: true,
            requester: { select: { id: true, displayName: true } },
            originUnit: { select: { id: true, name: true } },
            assignedUser: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    const open = new Set<string>(problemOpenTicketStatuses);
    return {
      total: links.length,
      open: links.filter((link) => open.has(link.ticket.status)).length,
      items: links.map(({ ticket, linkedAt }) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        // Confidential tickets: the title and requester stay on the ticket itself.
        title: ticket.isConfidential ? null : ticket.title,
        confidential: ticket.isConfidential,
        status: ticket.status,
        priority: ticket.priority,
        requester: ticket.isConfidential ? null : ticket.requester,
        organizationalUnit: ticket.originUnit,
        assignee: ticket.assignedUser,
        createdAt: ticket.createdAt.toISOString(),
        linkedAt: linkedAt.toISOString(),
      })),
    };
  }

  async panel(ticketId: string, viewer: ProblemViewer): Promise<TicketProblemPanel> {
    const hidden = (enabled: boolean): TicketProblemPanel => ({ enabled, visible: false, canLink: false, canUnlink: false, problem: null });
    if (!(await this.access.isEnabled())) return hidden(false);
    if (!this.access.hasPermission(viewer, permissionKeys.problemRead)) return hidden(true);
    const ticket = await this.staffTicket(ticketId, viewer, false);
    if (ticket === null) return hidden(true);
    const merged = (ticket as { mergedIntoTicketId?: string | null }).mergedIntoTicketId != null;
    const canWrite = this.access.hasPermission(viewer, permissionKeys.problemReport) && !merged && !readOnlyTicketStatuses.has(ticket.status);
    const link = await this.prisma.problemTicket.findUnique({
      where: { ticketId: ticket.id },
      select: {
        problem: { select: { id: true, sequence: true, title: true, status: true, priority: true, workaround: true, workaroundAt: true } },
      },
    });
    if (link === null) return { enabled: true, visible: true, canLink: canWrite, canUnlink: false, problem: null };
    const configuration = await this.access.configuration();
    // Working on the ticket makes the problem readable (§12).
    const problem = link.problem;
    return {
      enabled: true,
      visible: true,
      canLink: false,
      canUnlink: canWrite && (problemOpenStatuses as readonly string[]).includes(problem.status),
      problem: {
        id: problem.id,
        number: formatProblemNumber(configuration.numberPrefix, problem.sequence),
        title: problem.title,
        status: problem.status,
        priority: problem.priority,
        workaround: problem.workaround,
        workaroundAt: problem.workaroundAt?.toISOString() ?? null,
        canOpen: await this.canOpen(problem.id, viewer),
      },
    };
  }

  private async canOpen(problemId: string, viewer: ProblemViewer): Promise<boolean> {
    const scope = await this.access.scopeOf(viewer, permissionKeys.problemRead);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    if (visible === null) return true;
    return (await this.prisma.problem.count({ where: { id: problemId, ...visible } })) > 0;
  }

  async link(
    problemId: string,
    ticketIds: readonly string[],
    viewer: ProblemViewer,
    options: { readonly singleAsError?: boolean } = {},
  ): Promise<ProblemTicketLinkResult> {
    const problem = await this.loadProblem(problemId, viewer, permissionKeys.problemReport);
    if (!problemLinkableStatuses.includes(problem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
    const unique = [...new Set(ticketIds.map((id) => id.trim()).filter((id) => id.length > 0))].slice(0, problemLimits.linkBatchMax);
    if (unique.length === 0) throw new ProblemError(problemErrorCodes.validation, 'ticketIds');
    const number = formatProblemNumber((await this.access.configuration()).numberPrefix, problem.sequence);
    const linked: { ticketId: string; ticketNumber: string }[] = [];
    const skipped: { ticketId: string; ticketNumber: string | null; reason: ProblemTicketSkipReason }[] = [];

    for (const ticketId of unique) {
      const ticket = await this.staffTicket(ticketId, viewer, true);
      if (ticket === null) {
        skipped.push({ ticketId, ticketNumber: null, reason: 'not_found' });
        continue;
      }
      if ((ticket as { mergedIntoTicketId?: string | null }).mergedIntoTicketId != null) {
        skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'merged' });
        continue;
      }
      if (readOnlyTicketStatuses.has(ticket.status)) {
        skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'read_only' });
        continue;
      }
      const existing = await this.prisma.problemTicket.findUnique({ where: { ticketId: ticket.id }, select: { problemId: true } });
      if (existing !== null) {
        skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: existing.problemId === problem.id ? 'already_linked' : 'other_problem' });
        continue;
      }
      const messages: TicketPersistedMessageSink = [];
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.problemTicket.create({ data: { problemId: problem.id, ticketId: ticket.id, linkedByUserId: viewer.userId } });
          await transaction.problemEvent.create({
            data: {
              problemId: problem.id,
              action: problemEventActions.ticketLinked,
              actorUserId: viewer.userId,
              // P5/P6: a ticket joining a RESOLVED problem is a recurrence.
              detail: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, ...(problem.status === 'RESOLVED' ? { recurrence: true } : {}) },
            },
          });
          messages.push(
            await insertSystemTicketEvent(transaction as PrismaService, {
              ticketId: ticket.id,
              action: ticketSystemEventActions.problemLinked,
              actorUserId: viewer.userId,
              detail: `${problem.id}|${number} ${problem.title}`,
            }),
          );
        });
      } catch (error) {
        // A concurrent request linked the ticket first (one problem per ticket).
        if (isUniqueViolation(error)) {
          skipped.push({ ticketId, ticketNumber: ticket.ticketNumber, reason: 'other_problem' });
          continue;
        }
        throw error;
      }
      publishPersistedTicketMessages(this.realtimeHub, ticket, messages);
      linked.push({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber });
    }

    if (problem.status === 'RESOLVED' && linked.length > 0 && this.notifier !== undefined) {
      const notifier = this.notifier;
      notifier.run('recurrence', () => notifier.recurrence(problem.id, linked.map((item) => item.ticketNumber), viewer.userId));
    }

    // A single ticket (ticket panel) reports the reason as an error.
    if (options.singleAsError !== false && unique.length === 1 && linked.length === 0 && skipped[0] !== undefined && skipped[0].reason !== 'already_linked') {
      throw new ProblemError(skipErrorCode[skipped[0].reason], skipped[0].reason);
    }
    return { linked, skipped };
  }

  async unlink(problemId: string, ticketId: string, viewer: ProblemViewer): Promise<void> {
    const problem = await this.loadProblem(problemId, viewer, permissionKeys.problemReport);
    if (!(problemOpenStatuses as readonly string[]).includes(problem.status)) throw new ProblemError(problemErrorCodes.problemNotOpen);
    const link = await this.prisma.problemTicket.findUnique({ where: { ticketId }, select: { problemId: true } });
    if (link === null || link.problemId !== problem.id) throw new ProblemError(problemErrorCodes.ticketNotLinked);
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { ticketNumber: true } });
    const number = formatProblemNumber((await this.access.configuration()).numberPrefix, problem.sequence);
    const messages: TicketPersistedMessageSink = [];
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.problemTicket.deleteMany({ where: { problemId: problem.id, ticketId } });
      if (removed.count === 0) throw new ProblemError(problemErrorCodes.ticketNotLinked);
      await transaction.problemEvent.create({
        data: {
          problemId: problem.id,
          action: problemEventActions.ticketUnlinked,
          actorUserId: viewer.userId,
          detail: { ticketId, ticketNumber: ticket?.ticketNumber ?? null },
        },
      });
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId,
          action: ticketSystemEventActions.problemUnlinked,
          actorUserId: viewer.userId,
          detail: `${problem.id}|${number} ${problem.title}`,
        }),
      );
    });
    const record = await this.staffTicket(ticketId, viewer, false);
    if (record !== null) publishPersistedTicketMessages(this.realtimeHub, record, messages);
  }
}
