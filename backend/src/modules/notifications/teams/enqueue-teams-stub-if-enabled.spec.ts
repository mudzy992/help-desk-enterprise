import { IntegrationJobType } from '../../../generated/prisma/enums';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import { enqueueTeamsStubIfEnabled } from './enqueue-teams-stub-if-enabled';

function createdPayload(): TicketRealtimeMessagePayload {
  return {
    id: 'msg-1',
    ticketId: 'ticket-1',
    type: 'SYSTEM_EVENT',
    body: ticketSystemEventActions.created,
    authorUserId: 'user-1',
    createdAt: '2026-09-14T08:00:00.000Z',
    requesterId: 'user-1',
    assignedGroupId: 'group-1',
    visibility: 'public',
  };
}

function createSettings(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'private.integrations.teams.stubEnabled': false,
    'private.integrations.teams.eventTypesCsv': '',
    'private.integrations.queue.enabled': true,
    'private.integrations.queue.typesCsv': 'email,edge,teams',
    'private.integrations.queue.maxAttempts': 10,
    'private.integrations.queue.initialBackoffSeconds': 60,
    'private.integrations.queue.maxBackoffSeconds': 3600,
    'private.integrations.queue.deadLetterAfterAttempts': 10,
    'private.integrations.queue.deadLetterRetentionDays': 30,
    'private.integrations.queue.workerPollSeconds': 5,
    'private.integrations.queue.adminUiEnabled': true,
    ...overrides,
  };
  return {
    getSetting: jest.fn(async (key: string) => values[key]),
  };
}

describe('enqueueTeamsStubIfEnabled', () => {
  it('does not create a job when the stub flag is off', async () => {
    const enqueue = { enqueue: jest.fn() };
    const created = await enqueueTeamsStubIfEnabled({
      settingsService: createSettings() as never,
      enqueueIntegrationJobService: enqueue as never,
      payload: createdPayload(),
    });
    expect(created).toBe(false);
    expect(enqueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not create a job when the event type is not in eventTypesCsv', async () => {
    const enqueue = { enqueue: jest.fn() };
    const created = await enqueueTeamsStubIfEnabled({
      settingsService: createSettings({
        'private.integrations.teams.stubEnabled': true,
        'private.integrations.teams.eventTypesCsv': 'ticket.assigned',
      }) as never,
      enqueueIntegrationJobService: enqueue as never,
      payload: createdPayload(),
    });
    expect(created).toBe(false);
    expect(enqueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not create a job when eventTypesCsv is empty', async () => {
    const enqueue = { enqueue: jest.fn() };
    const created = await enqueueTeamsStubIfEnabled({
      settingsService: createSettings({
        'private.integrations.teams.stubEnabled': true,
      }) as never,
      enqueueIntegrationJobService: enqueue as never,
      payload: createdPayload(),
    });
    expect(created).toBe(false);
    expect(enqueue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues TEAMS_STUB when the flag is on and the event is allowed', async () => {
    const enqueue = { enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const created = await enqueueTeamsStubIfEnabled({
      settingsService: createSettings({
        'private.integrations.teams.stubEnabled': true,
        'private.integrations.teams.eventTypesCsv': 'ticket.created',
      }) as never,
      enqueueIntegrationJobService: enqueue as never,
      payload: createdPayload(),
    });
    expect(created).toBe(true);
    expect(enqueue.enqueue).toHaveBeenCalledWith({
      type: IntegrationJobType.TEAMS_STUB,
      payload: {
        eventType: 'ticket.created',
        event: ticketSystemEventActions.created,
        ticketId: 'ticket-1',
        messageId: 'msg-1',
      },
    });
  });
});
