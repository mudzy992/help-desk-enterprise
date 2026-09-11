import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createRoutedVpnTicket,
  createTicketsAttachmentsHarness,
} from './create-tickets-attachments-harness';
import { ticketsTestIds } from './create-tickets-service-harness';
import { attachmentUpload, pngFixture } from './attachments-test-fixtures';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsAttachmentsService authorization and classification', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };

  it('enforces upload/download permissions and OU/service scope', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('diagram.png', pngFixture),
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.attachments.list(ticketId, requester),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('diagram.png', pngFixture),
        agentHr,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    harness.contexts.set(
      ticketsTestIds.agentIt,
      createTestAuthorizationContext({
        subjectId: ticketsTestIds.agentIt,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            organizationalUnitId: ticketsTestIds.ouIt,
            organizationalUnitPath: '/Korisnici/IT',
            serviceId: ticketsTestIds.serviceDraft,
            permissionKeys: [
              permissionKeys.ticketAttachmentsUpload,
              permissionKeys.ticketAttachmentsDownload,
            ],
          }),
        ],
      }),
    );
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('diagram.png', pngFixture),
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('rejects unauthorized download of another ticket attachment', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const created = await harness.attachments.upload(
      ticketId,
      attachmentUpload('diagram.png', pngFixture),
      agentIt,
    );
    await expect(
      harness.attachments.download(ticketId, created.id, requester),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.attachments.download(ticketId, created.id, agentHr),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.attachments.remove(ticketId, created.id, agentHr),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('inherits ticket classification and refuses a downgrade', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const inherited = await harness.attachments.upload(
      ticketId,
      attachmentUpload('diagram.png', pngFixture),
      agentIt,
    );
    expect(inherited.classification).toBe('INTERNAL');
    const current = harness.memory.tickets.get(ticketId);
    if (current === undefined) {
      throw new Error('ticket missing');
    }
    harness.memory.tickets.set(ticketId, {
      ...current,
      classification: 'RESTRICTED',
    });
    const raised = await harness.attachments.list(ticketId, agentIt);
    expect(raised[0]?.classification).toBe('RESTRICTED');
    expect([...harness.memory.attachments.values()][0]?.classification).toBe(
      'RESTRICTED',
    );
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('lower.png', pngFixture, {
          requestedClassification: 'INTERNAL',
        }),
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'CLASSIFICATION_DOWNGRADE' } });
    const stricter = await harness.attachments.upload(
      ticketId,
      attachmentUpload('locked.png', pngFixture, {
        requestedClassification: 'RESTRICTED',
      }),
      agentIt,
    );
    expect(stricter.classification).toBe('RESTRICTED');
  });
});
