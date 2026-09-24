import { Counter, Gauge, Trend } from 'k6/metrics';

/**
 * Custom metrics that map one-to-one onto the phase gates in
 * PERFORMANCE_PHASE_PLAN.md, so a load-test report can be read against the
 * plan without post-processing.
 */
export const performanceMetrics = {
  ticketsList: new Trend('tickets_list_duration', true),
  ticketDetail: new Trend('ticket_detail_duration', true),
  ticketMessage: new Trend('ticket_message_duration', true),
  unreadCount: new Trend('unread_count_duration', true),
  search: new Trend('search_duration', true),
  dashboardSummary: new Trend('dashboard_summary_duration', true),

  ticketListPayload: new Trend('ticket_list_payload_kb'),
  dashboardPayload: new Trend('dashboard_payload_kb'),

  unreadCountRequests: new Counter('unread_count_requests'),
  searchRequests: new Counter('search_requests'),
  wsEventsReceived: new Counter('ws_events_received'),
  wsConnectErrors: new Counter('ws_connect_errors'),
  wsClients: new Gauge('ws_clients'),
};

/** Registers a response under the trend that matches its endpoint. */
export function recordResponse(endpoint, response, config) {
  const duration = response.timings.duration;
  switch (endpoint) {
    case 'tickets.list':
      performanceMetrics.ticketsList.add(duration);
      performanceMetrics.ticketListPayload.add(
        Number((response.body ? response.body.length : 0) / 1024),
      );
      break;
    case 'tickets.detail':
      performanceMetrics.ticketDetail.add(duration);
      break;
    case 'tickets.message':
      performanceMetrics.ticketMessage.add(duration);
      break;
    case 'notifications.unreadCount':
      performanceMetrics.unreadCount.add(duration);
      performanceMetrics.unreadCountRequests.add(1);
      break;
    case 'search.query':
      performanceMetrics.search.add(duration);
      performanceMetrics.searchRequests.add(1);
      break;
    case 'reports.dashboardSummary':
      performanceMetrics.dashboardSummary.add(duration);
      performanceMetrics.dashboardPayload.add(
        Number((response.body ? response.body.length : 0) / 1024),
      );
      break;
    default:
      break;
  }
  return config;
}
