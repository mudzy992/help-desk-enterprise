import { resolveNotificationRecipients } from './resolve-notification-recipients';
import { notificationTypes } from '../notifications.constants';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../../tickets/create-tickets-service-harness';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('resolveNotificationRecipients SLA escalation targets', () => {
  it('notifies only the configured group members for an escalation', async () => {
    const harness = createTicketsServiceHarness();
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    const rule = await harness.memory.prisma.slaEscalationRule.create({
      data: {
        slaProfileId: 'profile-1',
        triggerOffsetMinutes: 0,
        targetGroupId: ticketsTestIds.groupIt,
      },
    });
    const recipients = await resolveNotificationRecipients(
      harness.memory.prisma as never,
      {
        type: notificationTypes.ticketSla,
        event: ticketSystemEventActions.slaResponseEscalated,
        messageBody: `${ticketSystemEventActions.slaResponseEscalated}:${rule.id}`,
        actorUserId: null,
        ticket: {
          id: 'ticket-1',
          assignedUserId: ticketsTestIds.requester,
          assignedGroupId: 'other-group',
          requesterId: ticketsTestIds.requester,
        } as never,
      },
    );
    expect(recipients).toEqual([ticketsTestIds.agentIt]);
  });

  it('notifies the configured user target for an escalation', async () => {
    const harness = createTicketsServiceHarness();
    const rule = await harness.memory.prisma.slaEscalationRule.create({
      data: {
        slaProfileId: 'profile-1',
        triggerOffsetMinutes: 15,
        targetUserId: ticketsTestIds.agentHr,
      },
    });
    const recipients = await resolveNotificationRecipients(
      harness.memory.prisma as never,
      {
        type: notificationTypes.ticketSla,
        event: ticketSystemEventActions.slaResolutionEscalated,
        messageBody: `${ticketSystemEventActions.slaResolutionEscalated}:${rule.id}`,
        actorUserId: null,
        ticket: {
          id: 'ticket-2',
          assignedUserId: ticketsTestIds.agentIt,
          assignedGroupId: ticketsTestIds.groupIt,
          requesterId: ticketsTestIds.requester,
        } as never,
      },
    );
    expect(recipients).toEqual([ticketsTestIds.agentHr]);
  });

  it('notifies role members for a role target escalation', async () => {
    const harness = createTicketsServiceHarness();
    const rule = await harness.memory.prisma.slaEscalationRule.create({
      data: {
        slaProfileId: 'profile-1',
        triggerOffsetMinutes: 5,
        targetRole: 'admin',
      },
    });
    Object.assign(harness.memory.prisma, {
      userRole: {
        findMany: async () => [{ userId: ticketsTestIds.adminIt }],
      },
    });
    const recipients = await resolveNotificationRecipients(
      harness.memory.prisma as never,
      {
        type: notificationTypes.ticketSla,
        event: ticketSystemEventActions.slaResponseEscalated,
        messageBody: `${ticketSystemEventActions.slaResponseEscalated}:${rule.id}`,
        actorUserId: null,
        ticket: {
          id: 'ticket-3',
          assignedUserId: ticketsTestIds.agentIt,
          assignedGroupId: ticketsTestIds.groupIt,
          requesterId: ticketsTestIds.requester,
        } as never,
      },
    );
    expect(recipients).toEqual([ticketsTestIds.adminIt]);
  });
});
