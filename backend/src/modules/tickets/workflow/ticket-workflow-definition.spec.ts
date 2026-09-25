import { allowedTicketStatusTransitions, ticketStatuses } from '../tickets.constants';
import { ticketWorkflowTransitions, workflowStatusPhases } from './ticket-workflow-definition';

describe('ticket workflow definition (package 1.7, W1)', () => {
  it('derives exactly the transition matrix enforced before package 1.7', () => {
    expect(allowedTicketStatusTransitions).toEqual({
      PENDING: ['ASSIGNED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED'],
      UNROUTED: ['PENDING', 'CLOSED'],
      PENDING_APPROVAL: ['PENDING', 'CLOSED'],
      ASSIGNED: ['IN_PROGRESS', 'PENDING', 'WAITING_FOR_USER', 'CLOSED'],
      IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED', 'ASSIGNED'],
      WAITING_FOR_USER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      RESOLVED: ['CLOSED', 'IN_PROGRESS'],
      CLOSED: ['ARCHIVED', 'IN_PROGRESS'],
      ARCHIVED: [],
    });
  });

  it('gives every transition an actor and a trigger, without duplicates', () => {
    const seen = new Set<string>();
    for (const transition of ticketWorkflowTransitions) {
      expect(transition.actors.length).toBeGreaterThan(0);
      expect(transition.triggers.length).toBeGreaterThan(0);
      const key = `${transition.from}>${transition.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('leaves only ARCHIVED without an exit and places every status in a phase', () => {
    for (const status of ticketStatuses) {
      expect(workflowStatusPhases[status]).toBeDefined();
      const exits = allowedTicketStatusTransitions[status].length;
      expect(exits === 0).toBe(status === 'ARCHIVED');
    }
  });
});
