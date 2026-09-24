/**
 * Phase 4.1 (plan §4.1): ticket realtime events that the **worker** produces (the
 * archive and waiting-for-user sweeps publish system messages and status changes)
 * have to reach the API process, because only the API owns the Socket.IO server.
 *
 * This is the same bridge pattern the integration queue already uses for edge
 * events (`PublishEdgeEventToRedisService` + `EdgeEventRealtimeSubscriber`): the
 * worker publishes to one Redis channel, the API subscribes once and re-publishes
 * into the in-process hub that the gateways listen on. Without it, moving the
 * sweeps to the worker would silently drop every live update for tickets they touch.
 */
export const ticketRealtimeBridgeChannel = 'tickets:realtime-bridge';
