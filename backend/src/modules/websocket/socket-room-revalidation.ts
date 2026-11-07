import type { Server, Socket } from 'socket.io';
import { adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';
import { groupRoomName } from './ticket-socket-rooms';

/**
 * Group/admin changes normally invalidate the user's authz version and publish
 * a cross-instance socket disconnect. The 30-second room sweep is a bounded
 * reconciliation lease for missed events and changes made outside those paths;
 * unlike the old five-minute poll, it is not the primary revocation mechanism.
 */
export const socketRoomRevalidationIntervalMs = 30_000;
export const socketRoomRevalidationTimeoutMs = 5_000;
export const socketRoomRevalidationConcurrency = 25;

export type SocketRoomAuthorizationSnapshot = {
  readonly authzVersion: number;
  readonly isActive: boolean;
  readonly groupIds: readonly string[];
  readonly isAdmin: boolean;
};

export type SocketRoomMembershipSource = {
  /** One authoritative snapshot of group membership, admin role and authz version. */
  readonly roomAccessForUser: (
    userId: string,
  ) => Promise<SocketRoomAuthorizationSnapshot | null>;
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

/**
 * Refreshes the managed rooms from one database snapshot. If the authorization
 * read fails, all managed rooms are removed; if room cleanup itself fails, the
 * socket is disconnected so an uncertain room cannot remain subscribed.
 */
export async function revalidateSocketRooms(
  client: Socket,
  membership: SocketRoomMembershipSource,
  options: { readonly timeoutMs?: number } = {},
): Promise<SocketRoomRevalidationResult> {
  const principal = getSocketPrincipal(client);
  if (!isSocketPrincipal(principal)) {
    disconnectSocket(client);
    return { joined: 0, left: 0 };
  }
  if (socketIsDisconnected(client)) {
    return { joined: 0, left: 0 };
  }

  let snapshot: SocketRoomAuthorizationSnapshot | null;
  try {
    snapshot = await withTimeout(
      membership.roomAccessForUser(principal.subjectId),
      options.timeoutMs ?? socketRoomRevalidationTimeoutMs,
    );
  } catch (error) {
    await leaveManagedRoomsFailClosed(client);
    throw error;
  }
  return applyRoomAuthorizationSnapshot(client, principal.authzVersion, snapshot);
}

export type SocketRoomRevalidationSummary = {
  /** Number of authenticated sockets in the local process. */
  readonly checked: number;
  readonly joined: number;
  readonly left: number;
  /** Sockets whose refresh failed and had managed rooms revoked fail-closed. */
  readonly failed: number;
};

type SocketUserGroup = {
  readonly userId: string;
  readonly sockets: Socket[];
};

/**
 * Revalidates local sockets with one authorization read per distinct user and
 * bounded cross-user concurrency. A failed user snapshot strips every managed
 * room for that user's local sockets; unrelated users continue to be checked.
 */
export async function revalidateConnectedSocketRooms(
  sockets: Iterable<Socket>,
  membership: SocketRoomMembershipSource,
  logger: SocketRoomRevalidationLogger,
  options: {
    readonly timeoutMs?: number;
    readonly concurrency?: number;
  } = {},
): Promise<SocketRoomRevalidationSummary> {
  const summary = { checked: 0, joined: 0, left: 0, failed: 0 };
  const groups = new Map<string, SocketUserGroup>();

  for (const client of sockets) {
    const principal = getSocketPrincipal(client);
    if (!isSocketPrincipal(principal)) {
      disconnectSocket(client);
      continue;
    }
    if (socketIsDisconnected(client)) continue;
    summary.checked += 1;
    const group = groups.get(principal.subjectId);
    if (group === undefined) {
      groups.set(principal.subjectId, {
        userId: principal.subjectId,
        sockets: [client],
      });
    } else {
      group.sockets.push(client);
    }
  }

  await mapWithConcurrency(
    [...groups.values()],
    options.concurrency ?? socketRoomRevalidationConcurrency,
    async (group) => {
      let snapshot: SocketRoomAuthorizationSnapshot | null;
      try {
        snapshot = await withTimeout(
          membership.roomAccessForUser(group.userId),
          options.timeoutMs ?? socketRoomRevalidationTimeoutMs,
        );
      } catch {
        summary.failed += group.sockets.length;
        await Promise.all(
          group.sockets.map(async (client) => {
            const left = await leaveManagedRoomsFailClosed(client);
            summary.left += left;
          }),
        );
        return;
      }

      for (const client of group.sockets) {
        const principal = getSocketPrincipal(client);
        if (!isSocketPrincipal(principal) || socketIsDisconnected(client)) {
          disconnectSocket(client);
          continue;
        }
        try {
          const result = await applyRoomAuthorizationSnapshot(
            client,
            principal.authzVersion,
            snapshot,
          );
          summary.joined += result.joined;
          summary.left += result.left;
        } catch {
          summary.failed += 1;
        }
      }
    },
  );

  if (summary.failed > 0) {
    logger.warn(
      `socket_room_revalidation_failed checked=${summary.checked} failed=${summary.failed} fail_closed=1`,
    );
  }
  return summary;
}

/**
 * Starts an immediate refresh and a non-overlapping periodic reconciliation.
 * Only local sockets are walked: with the Redis adapter, every instance owns
 * its local connections, while authz-version invalidation is cross-instance.
 */
export function startSocketRoomRevalidation(
  server: Server,
  membership: SocketRoomMembershipSource,
  logger: SocketRoomRevalidationLogger,
  options: {
    readonly intervalMs?: number;
    readonly timeoutMs?: number;
    readonly concurrency?: number;
  } = {},
): () => void {
  let stopped = false;
  let running = false;
  const run = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await revalidateConnectedSocketRooms(
        server.sockets?.sockets?.values() ?? [],
        membership,
        logger,
        {
          timeoutMs: options.timeoutMs ?? socketRoomRevalidationTimeoutMs,
          concurrency: options.concurrency ?? socketRoomRevalidationConcurrency,
        },
      );
    } catch {
      // Keep the timer from creating an unhandled rejection; per-user failures
      // have already stripped managed rooms. This line is a process-health alert.
      logger.warn('socket_room_revalidation_failed reason=unexpected fail_closed=1');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(
    () => void run(),
    options.intervalMs ?? socketRoomRevalidationIntervalMs,
  );
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function applyRoomAuthorizationSnapshot(
  client: Socket,
  principalAuthzVersion: number,
  snapshot: SocketRoomAuthorizationSnapshot | null,
): Promise<SocketRoomRevalidationResult> {
  if (socketIsDisconnected(client)) return { joined: 0, left: 0 };
  if (
    snapshot === null ||
    !snapshot.isActive ||
    !Number.isSafeInteger(snapshot.authzVersion) ||
    snapshot.authzVersion !== principalAuthzVersion
  ) {
    // Any membership/role mutation changes authzVersion. A socket carrying the
    // prior version is not upgraded in place; it must authenticate a fresh lease.
    disconnectSocket(client);
    return { joined: 0, left: 0 };
  }

  const desired = new Set<string>(snapshot.groupIds.map(groupRoomName));
  if (snapshot.isAdmin) desired.add(adminRealtimeRoomName);

  try {
    let left = 0;
    for (const room of [...client.rooms]) {
      if (isManagedSocketRoom(room) && !desired.has(room)) {
        if (socketIsDisconnected(client)) return { joined: 0, left };
        await awaitRoomOperation(client.leave(room));
        left += 1;
        if (socketIsDisconnected(client)) {
          await leaveManagedRoomsFailClosed(client);
          return { joined: 0, left };
        }
      }
    }
    let joined = 0;
    for (const room of desired) {
      if (socketIsDisconnected(client)) return { joined, left };
      if (!client.rooms.has(room)) {
        await awaitRoomOperation(client.join(room));
        joined += 1;
        if (socketIsDisconnected(client)) {
          await leaveManagedRoomsFailClosed(client);
          return { joined: 0, left };
        }
      }
    }
    return { joined, left };
  } catch (error) {
    // A partial leave/join can leave the membership set uncertain. Strip every
    // managed room, disconnecting if the adapter cannot confirm the cleanup.
    await leaveManagedRoomsFailClosed(client);
    throw error;
  }
}

async function leaveManagedRoomsFailClosed(client: Socket): Promise<number> {
  let left = 0;
  let failed = false;
  for (const room of [...client.rooms]) {
    if (!isManagedSocketRoom(room)) continue;
    try {
      await awaitRoomOperation(client.leave(room));
      left += 1;
    } catch {
      failed = true;
    }
  }
  if (
    failed ||
    [...client.rooms].some(isManagedSocketRoom)
  ) {
    disconnectSocket(client);
  }
  return left;
}

function socketIsDisconnected(client: Socket): boolean {
  return client.disconnected === true || !client.rooms.has(client.id);
}

function disconnectSocket(client: Socket): void {
  try {
    client.disconnect(true);
  } catch {
    // Nothing else can make a broken Socket.IO connection safer.
  }
}

function awaitRoomOperation(operation: void | Promise<void>): Promise<void> {
  return Promise.resolve(operation);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('socket room authorization timeout')),
          timeoutMs,
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  if (values.length === 0) return;
  const workerCount = Math.max(1, Math.min(values.length, Math.floor(concurrency)));
  let next = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        const value = values[index];
        if (value !== undefined) await work(value);
      }
    }),
  );
}
