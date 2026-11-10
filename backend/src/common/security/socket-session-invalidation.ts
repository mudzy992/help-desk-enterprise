export const socketSessionInvalidationChannel =
  'servicedesk:auth:socket:invalidate';

export const socketSessionInvalidationBatchSize = 200;

export type SocketSessionInvalidation =
  | { readonly version: 1; readonly kind: 'token'; readonly jti: string }
  | {
      readonly version: 1;
      readonly kind: 'session';
      readonly sessionId: string;
    }
  | {
      readonly version: 1;
      readonly kind: 'user';
      readonly subjectId: string;
      readonly exceptSessionId: string | null;
      readonly exceptJti: string | null;
    }
  | {
      readonly version: 1;
      readonly kind: 'users';
      readonly subjectIds: readonly string[];
    };

export type SocketSessionInvalidationPublisher = {
  readonly status?: string;
  publish(channel: string, message: string): Promise<unknown>;
};

/**
 * Best-effort prompt delivery. The durable session/authz read remains the
 * authority; Redis Pub/Sub only shortens how long other API instances take to
 * notice a committed change. Never hold a logout or admin mutation open while
 * Redis reconnects.
 */
export async function publishSocketSessionInvalidation(
  publisher: SocketSessionInvalidationPublisher | null | undefined,
  event: SocketSessionInvalidation,
  timeoutMs = 500,
): Promise<boolean> {
  if (
    publisher === null ||
    publisher === undefined ||
    typeof publisher.publish !== 'function' ||
    publisher.status !== 'ready'
  ) {
    return false;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      publisher.publish(
        socketSessionInvalidationChannel,
        JSON.stringify(event),
      ),
      new Promise<'timeout'>((resolve) => {
        timeout = setTimeout(() => resolve('timeout'), timeoutMs);
        timeout.unref?.();
      }),
    ]);
    return result !== 'timeout';
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export function parseSocketSessionInvalidation(
  message: string,
): SocketSessionInvalidation | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(message);
  } catch {
    return null;
  }
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const value = candidate as Record<string, unknown>;
  if (value.version !== 1 || typeof value.kind !== 'string') {
    return null;
  }
  switch (value.kind) {
    case 'token':
      return nonEmpty(value.jti)
        ? { version: 1, kind: 'token', jti: value.jti }
        : null;
    case 'session':
      return nonEmpty(value.sessionId)
        ? { version: 1, kind: 'session', sessionId: value.sessionId }
        : null;
    case 'user':
      if (
        !nonEmpty(value.subjectId) ||
        !nullableString(value.exceptSessionId) ||
        !nullableString(value.exceptJti)
      ) {
        return null;
      }
      return {
        version: 1,
        kind: 'user',
        subjectId: value.subjectId,
        exceptSessionId: value.exceptSessionId ?? null,
        exceptJti: value.exceptJti ?? null,
      };
    case 'users':
      if (
        !Array.isArray(value.subjectIds) ||
        value.subjectIds.length === 0 ||
        value.subjectIds.length > socketSessionInvalidationBatchSize ||
        !value.subjectIds.every(nonEmpty)
      ) {
        return null;
      }
      return {
        version: 1,
        kind: 'users',
        subjectIds: value.subjectIds,
      };
    default:
      return null;
  }
}

export function invalidationMatchesSocketPrincipal(
  event: SocketSessionInvalidation,
  principal: {
    readonly subjectId: string;
    readonly sessionId: string | null;
    readonly jti: string | null;
  },
): boolean {
  switch (event.kind) {
    case 'token':
      return principal.jti !== null && principal.jti === event.jti;
    case 'session':
      return (
        principal.sessionId !== null &&
        principal.sessionId === event.sessionId
      );
    case 'user':
      if (principal.subjectId !== event.subjectId) {
        return false;
      }
      if (
        principal.sessionId !== null &&
        principal.sessionId === event.exceptSessionId
      ) {
        return false;
      }
      if (
        principal.sessionId === null &&
        principal.jti !== null &&
        principal.jti === event.exceptJti
      ) {
        return false;
      }
      return true;
    case 'users':
      return event.subjectIds.includes(principal.subjectId);
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}
