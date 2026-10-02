import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { activityConversationKind, activityTenantId, type TeamsActivity } from './teams-activity';

export interface TeamsConversationRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly kind: 'PERSONAL' | 'CHANNEL' | 'GROUP_CHAT';
  readonly serviceUrl: string;
  readonly userId: string | null;
}

/** Paket 3.1 (§6, §7): conversation references captured from inbound activities. */
@Injectable()
export class TeamsConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upserts the reference on every activity so a missed install event heals itself. */
  async touch(activity: TeamsActivity, mode: 'simulator' | 'live', userId: string | null): Promise<TeamsConversationRecord> {
    const kind = activityConversationKind(activity);
    const now = new Date();
    const personal = kind === 'PERSONAL';
    const data = {
      kind,
      mode: mode === 'live' ? ('LIVE' as const) : ('SIMULATOR' as const),
      tenantId: activityTenantId(activity) ?? '',
      serviceUrl: activity.serviceUrl,
      teamId: activity.channelData?.team?.id ?? null,
      teamName: activity.channelData?.team?.name ?? null,
      channelId: activity.channelData?.channel?.id ?? null,
      channelName: activity.channelData?.channel?.name ?? null,
      aadObjectId: personal ? (activity.from.aadObjectId ?? null) : null,
      userId: personal ? userId : null,
      lastActivityAt: now,
    };
    const record = await this.prisma.teamsConversation.upsert({
      where: { conversationId: activity.conversation.id },
      create: { conversationId: activity.conversation.id, ...data },
      update: { ...data, removedAt: null },
      select: { id: true, conversationId: true, kind: true, serviceUrl: true, userId: true },
    });
    return record;
  }

  async markRemoved(conversationId: string): Promise<void> {
    await this.prisma.teamsConversation.updateMany({ where: { conversationId, removedAt: null }, data: { removedAt: new Date() } });
  }

  /** True when the bot itself is the member that was added / removed. */
  static isBotMember(activity: TeamsActivity, members: TeamsActivity['membersAdded']): boolean {
    return (members ?? []).some((member) => member.id !== undefined && member.id === activity.recipient.id);
  }

  /** Idempotency (§7.4): false when the activity was already processed. */
  async claimActivity(activityId: string): Promise<boolean> {
    try {
      await this.prisma.teamsInboundActivity.create({ data: { activityId } });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }
}
