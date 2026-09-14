import { extensionVersion } from './extension-messages';
import { helpdeskRequest } from './helpdesk-http';

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
