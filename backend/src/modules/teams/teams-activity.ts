/**
 * Paket 3.1: the subset of the Bot Framework Activity schema the connector
 * reads. Everything is optional on the wire, so activities are parsed
 * defensively and unknown shapes are ignored rather than rejected.
 */
export interface TeamsChannelAccount {
  readonly id?: string;
  readonly name?: string;
  readonly aadObjectId?: string;
}

export interface TeamsActivity {
  readonly type: string;
  readonly id: string;
  readonly name?: string;
  readonly serviceUrl: string;
  readonly text?: string;
  readonly value?: unknown;
  readonly action?: string;
  readonly from: TeamsChannelAccount;
  readonly recipient: TeamsChannelAccount;
  readonly conversation: { readonly id: string; readonly conversationType?: string; readonly tenantId?: string };
  readonly membersAdded?: readonly TeamsChannelAccount[];
  readonly membersRemoved?: readonly TeamsChannelAccount[];
  readonly channelData?: {
    readonly tenant?: { readonly id?: string };
    readonly team?: { readonly id?: string; readonly name?: string };
    readonly channel?: { readonly id?: string; readonly name?: string };
    readonly eventType?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown, max = 4096): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function account(value: unknown): TeamsChannelAccount {
  if (!isRecord(value)) return {};
  return { id: str(value.id, 512), name: str(value.name, 256), aadObjectId: str(value.aadObjectId, 64) };
}

/** Returns null when the payload is not an activity we can address a reply to. */
export function parseTeamsActivity(body: unknown): TeamsActivity | null {
  if (!isRecord(body) || !isRecord(body.conversation)) return null;
  const type = str(body.type, 64);
  const id = str(body.id, 512);
  const serviceUrl = str(body.serviceUrl, 512);
  const conversationId = str(body.conversation.id, 512);
  if (!type || !id || !serviceUrl || !conversationId) return null;
  const channelData = isRecord(body.channelData) ? body.channelData : {};
  const sub = (key: string) => (isRecord(channelData[key]) ? (channelData[key] as Record<string, unknown>) : undefined);
  return {
    type,
    id,
    name: str(body.name, 128),
    serviceUrl,
    text: str(body.text, 28_000),
    value: body.value,
    action: str(body.action, 32),
    from: account(body.from),
    recipient: account(body.recipient),
    conversation: {
      id: conversationId,
      conversationType: str(body.conversation.conversationType, 32),
      tenantId: str(body.conversation.tenantId, 64),
    },
    membersAdded: Array.isArray(body.membersAdded) ? body.membersAdded.slice(0, 100).map(account) : undefined,
    membersRemoved: Array.isArray(body.membersRemoved) ? body.membersRemoved.slice(0, 100).map(account) : undefined,
    channelData: {
      tenant: sub('tenant') ? { id: str(sub('tenant')?.id, 64) } : undefined,
      team: sub('team') ? { id: str(sub('team')?.id, 512), name: str(sub('team')?.name, 256) } : undefined,
      channel: sub('channel') ? { id: str(sub('channel')?.id, 512), name: str(sub('channel')?.name, 256) } : undefined,
      eventType: str(channelData.eventType, 64),
    },
  };
}

export function activityTenantId(activity: TeamsActivity): string | undefined {
  return activity.channelData?.tenant?.id ?? activity.conversation.tenantId;
}

export type TeamsConversationKindValue = 'PERSONAL' | 'CHANNEL' | 'GROUP_CHAT';

export function activityConversationKind(activity: TeamsActivity): TeamsConversationKindValue {
  switch (activity.conversation.conversationType) {
    case 'channel':
      return 'CHANNEL';
    case 'groupChat':
      return 'GROUP_CHAT';
    default:
      return 'PERSONAL';
  }
}

/** Invoke value of an `adaptiveCard/action` (Universal Actions). */
export function readCardAction(activity: TeamsActivity): { verb: string; data: Record<string, unknown> } | null {
  if (activity.type !== 'invoke' || activity.name !== 'adaptiveCard/action' || !isRecord(activity.value)) return null;
  const action = activity.value.action;
  if (!isRecord(action) || typeof action.verb !== 'string') return null;
  return { verb: action.verb, data: isRecord(action.data) ? action.data : {} };
}
