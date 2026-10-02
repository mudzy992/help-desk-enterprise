import type { BotCredentials, BotTokenClient } from './bot-token-client';
import { TeamsError } from './teams.error';
import type {
  TeamsConversationAddress,
  TeamsCreatePersonalConversationInput,
  TeamsOutboundActivity,
  TeamsSendResult,
  TeamsTransport,
} from './teams-transport';

/** Live transport: Bot Connector REST API v3 (protocol stays supported after the SDK retirement). */
export class BotConnectorTeamsTransport implements TeamsTransport {
  readonly mode = 'live' as const;

  constructor(
    private readonly fetchImplementation: typeof fetch,
    private readonly tokens: BotTokenClient,
    private readonly credentials: () => Promise<BotCredentials>,
  ) {}

  async createPersonalConversation(input: TeamsCreatePersonalConversationInput): Promise<TeamsConversationAddress> {
    const credentials = await this.credentials();
    const json = await this.call<{ id?: unknown }>(input.serviceUrl, 'v3/conversations', 'POST', {
      bot: { id: `28:${credentials.appId}` },
      members: [{ id: `29:${input.userAadObjectId}`, aadObjectId: input.userAadObjectId }],
      channelData: { tenant: { id: input.tenantId } },
      isGroup: false,
      tenantId: input.tenantId,
    });
    if (typeof json?.id !== 'string') throw new TeamsError('TRANSPORT_FAILED', 'Conversation id missing');
    return { serviceUrl: input.serviceUrl, conversationId: json.id };
  }

  async sendActivity(address: TeamsConversationAddress, activity: TeamsOutboundActivity): Promise<TeamsSendResult> {
    const json = await this.call<{ id?: unknown }>(address.serviceUrl, `v3/conversations/${encodeURIComponent(address.conversationId)}/activities`, 'POST', activity);
    if (typeof json?.id !== 'string') throw new TeamsError('TRANSPORT_FAILED', 'Activity id missing');
    return { activityId: json.id };
  }

  async updateActivity(address: TeamsConversationAddress, activityId: string, activity: TeamsOutboundActivity): Promise<void> {
    await this.call(address.serviceUrl, `v3/conversations/${encodeURIComponent(address.conversationId)}/activities/${encodeURIComponent(activityId)}`, 'PUT', { ...activity, id: activityId });
  }

  private async call<T>(serviceUrl: string, path: string, method: 'POST' | 'PUT', body: unknown, retried = false): Promise<T | null> {
    const base = assertServiceUrl(serviceUrl);
    const token = await this.tokens.getToken(await this.credentials());
    let response: Response;
    try {
      response = await this.fetchImplementation(new URL(path, base).toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new TeamsError('TRANSPORT_FAILED', 'Bot Connector unreachable');
    }
    if (response.status === 401 && !retried) {
      this.tokens.invalidate();
      return this.call<T>(serviceUrl, path, method, body, true);
    }
    if (response.status === 403 || response.status === 404) throw new TeamsError('CONVERSATION_GONE', `Bot Connector returned ${response.status}`);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '');
      throw new TeamsError('THROTTLED', 'Bot Connector throttled', Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    if (!response.ok) throw new TeamsError('TRANSPORT_FAILED', `Bot Connector returned ${response.status}`);
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}

/** Only HTTPS service URLs on Microsoft-owned hosts are trusted (token leakage guard). */
export function assertServiceUrl(serviceUrl: string): string {
  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Invalid service URL');
  }
  const host = url.hostname.toLowerCase();
  const trusted = ['.botframework.com', '.trafficmanager.net', '.teams.microsoft.com', '.botframework.azure.us'];
  if (url.protocol !== 'https:' || !trusted.some((suffix) => host.endsWith(suffix))) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Untrusted service URL');
  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
}
