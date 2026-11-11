import type { TicketRealtimeMessagePayload } from './collaboration.types';
import type {
  AnnouncementChangedRealtimePayload,
  TicketUpdatedRealtimePayload,
} from './ticket-realtime.types';

export type TicketRealtimeBridgePublish =
  | { readonly kind: 'message'; readonly payload: TicketRealtimeMessagePayload }
  | { readonly kind: 'updated'; readonly payload: TicketUpdatedRealtimePayload }
  | { readonly kind: 'announcement-changed'; readonly payload: AnnouncementChangedRealtimePayload };
