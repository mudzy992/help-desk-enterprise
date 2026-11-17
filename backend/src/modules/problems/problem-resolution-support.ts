import { HttpException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import type { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import type { ProblemAccessService, ProblemViewer } from './problem-access.service';
import { problemTicketVisibility } from './problem-ticket-visibility';
import { problemVisibilityWhere } from './problem-visibility';
import { problemErrorCodes, problemOpenTicketStatuses, ProblemError } from './problems.constants';

/** Why a linked ticket is not resolved by the group resolution (§8.4). */
export type ProblemTicketResolveSkip = 'waiting_for_user' | 'pending_approval' | 'merged' | 'no_access' | 'limit';

export type ProblemResolutionRunStatusValue = 'PROCESSING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';

/**
 * §8.4 result. W7.24 adds the durable run reference: `status` is `PARTIAL` when
 * at least one ticket (or its reply) is still unfinished, and `canResume` says
 * whether `POST .../resolution-runs/:runId/resume` has work left to do.
 */
export type ProblemTicketResolveOutcome = {
  readonly resolved: readonly { ticketId: string; ticketNumber: string; messageSent: boolean }[];
  readonly skipped: readonly { ticketId: string; ticketNumber: string; reason: ProblemTicketResolveSkip }[];
  readonly failed: readonly { ticketId: string; ticketNumber: string; code: string }[];
  readonly runId?: string;
  readonly status?: ProblemResolutionRunStatusValue;
  readonly canResume?: boolean;
  /** Replies that could not be delivered yet; a resume retries them. */
  readonly messagePending?: number;
};

export type ResolutionCandidate = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string | null;
  readonly status: string;
  readonly isConfidential: boolean;
  readonly resolvable: boolean;
  readonly reason: ProblemTicketResolveSkip | null;
};

/** Collaborators every resolution helper needs; kept explicit so the run and preview share them. */
export type ResolutionSupport = {
  readonly prisma: PrismaService;
  readonly access: ProblemAccessService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly accessPolicies: TicketAccessPolicyBinder;
};

/** Error code of a failed ticket operation (HTTP body code, domain code, or a generic one). */
export function ticketFailureCode(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string') {
      return (body as { code: string }).code;
    }
    return `HTTP_${error.getStatus()}`;
  }
  if (typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return 'TICKET_OPERATION_FAILED';
}

/**
 * A ticket failure that a resume can actually fix (a transient lock, a timeout,
 * a downstream 5xx) versus one that needs a human (no access, ticket gone,
 * merged into another ticket, invalid transition).
 */
const permanentTicketFailureCodes: readonly string[] = [
  problemErrorCodes.forbidden,
  problemErrorCodes.notFound,
  problemErrorCodes.ticketNotFound,
  problemErrorCodes.ticketNotLinked,
  problemErrorCodes.statusTransition,
  problemErrorCodes.outOfScope,
  // Ticket-domain equivalents: a resume cannot grant access or recreate a ticket.
  'FORBIDDEN',
  'STATUS_CHANGE_FORBIDDEN',
  'NOT_FOUND',
];

export function isRetryableTicketFailure(code: string): boolean {
  if (permanentTicketFailureCodes.includes(code)) return false;
  if (code === 'HTTP_400' || code === 'HTTP_401' || code === 'HTTP_403' || code === 'HTTP_404' || code === 'HTTP_409' || code === 'HTTP_422') {
    return false;
  }
  return true;
}

/** Loads the problem and proves `problem.read` + `problem.manage` + `problem.close` in its scope. */
export async function loadProblemForResolution(support: ResolutionSupport, problemId: string, viewer: ProblemViewer) {
  const scope = await support.access.require(viewer, permissionKeys.problemManage);
  if (!support.access.hasPermission(viewer, permissionKeys.problemClose)) {
    throw new ProblemError(problemErrorCodes.forbidden, 'problem.close');
  }
  const readScope = await support.access.require(viewer, permissionKeys.problemRead);
  const filters = [problemVisibilityWhere(scope, viewer.userId), problemVisibilityWhere(readScope, viewer.userId)].filter(
    (filter) => filter !== null,
  );
  const problem = await support.prisma.problem.findFirst({
    where: { id: problemId, AND: filters },
    select: { id: true, sequence: true, status: true, version: true, resolution: true, title: true, groupId: true, organizationalUnitId: true },
  });
  if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
  await support.access.requireGroupAuthority(viewer, permissionKeys.problemClose, problem.groupId);
  return problem;
}

/**
 * Which open tickets the group resolution would touch and why the rest is
 * skipped. Delegation applies only after the ticket read predicate narrowed the
 * candidates, and (BA-problems-05) never to confidential tickets.
 */
export async function resolutionCandidates(
  support: ResolutionSupport,
  problemId: string,
  viewer: ProblemViewer,
  max: number,
): Promise<ResolutionCandidate[]> {
  const visibility = await problemTicketVisibility(
    support.prisma,
    support.authorizationContextLoader,
    support.accessPolicies,
    viewer.userId,
  );
  const links = await support.prisma.problemTicket.findMany({
    where: { problemId, ticket: { is: { AND: [visibility, { status: { in: [...problemOpenTicketStatuses] } }] } } },
    orderBy: { linkedAt: 'asc' },
    take: 2000,
    select: {
      ticket: { select: { id: true, ticketNumber: true, title: true, status: true, isConfidential: true, mergedIntoTicketId: true } },
    },
  });
  const delegated = support.access.hasPermission(viewer, permissionKeys.problemClose);
  const gated = await support.accessPolicies.bind({ actorUserId: viewer.userId });
  const result: ResolutionCandidate[] = [];
  let resolvable = 0;
  for (const { ticket } of links) {
    let reason: ProblemTicketResolveSkip | null = null;
    if (ticket.status === 'WAITING_FOR_USER') reason = 'waiting_for_user';
    else if (ticket.status === 'PENDING_APPROVAL') reason = 'pending_approval';
    else if (ticket.mergedIntoTicketId !== null) reason = 'merged';
    else if (!delegated || ticket.isConfidential) {
      try {
        const { access } = await loadAccessibleTicket(
          support.prisma,
          support.authorizationContextLoader,
          ticket.id,
          gated,
          { writable: true },
        );
        if (access.visibility !== 'staff') reason = 'no_access';
      } catch {
        reason = 'no_access';
      }
    }
    if (reason === null && resolvable >= max) reason = 'limit';
    if (reason === null) resolvable += 1;
    result.push({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.isConfidential ? null : ticket.title,
      status: ticket.status,
      isConfidential: ticket.isConfidential,
      resolvable: reason === null,
      reason,
    });
  }
  return result;
}
