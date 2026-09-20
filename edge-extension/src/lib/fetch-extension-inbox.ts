import { helpdeskRequest } from './helpdesk-http';
import type { ExtensionInboxTicket } from './extension-messages';
import { isOpenRequesterTicket } from './filter-extension-chat';

/**
 * `GET /tickets` → mini inbox.
 *
 * Inbox pravilo (F9-2 matrica): samo tiketi gdje je korisnik `requesterId`,
 * status ∉ {CLOSED, ARCHIVED}, sortirano po `updatedAt` desc.
 */
type TicketListItem = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority?: string;
  readonly updatedAt?: string;
  readonly requesterId: string;
};

export async function fetchExtensionInbox(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly subjectId: string;
}): Promise<readonly ExtensionInboxTicket[]> {
  const response = await helpdeskRequest<unknown>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/tickets',
  });
  const tickets = readTicketArray(response);
  return tickets
    .filter((ticket) =>
      isOpenRequesterTicket({
        requesterId: ticket.requesterId,
        subjectId: input.subjectId,
        status: ticket.status,
      }),
    )
    .map((ticket): ExtensionInboxTicket => {
      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        status: ticket.status,
        priority: typeof ticket.priority === 'string' ? ticket.priority : 'MEDIUM',
        updatedAt:
          typeof ticket.updatedAt === 'string'
            ? ticket.updatedAt
            : new Date().toISOString(),
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function readTicketArray(response: unknown): readonly TicketListItem[] {
  if (Array.isArray(response)) {
    return response.filter(isTicketListItem);
  }
  if (typeof response === 'object' && response !== null) {
    const items = (response as { readonly items?: unknown }).items;
    if (Array.isArray(items)) {
      return items.filter(isTicketListItem);
    }
  }
  return [];
}

function isTicketListItem(value: unknown): value is TicketListItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.ticketNumber === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.requesterId === 'string'
  );
}
