import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultTicketAttachmentConfiguration } from './attachments/attachments.constants';
import { DiskTicketAttachmentStorage } from './attachments/disk-ticket-attachment-storage';
import { TicketsAttachmentsService } from './attachments/tickets-attachments.service';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

export function createTicketsAttachmentsHarness() {
  const harness = createTicketsServiceHarness();
  const uploadRoot = mkdtempSync(path.join(tmpdir(), 'ep-ticket-attachments-'));
  const attachments = new TicketsAttachmentsService(
    harness.memory.prisma as never,
    harness.authorizationContextLoader as never,
    {
      load: async () => ({ ...defaultTicketAttachmentConfiguration }),
    } as never,
    new DiskTicketAttachmentStorage(uploadRoot),
    harness.realtimeHub,
  );
  return { ...harness, attachments, uploadRoot };
}

export async function createRoutedVpnTicket(
  harness: ReturnType<typeof createTicketsAttachmentsHarness>,
): Promise<string> {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const ticket = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return ticket.id;
}

