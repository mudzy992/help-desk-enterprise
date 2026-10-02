import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IntegrationJobType } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnqueueIntegrationJobService } from '../integration-queue/enqueue-integration-job.service';
import { loadIntegrationQueueSettings } from '../integration-queue/load-integration-queue-settings';
import { isQueuedIntegrationJobType } from '../integration-queue/parse-integration-queue-types';
import { registerNotificationCreatedSink } from '../notifications/fan-out/notification-created-sinks';
import type { NotificationRecord } from '../notifications/notifications.types';
import { findPreferenceCategoryForType } from '../notifications/preferences/notification-preference-catalog';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';
import { effectiveTeamsPreference, isTeamsCapableCategory } from '../notifications/preferences/teams-preference-defaults';
import { SettingsService } from '../settings/settings.service';
import { channelEventOf } from './teams-channel-events';
import { TeamsConfigurationService } from './teams-configuration.service';
import { TeamsDeliveryService } from './teams-delivery.service';
import type { TeamsDeliveryJob } from './teams-delivery.types';

function eventOf(record: NotificationRecord): string {
  const payload = record.payload as { event?: unknown } | null;
  return typeof payload?.event === 'string' ? payload.event : '';
}

/**
 * Paket 3.1 (§8, §12): decides who gets a Teams copy of a freshly written
 * notification — personal chats by preference (quiet hours respected, on-call
 * exempt) and linked group channels by their event list — and queues one
 * TEAMS job per target (inline when the integration queue does not take TEAMS).
 */
@Injectable()
export class TeamsNotificationPlanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamsNotificationPlanner.name);
  private unregister: (() => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly configuration: TeamsConfigurationService,
    private readonly enqueue: EnqueueIntegrationJobService,
    private readonly delivery: TeamsDeliveryService,
  ) {}

  onModuleInit(): void {
    this.unregister = registerNotificationCreatedSink(async (records) => {
      await this.plan(records);
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  async plan(records: readonly NotificationRecord[]): Promise<number> {
    const config = await this.configuration.load();
    if (config.mode === 'off') return 0;
    // Decisions and outcomes on changes: refresh vote cards so their buttons go away.
    for (const changeId of new Set(records.map((record) => (record.payload as { changeId?: unknown } | null)?.changeId).filter((id): id is string => typeof id === 'string' && id.length > 0))) {
      if (records.some((record) => record.type !== 'change.approvalRequested' && (record.payload as { changeId?: unknown } | null)?.changeId === changeId)) {
        await this.delivery.refreshEntityCards('change', changeId).catch(() => 0);
      }
    }
    const jobs: TeamsDeliveryJob[] = [];
    if (config.personalEnabled) jobs.push(...(await this.personalJobs(records.filter((record) => record.userId))));
    if (config.channelEnabled) jobs.push(...(await this.channelJobs(records.filter((record) => record.groupId))));
    if (jobs.length === 0) return 0;
    const queue = await loadIntegrationQueueSettings(this.settings);
    const queued = queue.enabled && isQueuedIntegrationJobType(IntegrationJobType.TEAMS, queue.typeTokens);
    for (const job of jobs) {
      if (queued) {
        await this.enqueue.enqueue({ type: IntegrationJobType.TEAMS, payload: { ...job } });
      } else {
        // Without the queue a failed delivery is logged and dropped (e-mail and in-app are unaffected).
        await this.delivery.deliver(job).catch((error: unknown) => {
          this.logger.warn(`teams_inline_delivery_failed notification=${job.notificationId} reason=${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    return jobs.length;
  }

  private async personalJobs(records: readonly NotificationRecord[]): Promise<TeamsDeliveryJob[]> {
    const relevant = records.filter((record) => {
      const category = findPreferenceCategoryForType(record.type);
      return category !== null && !category.alwaysOn && isTeamsCapableCategory(category.key);
    });
    if (relevant.length === 0) return [];
    const userIds = [...new Set(relevant.map((record) => record.userId as string))];
    const conversations = await this.prisma.teamsConversation.findMany({
      where: { kind: 'PERSONAL', removedAt: null, userId: { in: userIds } },
      select: { id: true, userId: true },
      orderBy: { lastActivityAt: 'desc' },
    });
    const conversationByUser = new Map<string, string>();
    for (const conversation of conversations) if (conversation.userId && !conversationByUser.has(conversation.userId)) conversationByUser.set(conversation.userId, conversation.id);
    if (conversationByUser.size === 0) return [];
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const jobs: TeamsDeliveryJob[] = [];
    const byType = new Map<string, NotificationRecord[]>();
    for (const record of relevant) byType.set(record.type, [...(byType.get(record.type) ?? []), record]);
    for (const [type, group] of byType) {
      const category = findPreferenceCategoryForType(type)!;
      const ids = group.map((record) => record.userId as string).filter((id) => conversationByUser.has(id));
      if (ids.length === 0) continue;
      const [stored, decisions] = await Promise.all([
        this.prisma.userNotificationPreference.findMany({ where: { userId: { in: ids }, category: category.key }, select: { userId: true, teams: true } }),
        resolveDeliveryDecisions(this.prisma, policy, { type, userIds: ids }),
      ]);
      const teamsChoice = new Map(stored.map((row) => [row.userId, row.teams]));
      for (const record of group) {
        const userId = record.userId as string;
        const conversationId = conversationByUser.get(userId);
        if (!conversationId) continue;
        if (!effectiveTeamsPreference(category.key, teamsChoice.get(userId))) continue;
        if (decisions.get(userId)?.quiet === true) continue;
        jobs.push({ target: 'personal', teamsConversationId: conversationId, notificationId: record.id, userId });
      }
    }
    return jobs;
  }

  private async channelJobs(records: readonly NotificationRecord[]): Promise<TeamsDeliveryJob[]> {
    const candidates = records.map((record) => ({ record, event: channelEventOf(record.type, eventOf(record)) })).filter((entry) => entry.event !== null);
    if (candidates.length === 0) return [];
    const links = await this.prisma.teamsGroupChannel.findMany({
      where: { groupId: { in: [...new Set(candidates.map((entry) => entry.record.groupId as string))] }, conversation: { removedAt: null } },
      select: { groupId: true, teamsConversationId: true, events: true },
    });
    const linkByGroup = new Map(links.map((link) => [link.groupId, link]));
    const jobs: TeamsDeliveryJob[] = [];
    for (const { record, event } of candidates) {
      const link = linkByGroup.get(record.groupId as string);
      if (!link || !link.events.includes(event as string)) continue;
      jobs.push({ target: 'channel', teamsConversationId: link.teamsConversationId, notificationId: record.id, groupId: link.groupId });
    }
    return jobs;
  }
}
