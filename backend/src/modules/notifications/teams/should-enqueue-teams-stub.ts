import { isTeamsStubEventType } from './teams-stub-event-types';

export function shouldEnqueueTeamsStub(input: {
  readonly stubEnabled: boolean;
  readonly queueEnabled: boolean;
  readonly teamsQueued: boolean;
  readonly eventType: string | null;
  readonly allowedEventTypes: ReadonlySet<string>;
}): boolean {
  if (!input.stubEnabled || !input.queueEnabled || !input.teamsQueued) {
    return false;
  }
  if (input.eventType === null || !isTeamsStubEventType(input.eventType)) {
    return false;
  }
  return input.allowedEventTypes.has(input.eventType);
}
