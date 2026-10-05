import type { Server, Socket } from 'socket.io';
import { adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';
import { groupRoomName } from './ticket-socket-rooms';

/**
 * Val 3 (M11/B1): group membership and the ADMIN/SUPER_ADMIN role are read once,
 * at handshake, and the socket joins `group:{id}` / `role:admins` accordingly
 * (`socket-group-membership.service.ts`). After that nothing re-checks them, so a
 * user whose membership was revoked keeps receiving group notifications — and an
 * ex-admin keeps receiving admin configuration events — until they reconnect.
 * The HTTP layer already honours the change (`PrincipalContextInvalidator` bumps
 * `authzVersion`), which is exactly why the drift is invisible in the UI.
 *
 * This module closes the gap the cheap way the finding allows: every connected
 * socket re-checks its own rooms periodically (default 5 minutes), leaves the
 * managed rooms it no longer qualifies for and joins the ones it gained. The
 * ticket rooms (`ticket:*`) are not touched — they are per-ticket, joined only
 * through `ticket:join` with its own authorization, and the visibility room is
 * re-checked on every join.
 */
export const socketRoomRevalidationIntervalMs = 5 * 60_000;

export type SocketRoomMembershipSource = {
  readonly groupIdsForUser: (userId: string) => Promise<readonly string[]>;
  readonly isAdmin?: (userId: string) => Promise<boolean>;
};

export type SocketRoomRevalidationLogger = {
  readonly warn: (message: string) => void;
};

/** Rooms this revalidation owns; everything else on the socket is left alone. */
export function isManagedSocketRoom(room: string): boolean {
  return room.startsWith('group:') || room === adminRealtimeRoomName;
}

export type SocketRoomRevalidationResult = {
  readonly joined: number;
  readonly left: number;
};

export async function revalidateSocketRooms(
  client: Socket,
  membership: SocketRoomMembershipSource,
): Promise<SocketRoomRevalidationResult> {
  const principal = getSocketPrincipal(client);
  if (!isSocketPrincipal(principal)) {
    return { joined: 0, left: 0 };
  }
  const desired = new Set<string>(
    (await membership.groupIdsForUser(principal.subjectId)).map(groupRoomName),
  );
  if ((await membership.isAdmin?.(principal.subjectId)) === true) {
    desired.add(adminRealtimeRoomName);
  }
  let left = 0;
  for (const room of [...client.rooms]) {
    if (isManagedSocketRoom(room) && !desired.has(room)) {
      await client.leave(room);
      left += 1;
    }
  }
  let joined = 0;
  for (const room of desired) {
    if (!client.rooms.has(room)) {
      await client.join(room);
      joined += 1;
    }
  }
  return { joined, left };
}

export type SocketRoomRevalidationSummary = {
  readonly checked: number;
  readonly joined: number;
  readonly left: number;
  readonly failed: number;
};

/**
 * Revalidates every given socket, one failure at a time: a socket whose
 * membership could not be read keeps its current rooms (fail-open, the same
 * direction as the handshake) and is counted, not thrown.
 */
export async function revalidateConnectedSocketRooms(
  sockets: Iterable<Socket>,
  membership: SocketRoomMembershipSource,
  logger: SocketRoomRevalidationLogger,
): Promise<SocketRoomRevalidationSummary> {
  const summary = { checked: 0, joined: 0, left: 0, failed: 0 };
  for (const client of sockets) {
    if (!isSocketPrincipal(getSocketPrincipal(client))) {
      continue;
    }
    summary.checked += 1;
    try {
      const result = await revalidateSocketRooms(client, membership);
      summary.joined += result.joined;
      summary.left += result.left;
    } catch (error) {
      summary.failed += 1;
      logger.warn(
        `socket_room_revalidation_failed connectionId=${client.id} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return summary;
}

/**
 * Starts the periodic revalidation and returns the stop function. Only the local
 * sockets are walked (`server.sockets.sockets`): with the Redis adapter every
 * instance is responsible for its own connections, and a socket revalidates
 * itself on whichever instance it lives.
 */
export function startSocketRoomRevalidation(
  server: Server,
  membership: SocketRoomMembershipSource,
  logger: SocketRoomRevalidationLogger,
  options: { readonly intervalMs?: number } = {},
): () => void {
  const intervalMs = options.intervalMs ?? socketRoomRevalidationIntervalMs;
  const timer = setInterval(() => {
    void revalidateConnectedSocketRooms(
      server.sockets?.sockets?.values() ?? [],
      membership,
      logger,
    );
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
