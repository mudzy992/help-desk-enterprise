import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { formatChangeNumber } from '../changes/change-rules';
import { changeDefaults } from '../settings/definitions/change-settings';
import { settingKeys } from '../settings/setting-keys';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { SettingsService } from '../settings/settings.service';
import { cardActivity } from './teams-cards';
import { TeamsConfigurationService, type TeamsConfiguration } from './teams-configuration.service';
import { parseTeamsDeliveryJob, type TeamsDeliveryJob } from './teams-delivery.types';
import { TeamsError } from './teams.error';
import { buildNotificationCard, type BuiltNotificationCard, type ChangeCardFacts, type TicketCardFacts } from './teams-notification-cards';
import { TeamsRateLimiter } from './teams-rate-limiter';
import { toTeamsLocale } from './teams-text';
import { TeamsTransportFactory } from './teams-transport.factory';

export type TeamsDeliveryOutcome = 'sent' | 'updated' | 'unchanged' | 'skipped' | 'gone';

/**
 * Paket 3.1 (§8): sends or updates one card. The card is built from current
 * data; an existing card for the same entity in the same conversation is
 * updated in place (stateHash avoids no-op updates). 403/404 mark the
 * conversation removed and end the job; transient errors are re-thrown so
 * the integration queue retries (THROTTLED honours Retry-After there).
 */
@Injectable()
export class TeamsDeliveryService {
  private readonly logger = new Logger(TeamsDeliveryService.name);
  private readonly limiter = new TeamsRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly configuration: TeamsConfigurationService,
    private readonly transports: TeamsTransportFactory,
  ) {}

  /** Integration queue entry point. */
  async process(payload: unknown): Promise<void> {
    const job = parseTeamsDeliveryJob(payload);
    if (!job) throw new Error('Invalid TEAMS job payload');
    await this.deliver(job);
  }

  async deliver(job: TeamsDeliveryJob): Promise<TeamsDeliveryOutcome> {
    const config = await this.configuration.load();
    if (config.mode === 'off') return 'skipped';
    const conversation = await this.prisma.teamsConversation.findUnique({
      where: { id: job.teamsConversationId },
      select: { id: true, conversationId: true, serviceUrl: true, removedAt: true, userId: true, mode: true },
    });
    if (!conversation || conversation.removedAt) return 'skipped';
    // A simulator conversation is never addressed by the live transport and vice versa.
    if ((conversation.mode === 'LIVE') !== (config.mode === 'live')) return 'skipped';
    if (job.target === 'personal' && (!job.userId || conversation.userId !== job.userId)) return 'skipped';
    const built = await this.build(job, config);
    if (!built) return 'skipped';
    const transport = await this.transports.forMode(config.mode);
    const address = { serviceUrl: conversation.serviceUrl, conversationId: conversation.conversationId };
    const existing = await this.prisma.teamsCardMessage.findUnique({
      where: {
        teamsConversationId_entityType_entityId_cardKind: {
          teamsConversationId: conversation.id,
          entityType: built.entityType,
          entityId: built.entityId,
          cardKind: built.cardKind,
        },
      },
      select: { id: true, activityId: true, stateHash: true },
    });
    if (existing && existing.stateHash === built.stateHash) return 'unchanged';
    const activity = cardActivity(built.card, built.summary);
    const payload = config.mode === 'simulator' ? (JSON.parse(JSON.stringify(built.card)) as object) : undefined;
    try {
      await this.limiter.acquire(conversation.conversationId);
      if (existing) {
        await transport.updateActivity(address, existing.activityId, activity);
        await this.prisma.teamsCardMessage.update({ where: { id: existing.id }, data: { stateHash: built.stateHash, ...(payload ? { payload } : {}) } });
        return 'updated';
      }
      const sent = await transport.sendActivity(address, activity);
      await this.prisma.teamsCardMessage.upsert({
        where: {
          teamsConversationId_entityType_entityId_cardKind: {
            teamsConversationId: conversation.id,
            entityType: built.entityType,
            entityId: built.entityId,
            cardKind: built.cardKind,
          },
        },
        create: {
          teamsConversationId: conversation.id,
          activityId: sent.activityId,
          entityType: built.entityType,
          entityId: built.entityId,
          cardKind: built.cardKind,
          stateHash: built.stateHash,
          ...(payload ? { payload } : {}),
        },
        update: { activityId: sent.activityId, stateHash: built.stateHash, ...(payload ? { payload } : {}) },
      });
      return 'sent';
    } catch (error) {
      if (error instanceof TeamsError && error.code === 'CONVERSATION_GONE') {
        await this.prisma.teamsConversation.update({ where: { id: conversation.id }, data: { removedAt: new Date() } });
        this.logger.warn(`teams_conversation_gone conversation=${conversation.id}`);
        return 'gone';
      }
      if (error instanceof TeamsError && !error.retryable) {
        this.logger.warn(`teams_delivery_failed_final code=${error.code} notification=${job.notificationId}`);
        return 'skipped';
      }
      throw error;
    }
  }

  /**
   * Paket 3.1 (§8): refreshes every card already posted for an entity (status
   * changed, claimed, decided) so buttons disappear when they no longer apply.
   */
  async refreshEntityCards(entityType: 'ticket' | 'change', entityId: string): Promise<number> {
    const config = await this.configuration.load();
    if (config.mode === 'off') return 0;
    const cards = await this.prisma.teamsCardMessage.findMany({
      where: { entityType, entityId, conversation: { removedAt: null } },
      select: { id: true, activityId: true, cardKind: true, stateHash: true, teamsConversationId: true, conversation: { select: { conversationId: true, serviceUrl: true, kind: true, userId: true } } },
      take: 50,
    });
    let updated = 0;
    const transport = await this.transports.forMode(config.mode);
    for (const card of cards) {
      const locale = card.conversation.kind === 'PERSONAL' && card.conversation.userId ? await this.userLocale(card.conversation.userId, config) : config.defaultLocale;
      const built = await this.buildForKind(entityType, entityId, card.cardKind, card.conversation.kind === 'PERSONAL' ? 'personal' : 'channel', locale, config);
      if (!built || built.stateHash === card.stateHash) continue;
      try {
        await this.limiter.acquire(card.conversation.conversationId);
        await transport.updateActivity({ serviceUrl: card.conversation.serviceUrl, conversationId: card.conversation.conversationId }, card.activityId, cardActivity(built.card, built.summary));
        await this.prisma.teamsCardMessage.update({
          where: { id: card.id },
          data: { stateHash: built.stateHash, ...(config.mode === 'simulator' ? { payload: JSON.parse(JSON.stringify(built.card)) as object } : {}) },
        });
        updated += 1;
      } catch (error) {
        this.logger.warn(`teams_card_refresh_failed card=${card.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return updated;
  }

  private async userLocale(userId: string, config: TeamsConfiguration) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferredLocale: true } });
    return user?.preferredLocale ? toTeamsLocale(user.preferredLocale) : config.defaultLocale;
  }

  private async build(job: TeamsDeliveryJob, config: TeamsConfiguration): Promise<BuiltNotificationCard | null> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.notificationId },
      select: { type: true, body: true, ticketId: true, payload: true },
    });
    if (!notification) return null;
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    const locale = job.target === 'personal' && job.userId ? await this.userLocale(job.userId, config) : config.defaultLocale;
    const includeTitle = job.target === 'channel' && job.groupId ? await this.channelIncludeTitle(job.groupId, config) : config.channelIncludeTitle;
    const base = {
      target: job.target,
      locale,
      timeZone: await readInstallationTimeZone(this.settings),
      notificationType: notification.type,
      event: typeof payload.event === 'string' ? payload.event : '',
      body: notification.body,
      includeTitle,
      actionsEnabled: config.actionsEnabled,
      publicUrl: config.publicUrl,
    };
    const changeId = typeof payload.changeId === 'string' && payload.changeId ? payload.changeId : null;
    const problemId = typeof payload.problemId === 'string' && payload.problemId ? payload.problemId : null;
    if (notification.ticketId) return buildNotificationCard({ ...base, ticket: await this.ticketFacts(notification.ticketId), change: null, other: null });
    if (changeId) return buildNotificationCard({ ...base, ticket: null, change: await this.changeFacts(changeId, payload.changeNumber), other: null });
    if (problemId) {
      const label = typeof payload.problemNumber === 'string' ? payload.problemNumber : problemId;
      return buildNotificationCard({ ...base, ticket: null, change: null, other: { entityType: 'problem', id: problemId, label, path: `/problems/${encodeURIComponent(problemId)}` } });
    }
    if (notification.type.startsWith('oncall.')) {
      return buildNotificationCard({ ...base, ticket: null, change: null, other: { entityType: 'oncall', id: job.notificationId, label: notification.body ?? '', path: '/on-call' } });
    }
    return null;
  }

  /** Current card for an entity (invoke responses and refreshes). */
  async buildForKind(entityType: 'ticket' | 'change', entityId: string, cardKind: string, target: 'personal' | 'channel', locale: ReturnType<typeof toTeamsLocale>, config: TeamsConfiguration) {
    const base = {
      target,
      locale,
      timeZone: await readInstallationTimeZone(this.settings),
      notificationType: cardKind === 'ticket.approval' ? 'ticket.approval' : cardKind === 'change.vote' ? 'change.approvalRequested' : cardKind.startsWith('change.') ? cardKind.slice('change.'.length) : 'ticket.assigned',
      event: cardKind === 'ticket.approval' ? 'ticket_approval_requested' : '',
      body: null,
      includeTitle: config.channelIncludeTitle,
      actionsEnabled: config.actionsEnabled,
      publicUrl: config.publicUrl,
    };
    if (entityType === 'ticket') {
      const ticket = await this.ticketFacts(entityId);
      if (!ticket) return null;
      return buildNotificationCard({ ...base, notificationType: target === 'channel' ? 'ticket.created' : base.notificationType, ticket, change: null, other: null });
    }
    const change = await this.changeFacts(entityId, undefined);
    return change ? buildNotificationCard({ ...base, ticket: null, change, other: null }) : null;
  }

  private async channelIncludeTitle(groupId: string, config: TeamsConfiguration): Promise<boolean> {
    const link = await this.prisma.teamsGroupChannel.findUnique({ where: { groupId }, select: { includeTitle: true } });
    return link?.includeTitle ?? config.channelIncludeTitle;
  }

  private async ticketFacts(ticketId: string): Promise<TicketCardFacts | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        isConfidential: true,
        service: { select: { name: true } },
        assignedUser: { select: { displayName: true } },
      },
    });
    if (!ticket) return null;
    return {
      id: ticket.id,
      number: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      serviceName: ticket.service.name,
      assigneeName: ticket.assignedUser?.displayName ?? null,
      dueAt: ticket.dueAt,
      isConfidential: ticket.isConfidential,
    };
  }

  private async changeFacts(changeId: string, number: unknown): Promise<ChangeCardFacts | null> {
    const change = await this.prisma.changeRequest.findUnique({
      where: { id: changeId },
      select: { id: true, sequence: true, title: true, risk: true, status: true, plannedStart: true, plannedEnd: true, version: true },
    });
    if (!change) return null;
    const existing = typeof number === 'string' && number ? number : await this.changeNumber(change.sequence);
    return { id: change.id, number: existing, title: change.title, risk: change.risk, status: change.status, plannedStart: change.plannedStart, plannedEnd: change.plannedEnd, version: change.version };
  }

  private async changeNumber(sequence: number): Promise<string> {
    let prefix: string = changeDefaults.numberPrefix;
    try {
      const value = await this.settings.getSetting(settingKeys.privateChangesNumberPrefix);
      if (typeof value === 'string') prefix = value;
    } catch {
      // default prefix
    }
    return formatChangeNumber(prefix, sequence);
  }
}
