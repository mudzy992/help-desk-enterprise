/**
 * Paket 3.1: the single seam between the connector and Microsoft. The live
 * implementation talks to the Bot Connector REST API; the simulator records
 * the same activities so every flow can be proven without Microsoft resources.
 */
export interface TeamsConversationAddress {
  /** Bot Connector service URL from the inbound activity (live) or `simulator://`. */
  readonly serviceUrl: string;
  readonly conversationId: string;
}

export interface TeamsOutboundActivity {
  readonly type: 'message';
  readonly text?: string;
  readonly summary?: string;
  readonly attachments?: readonly {
    readonly contentType: 'application/vnd.microsoft.card.adaptive';
    readonly content: Readonly<Record<string, unknown>>;
  }[];
}

export interface TeamsSendResult {
  readonly activityId: string;
}

export interface TeamsCreatePersonalConversationInput {
  readonly serviceUrl: string;
  readonly tenantId: string;
  /** Entra object ID of the user (`User.entraObjectId`). */
  readonly userAadObjectId: string;
}

export interface TeamsTransport {
  readonly mode: 'simulator' | 'live';
  createPersonalConversation(input: TeamsCreatePersonalConversationInput): Promise<TeamsConversationAddress>;
  sendActivity(address: TeamsConversationAddress, activity: TeamsOutboundActivity): Promise<TeamsSendResult>;
  updateActivity(address: TeamsConversationAddress, activityId: string, activity: TeamsOutboundActivity): Promise<void>;
}

export const TEAMS_TRANSPORT = Symbol('TEAMS_TRANSPORT');
export const TEAMS_FETCH = Symbol('TEAMS_FETCH');
