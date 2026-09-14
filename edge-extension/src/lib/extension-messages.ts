export const extensionVersion = '0.0.1';

export const extensionMessageTypes = {
  sessionSet: 'session.set',
  sessionClear: 'session.clear',
  statusGet: 'status.get',
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

export type ExtensionRuntimeMessage =
  | SessionSetMessage
  | SessionClearMessage
  | StatusGetMessage;

export type ExtensionStatus = {
  readonly signedIn: boolean;
  readonly allowed: boolean;
  readonly reason: string;
  readonly connected: boolean;
  readonly polling: boolean;
  readonly deskPublicUrl: string;
};
