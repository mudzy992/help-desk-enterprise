import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EnqueueIntegrationJobService } from '../../integration-queue/enqueue-integration-job.service';
import { SettingsService } from '../../settings/settings.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { TicketRealtimeHub } from '../../tickets/ticket-realtime.hub';
import { enqueueTeamsStubIfEnabled } from './enqueue-teams-stub-if-enabled';

@Injectable()
export class TeamsIntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamsIntegrationService.name);
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly ticketRealtimeHub: TicketRealtimeHub,
    private readonly settingsService: SettingsService,
    private readonly enqueueIntegrationJobService: EnqueueIntegrationJobService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.ticketRealtimeHub.subscribe((payload) => {
      void this.ingest(payload);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async ingest(payload: TicketRealtimeMessagePayload): Promise<void> {
    try {
      await enqueueTeamsStubIfEnabled({
        settingsService: this.settingsService,
        enqueueIntegrationJobService: this.enqueueIntegrationJobService,
        payload,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue Teams stub for ticket ${payload.ticketId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
