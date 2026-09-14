export const teamsStubEventTypes = [
  'ticket.created',
  'ticket.assigned',
  'ticket.message',
  'ticket.resolved',
  'ticket.closed',
] as const;

export type TeamsStubEventType = (typeof teamsStubEventTypes)[number];

export function isTeamsStubEventType(
  value: string,
): value is TeamsStubEventType {
  return (teamsStubEventTypes as readonly string[]).includes(value);
}
