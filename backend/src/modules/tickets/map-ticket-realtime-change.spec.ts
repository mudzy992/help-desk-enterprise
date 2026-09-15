import { mapTicketRealtimeChange } from './map-ticket-realtime-change';
import { toTicketUpdatedPayload } from './to-ticket-updated-payload';
import type { TicketRecord } from './tickets.types';

describe('ticket realtime change mapping', () => {
  it('maps lifecycle system events and ignores chat replies', () => {
    expect(mapTicketRealtimeChange('SYSTEM_EVENT', 'ticket_assigned')).toBe(
      'assignment',
    );
    expect(mapTicketRealtimeChange('SYSTEM_EVENT', 'ticket_resolved')).toBe(
      'resolved',
    );
    expect(
      mapTicketRealtimeChange('SYSTEM_EVENT', 'ticket_sla_response_breached'),
    ).toBe('sla');
    expect(mapTicketRealtimeChange('APPROVAL_DECISION', null)).toBe('approval');
    expect(mapTicketRealtimeChange('AGENT_REPLY', null)).toBeNull();
    expect(mapTicketRealtimeChange('INTERNAL_NOTE', null)).toBeNull();
  });

  it('builds a slim ticket.updated payload without title or description', () => {
    const payload = toTicketUpdatedPayload(
      {
        id: 'msg-1',
        ticketId: 'ticket-1',
        type: 'SYSTEM_EVENT',
        body: 'ticket_closed',
        authorUserId: 'user-agent-it',
        createdAt: new Date('2026-09-13T08:00:00.000Z'),
      },
      {
        id: 'ticket-1',
        status: 'CLOSED',
        priority: 'HIGH',
        assignedUserId: 'user-agent-it',
        assignedGroupId: 'group-it',
        requesterId: 'user-requester',
        archivedAt: null,
        resolvedAt: new Date('2026-09-13T07:00:00.000Z'),
        closedAt: new Date('2026-09-13T08:00:00.000Z'),
        title: 'SECRET TITLE',
        description: 'SECRET BODY',
      } as TicketRecord,
    );
    expect(payload).toMatchObject({
      ticketId: 'ticket-1',
      change: 'closed',
      sourceAction: 'ticket_closed',
      requesterId: 'user-requester',
      visibility: 'public',
      occurredAt: '2026-09-13T08:00:00.000Z',
    });
    expect(JSON.stringify(payload)).not.toContain('SECRET');
  });
});
