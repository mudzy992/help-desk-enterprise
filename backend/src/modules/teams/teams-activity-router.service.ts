import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { readCardAction, type TeamsActivity } from './teams-activity';
import { adaptiveCard, cardActivity, escapeCardText, execute, heading, openUrl, paragraph, type CardElement } from './teams-cards';
import { parseTeamsCommand } from './teams-commands';
import type { TeamsConfiguration } from './teams-configuration.service';
import { defaultTeamsChannelEvents, maxMyTickets, teamsVerbs } from './teams.constants';
import { TeamsConversationsService, type TeamsConversationRecord } from './teams-conversations.service';
import { TeamsIdentityService, type TeamsLinkedUser } from './teams-identity.service';
import { teamsStatusLabel, teamsText, type TeamsLocale, type TeamsTextKey } from './teams-text';
import type { TeamsOutboundActivity, TeamsTransport } from './teams-transport';

/** Synchronous answer to an `invoke` (Universal Actions expect a card back). */
export interface TeamsInvokeResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const openTicketStatuses = ['PENDING', 'UNROUTED', 'PENDING_APPROVAL', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER'] as const;

/** Extension point for T4 (card actions and ticket creation). */
export interface TeamsActionHandler {
  handles(verb: string): boolean;
  handle(input: { verb: string; data: Record<string, unknown>; user: TeamsLinkedUser; activity: TeamsActivity; config: TeamsConfiguration }): Promise<Record<string, unknown>>;
}

interface RouteContext {
  readonly activity: TeamsActivity;
  readonly config: TeamsConfiguration;
  readonly transport: TeamsTransport;
  readonly conversation: TeamsConversationRecord;
  readonly user: TeamsLinkedUser | null;
  readonly locale: TeamsLocale;
}

/**
 * Paket 3.1 (§7.5): routes an authenticated, tenant-checked, de-duplicated
 * activity. Replies to messages go out through the transport; invokes answer
 * synchronously with a card. Nothing here trusts the activity beyond the
 * validated identity fields (aadObjectId → our user).
 */
@Injectable()
export class TeamsActivityRouter {
  private readonly logger = new Logger(TeamsActivityRouter.name);
  private actionHandler: TeamsActionHandler | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: TeamsConversationsService,
    private readonly identity: TeamsIdentityService,
  ) {}

  registerActionHandler(handler: TeamsActionHandler): void {
    this.actionHandler = handler;
  }

  async route(activity: TeamsActivity, config: TeamsConfiguration, transport: TeamsTransport): Promise<TeamsInvokeResponse | null> {
    const mode = config.mode === 'live' ? 'live' : 'simulator';
    const user = await this.identity.resolveUser(activity.from.aadObjectId, config.defaultLocale);
    const removal =
      (activity.type === 'installationUpdate' && activity.action?.startsWith('remove')) ||
      (activity.type === 'conversationUpdate' && TeamsConversationsService.isBotMember(activity, activity.membersRemoved));
    if (removal) {
      await this.conversations.markRemoved(activity.conversation.id);
      return null;
    }
    const conversation = await this.conversations.touch(activity, mode, user?.id ?? null);
    const context: RouteContext = {
      activity,
      config,
      transport,
      conversation,
      user,
      locale: conversation.kind === 'PERSONAL' ? (user?.locale ?? config.defaultLocale) : config.defaultLocale,
    };
    switch (activity.type) {
      case 'installationUpdate':
        if (conversation.kind === 'PERSONAL') await this.reply(context, this.welcomeCard(context));
        return null;
      case 'conversationUpdate':
        if (conversation.kind === 'PERSONAL' && TeamsConversationsService.isBotMember(activity, activity.membersAdded)) await this.reply(context, this.welcomeCard(context));
        return null;
      case 'message':
        await this.onMessage(context);
        return null;
      case 'invoke':
        return this.onInvoke(context);
      default:
        return null;
    }
  }

  private async onMessage(context: RouteContext): Promise<void> {
    const command = parseTeamsCommand(context.activity.text);
    if (context.conversation.kind !== 'PERSONAL') {
      // Channel and group chat: the bot only reacts to link / unlink (it is @-mentioned there).
      if (command === 'link') await this.reply(context, await this.linkCard(context));
      else if (command === 'unlink') await this.reply(context, await this.unlink(context));
      return;
    }
    if (!context.user) {
      await this.reply(context, this.noticeCard(context, 'notLinked'));
      return;
    }
    switch (command) {
      case 'myTickets':
        await this.reply(context, await this.myTicketsCard(context, context.user));
        return;
      case 'newTicket':
        await this.reply(context, this.noticeCard(context, context.config.ticketCreateEnabled ? 'newTicketSoon' : 'newTicketDisabled', true));
        return;
      case 'link':
        await this.reply(context, this.noticeCard(context, 'linkOnlyChannel'));
        return;
      default:
        await this.reply(context, this.helpCard(context));
    }
  }

  private async onInvoke(context: RouteContext): Promise<TeamsInvokeResponse> {
    const action = readCardAction(context.activity);
    if (!action) return { status: 200, body: { statusCode: 200, type: 'application/vnd.microsoft.activity.message', value: teamsText(context.locale, 'actionUnavailable') } };
    if (!context.user) return cardResponse(this.noticeCardContent(context, 'notLinked'));
    if (action.verb === teamsVerbs.linkGroup) return cardResponse(await this.linkGroup(context, context.user, action.data));
    if (this.actionHandler?.handles(action.verb)) {
      try {
        return cardResponse(await this.actionHandler.handle({ ...action, user: context.user, activity: context.activity, config: context.config }));
      } catch (error) {
        this.logger.warn(`teams_action_failed verb=${action.verb} reason=${error instanceof Error ? error.message : String(error)}`);
        return cardResponse(this.noticeCardContent(context, 'actionFailed', true));
      }
    }
    return cardResponse(this.noticeCardContent(context, 'actionUnavailable', true));
  }

  // ---- linking (§11) -------------------------------------------------------

  private async linkCard(context: RouteContext): Promise<TeamsOutboundActivity> {
    if (context.conversation.kind !== 'CHANNEL') return this.noticeCard(context, 'linkOnlyChannel');
    if (!context.user) return this.noticeCard(context, 'notLinked');
    if (!context.config.channelEnabled) return this.noticeCard(context, 'channelsDisabled');
    const groups = await this.identity.linkableGroups(context.user.id);
    if (groups.length === 0) return this.noticeCard(context, 'linkNone');
    const t = (key: TeamsTextKey) => teamsText(context.locale, key);
    return cardActivity(
      adaptiveCard(
        [
          heading(t('linkTitle')),
          paragraph(t('linkChoose')),
          {
            type: 'Input.ChoiceSet',
            id: 'groupId',
            label: t('linkGroup'),
            isRequired: true,
            style: 'filtered',
            choices: groups.map((group) => ({ title: group.name, value: group.id })),
          },
        ],
        [execute(t('linkSubmit'), teamsVerbs.linkGroup, {}, { associatedInputs: 'auto' })],
      ),
      t('linkTitle'),
    );
  }

  private async linkGroup(context: RouteContext, user: TeamsLinkedUser, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (context.conversation.kind !== 'CHANNEL') return this.noticeCardContent(context, 'linkOnlyChannel');
    if (!context.config.channelEnabled) return this.noticeCardContent(context, 'channelsDisabled');
    const groupId = typeof data.groupId === 'string' ? data.groupId : '';
    const group = (await this.identity.linkableGroups(user.id)).find((candidate) => candidate.id === groupId);
    if (!group) return this.noticeCardContent(context, 'linkForbidden');
    await this.prisma.teamsGroupChannel.upsert({
      where: { groupId: group.id },
      create: {
        groupId: group.id,
        teamsConversationId: context.conversation.id,
        events: [...defaultTeamsChannelEvents],
        includeTitle: context.config.channelIncludeTitle,
        createdByUserId: user.id,
      },
      update: { teamsConversationId: context.conversation.id, createdByUserId: user.id },
    });
    this.logger.log(`teams_channel_linked group=${group.id} conversation=${context.conversation.id} actor=${user.id}`);
    return adaptiveCard([paragraph(teamsText(context.locale, 'linkDone', { group: escapeCardText(group.name) }))]);
  }

  private async unlink(context: RouteContext): Promise<TeamsOutboundActivity> {
    if (context.conversation.kind !== 'CHANNEL') return this.noticeCard(context, 'linkOnlyChannel');
    if (!context.user) return this.noticeCard(context, 'notLinked');
    const allowed = (await this.identity.linkableGroups(context.user.id)).map((group) => group.id);
    const result = await this.prisma.teamsGroupChannel.deleteMany({ where: { teamsConversationId: context.conversation.id, groupId: { in: allowed } } });
    this.logger.log(`teams_channel_unlinked conversation=${context.conversation.id} actor=${context.user.id} count=${result.count}`);
    return result.count === 0 ? this.noticeCard(context, 'unlinkNone') : this.noticeCard(context, 'unlinkDone', false, { count: result.count });
  }

  // ---- cards ---------------------------------------------------------------

  private welcomeCard(context: RouteContext): TeamsOutboundActivity {
    const t = (key: TeamsTextKey, params?: Record<string, string>) => teamsText(context.locale, key, params);
    const app = context.config.appName || t('openApp');
    const body: CardElement[] = [heading(t('welcomeTitle', { app: escapeCardText(app) }))];
    body.push(paragraph(context.user ? t('welcomeLinked', { name: escapeCardText(context.user.displayName) }) : t('notLinked')));
    if (context.user) body.push(...this.helpLines(context));
    return cardActivity(adaptiveCard(body, this.appLink(context)), t('welcomeTitle', { app }));
  }

  private helpCard(context: RouteContext): TeamsOutboundActivity {
    return cardActivity(adaptiveCard([heading(teamsText(context.locale, 'helpTitle')), ...this.helpLines(context)], this.appLink(context)));
  }

  private helpLines(context: RouteContext): CardElement[] {
    const keys: TeamsTextKey[] = ['helpNewTicket', 'helpMyTickets', 'helpHelp', 'helpChannel'];
    return keys.map((key) => paragraph(`• ${teamsText(context.locale, key)}`, { spacing: 'Small' }));
  }

  private async myTicketsCard(context: RouteContext, user: TeamsLinkedUser): Promise<TeamsOutboundActivity> {
    const tickets = await this.prisma.ticket.findMany({
      where: { requesterId: user.id, status: { in: [...openTicketStatuses] } },
      select: { id: true, ticketNumber: true, title: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: maxMyTickets,
    });
    const t = (key: TeamsTextKey) => teamsText(context.locale, key);
    const body: CardElement[] = [heading(t('myTicketsTitle'))];
    if (tickets.length === 0) body.push(paragraph(t('myTicketsEmpty')));
    for (const ticket of tickets) {
      const url = context.config.publicUrl ? `${context.config.publicUrl}/tickets/${encodeURIComponent(ticket.id)}` : null;
      body.push({
        type: 'Container',
        separator: true,
        ...(url ? { selectAction: openUrl(t('open'), url) } : {}),
        items: [
          paragraph(`**${escapeCardText(ticket.ticketNumber)}** · ${escapeCardText(ticket.title)}`),
          paragraph(teamsStatusLabel(context.locale, ticket.status), { isSubtle: true, spacing: 'None', size: 'Small' }),
        ],
      });
    }
    return cardActivity(adaptiveCard(body, this.appLink(context)), t('myTicketsTitle'));
  }

  private noticeCardContent(context: RouteContext, key: TeamsTextKey, withLink = false, params: Record<string, string | number> = {}): Record<string, unknown> {
    return adaptiveCard([paragraph(teamsText(context.locale, key, params))], withLink ? this.appLink(context) : []);
  }

  private noticeCard(context: RouteContext, key: TeamsTextKey, withLink = false, params: Record<string, string | number> = {}): TeamsOutboundActivity {
    return cardActivity(this.noticeCardContent(context, key, withLink, params), teamsText(context.locale, key, params));
  }

  private appLink(context: RouteContext): CardElement[] {
    return context.config.publicUrl ? [openUrl(teamsText(context.locale, 'openApp'), context.config.publicUrl)] : [];
  }

  private async reply(context: RouteContext, activity: TeamsOutboundActivity): Promise<void> {
    await context.transport.sendActivity({ serviceUrl: context.activity.serviceUrl, conversationId: context.activity.conversation.id }, activity);
  }
}

function cardResponse(card: Record<string, unknown>): TeamsInvokeResponse {
  return { status: 200, body: { statusCode: 200, type: 'application/vnd.microsoft.card.adaptive', value: card } };
}
