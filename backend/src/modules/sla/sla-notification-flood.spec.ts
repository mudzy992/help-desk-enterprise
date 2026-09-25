jest.mock('./record-ticket-sla-runtime-event', () => ({
  recordTicketSlaRuntimeEvent: jest.fn(async () => undefined),
}));

import type { PrismaService } from '../../common/prisma/prisma.service';
import { resolveNotificationAudience } from '../notifications/fan-out/resolve-notification-recipients';
import { notificationTypes } from '../notifications/notifications.constants';
import type { TicketRecord } from '../tickets/tickets.types';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import {
  emitTicketSlaRuntimeEvents,
  emptyTicketSlaRuntimeMarks,
} from './emit-ticket-sla-runtime-events';
import { recordTicketSlaRuntimeEvent } from './record-ticket-sla-runtime-event';
import type { TicketSlaStateRecord } from './ticket-sla.types';

const prisma = {} as PrismaService;

describe('SLA notification flood (staging 2026-09-25)', () => {
  beforeEach(() => jest.mocked(recordTicketSlaRuntimeEvent).mockClear());

  it('skips "at risk" for a clock that breaches in the same evaluation', async () => {
    const next = {
      ...emptyTicketSlaRuntimeMarks,
      isResponseAtRisk: true,
      isResponseBreached: true,
      isResolutionAtRisk: true,
      isResolutionBreached: false,
      firedEscalationKeys: [],
    } as unknown as TicketSlaStateRecord;
    await emitTicketSlaRuntimeEvents(prisma, {
      ticketId: 't1',
      previous: emptyTicketSlaRuntimeMarks,
      next,
      rules: [],
    });
    const reasons = jest
      .mocked(recordTicketSlaRuntimeEvent)
      .mock.calls.map(([, input]) => input.action);
    expect(reasons).toHaveLength(2);
    expect(reasons.some((a) => String(a).includes('response_at_risk'))).toBe(false);
    expect(reasons.some((a) => String(a).includes('resolution_at_risk'))).toBe(true);
    expect(reasons.some((a) => String(a).includes('response_breached'))).toBe(true);
  });

  it('sends SLA breach as one group row plus the assignee, not a row per member', async () => {
    const ticket = {
      id: 't1',
      assignedGroupId: 'g1',
      assignedUserId: 'u-assignee',
      requesterId: 'u-req',
    } as unknown as TicketRecord;
    const audience = await resolveNotificationAudience(prisma, {
      type: notificationTypes.ticketSla,
      ticket,
      actorUserId: null,
      event: ticketSystemEventActions.slaResponseBreached,
    });
    expect(audience.userIds).toEqual(['u-assignee']);
    expect(audience.group).toEqual({ groupId: 'g1', excludedUserIds: ['u-assignee'] });
  });
});
