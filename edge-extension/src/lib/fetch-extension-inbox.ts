import { helpdeskRequest } from './helpdesk-http';
import type { ExtensionInboxTicket } from './extension-messages';
import { isOpenRequesterTicket } from './filter-extension-chat';

type TicketListItem = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly requesterId: string;
};

export async function fetchExtensionInbox(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly subjectId: string;
}): Promise<readonly ExtensionInboxTicket[]> {
  const tickets = await helpdeskRequest<readonly TicketListItem[]>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/tickets',
  });
  return tickets
    .filter((ticket) =>
      isOpenRequesterTicket({
        requesterId: ticket.requesterId,
        subjectId: input.subjectId,
        status: ticket.status,
      }),
    )
    .map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
    }));
}
