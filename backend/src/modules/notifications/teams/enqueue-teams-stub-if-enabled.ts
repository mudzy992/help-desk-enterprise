import { IntegrationJobType } from '../../../generated/prisma/enums';
import { EnqueueIntegrationJobService } from '../../integration-queue/enqueue-integration-job.service';
import { isQueuedIntegrationJobType } from '../../integration-queue/parse-integration-queue-types';
import { loadIntegrationQueueSettings } from '../../integration-queue/load-integration-queue-settings';
import type { SettingsService } from '../../settings/settings.service';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { mapTicketEventToNotification } from '../fan-out/map-ticket-event-to-notification';
import { loadTeamsStubSettings } from './load-teams-stub-settings';
import { shouldEnqueueTeamsStub } from './should-enqueue-teams-stub';

export async function enqueueTeamsStubIfEnabled(input: {
  readonly settingsService: SettingsService;
  readonly enqueueIntegrationJobService: EnqueueIntegrationJobService;
  readonly payload: TicketRealtimeMessagePayload;
}): Promise<boolean> {
  const teams = await loadTeamsStubSettings(input.settingsService);
  if (!teams.stubEnabled) {
    return false;
  }
  const mapped = mapTicketEventToNotification(input.payload);
  if (mapped === null) {
    return false;
  }
  const queue = await loadIntegrationQueueSettings(input.settingsService);
  if (
    !shouldEnqueueTeamsStub({
      stubEnabled: teams.stubEnabled,
      queueEnabled: queue.enabled,
      teamsQueued: isQueuedIntegrationJobType(
        IntegrationJobType.TEAMS_STUB,
        queue.typeTokens,
      ),
      eventType: mapped.type,
      allowedEventTypes: teams.eventTypeTokens,
    })
  ) {
    return false;
  }
  await input.enqueueIntegrationJobService.enqueue({
    type: IntegrationJobType.TEAMS_STUB,
    payload: {
      eventType: mapped.type,
      event: mapped.event,
      ticketId: input.payload.ticketId,
      messageId: input.payload.id,
    },
  });
  return true;
}
