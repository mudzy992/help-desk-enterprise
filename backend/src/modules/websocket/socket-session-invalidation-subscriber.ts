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
    disconnectInvalidatedSockets(server, event);
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

export function disconnectInvalidatedSockets(
  server: Server,
  event: NonNullable<ReturnType<typeof parseSocketSessionInvalidation>>,
): number {
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
