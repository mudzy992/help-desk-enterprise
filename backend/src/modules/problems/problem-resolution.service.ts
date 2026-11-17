import { Injectable } from '@nestjs/common';
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
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { ProblemAccessService, type ProblemViewer } from './problem-access.service';
import { buildKnownErrorArticle, type ProblemArticleLocale } from './problem-article';
import { formatProblemNumber } from './problem-rules';
import { problemVisibilityWhere } from './problem-visibility';
import { ProblemResolutionRunService } from './problem-resolution-run.service';
import {
  loadProblemForResolution,
  resolutionCandidates,
  type ProblemResolutionRunStatusValue,
  type ProblemTicketResolveOutcome,
  type ResolutionSupport,
} from './problem-resolution-support';
import { problemErrorCodes, problemEventActions, problemLimits, ProblemError } from './problems.constants';

export { ticketFailureCode } from './problem-resolution-support';
export type { ProblemTicketResolveSkip } from './problem-resolution-support';
export type { ProblemResolutionRunStatusValue, ProblemTicketResolveOutcome };

/**
 * Paket 3.3 (P4, §7, §8.4): the known error becomes a knowledge article draft,
 * and a resolved problem optionally resolves its open tickets. Nothing happens
 * automatically: the article and the group resolution are explicit, previewed
 * actions. Tickets go through the regular ticket services, so SLA, playbooks,
 * close codes, notifications and the ticket history behave as for one ticket.
 */
@Injectable()
export class ProblemResolutionService {
  private readonly support: ResolutionSupport;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProblemAccessService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly closeCodes: TicketCloseCodesConfigurationLoader,
    private readonly runs: ProblemResolutionRunService,
  ) {
    this.support = { prisma, access, authorizationContextLoader, accessPolicies };
  }

  // ------------------------------------------------------------ article (§7)

  private async loadForArticle(problemId: string, viewer: ProblemViewer, options: { readonly allowExisting?: boolean } = {}) {
    const scope = await this.access.require(viewer, permissionKeys.problemManage);
    const readScope = await this.access.require(viewer, permissionKeys.problemRead);
    const filters = [problemVisibilityWhere(scope, viewer.userId), problemVisibilityWhere(readScope, viewer.userId)].filter((filter) => filter !== null);
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, AND: filters },
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
        knowledgeArticle: { select: { id: true, title: true, status: true } },
        groupId: true,
      },
    });
    if (problem === null) throw new ProblemError(problemErrorCodes.notFound);
    await this.access.requireGroupAuthority(viewer, permissionKeys.problemManage, problem.groupId);
    if (problem.status !== 'KNOWN_ERROR' && problem.status !== 'RESOLVED') {
      throw new ProblemError(problemErrorCodes.statusTransition, 'knowledgeArticle.status');
    }
    if (problem.knowledgeArticleId !== null && options.allowExisting !== true) {
      throw new ProblemError(problemErrorCodes.articleExists);
    }
    return problem;
  }

  /**
   * W7.27: the article this problem already links, or null when nothing is
   * linked (then the original conflict stands). A retried or concurrent create
   * replays the winner instead of reporting a failure for a committed command.
   */
  private async existingArticle(problemId: string, viewer: ProblemViewer): Promise<{ id: string; title: string; status: string } | null> {
    const problem = await this.loadForArticle(problemId, viewer, { allowExisting: true });
    return problem.knowledgeArticle ?? null;
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
    let problem: Awaited<ReturnType<ProblemResolutionService['loadForArticle']>>;
    try {
      problem = await this.loadForArticle(problemId, viewer);
    } catch (error) {
      const replay = error instanceof ProblemError && error.code === problemErrorCodes.articleExists ? await this.existingArticle(problemId, viewer) : null;
      if (replay !== null) return replay;
      throw error;
    }
    const configuration = await this.access.configuration();
    const number = formatProblemNumber(configuration.numberPrefix, problem.sequence);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Re-read the two invariants a concurrent writer can change between the
        // optimistic check above and this write: the status and the link fence.
        const current = await transaction.problem.findFirst({
          where: { id: problem.id },
          select: { status: true, knowledgeArticleId: true },
        });
        if (current === null) throw new ProblemError(problemErrorCodes.notFound);
        if (current.status !== 'KNOWN_ERROR' && current.status !== 'RESOLVED') {
          throw new ProblemError(problemErrorCodes.statusTransition, 'knowledgeArticle.status');
        }
        if (current.knowledgeArticleId !== null) throw new ProblemError(problemErrorCodes.articleExists);
        let article: { id: string; title: string; status: string };
        try {
          article = await createKnowledgeArticle(
            transaction as unknown as PrismaService,
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
            { transaction },
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
        // The fence: only one article can ever be linked to this problem.
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
          organizationalUnitId: problem.organizationalUnitId,
          metadata: { articleId: article.id } as never,
          actorUserId: viewer.userId,
        });
        return { id: article.id, title: article.title, status: article.status };
      });
    } catch (error) {
      // Either the fence lost a race or the status changed: the draft is rolled
      // back with the transaction, so a linked article means someone else won.
      const replay = error instanceof ProblemError && error.code === problemErrorCodes.articleExists ? await this.existingArticle(problemId, viewer) : null;
      if (replay !== null) return replay;
      throw error;
    }
  }

  // ------------------------------------------------- group resolution (§8.4)

  /** §8.4: which open tickets a group resolution would touch, and why the rest is skipped. */
  async resolvePreview(problemId: string, viewer: ProblemViewer) {
    await loadProblemForResolution(this.support, problemId, viewer);
    const [configuration, closeCodes] = await Promise.all([this.access.configuration(), this.closeCodes.load()]);
    const items = await resolutionCandidates(this.support, problemId, viewer, configuration.bulkResolveMax);
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
  assertResolveOptions(problemId: string, viewer: ProblemViewer, options: { message?: string; closeCode?: string }) {
    return this.runs.assertResolveOptions(problemId, viewer, options);
  }

  /**
   * W7.24: the group resolution is a durable run. `resolveTickets` keeps the
   * legacy shape for the status endpoint; the run endpoints expose the run id so
   * the client can replay or resume it.
   */
  resolveTickets(problemId: string, viewer: ProblemViewer, options: { message: string; closeCode?: string; runId?: string }) {
    return this.runs.resolveTickets(problemId, viewer, options);
  }

  prepareRun(problemId: string, viewer: ProblemViewer, input: { runId: string; message?: string; closeCode?: string }) {
    return this.runs.prepare(problemId, viewer, input);
  }

  executeRun(problemId: string, viewer: ProblemViewer, runId: string) {
    return this.runs.execute(problemId, viewer, runId);
  }

  resumeRun(problemId: string, viewer: ProblemViewer, runId: string) {
    return this.runs.resume(problemId, viewer, runId);
  }

  latestRun(problemId: string, viewer: ProblemViewer) {
    return this.runs.latest(problemId, viewer);
  }

  runById(problemId: string, viewer: ProblemViewer, runId: string) {
    return this.runs.view(problemId, viewer, runId);
  }

  abortRun(runId: string, code: string) {
    return this.runs.abort(runId, code);
  }
}
