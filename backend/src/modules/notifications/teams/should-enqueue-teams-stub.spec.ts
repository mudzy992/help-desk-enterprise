import { shouldEnqueueTeamsStub } from './should-enqueue-teams-stub';

describe('shouldEnqueueTeamsStub', () => {
  const allowed = new Set(['ticket.created', 'ticket.assigned']);

  it('returns false when the stub flag is off', () => {
    expect(
      shouldEnqueueTeamsStub({
        stubEnabled: false,
        queueEnabled: true,
        teamsQueued: true,
        eventType: 'ticket.created',
        allowedEventTypes: allowed,
      }),
    ).toBe(false);
  });

  it('returns false when the event type is not in the CSV allow-list', () => {
    expect(
      shouldEnqueueTeamsStub({
        stubEnabled: true,
        queueEnabled: true,
        teamsQueued: true,
        eventType: 'ticket.message',
        allowedEventTypes: allowed,
      }),
    ).toBe(false);
  });

  it('returns true when flag, queue, and event type all match', () => {
    expect(
      shouldEnqueueTeamsStub({
        stubEnabled: true,
        queueEnabled: true,
        teamsQueued: true,
        eventType: 'ticket.created',
        allowedEventTypes: allowed,
      }),
    ).toBe(true);
  });
});
