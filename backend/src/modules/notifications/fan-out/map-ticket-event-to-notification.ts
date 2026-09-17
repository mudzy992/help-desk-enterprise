import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../../tickets/collaboration.types';
import {
  notificationTypes,
  type NotificationType,
} from '../notifications.constants';

export type MappedTicketNotification = {
  readonly type: NotificationType;
  readonly event: string;
};

const systemEventTypes: Readonly<Record<string, NotificationType>> = {
  [ticketSystemEventActions.created]: notificationTypes.ticketCreated,
  [ticketSystemEventActions.assigned]: notificationTypes.ticketAssigned,
  [ticketSystemEventActions.claimed]: notificationTypes.ticketAssigned,
  [ticketSystemEventActions.approvalRequested]: notificationTypes.ticketApproval,
  [ticketSystemEventActions.approvalApproved]: notificationTypes.ticketApproval,
  [ticketSystemEventActions.approvalRejected]: notificationTypes.ticketApproval,
  [ticketSystemEventActions.resolved]: notificationTypes.ticketResolved,
  [ticketSystemEventActions.closed]: notificationTypes.ticketClosed,
  [ticketSystemEventActions.slaResponseBreached]: notificationTypes.ticketSla,
  [ticketSystemEventActions.slaResolutionBreached]: notificationTypes.ticketSla,
  [ticketSystemEventActions.slaResponseAtRisk]: notificationTypes.ticketSla,
  [ticketSystemEventActions.slaResolutionAtRisk]: notificationTypes.ticketSla,
  [ticketSystemEventActions.slaResponseEscalated]: notificationTypes.ticketSla,
  [ticketSystemEventActions.slaResolutionEscalated]: notificationTypes.ticketSla,
  [ticketSystemEventActions.remoteRequested]: notificationTypes.remoteRequested,
};

export function mapTicketEventToNotification(
  payload: TicketRealtimeMessagePayload,
): MappedTicketNotification | null {
  if (payload.type === 'USER_REPLY' || payload.type === 'AGENT_REPLY') {
    return { type: notificationTypes.ticketMessage, event: payload.type };
  }
  if (payload.type !== 'SYSTEM_EVENT') {
    return null;
  }
  const action = payload.body.split(':')[0] ?? payload.body;
  const type = systemEventTypes[action];
  if (type === undefined) {
    return null;
  }
  return { type, event: action };
}
