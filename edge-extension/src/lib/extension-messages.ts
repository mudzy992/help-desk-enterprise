export const extensionVersion = '0.0.1';

export const extensionMessageTypes = {
  sessionSet: 'session.set',
  sessionClear: 'session.clear',
  statusGet: 'status.get',
  inboxGet: 'inbox.get',
  threadGet: 'thread.get',
  replySend: 'reply.send',
  remoteAck: 'remote.ack',
} as const;

export type SessionSetMessage = {
  readonly type: typeof extensionMessageTypes.sessionSet;
  readonly accessToken: string;
  readonly apiBaseUrl: string;
};

export type SessionClearMessage = {
  readonly type: typeof extensionMessageTypes.sessionClear;
};

export type StatusGetMessage = {
  readonly type: typeof extensionMessageTypes.statusGet;
};

export type InboxGetMessage = {
  readonly type: typeof extensionMessageTypes.inboxGet;
};

export type ThreadGetMessage = {
  readonly type: typeof extensionMessageTypes.threadGet;
  readonly ticketId: string;
};

export type ReplySendMessage = {
  readonly type: typeof extensionMessageTypes.replySend;
  readonly ticketId: string;
  readonly body: string;
};

export type RemoteAckMessage = {
  readonly type: typeof extensionMessageTypes.remoteAck;
  readonly ticketId: string;
};

export type ExtensionRuntimeMessage =
  | SessionSetMessage
  | SessionClearMessage
  | StatusGetMessage
  | InboxGetMessage
  | ThreadGetMessage
  | ReplySendMessage
  | RemoteAckMessage;

export type ExtensionStatus = {
  readonly signedIn: boolean;
  readonly allowed: boolean;
  readonly reason: string;
  readonly connected: boolean;
  readonly polling: boolean;
  readonly deskPublicUrl: string;
  readonly subjectId: string;
  readonly chatEnabled: boolean;
  readonly remoteEnabled: boolean;
  readonly pendingRemoteTicketIds: readonly string[];
};

export type ExtensionInboxTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
};

export type ExtensionThreadMessage = {
  readonly id: string;
  readonly type: string;
  readonly body: string;
  readonly createdAt: string;
};
