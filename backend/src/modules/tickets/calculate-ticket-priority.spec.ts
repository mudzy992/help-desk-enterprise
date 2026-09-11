import { calculateTicketPriority } from './calculate-ticket-priority';

describe('calculateTicketPriority', () => {
  it('uses one deterministic impact + urgency score', () => {
    expect(calculateTicketPriority('LOW', 'LOW')).toBe('LOW');
    expect(calculateTicketPriority('LOW', 'MEDIUM')).toBe('MEDIUM');
    expect(calculateTicketPriority('LOW', 'HIGH')).toBe('MEDIUM');
    expect(calculateTicketPriority('LOW', 'CRITICAL')).toBe('HIGH');
    expect(calculateTicketPriority('MEDIUM', 'MEDIUM')).toBe('MEDIUM');
    expect(calculateTicketPriority('MEDIUM', 'HIGH')).toBe('HIGH');
    expect(calculateTicketPriority('HIGH', 'HIGH')).toBe('HIGH');
    expect(calculateTicketPriority('HIGH', 'CRITICAL')).toBe('CRITICAL');
    expect(calculateTicketPriority('CRITICAL', 'CRITICAL')).toBe('CRITICAL');
  });
});
