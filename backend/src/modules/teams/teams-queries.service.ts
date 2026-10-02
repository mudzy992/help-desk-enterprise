import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assetViewerFromContext } from '../assets/asset-viewer';
import { ChangeAccessService } from '../changes/change-access.service';
import { ChangesService } from '../changes/changes.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { onCallViewerFromContext } from '../on-call/on-call-viewer';
import { OnCallService } from '../on-call/on-call.service';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { SettingsService } from '../settings/settings.service';
import { StatusPageService } from '../status-page/status-page.service';
import { statusViewerFromContext } from '../status-page/status-viewer';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext, TicketResponse } from '../tickets/tickets.types';
import type { TeamsQueryAudience, TeamsQueryHandler, TeamsQueryInput } from './teams-activity-router.service';
import { TeamsActivityRouter } from './teams-activity-router.service';
import { domainErrorCode } from './teams-action-errors';
import { adaptiveCard, paragraph } from './teams-cards';
import { isBareTicketReference, teamsAgentCommands } from './teams-commands';
import { TeamsDeliveryService } from './teams-delivery.service';
import {
  articlesCard,
  onCallCard,
  statusCard,
  summaryCard,
  ticketDetailCard,
  ticketListCard,
  type QueryCardContext,
  type TicketListRow,
} from './teams-query-cards';
import { teamsListLimits } from './teams.constants';
import { teamsText, type TeamsTextKey } from './teams-text';

const openTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;
const previewLength = 160;

type Card = Record<string, unknown>;

/**
 * Paket 3.1 (§20b): read commands (`tiket`, `traži`, `odobrenja`, `status`,
 * `dodijeljeni`, `red`, `sla`, `cab`, `dežurni`). Every answer comes from the
 * same domain service as the web page, called as the linked user, so RBAC,
 * unit scope, confidentiality and module switches apply unchanged.
 */
@Injectable()
export class TeamsQueriesService implements TeamsQueryHandler, OnModuleInit {
  private readonly logger = new Logger(TeamsQueriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: TeamsActivityRouter,
    private readonly principals: PrincipalContextLoader,
    private readonly settings: SettingsService,
    private readonly tickets: TicketsService,
    private readonly knowledge: KnowledgeBaseService,
    private readonly statusPage: StatusPageService,
    private readonly onCall: OnCallService,
    private readonly changes: ChangesService,
    private readonly changeAccess: ChangeAccessService,
    private readonly delivery: TeamsDeliveryService,
  ) {}

  onModuleInit(): void {
    this.router.registerQueryHandler(this);
  }

  async audience(userId: string): Promise<TeamsQueryAudience> {
    const principal = await this.principals.load(userId);
    const isStaff = statusViewerFromContext(principal, userId).isStaff;
    if (!isStaff) return { isStaff, cab: false, onCall: false };
    const [cab, onCall] = await Promise.all([
      this.changeAccess.isEnabled().catch(() => false),
      onCallViewerFromContext(principal, userId).canRead ? this.onCall.isEnabled().catch(() => false) : Promise.resolve(false),
    ]);
    return { isStaff, cab, onCall };
  }

  /** Cards to send, in order; `null` = not a query command (or a bare number that is no ticket) → help. */
  async answer(input: TeamsQueryInput): Promise<Card[] | null> {
    const { command, user, config } = input;
    const principal = await this.principals.load(user.id);
    const isStaff = statusViewerFromContext(principal, user.id).isStaff;
    const card: QueryCardContext = { locale: user.locale, timeZone: await readInstallationTimeZone(this.settings), publicUrl: config.publicUrl };
    const notice = (key: TeamsTextKey, params?: Record<string, string | number>) => [adaptiveCard([paragraph(teamsText(user.locale, key, params))])];
    if (teamsAgentCommands.has(command) && !isStaff) return notice('agentOnly');
    const context: TicketMutationContext = { actorUserId: user.id, messageSource: 'TEAMS' };
    try {
      switch (command) {
        case 'ticket':
          return await this.ticket(input, card, context, isStaff);
        case 'search':
          return input.argument ? [await this.search(input.argument, card, user.id)] : notice('searchUsage');
        case 'approvals':
          return await this.approvals(card, user.id, config);
        case 'status':
          return await this.status(card, principal, user.id);
        case 'assigned': {
          const page = await this.tickets.listPage(
            { assignedUserId: user.id, status: [...openTicketStatuses], sort: 'slaDueAt', dir: 'asc', pageSize: teamsListLimits.agent },
            context,
          );
          return [ticketListCard(card, { titleKey: 'assignedTitle', emptyKey: 'assignedEmpty', rows: page.items.map(toRow), total: page.total, path: '/tickets?view=assigned' })];
        }
        case 'queue': {
          const { rows, total } = await this.queue(context, teamsListLimits.agent);
          return [ticketListCard(card, { titleKey: 'queueTitle', emptyKey: 'queueEmpty', rows, total, path: '/tickets?view=inbox', claim: true })];
        }
        case 'sla':
          return [await this.sla(card, context, user.id)];
        case 'cab':
          return await this.cab(card, principal, user.id, config);
        case 'onCall':
          return await this.onCallAnswer(card, principal, user.id);
        default:
          return null;
      }
    } catch (error) {
      this.logger.warn(`teams_query_failed command=${command} user=${user.id} reason=${error instanceof Error ? error.message : String(error)}`);
      return notice('actionFailed');
    }
  }

  // ---- commands ------------------------------------------------------------

  private async ticket(input: TeamsQueryInput, card: QueryCardContext, context: TicketMutationContext, isStaff: boolean): Promise<Card[] | null> {
    const reference = input.argument.trim();
    const bare = isBareTicketReference(input.text);
    if (!reference) return [adaptiveCard([paragraph(teamsText(card.locale, 'ticketUsage'))])];
    const found = await this.prisma.ticket.findFirst({ where: { ticketNumber: { equals: reference, mode: 'insensitive' } }, select: { id: true } });
    let ticket: TicketResponse | null = null;
    if (found) ticket = await this.tickets.getById(found.id, context).catch(() => null);
    if (!ticket) {
      // Same answer for "missing" and "not yours": the bot never confirms that a number exists.
      return bare ? null : [adaptiveCard([paragraph(teamsText(card.locale, 'ticketNotFound', { ref: reference.slice(0, 40) }))])];
    }
    return [
      ticketDetailCard(
        card,
        {
          ...toRow(ticket),
          serviceName: ticket.serviceName ?? null,
          groupName: ticket.assignedGroupName ?? null,
          assigneeName: ticket.assignedUserName ?? null,
          requesterName: ticket.requesterName ?? null,
          isConfidential: ticket.isConfidential,
        },
        { isStaff, actionsEnabled: input.config.actionsEnabled },
      ),
    ];
  }

  private async search(query: string, card: QueryCardContext, userId: string): Promise<Card> {
    try {
      const articles = await this.knowledge.list({ q: query.slice(0, 120), status: 'PUBLISHED' }, { actorUserId: userId });
      const rows = articles.slice(0, teamsListLimits.personal).map((article) => ({
        id: article.id,
        slug: article.slug,
        title: article.title,
        preview: preview(article.body),
        serviceName: article.serviceName ?? null,
      }));
      return articlesCard(card, query, rows, articles.length);
    } catch (error) {
      this.logger.warn(`teams_kb_search_failed user=${userId} reason=${error instanceof Error ? error.message : String(error)}`);
      return adaptiveCard([paragraph(teamsText(card.locale, 'searchUnavailable'))]);
    }
  }

  private async approvals(card: QueryCardContext, userId: string, config: TeamsQueryInput['config']): Promise<Card[]> {
    const where = { approverUserId: userId, status: 'PENDING' as const, ticket: { status: 'PENDING_APPROVAL' as const } };
    const [pending, total] = await Promise.all([
      this.prisma.ticketApproval.findMany({ where, select: { ticketId: true }, orderBy: { createdAt: 'asc' }, take: teamsListLimits.cards }),
      this.prisma.ticketApproval.count({ where }),
    ]);
    const cards = await this.entityCards('ticket', [...new Set(pending.map((row) => row.ticketId))], 'ticket.approval', card, config);
    return [summaryCard(card, 'approvalsTitle', 'approvalsEmpty', cards.length, total, '/tickets?view=all&status=PENDING_APPROVAL'), ...cards];
  }

  private async status(card: QueryCardContext, principal: PrincipalContext | null, userId: string): Promise<Card[]> {
    const viewer = statusViewerFromContext(principal, userId);
    const page = await this.statusPage.page(viewer).catch(() => null);
    if (!page || !page.configuration.enabled) return [adaptiveCard([paragraph(teamsText(card.locale, 'statusUnavailable'))])];
    const limit = teamsListLimits.personal;
    const active = page.activeIncidents.slice(0, limit).map((incident) => ({
      title: card.locale === 'en' && incident.titleEn ? incident.titleEn : incident.title,
      impact: incident.impact,
      services: incident.services.map((service) => service.name),
      startedAt: incident.startedAt,
    }));
    const planned = page.planned.slice(0, limit).map((window) => ({ serviceName: window.serviceName, startsAt: window.startsAt, endsAt: window.endsAt }));
    return [statusCard(card, active, planned, { active: page.activeIncidents.length, planned: page.planned.length })];
  }

  /** Group inbox; without it (inbox off) the unclaimed tickets in the caller's scope. */
  private async queue(context: TicketMutationContext, pageSize: number): Promise<{ rows: TicketListRow[]; total: number }> {
    try {
      const page = await this.tickets.listInbox({ pageSize }, context);
      return { rows: page.items.map(toRow), total: page.total };
    } catch (error) {
      if (domainErrorCode(error) !== 'GROUP_INBOX_DISABLED') throw error;
      const page = await this.tickets.listPage({ unassigned: true, status: [...openTicketStatuses], sort: 'slaDueAt', dir: 'asc', pageSize }, context);
      return { rows: page.items.map(toRow), total: page.total };
    }
  }

  private async sla(card: QueryCardContext, context: TicketMutationContext, userId: string): Promise<Card> {
    const scan = 50;
    const [assigned, queue] = await Promise.all([
      this.tickets.listPage({ assignedUserId: userId, status: [...openTicketStatuses], sort: 'slaDueAt', dir: 'asc', pageSize: scan }, context),
      this.queue(context, scan).catch(() => ({ rows: [] as TicketListRow[], total: 0 })),
    ]);
    const byId = new Map<string, TicketListRow>();
    for (const row of [...assigned.items.map(toRow), ...queue.rows]) if (row.isOverdue || row.isAtRisk) byId.set(row.id, row);
    const rows = [...byId.values()].sort(
      (a, b) => Number(b.isOverdue) - Number(a.isOverdue) || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'),
    );
    return ticketListCard(card, {
      titleKey: 'slaTitle',
      emptyKey: 'slaEmpty',
      rows: rows.slice(0, teamsListLimits.agent),
      total: rows.length,
      path: '/tickets?view=all&atRisk=true',
      claim: true,
    });
  }

  private async cab(card: QueryCardContext, principal: PrincipalContext | null, userId: string, config: TeamsQueryInput['config']): Promise<Card[]> {
    if (!(await this.changeAccess.isEnabled().catch(() => false))) return [adaptiveCard([paragraph(teamsText(card.locale, 'cabUnavailable'))])];
    const viewer = assetViewerFromContext(principal, userId, 'change.');
    const list = await this.changes.list(viewer, { awaitingMyVote: true, limit: teamsListLimits.cards * 2 }).catch(() => null);
    if (!list) return [adaptiveCard([paragraph(teamsText(card.locale, 'cabUnavailable'))])];
    const ids = list.items.slice(0, teamsListLimits.cards).map((item) => item.id);
    const cards = await this.entityCards('change', ids, 'change.vote', card, config);
    return [summaryCard(card, 'cabTitle', 'cabEmpty', cards.length, list.items.length, '/changes?vote=true'), ...cards];
  }

  private async onCallAnswer(card: QueryCardContext, principal: PrincipalContext | null, userId: string): Promise<Card[]> {
    const viewer = onCallViewerFromContext(principal, userId);
    if (!viewer.canRead || !(await this.onCall.isEnabled().catch(() => false))) {
      return [adaptiveCard([paragraph(teamsText(card.locale, 'onCallUnavailable'))])];
    }
    const [overview, me] = await Promise.all([this.onCall.overview(viewer), this.onCall.me(viewer)]);
    const groups = overview.groups.filter((group) => group.hasSchedule && group.isActive);
    const rows = groups.slice(0, teamsListLimits.agent).map((group) => ({
      groupName: group.groupName,
      displayName: group.current?.displayName || null,
      endsAt: group.current?.endsAt ?? null,
    }));
    return [onCallCard(card, rows, groups.length, { current: me.current, next: me.next })];
  }

  // ---- helpers -------------------------------------------------------------

  /** Existing approval / CAB cards (same buttons as the notifications). */
  private async entityCards(type: 'ticket' | 'change', ids: readonly string[], kind: string, card: QueryCardContext, config: TeamsQueryInput['config']): Promise<Card[]> {
    const built = await Promise.all(ids.map((id) => this.delivery.buildForKind(type, id, kind, 'personal', card.locale, config).catch(() => null)));
    return built.filter((entry): entry is NonNullable<typeof entry> => entry !== null).map((entry) => entry.card);
  }
}

function toRow(ticket: TicketResponse): TicketListRow {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    isOverdue: ticket.isOverdue,
    isAtRisk: ticket.isAtRisk,
    dueAt: ticket.sla?.resolutionDueAt ?? null,
    assignedUserId: ticket.assignedUserId,
  };
}

function preview(body: string): string {
  const plain = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>[\]()!|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > previewLength ? `${plain.slice(0, previewLength - 1)}…` : plain;
}
