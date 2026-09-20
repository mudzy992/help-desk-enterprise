import { extensionVersion } from './extension-messages';
import { helpdeskRequest } from './helpdesk-http';

/**
 * Odgovor `GET /edge-extension/bootstrap` — server svaku "pustio/nije pustio"
 * odluku spušta klijentu (kill switch, addon/modul flagovi, domen, verzija).
 * Ugovor 1:1 sa backend `EdgeExtensionService.buildBootstrap`.
 */
export type EdgeExtensionBootstrap = {
  readonly allowed: boolean;
  readonly reason: string;
  readonly deskPublicUrl: string;
  readonly wsEnabled: boolean;
  readonly reconnectMaxBackoffSeconds: number;
  readonly pollingFallbackEnabled: boolean;
  readonly pollingIntervalSeconds: number;
  readonly redactedPreviews: boolean;
  readonly receiptsEnabled: boolean;
  readonly dedupEnabled: boolean;
  readonly minClientVersion: string | null;
  readonly allowedEmailDomain: string | null;
  readonly subjectId: string;
  readonly chatEnabled: boolean;
  readonly chatMaxMessagesPerTicket: number;
  readonly attachmentsEnabled: boolean;
  readonly remoteEnabled: boolean;
  readonly remoteRateLimitMinutesPerTicket: number;
  readonly requireUserClickToOpenQuickAssist: boolean;
  readonly auditAcknowledge: boolean;
};

export async function fetchEdgeBootstrap(input: {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
}): Promise<EdgeExtensionBootstrap> {
  const query = new URLSearchParams({ extensionVersion });
  return helpdeskRequest<EdgeExtensionBootstrap>({
    apiBaseUrl: input.apiBaseUrl,
    accessToken: input.accessToken,
    path: `/edge-extension/bootstrap?${query.toString()}`,
  });
}
