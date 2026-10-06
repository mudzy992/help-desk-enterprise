import { defaultServiceFormsConfiguration } from '../service-catalog/service-forms.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
  vpnFormSchema,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService GET form', () => {
  it('returns the ticket-bound form schema and submitted values without writing', async () => {
    const { tickets, memory } = createTicketsServiceHarness();
    const actor = { actorUserId: ticketsTestIds.requester };
    const ticket = await tickets.create(vpnCreateInput(), actor);
    const changesBeforeRead = memory.changeLogs.length;
    const auditBeforeRead = memory.auditLogs.length;

    await expect(tickets.getFormById(ticket.id, actor)).resolves.toEqual({
      ticketId: ticket.id,
      serviceId: ticketsTestIds.serviceVpn,
      formVersionRef: ticketsTestIds.formVpnV1,
      schema: vpnFormSchema,
      formData: { asset_tag: 'LPT-001' },
    });
    expect(memory.changeLogs).toHaveLength(changesBeforeRead);
    expect(memory.auditLogs).toHaveLength(auditBeforeRead);
  });

  it('returns a nullable schema and binding for a ticket created without forms', async () => {
    const { tickets } = createTicketsServiceHarness({
      ...defaultServiceFormsConfiguration,
      enabled: false,
    });
    const actor = { actorUserId: ticketsTestIds.requester };
    const ticket = await tickets.create(vpnCreateInput({ formData: {} }), actor);

    await expect(tickets.getFormById(ticket.id, actor)).resolves.toEqual({
      ticketId: ticket.id,
      serviceId: ticketsTestIds.serviceVpn,
      formVersionRef: null,
      schema: null,
      formData: {},
    });
  });

  it('uses the same visibility authorization as ticket detail', async () => {
    const { tickets } = createTicketsServiceHarness();
    const ticket = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });

    await expect(
      tickets.getFormById(ticket.id, { actorUserId: ticketsTestIds.agentHr }),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });
});
