import type { Server, Socket } from 'socket.io';
import { createRedisClient } from '../../common/redis/create-redis-client';
import type { RedisConfiguration } from '../../common/redis/redis.types';
import {
  parseSocketSessionInvalidation,
  socketSessionInvalidationChannel,
  invalidationMatchesSocketPrincipal,
} from '../../common/security/socket-session-invalidation';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';
import { groupRoomName } from './ticket-socket-rooms';

export type SocketSessionInvalidationLogger = {
  readonly warn: (message: string) => void;
};

/**
 * Each API instance subscribes on a dedicated Redis connection and disconnects
 * only its local Socket.IO clients. The publisher emits one event, which avoids
 * a cluster-wide adapter broadcast being repeated once per API instance.
 */
export function startSocketSessionInvalidationSubscriber(
  configuration: RedisConfiguration,
  server: Server,
  logger: SocketSessionInvalidationLogger,
): () => void {
  const subscriber = createRedisClient(configuration);
  subscriber.on('error', (error: Error) => {
    logger.warn(`socket_session_invalidation_redis_error type=${error.name}`);
  });
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== socketSessionInvalidationChannel) return;
    const event = parseSocketSessionInvalidation(message);
    if (event === null) {
      logger.warn('socket_session_invalidation_message_invalid fail_closed_by_recheck=1');
      return;
    }
    void applySocketSessionInvalidation(server, event).catch((error: unknown) => {
      logger.warn(
        `socket_session_invalidation_apply_failed reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    });
  });

  try {
    void subscriber.subscribe(socketSessionInvalidationChannel).catch((error: unknown) => {
      logger.warn(
        `socket_session_invalidation_subscribe_unavailable reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    });
  } catch (error) {
    logger.warn(
      `socket_session_invalidation_subscribe_unavailable reason=${error instanceof Error ? error.name : 'unknown'}`,
    );
  }

  return () => {
    subscriber.disconnect();
  };
}

/**
 * W2.25 (`BA-groups-02`): a `group` event is a room loss, not a session loss, so it
 * is applied before the disconnect branch. Every local socket of the subject leaves
 * `group:<id>`; if the leave cannot be confirmed the socket is disconnected, because
 * an uncertain subscription is exactly what must not survive a revocation.
 */
export async function applySocketSessionInvalidation(
  server: Server,
  event: NonNullable<ReturnType<typeof parseSocketSessionInvalidation>>,
): Promise<number> {
  if (event.kind !== 'group') {
    return disconnectInvalidatedSockets(server, event);
  }
  return leaveGroupRoomForSubject(server, event.subjectId, event.groupId);
}

export async function leaveGroupRoomForSubject(
  server: Server,
  subjectId: string,
  groupId: string,
): Promise<number> {
  const sockets = server.sockets?.sockets;
  if (sockets === undefined) return 0;
  const room = groupRoomName(groupId);
  let left = 0;
  for (const client of sockets.values() as Iterable<Socket>) {
    const principal = getSocketPrincipal(client);
    if (!isSocketPrincipal(principal) || principal.subjectId !== subjectId) {
      continue;
    }
    if (!client.rooms.has(room)) {
      continue;
    }
    try {
      await Promise.resolve(client.leave(room));
      left += 1;
    } catch {
      // Fail closed: a socket whose room membership cannot be confirmed is
      // disconnected. The periodic room sweep would also catch it, later.
      try {
        client.disconnect(true);
      } catch {
        // Nothing else can make this connection safer.
      }
    }
  }
  return left;
}

/**
 * Disconnects the local sockets a session-level event matches. A `group` event is
 * applied by {@link applySocketSessionInvalidation} instead — it is a room loss, and
 * this function deliberately does nothing for it rather than over-reaching.
 */
export function disconnectInvalidatedSockets(
  server: Server,
  event: NonNullable<ReturnType<typeof parseSocketSessionInvalidation>>,
): number {
  if (event.kind === 'group') return 0;
  const sockets = server.sockets?.sockets;
  if (sockets === undefined) return 0;
  let disconnected = 0;
  for (const client of sockets.values() as Iterable<Socket>) {
    const principal = getSocketPrincipal(client);
    if (
      isSocketPrincipal(principal) &&
      invalidationMatchesSocketPrincipal(event, principal)
    ) {
      try {
        client.disconnect(true);
        disconnected += 1;
      } catch {
        // A broken local socket is still handled by the periodic fail-closed
        // lease re-check; continue disconnecting the remaining local sockets.
      }
    }
  }
  return disconnected;
}
