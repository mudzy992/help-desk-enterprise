import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { IntegrationJobType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EnqueueIntegrationJobService } from '../../integration-queue/enqueue-integration-job.service';
import { isQueuedIntegrationJobType } from '../../integration-queue/parse-integration-queue-types';
import { loadIntegrationQueueSettings } from '../../integration-queue/load-integration-queue-settings';
import { SettingsService } from '../../settings/settings.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { fanOutEmailNotifications } from '../email/fan-out-email-notifications';
import { loadEmailChannelConfiguration } from '../email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../email/mail-transport';
import {
  clearSlaRuntimeNotificationChannels,
  registerSlaRuntimeNotificationChannels,
} from './dispatch-sla-runtime-notification';
import { fanOutInAppNotifications } from './fan-out-in-app-notifications';
import { publishCreatedNotifications } from './publish-created-notifications';
import { NotificationUnreadCountCache } from '../notification-unread-count.cache';
import { enqueueEdgeNotificationEvents } from './enqueue-edge-notification-events';

@Injectable()
export class NotificationsFanOutService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsFanOutService.name);
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
    private readonly settingsService: SettingsService,
    private readonly enqueueIntegrationJobService: EnqueueIntegrationJobService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
    private readonly unreadCountCache: NotificationUnreadCountCache,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.ticketRealtimeHub.subscribe((payload) => {
      void this.ingest(payload);
    });
    registerSlaRuntimeNotificationChannels({
      publish: (payload) => {
        void this.ingest(payload);
      },
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    clearSlaRuntimeNotificationChannels();
  }

  private async ingest(payload: TicketRealtimeMessagePayload): Promise<void> {
    await this.persistInApp(payload);
    await this.deliverEmail(payload);
  }

  private async persistInApp(
    payload: TicketRealtimeMessagePayload,
  ): Promise<void> {
    try {
      const created = await fanOutInAppNotifications(this.prisma, payload);
      await publishCreatedNotifications(
        this.prisma,
        this.ticketRealtimeHub,
        created,
        (userId) => this.unreadCountCache.invalidate(userId),
        (groupId) => this.unreadCountCache.bumpGroup(groupId),
      );
      await enqueueEdgeNotificationEvents({
        prisma: this.prisma,
        settingsService: this.settingsService,
        enqueueIntegrationJobService: this.enqueueIntegrationJobService,
        records: created,
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist in-app notification for ticket ${payload.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async deliverEmail(
    payload: TicketRealtimeMessagePayload,
  ): Promise<void> {
    try {
      const configuration = await loadEmailChannelConfiguration(
        this.settingsService,
      );
      const queueSettings = await loadIntegrationQueueSettings(
        this.settingsService,
      );
      const queueEmail =
        queueSettings.enabled &&
        isQueuedIntegrationJobType(
          IntegrationJobType.EMAIL,
          queueSettings.typeTokens,
        );
      await fanOutEmailNotifications(
        this.prisma,
        configuration,
        this.mailTransport,
        payload,
        queueEmail
          ? {
              handle: async (work) => {
                await this.enqueueIntegrationJobService.enqueue({
                  type: IntegrationJobType.EMAIL,
                  payload: work,
                });
              },
            }
          : undefined,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send notification email for ticket ${payload.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
