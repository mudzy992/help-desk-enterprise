import { ticketSystemEventActions } from './collaboration.constants';
import { ticketStatusChangeSystemEvent } from './ticket-status-change-system-event';

describe('ticketStatusChangeSystemEvent', () => {
  it('emits waiting, resolved, and closed events only on those transitions', () => {
    expect(ticketStatusChangeSystemEvent('IN_PROGRESS', 'WAITING_FOR_USER')).toBe(
      ticketSystemEventActions.waitingForUserEntered,
    );
    expect(ticketStatusChangeSystemEvent('IN_PROGRESS', 'RESOLVED')).toBe(
      ticketSystemEventActions.resolved,
    );
    expect(ticketStatusChangeSystemEvent('RESOLVED', 'CLOSED')).toBe(
      ticketSystemEventActions.closed,
    );
    expect(ticketStatusChangeSystemEvent('IN_PROGRESS', 'IN_PROGRESS')).toBeNull();
    expect(ticketStatusChangeSystemEvent('PENDING', 'ASSIGNED')).toBeNull();
  });
});
