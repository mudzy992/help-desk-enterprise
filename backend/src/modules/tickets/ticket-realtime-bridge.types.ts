import type { TicketRealtimeMessagePayload } from './collaboration.types';
import type { TicketUpdatedRealtimePayload } from './ticket-realtime.types';

export type TicketRealtimeBridgePublish =
  | { readonly kind: 'message'; readonly payload: TicketRealtimeMessagePayload }
  | { readonly kind: 'updated'; readonly payload: TicketUpdatedRealtimePayload };
