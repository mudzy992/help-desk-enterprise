import { helpdeskRequest } from './helpdesk-http';
import type { ExtensionThreadMessage } from './extension-messages';
import { filterExtensionChatMessages } from './filter-extension-chat';

export async function fetchExtensionThread(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly ticketId: string;
  readonly maxMessages: number;
}): Promise<readonly ExtensionThreadMessage[]> {
  const messages = await helpdeskRequest<readonly ExtensionThreadMessage[]>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: `/tickets/${input.ticketId}/messages`,
  });
  return filterExtensionChatMessages(messages, input.maxMessages);
}

export async function sendExtensionReply(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly ticketId: string;
  readonly body: string;
}): Promise<ExtensionThreadMessage> {
  return helpdeskRequest<ExtensionThreadMessage>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    method: 'POST',
    path: `/tickets/${input.ticketId}/messages`,
    body: { type: 'USER_REPLY', body: input.body },
  });
}

export async function acknowledgeRemoteRequest(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly ticketId: string;
}): Promise<void> {
  await helpdeskRequest({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    method: 'POST',
    path: `/edge-extension/remote-requests/${input.ticketId}/acknowledge`,
  });
}

export async function fetchPendingRemoteTicketIds(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<readonly string[]> {
  const response = await helpdeskRequest<{ ticketIds: readonly string[] }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/edge-extension/remote-requests/pending',
  });
  return response.ticketIds;
}
