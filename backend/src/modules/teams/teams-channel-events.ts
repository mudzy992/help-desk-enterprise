import type { TeamsChannelEvent } from './teams.constants';

/** Paket 3.1 (§12): which channel event a group notification represents (null = not for channels). */
export function channelEventOf(type: string, event: string): TeamsChannelEvent | null {
  switch (type) {
    case 'ticket.created':
      return 'ticket.created_in_group';
    case 'ticket.assigned':
    case 'ticket.forwarded':
      return 'ticket.assigned_in_group';
    case 'ticket.sla':
      return event.includes('breached') ? 'sla.breached' : 'sla.warning';
    default:
      return null;
  }
}
