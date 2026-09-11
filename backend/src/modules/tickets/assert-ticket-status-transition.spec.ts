import { assertTicketStatusTransition } from './assert-ticket-status-transition';
import { allowedTicketStatusTransitions } from './tickets.constants';
import { TicketsError } from './tickets.error';

describe('ticket status transitions', () => {
  it('allows the documented workflow matrix', () => {
    expect(allowedTicketStatusTransitions.PENDING).toEqual([
      'ASSIGNED',
      'IN_PROGRESS',
      'PENDING_APPROVAL',
    ]);
    expect(() =>
      assertTicketStatusTransition('PENDING', 'IN_PROGRESS'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('IN_PROGRESS', 'RESOLVED'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('RESOLVED', 'CLOSED'),
    ).not.toThrow();
    expect(() =>
      assertTicketStatusTransition('UNROUTED', 'PENDING'),
    ).not.toThrow();
  });

  it('rejects jumps that skip the workflow', () => {
    expect(() => assertTicketStatusTransition('PENDING', 'CLOSED')).toThrow(
      TicketsError,
    );
    expect(() =>
      assertTicketStatusTransition('PENDING', 'CLOSED'),
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
