import { helpdeskRequest } from './helpdesk-http';
import type { ExtensionThreadMessage } from './extension-messages';
import {
  filterExtensionChatMessages,
  normalizeThreadMessage,
} from './filter-extension-chat';

/**
 * REST ugovor prema ticket modulu (quick reply + remote lifecycle).
 * Svi pozivi nose Session JWT; guards: Session + Role USER+ (bez OU guarda).
 */
export async function fetchExtensionThread(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly ticketId: string;
  readonly maxMessages: number;
}): Promise<readonly ExtensionThreadMessage[]> {
  const response = await helpdeskRequest<unknown>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: `/tickets/${encodeURIComponent(input.ticketId)}/messages`,
  });
  const raws = readMessageArray(response);
  const normalized = raws
    .map((raw) => normalizeThreadMessage(raw))
    .filter(
      (message): message is ExtensionThreadMessage => message !== null,
    );
  return filterExtensionChatMessages(normalized, input.maxMessages);
}

export async function sendExtensionReply(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly ticketId: string;
  readonly body: string;
}): Promise<ExtensionThreadMessage> {
  const response = await helpdeskRequest<unknown>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    method: 'POST',
    path: `/tickets/${encodeURIComponent(input.ticketId)}/messages`,
    body: { type: 'USER_REPLY', body: input.body },
  });
  return (
    normalizeThreadMessage(response) ?? {
      id: `local-${Date.now()}`,
      type: 'USER_REPLY',
      body: input.body,
      createdAt: new Date().toISOString(),
      authorUserId: null,
      authorName: null,
    }
  );
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
    path: `/edge-extension/remote-requests/${encodeURIComponent(input.ticketId)}/acknowledge`,
  });
}

export async function fetchPendingRemoteTicketIds(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<readonly string[]> {
  const response = await helpdeskRequest<{ readonly ticketIds?: unknown }>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: '/edge-extension/remote-requests/pending',
  });
  if (!Array.isArray(response.ticketIds)) {
    return [];
  }
  return response.ticketIds.filter(
    (item): item is string => typeof item === 'string',
  );
}

function readMessageArray(response: unknown): readonly unknown[] {
  if (Array.isArray(response)) {
    return response;
  }
  if (typeof response === 'object' && response !== null) {
    const items = (response as { readonly items?: unknown }).items;
    if (Array.isArray(items)) {
      return items;
    }
  }
  return [];
}
