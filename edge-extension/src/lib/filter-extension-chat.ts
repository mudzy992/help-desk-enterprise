import type { ExtensionThreadMessage } from './extension-messages';

/**
 * Staff-only tipovi nikad ne idu u extension chat (dvostruka zaštita:
 * backend već filtrira za public sobu, klijent filtrira ponovo).
 */
const staffOnlyMessageTypes = new Set([
  'INTERNAL_NOTE',
  'SYSTEM_EVENT',
  'APPROVAL_DECISION',
]);

export function isExtensionVisibleMessageType(type: string): boolean {
  return !staffOnlyMessageTypes.has(type);
}

export function filterExtensionChatMessages(
  messages: readonly ExtensionThreadMessage[],
  maxMessages: number,
): readonly ExtensionThreadMessage[] {
  const visible = messages.filter((message) =>
    isExtensionVisibleMessageType(message.type),
  );
  if (visible.length <= maxMessages) {
    return visible;
  }
  return visible.slice(visible.length - maxMessages);
}

export function isOpenRequesterTicket(input: {
  readonly requesterId: string;
  readonly subjectId: string;
  readonly status: string;
}): boolean {
  return (
    input.requesterId === input.subjectId &&
    input.status !== 'CLOSED' &&
    input.status !== 'ARCHIVED'
  );
}

/**
 * Defanzivna normalizacija poruke: backend response može evoluirati
 * (npr. `author` objekat) — klijent čita više oblika bez rušenja.
 */
export function normalizeThreadMessage(raw: unknown): ExtensionThreadMessage | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const candidate = raw as {
    readonly id?: unknown;
    readonly type?: unknown;
    readonly body?: unknown;
    readonly createdAt?: unknown;
    readonly authorUserId?: unknown;
    readonly authorName?: unknown;
    readonly author?: unknown;
  };
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.body !== 'string'
  ) {
    return null;
  }
  const authorObject =
    typeof candidate.author === 'object' && candidate.author !== null
      ? (candidate.author as {
          readonly userId?: unknown;
          readonly id?: unknown;
          readonly displayName?: unknown;
          readonly name?: unknown;
        })
      : null;
  const authorUserId =
    typeof candidate.authorUserId === 'string'
      ? candidate.authorUserId
      : typeof authorObject?.userId === 'string'
        ? authorObject.userId
        : typeof authorObject?.id === 'string'
          ? authorObject.id
          : null;
  const authorName =
    typeof candidate.authorName === 'string'
      ? candidate.authorName
      : typeof authorObject?.displayName === 'string'
        ? authorObject.displayName
        : typeof authorObject?.name === 'string'
          ? authorObject.name
          : null;
  return {
    id: candidate.id,
    type: candidate.type,
    body: candidate.body,
    createdAt:
      typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : new Date().toISOString(),
    authorUserId,
    authorName,
  };
}
