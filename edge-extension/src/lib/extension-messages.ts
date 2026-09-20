/**
 * Ugovor između popupa i service workera.
 * Svaka izmjena verzioniše se kroz `extensionVersion` (sinhronizovano sa
 * package.json i public/manifest.json).
 */
export const extensionVersion = '1.0.0';

export const extensionMessageTypes = {
  sessionSet: 'session.set',
  sessionClear: 'session.clear',
  statusGet: 'status.get',
  inboxGet: 'inbox.get',
  threadGet: 'thread.get',
  threadWatch: 'thread.watch',
  replySend: 'reply.send',
  remoteAck: 'remote.ack',
  languageSet: 'language.set',
} as const;

/** Naziv dugoživog porta SW → popup (live push). */
export const popupPortName = 'ep-helpdesk.popup.v1';

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

export type ThreadWatchMessage = {
  readonly type: typeof extensionMessageTypes.threadWatch;
  /** null = popup je zatvorio thread (izlazak iz sobe). */
  readonly ticketId: string | null;
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

export type LanguageSetMessage = {
  readonly type: typeof extensionMessageTypes.languageSet;
  readonly language: 'bs' | 'en';
};

export type ExtensionRuntimeMessage =
  | SessionSetMessage
  | SessionClearMessage
  | StatusGetMessage
  | InboxGetMessage
  | ThreadGetMessage
  | ThreadWatchMessage
  | ReplySendMessage
  | RemoteAckMessage
  | LanguageSetMessage;

/** Generični odgovor SW-a; `authExpired` signalizira popupu da pokaže login. */
export type ExtensionErrorResponse = {
  readonly error: string;
  readonly code?: string;
  readonly authExpired?: boolean;
};

export type ExtensionStatus = {
  readonly signedIn: boolean;
  readonly allowed: boolean;
  readonly reason: string;
  readonly connected: boolean;
  readonly polling: boolean;
  readonly deskPublicUrl: string;
  readonly subjectId: string;
  /** Puno ime korisnika iz /auth/session; null dok se ne učita. */
  readonly displayName: string | null;
  readonly chatEnabled: boolean;
  readonly remoteEnabled: boolean;
  readonly pendingRemoteTicketIds: readonly string[];
  readonly unreadCount: number;
};

export type ExtensionInboxTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly updatedAt: string;
};

export type ExtensionThreadMessage = {
  readonly id: string;
  readonly type: string;
  readonly body: string;
  readonly createdAt: string;
  /** null kad backend ne isporuči autora — UI tada ne poravnava "vlasništvo". */
  readonly authorUserId: string | null;
  readonly authorName: string | null;
};

/** Push eventi koje SW šalje popupu kroz {@link popupPortName} port. */
export type PopupPortEvent =
  | { readonly type: 'status.changed'; readonly status: ExtensionStatus }
  | { readonly type: 'inbox.refresh' }
  | {
      readonly type: 'thread.message';
      readonly ticketId: string;
      readonly message: ExtensionThreadMessage;
    }
  | { readonly type: 'thread.refresh'; readonly ticketId: string };
