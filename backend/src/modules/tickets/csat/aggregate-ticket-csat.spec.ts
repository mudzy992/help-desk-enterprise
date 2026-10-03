import { aggregateTicketCsat, satisfiedMinRating } from './aggregate-ticket-csat';
import type { TicketCsatRecord } from './csat.types';
import type { TicketRecord } from '../tickets.types';

const baseTicket = {
  ticketNumber: 'T-1',
  title: 'VPN',
  description: 'down',
  status: 'CLOSED',
  priority: 'LOW',
  impact: 'LOW',
  urgency: 'LOW',
  classification: 'INTERNAL',
  isConfidential: false,
  formData: null,
  formVersionId: 'form-1',
  assignedUserId: null,
  parentTicketId: null,
  mergedIntoTicketId: null,
  reopenedFromTicketId: null,
  closeCodeId: null,
  resolutionNote: null,
  resolvedAt: null,
  closedAt: null,
  archivedAt: null,
  waitingForUserEnteredAt: null,
  waitingForUserReminderSentAt: null,
  firstResponseAt: null,
  createdAt: new Date('2026-09-11T12:00:00.000Z'),
  updatedAt: new Date('2026-09-11T12:00:00.000Z'),
} as const;

describe('aggregateTicketCsat', () => {
  it('groups ratings by origin unit, service, and handler group', () => {
    const summary = aggregateTicketCsat([
      row('t1', 'ou-it', 'svc-vpn', 'group-it', 5),
      row('t2', 'ou-it', 'svc-vpn', 'group-it', 3),
      row('t3', 'ou-hr', 'svc-leave', 'group-hr', 4),
    ], 5);
    expect(summary.count).toBe(3);
    expect(summary.average).toBeCloseTo(4);
    expect(summary.scaleMax).toBe(5);
    expect(summary.satisfiedMinRating).toBe(4);
    expect(summary.byOriginUnit).toEqual([
      { key: 'ou-hr', count: 1, average: 4 },
      { key: 'ou-it', count: 2, average: 4 },
    ]);
    expect(summary.byService.map((item) => item.key)).toEqual(['svc-leave', 'svc-vpn']);
    expect(summary.byGroup).toEqual([
      { key: 'group-hr', count: 1, average: 4 },
      { key: 'group-it', count: 2, average: 4 },
    ]);
  });
});

describe('satisfiedMinRating (val 1, M9/B3)', () => {
  it('čuva prag 4 na skali 5, a na skali 10 traži 8', () => {
    expect(satisfiedMinRating(5)).toBe(4);
    expect(satisfiedMinRating(10)).toBe(8);
    // Isti prag kao do sada: 80 % skale, nikad ispod 1.
    expect(satisfiedMinRating(2)).toBe(2);
    expect(satisfiedMinRating(0)).toBe(1);
  });
});

function row(
  id: string,
  originUnitId: string,
  serviceId: string,
  assignedGroupId: string,
  rating: number,
): { ticket: TicketRecord; submission: TicketCsatRecord } {
  return {
    ticket: {
      ...baseTicket,
      id,
      requesterId: 'user-1',
      originUnitId,
      serviceId,
      assignedGroupId,
    },
    submission: {
      id: `csat-${id}`,
      ticketId: id,
      rating,
      comment: null,
      submittedByUserId: 'user-1',
      createdAt: baseTicket.createdAt,
    },
  };
}
