import { problemTakeoverStatuses } from '../tickets/assignment/take-over-ticket-for-problem';
import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import { createKnowledgeArticle } from '../knowledge-base/create-knowledge-article';
import { KnowledgeBaseError } from '../knowledge-base/knowledge-base.error';
import { replyScrubLabels, scrubReplyPersonalData } from '../knowledge-base/portal/scrub-reply-personal-data';
import { TicketCloseCodesConfigurationLoader } from '../tickets/close-codes/ticket-close-codes-configuration.loader';
import { listConfiguredCloseCodes } from '../tickets/close-codes/resolve-close-code-record';
import { loadAccessibleTicket } from '../tickets/load-accessible-ticket';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketsService } from '../tickets/tickets.service';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { buildKnownErrorArticle, type ProblemArticleLocale } from './problem-article';
import { formatProblemNumber } from './problem-rules';
import { problemVisibilityWhere } from './problem-visibility';
import { problemErrorCodes, problemEventActions, problemLimits, problemOpenTicketStatuses, ProblemError } from './problems.constants';

export type ProblemTicketResolveSkip = 'waiting_for_user' | 'pending_approval' | 'merged' | 'no_access' | 'limit';

export type ProblemTicketResolveOutcome = {
  readonly resolved: readonly { ticketId: string; ticketNumber: string; messageSent: boolean }[];
  readonly skipped: readonly { ticketId: string; ticketNumber: string; reason: ProblemTicketResolveSkip }[];
  readonly failed: readonly { ticketId: string; ticketNumber: string; code: string }[];
};

type Candidate = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string | null;
  readonly status: string;
  readonly resolvable: boolean;
  readonly reason: ProblemTicketResolveSkip | null;
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
 * Paket 3.3 (P4, §7, §8.4): the known error becomes a knowledge article draft,
 * and a resolved problem optionally resolves its open tickets. Nothing happens
 * automatically: the article and the group resolution are explicit, previewed
 * actions. Tickets go through the regular ticket services, so SLA, playbooks,
 * close codes, notifications and the ticket history behave as for one ticket.
 */
@Injectable()
export class ProblemResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly tickets: TicketsService,
    private readonly collaboration: TicketsCollaborationService,
    private readonly closeCodes: TicketCloseCodesConfigurationLoader,
  ) {}

  // ------------------------------------------------------------ article (§7)

  private async loadForArticle(problemId: string, viewer: ProblemViewer) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(visible === null ? {} : visible) },
      select: {
        id: true,
        sequence: true,
        title: true,
        status: true,
        description: true,
        rootCause: true,
        workaround: true,
        resolution: true,
        serviceId: true,
        organizationalUnitId: true,
        ownerUserId: true,
        createdByUserId: true,
        knowledgeArticleId: true,
      },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    if (problem.status !== 'KNOWN_ERROR' && problem.status !== 'RESOLVED') {
      throw new ProblemError(problemErrorCodes.statusTransition, 'knowledgeArticle.status');
    }
    if (problem.knowledgeArticleId !== null) {
      throw new ProblemError(problemErrorCodes.articleExists);
    }
    return problem;
  }

  private async scrubPeople(problem: { id: string; ownerUserId: string | null; createdByUserId: string | null }) {
    const links = await this.prisma.problemTicket.findMany({
      where: { problemId: problem.id },
      select: { ticket: { select: { requesterId: true } } },
      take: 2000,
    });
    const ids = [...new Set([problem.ownerUserId, problem.createdByUserId, ...links.map((link) => link.ticket.requesterId)])].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { email: true, displayName: true, distinguishedName: true },
    });
    return users.map((user) => ({
      displayName: user.displayName,
      email: user.email,
      distinguishedName: user.distinguishedName,
      logins: [user.email.split('@')[0]],
    }));
  }

  private async localeOf(viewer: ProblemViewer): Promise<ProblemArticleLocale> {
    const actor = await this.prisma.user.findUnique({ where: { id: viewer.userId }, select: { preferredLocale: true } });
    return actor?.preferredLocale?.startsWith('en') ? 'en' : 'bs';
  }

  async articleDraft(problemId: string, viewer: ProblemViewer) {
    const problem = await this.loadForArticle(problemId, viewer);
    const locale = await this.localeOf(viewer);
    const labels = replyScrubLabels[locale];
    const people = await this.scrubPeople(problem);
    const raw = buildKnownErrorArticle(problem, locale);
    const title = scrubReplyPersonalData(raw.title, people, labels);
    const body = scrubReplyPersonalData(raw.body, people, labels);
    const sum = (key: 'email' | 'person' | 'ip' | 'phone') => title.counts[key] + body.counts[key];
    return {
      title: title.text.slice(0, problemLimits.titleMax),
      body: body.text.slice(0, problemLimits.articleBodyMax),
      serviceId: problem.serviceId,
      organizationalUnitId: problem.organizationalUnitId,
      replacements: { email: sum('email'), person: sum('person'), ip: sum('ip'), phone: sum('phone') },
    };
  }

  async createArticle(
    problemId: string,
    input: { title: string; body: string; serviceId: string; organizationalUnitId: string },
    viewer: ProblemViewer,
  ) {
    const problem = await this.loadForArticle(problemId, viewer);
    const configuration = await this.access.configuration();
    const number = formatProblemNumber(configuration.numberPrefix, problem.sequence);
    let article: { id: string; title: string; status: string };
    try {
      article = await createKnowledgeArticle(
        this.prisma,
        this.authorizationContextLoader,
        {
          title: input.title,
          body: input.body,
          serviceId: input.serviceId,
          organizationalUnitId: input.organizationalUnitId,
          ownerUserId: viewer.userId,
          reason: `${number}: known error`,
        },
        { actorUserId: viewer.userId },
      );
    } catch (error) {
      if (error instanceof KnowledgeBaseError) {
        throw new ProblemError(
          error.code === 'FORBIDDEN' ? problemErrorCodes.forbidden : problemErrorCodes.articleInvalid,
          error.code,
        );
      }
      throw error;
    }
    await this.prisma.$transaction(async (transaction) => {
      // Two agents creating at once: the second loses and its draft stays unlinked.
      const result = await transaction.problem.updateMany({
        where: { id: problem.id, knowledgeArticleId: null },
        data: { knowledgeArticleId: article.id, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ProblemError(problemErrorCodes.articleExists);
      await transaction.problemEvent.create({
        data: {
          problemId: problem.id,
          action: problemEventActions.knowledgeArticle,
          actorUserId: viewer.userId,
          detail: { articleId: article.id, title: article.title },
        },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.problemKnowledgeArticleCreated,
        entityType: auditLogEntityTypes.problem,
        entityId: problem.id,
        metadata: { articleId: article.id } as never,
        actorUserId: viewer.userId,
      });
    });
    return { id: article.id, title: article.title, status: article.status };
  }

  // ------------------------------------------------- group resolution (§8.4)

  private async candidates(problemId: string, viewer: ProblemViewer, max: number): Promise<Candidate[]> {
    const links = await this.prisma.problemTicket.findMany({
      where: { problemId, ticket: { status: { in: [...problemOpenTicketStatuses] } } },
      orderBy: { linkedAt: 'asc' },
      take: 2000,
      select: {
        ticket: { select: { id: true, ticketNumber: true, title: true, status: true, isConfidential: true, mergedIntoTicketId: true } },
      },
    });
    // Decision 2026-10-01: whoever holds problem.close (PROBLEM_MANAGER, ADMIN)
    // resolves every linked ticket, whatever unit it came from.
    const delegated = this.access.hasPermission(viewer, permissionKeys.problemClose);
    const gated = await this.accessPolicies.bind({ actorUserId: viewer.userId });
    const result: Candidate[] = [];
    let resolvable = 0;
    for (const { ticket } of links) {
      let reason: ProblemTicketResolveSkip | null = null;
      if (ticket.status === 'WAITING_FOR_USER') reason = 'waiting_for_user';
      else if (ticket.status === 'PENDING_APPROVAL') reason = 'pending_approval';
      else if (ticket.mergedIntoTicketId !== null) reason = 'merged';
      else if (!delegated) {
        try {
          const { access } = await loadAccessibleTicket(this.prisma, this.authorizationContextLoader, ticket.id, gated, { writable: true });
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
        resolvable: reason === null,
        reason,
      });
    }
    return result;
  }

  private async loadForResolution(problemId: string, viewer: ProblemViewer) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    if (!this.access.hasPermission(viewer, permissionKeys.problemClose)) {
      throw new ProblemError(problemErrorCodes.forbidden, 'problem.close');
    }
    const visible = problemVisibilityWhere(scope, viewer.userId);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, ...(visible === null ? {} : visible) },
      select: { id: true, sequence: true, status: true, resolution: true, title: true },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    return problem;
  }

  /** §8.4: which open tickets a group resolution would touch, and why the rest is skipped. */
  async resolvePreview(problemId: string, viewer: ProblemViewer) {
    await this.loadForResolution(problemId, viewer);
    const [configuration, closeCodes] = await Promise.all([this.access.configuration(), this.closeCodes.load()]);
    const items = await this.candidates(problemId, viewer, configuration.bulkResolveMax);
    return {
      max: configuration.bulkResolveMax,
      resolvable: items.filter((item) => item.resolvable).length,
      items,
      closeCodes: {
        enabled: closeCodes.enabled,
        required: closeCodes.enabled && closeCodes.requireOnResolve,
        codes: closeCodes.enabled ? listConfiguredCloseCodes(closeCodes) : [],
      },
    };
  }

  /** Validated before the problem changes status, so a bad request changes nothing. */
  async assertResolveOptions(problemId: string, viewer: ProblemViewer, options: { message?: string; closeCode?: string }) {
    await this.loadForResolution(problemId, viewer);
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

  /**
   * Resolves the resolvable tickets one by one: status first (with the close
   * code), then the public reply, so a requester never reads "resolved" on a
   * ticket that stayed open. One failing ticket does not stop the others.
   */
  async resolveTickets(
    problemId: string,
    viewer: ProblemViewer,
    options: { message: string; closeCode?: string },
  ): Promise<ProblemTicketResolveOutcome> {
    const problem = await this.loadForResolution(problemId, viewer);
    if (problem.status !== 'RESOLVED') throw new ProblemError(problemErrorCodes.statusTransition, 'resolveTickets');
    const configuration = await this.access.configuration();
    const number = formatProblemNumber(configuration.numberPrefix, problem.sequence);
    const items = await this.candidates(problemId, viewer, configuration.bulkResolveMax);
    const message = options.message.trim();
    const closeCode = options.closeCode?.trim() || undefined;
    const context = { actorUserId: viewer.userId, problemDelegation: { problemId } };
    const problemDetail = `${problemId}|${number} ${problem.title}`;
    const resolved: { ticketId: string; ticketNumber: string; messageSent: boolean }[] = [];
    const failed: { ticketId: string; ticketNumber: string; code: string }[] = [];
    for (const item of items.filter((candidate) => candidate.resolvable)) {
      try {
        // Not started yet (PENDING/UNROUTED/ASSIGNED): take over, then resolve.
        if ((problemTakeoverStatuses as readonly string[]).includes(item.status)) {
          await this.tickets.takeOverForProblem(item.id, { actorUserId: viewer.userId, problemDetail });
        }
        await this.tickets.update(item.id, { status: 'RESOLVED', closeCode, resolutionNote: number }, context);
      } catch (error) {
        failed.push({ ticketId: item.id, ticketNumber: item.ticketNumber, code: ticketFailureCode(error) });
        continue;
      }
      let messageSent = true;
      try {
        await this.collaboration.createMessage(item.id, { type: 'AGENT_REPLY', body: message }, context);
      } catch {
        messageSent = false;
      }
      resolved.push({ ticketId: item.id, ticketNumber: item.ticketNumber, messageSent });
    }
    const skipped = items
      .filter((candidate) => !candidate.resolvable)
      .map((candidate) => ({ ticketId: candidate.id, ticketNumber: candidate.ticketNumber, reason: candidate.reason as ProblemTicketResolveSkip }));
    const detail = { resolved: resolved.length, skipped: skipped.length, failed: failed.length };
    await this.prisma.$transaction(async (transaction) => {
      await transaction.problemEvent.create({
        data: { problemId, action: problemEventActions.ticketsResolved, actorUserId: viewer.userId, detail },
      });
      await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.problemTicketsResolved,
        entityType: auditLogEntityTypes.problem,
        entityId: problemId,
        metadata: detail as never,
        actorUserId: viewer.userId,
      });
    });
    return { resolved, skipped, failed };
  }
}
