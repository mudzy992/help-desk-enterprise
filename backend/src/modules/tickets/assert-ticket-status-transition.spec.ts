import { assertTicketStatusTransition } from './assert-ticket-status-transition';
import { allowedTicketStatusTransitions } from './tickets.constants';
import { TicketsError } from './tickets.error';

describe('ticket status transitions', () => {
  it('allows the documented workflow matrix', () => {
    expect(allowedTicketStatusTransitions.PENDING).toEqual([
      'ASSIGNED',
      'IN_PROGRESS',
      'PENDING_APPROVAL',
      'CLOSED',
    ]);
    // Review 2026-09-25: duplicate / spam / withdrawn tickets close directly.
    expect(() => assertTicketStatusTransition('PENDING', 'CLOSED')).not.toThrow();
    expect(() => assertTicketStatusTransition('ASSIGNED', 'CLOSED')).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('PENDING', 'IN_PROGRESS'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('IN_PROGRESS', 'RESOLVED'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('WAITING_FOR_USER', 'CLOSED'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('RESOLVED', 'CLOSED'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('UNROUTED', 'PENDING'),
    ).not.toThrow();
  });

  it('rejects jumps that skip the workflow', () => {
    expect(() => assertTicketStatusTransition('PENDING', 'RESOLVED')).toThrow(
      TicketsError,
    );
    expect(() =>
      assertTicketStatusTransition('ASSIGNED', 'RESOLVED'),
    ).toThrow(/INVALID_STATUS_TRANSITION/);
    expect(() =>
      assertTicketStatusTransition('UNROUTED', 'IN_PROGRESS'),
    ).toThrow(TicketsError);
    expect(() =>
      assertTicketStatusTransition('CLOSED', 'PENDING'),
    ).toThrow(TicketsError);
    expect(() =>
      assertTicketStatusTransition('ARCHIVED', 'IN_PROGRESS'),
    ).toThrow(TicketsError);
  });
});
