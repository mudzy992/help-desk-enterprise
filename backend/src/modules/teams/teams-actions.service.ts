import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assetViewerFromContext } from '../assets/asset-viewer';
import { appendAuditLog } from '../audit-log/append-audit-log';
import { ChangeApprovalsService } from '../changes/change-approvals.service';
import { isServiceOfferedToRequesters } from '../service-catalog/assert-service-lifecycle-transition';
import { parseFormSchema } from '../service-catalog/parse-form-schema';
import { TicketsApprovalsService } from '../tickets/approvals/tickets-approvals.service';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext } from '../tickets/tickets.types';
import { teamsErrorTextKey } from './teams-action-errors';
import type { TeamsActivity } from './teams-activity';
import { TeamsActivityRouter, type TeamsActionHandler } from './teams-activity-router.service';
import { adaptiveCard, paragraph } from './teams-cards';
import type { TeamsConfiguration } from './teams-configuration.service';
import { teamsVerbs } from './teams.constants';
import { TeamsDeliveryService } from './teams-delivery.service';
import type { TeamsLinkedUser } from './teams-identity.service';
import { teamsText, type TeamsLocale, type TeamsTextKey } from './teams-text';
import { needsFormCard, readTicketDraft, ticketCreatedCard, ticketFormCard, type TeamsServiceChoice } from './teams-ticket-create';

const textMin = 2;
const textMax = 4000;
const handledVerbs = new Set<string>([
  teamsVerbs.claimTicket,
  teamsVerbs.replyTicket,
  teamsVerbs.noteTicket,
  teamsVerbs.approveTicket,
  teamsVerbs.rejectTicket,
  teamsVerbs.approveChange,
  teamsVerbs.rejectChange,
  teamsVerbs.createTicket,
]);

type ActionInput = Parameters<TeamsActionHandler['handle']>[0];

/**
 * Paket 3.1 (§9, §10): card actions and ticket creation. Every action runs as
 * the linked user through the same services as the web application (RBAC,
 * unit scope, transitions, SLA and notifications included); Teams adds no
 * permission of its own. Each action is audited as `teams.<verb>`.
 */
@Injectable()
export class TeamsActionsService implements TeamsActionHandler, OnModuleInit {
  private readonly logger = new Logger(TeamsActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: TeamsActivityRouter,
    private readonly principals: PrincipalContextLoader,
    private readonly tickets: TicketsService,
    private readonly collaboration: TicketsCollaborationService,
    private readonly approvals: TicketsApprovalsService,
    private readonly changeApprovals: ChangeApprovalsService,
    private readonly delivery: TeamsDeliveryService,
  ) {}

  onModuleInit(): void {
    this.router.registerActionHandler(this);
  }

  handles(verb: string): boolean {
    return handledVerbs.has(verb);
  }

  async handle(input: ActionInput): Promise<Record<string, unknown>> {
    const { verb, user, config } = input;
    const locale = user.locale;
    if (verb === teamsVerbs.createTicket) return this.createTicket(input);
    if (!config.actionsEnabled) return notice(locale, 'actionUnavailable');
    const context: TicketMutationContext = { actorUserId: user.id, messageSource: 'TEAMS' };
    const ticketId = str(input.data.ticketId, 64);
    const changeId = str(input.data.changeId, 64);
    const cardKind = str(input.data.cardKind, 60) ?? 'ticket';
    try {
      switch (verb) {
        case teamsVerbs.claimTicket: {
          if (!ticketId) return notice(locale, 'errInvalid');
          const current = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { assignedUserId: true } });
          if (current?.assignedUserId) return this.entityCard('ticket', ticketId, cardKind, input, 'errStale');
          await this.tickets.claim(ticketId, context);
          await this.audit(user, input.activity, verb, 'ticket', ticketId);
          return this.entityCard('ticket', ticketId, cardKind, input, 'doneClaimed');
        }
        case teamsVerbs.replyTicket:
        case teamsVerbs.noteTicket: {
          const text = str(input.data.text, 10_000)?.trim() ?? '';
          if (!ticketId) return notice(locale, 'errInvalid');
          if (text.length < textMin || text.length > textMax) return this.entityCard('ticket', ticketId, cardKind, input, 'errTextLength');
          await this.collaboration.createMessage(ticketId, { type: verb === teamsVerbs.noteTicket ? 'INTERNAL_NOTE' : 'AGENT_REPLY', body: text }, context);
          await this.audit(user, input.activity, verb, 'ticket', ticketId);
          return this.entityCard('ticket', ticketId, cardKind, input, verb === teamsVerbs.noteTicket ? 'doneNoted' : 'doneReplied');
        }
        case teamsVerbs.approveTicket:
        case teamsVerbs.rejectTicket: {
          if (!ticketId) return notice(locale, 'errInvalid');
          const comment = str(input.data.comment, textMax)?.trim() ?? '';
          if (verb === teamsVerbs.rejectTicket && comment.length < textMin) return this.entityCard('ticket', ticketId, cardKind, input, 'errReasonRequired');
          const approval = await this.prisma.ticketApproval.findFirst({
            where: { ticketId, approverUserId: user.id, status: 'PENDING' },
            orderBy: { stepOrder: 'asc' },
            select: { id: true },
          });
          if (!approval) return this.entityCard('ticket', ticketId, cardKind, input, 'errStale');
          if (verb === teamsVerbs.approveTicket) await this.approvals.approve(ticketId, approval.id, { comment }, context);
          else await this.approvals.reject(ticketId, approval.id, { comment }, context);
          await this.audit(user, input.activity, verb, 'ticket', ticketId);
          return this.entityCard('ticket', ticketId, cardKind, input, verb === teamsVerbs.approveTicket ? 'doneApproved' : 'doneRejected');
        }
        case teamsVerbs.approveChange:
        case teamsVerbs.rejectChange: {
          const version = Number(input.data.version);
          if (!changeId || !Number.isInteger(version)) return notice(locale, 'errInvalid');
          const comment = str(input.data.comment, textMax)?.trim() ?? '';
          if (verb === teamsVerbs.rejectChange && comment.length < textMin) return this.entityCard('change', changeId, 'change.vote', input, 'errReasonRequired');
          const viewer = assetViewerFromContext(await this.principals.load(user.id), user.id, 'change.');
          await this.changeApprovals.vote(viewer, changeId, { version, decision: verb === teamsVerbs.approveChange ? 'APPROVED' : 'REJECTED', comment: comment || undefined });
          await this.audit(user, input.activity, verb, 'change', changeId);
          return this.entityCard('change', changeId, 'change.vote', input, 'doneVoted');
        }
        default:
          return notice(locale, 'actionUnavailable');
      }
    } catch (error) {
      const key = teamsErrorTextKey(error);
      if (key === null) throw error;
      this.logger.log(`teams_action_refused verb=${verb} user=${user.id} reason=${key}`);
      if (ticketId) return this.entityCard('ticket', ticketId, cardKind, input, key);
      if (changeId) return this.entityCard('change', changeId, 'change.vote', input, key);
      return notice(locale, key);
    }
  }

  // ---- ticket creation (§10) -----------------------------------------------

  /** Services a ticket can be created for from Teams: offered and without required form fields. */
  async creatableServices(query = '', limit = 15): Promise<{ choices: TeamsServiceChoice[]; needsForm: Set<string> }> {
    const services = await this.prisma.service.findMany({
      where: query ? { name: { contains: query, mode: 'insensitive' } } : {},
      select: { id: true, name: true, lifecycle: true, formVersions: { where: { status: 'ACTIVE' }, select: { schema: true }, orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
      take: 200,
    });
    const choices: TeamsServiceChoice[] = [];
    const needsForm = new Set<string>();
    for (const service of services) {
      if (!isServiceOfferedToRequesters(service.lifecycle)) continue;
      if (hasRequiredFields(service.formVersions[0]?.schema)) {
        needsForm.add(service.id);
        continue;
      }
      if (choices.length < limit) choices.push({ id: service.id, name: service.name });
    }
    return { choices, needsForm };
  }

  async ticketForm(locale: TeamsLocale, config: TeamsConfiguration, description?: string, submitMode: 'execute' | 'submit' = 'execute'): Promise<Record<string, unknown>> {
    if (!config.ticketCreateEnabled) return notice(locale, 'newTicketDisabled');
    const { choices } = await this.creatableServices();
    if (choices.length === 0) return notice(locale, 'createNoServices');
    return ticketFormCard({ locale, services: choices, description, publicUrl: config.publicUrl, submitMode });
  }

  async searchServices(query: string): Promise<{ title: string; value: string }[]> {
    const { choices } = await this.creatableServices(query.trim().slice(0, 80), 15);
    return choices.map((choice) => ({ title: choice.name, value: choice.id }));
  }

  private async createTicket(input: ActionInput): Promise<Record<string, unknown>> {
    const { user, config } = input;
    const locale = user.locale;
    if (!config.ticketCreateEnabled) return notice(locale, 'newTicketDisabled');
    const draft = readTicketDraft(input.data);
    if (!draft) return notice(locale, 'errInvalid');
    const { needsForm } = await this.creatableServices();
    if (needsForm.has(draft.serviceId)) return needsFormCard(locale, draft.serviceId, config.publicUrl);
    try {
      const created = await this.tickets.create(
        { title: draft.title, description: draft.description, serviceId: draft.serviceId, impact: draft.impact, urgency: draft.urgency },
        { actorUserId: user.id, messageSource: 'TEAMS' },
      );
      // No TicketSource enum (design §10 deviation): the origin is the audit metadata `channel: teams`.
      await this.audit(user, input.activity, teamsVerbs.createTicket, 'ticket', created.id);
      return ticketCreatedCard(locale, { id: created.id, number: created.ticketNumber, title: created.title }, config.publicUrl);
    } catch (error) {
      const key = teamsErrorTextKey(error);
      if (key === null) throw error;
      return notice(locale, key);
    }
  }

  // ---- helpers -------------------------------------------------------------

  private async entityCard(entityType: 'ticket' | 'change', entityId: string, cardKind: string, input: ActionInput, banner: TeamsTextKey): Promise<Record<string, unknown>> {
    const target = input.activity.conversation.conversationType === 'channel' ? 'channel' : 'personal';
    const built = await this.delivery.buildForKind(entityType, entityId, cardKind, target, input.user.locale, input.config).catch(() => null);
    // Other copies of the card (channel, other approvers) follow in the background.
    void this.delivery.refreshEntityCards(entityType, entityId).catch(() => 0);
    if (!built) return notice(input.user.locale, banner);
    const card = built.card as { body?: unknown[] };
    const tone = banner.startsWith('done') ? 'Good' : 'Attention';
    return { ...built.card, body: [paragraph(teamsText(input.user.locale, banner), { color: tone, weight: 'Bolder' }), ...(card.body ?? [])] };
  }

  private async audit(user: TeamsLinkedUser, activity: TeamsActivity, verb: string, entityType: string, entityId: string): Promise<void> {
    try {
      await this.prisma.$transaction((transaction) =>
        appendAuditLog(transaction as never, {
          action: `teams.${verb}`,
          entityType,
          entityId,
          actorUserId: user.id,
          metadata: { channel: 'teams', activityId: activity.id, conversationType: activity.conversation.conversationType ?? 'personal' },
        }),
      );
    } catch (error) {
      // The action itself succeeded and is recorded by the domain; a failed extra audit row is logged.
      this.logger.warn(`teams_audit_failed verb=${verb} entity=${entityId} reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function str(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined;
}

function notice(locale: TeamsLocale, key: TeamsTextKey): Record<string, unknown> {
  return adaptiveCard([paragraph(teamsText(locale, key))]);
}

function hasRequiredFields(schema: unknown): boolean {
  if (schema === undefined || schema === null) return false;
  try {
    return parseFormSchema(schema).fields.some((field) => field.required);
  } catch {
    // An unreadable form is not something Teams can fill in.
    return true;
  }
}
