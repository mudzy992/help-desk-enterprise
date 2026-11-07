import type { Server, Socket } from 'socket.io';
import { adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import {
  isManagedSocketRoom,
  revalidateConnectedSocketRooms,
  revalidateSocketRooms,
  socketRoomRevalidationIntervalMs,
  startSocketRoomRevalidation,
  type SocketRoomAuthorizationSnapshot,
} from './socket-room-revalidation';

type FakeSocket = Socket & { rooms: Set<string> };

function snapshot(
  groupIds: readonly string[],
  isAdmin = false,
  authzVersion = 7,
): SocketRoomAuthorizationSnapshot {
  return { authzVersion, isActive: true, groupIds, isAdmin };
}

function createSocket(
  userId: string,
  rooms: readonly string[] = [],
  authzVersion = 7,
): FakeSocket {
  const id = `socket-${userId}`;
  const set = new Set([id, ...rooms]);
  let connected = true;
  const socket = {
    id,
    data: {
      principal: {
        subjectId: userId,
        sessionId: `session-${userId}`,
        jti: `jti-${userId}`,
        issuedAt: 1,
        expiresAt: 9_999_999_999,
        authzVersion,
      },
    },
    rooms: set,
    disconnected: false,
    join: jest.fn(async (room: string) => {
      if (connected) set.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      set.delete(room);
    }),
    disconnect: jest.fn(() => {
      connected = false;
      set.clear();
    }),
  };
  return socket as unknown as FakeSocket;
}

describe('socket room revalidation (BA-websocket-03)', () => {
  it('replaces revoked group and admin rooms from one current authorization snapshot', async () => {
    const client = createSocket('user-1', [
      'user:user-1',
      'group:group-old',
      adminRealtimeRoomName,
      'ticket:ticket-1:staff',
    ]);
    const membership = {
      roomAccessForUser: jest.fn().mockResolvedValue(snapshot(['group-new'])),
    };

    const result = await revalidateSocketRooms(client, membership);

    expect(result).toEqual({ joined: 1, left: 2 });
    expect(membership.roomAccessForUser).toHaveBeenCalledTimes(1);
    expect(client.leave).toHaveBeenCalledWith('group:group-old');
    expect(client.leave).toHaveBeenCalledWith(adminRealtimeRoomName);
    expect(client.join).toHaveBeenCalledWith('group:group-new');
    // Personal and ticket rooms are not this revalidation's business.
    expect(client.leave).not.toHaveBeenCalledWith('user:user-1');
    expect(client.leave).not.toHaveBeenCalledWith('ticket:ticket-1:staff');
    expect([...client.rooms].sort()).toEqual(
      ['group:group-new', 'socket-user-1', 'ticket:ticket-1:staff', 'user:user-1'].sort(),
    );
  });

  it('adds the admin room when the current snapshot includes an admin role', async () => {
    const client = createSocket('user-2', ['group:group-1']);
    const membership = {
      roomAccessForUser: jest.fn().mockResolvedValue(snapshot(['group-1'], true)),
    };

    await expect(revalidateSocketRooms(client, membership)).resolves.toEqual({
      joined: 1,
      left: 0,
    });
    expect(client.rooms.has(adminRealtimeRoomName)).toBe(true);
  });

  it('disconnects a socket whose authorization version changed since its lease', async () => {
    const client = createSocket('user-version', [
      'group:group-stale',
      adminRealtimeRoomName,
    ]);
    const membership = {
      roomAccessForUser: jest
        .fn()
        .mockResolvedValue(snapshot(['group-current'], true, 8)),
    };

    await revalidateSocketRooms(client, membership);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.rooms.size).toBe(0);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects an inactive user even if the authz version still matches', async () => {
    const client = createSocket('user-inactive', ['group:group-stale']);
    const membership = {
      roomAccessForUser: jest
        .fn()
        .mockResolvedValue({ ...snapshot(['group-stale']), isActive: false }),
    };

    await revalidateSocketRooms(client, membership);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.rooms.size).toBe(0);
  });

  it('disconnects sockets without a valid principal without querying membership', async () => {
    const client = createSocket('user-invalid', ['group:group-stale']);
    client.data = {} as Socket['data'];
    const membership = { roomAccessForUser: jest.fn() };

    await expect(revalidateSocketRooms(client, membership)).resolves.toEqual({
      joined: 0,
      left: 0,
    });
    expect(membership.roomAccessForUser).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('removes managed rooms on a failed database read while continuing other users', async () => {
    const failing = createSocket('user-fail', [
      'user:user-fail',
      'group:group-1',
      adminRealtimeRoomName,
      'ticket:ticket-fail:staff',
    ]);
    const working = createSocket('user-ok', []);
    const membership = {
      roomAccessForUser: jest.fn(async (userId: string) => {
        if (userId === 'user-fail') throw new Error('database unavailable');
        return snapshot(['group-2']);
      }),
    };
    const logger = { warn: jest.fn() };

    const summary = await revalidateConnectedSocketRooms(
      [failing, working],
      membership,
      logger,
    );

    expect(summary).toEqual({ checked: 2, joined: 1, left: 2, failed: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      'socket_room_revalidation_failed checked=2 failed=1 fail_closed=1',
    );
    expect(failing.rooms.has('group:group-1')).toBe(false);
    expect(failing.rooms.has(adminRealtimeRoomName)).toBe(false);
    expect(failing.rooms.has('user:user-fail')).toBe(true);
    expect(failing.rooms.has('ticket:ticket-fail:staff')).toBe(true);
    expect(failing.disconnect).not.toHaveBeenCalled();
    expect(working.rooms.has('group:group-2')).toBe(true);
  });

  it('times out an unresponsive membership query and fails closed', async () => {
    const client = createSocket('user-timeout', [
      'group:group-stale',
      'ticket:ticket-timeout:staff',
    ]);
    const membership = {
      roomAccessForUser: jest.fn(
        () => new Promise<SocketRoomAuthorizationSnapshot | null>(() => undefined),
      ),
    };

    await expect(
      revalidateSocketRooms(client, membership, { timeoutMs: 1 }),
    ).rejects.toThrow('socket room authorization timeout');

    expect(client.rooms.has('group:group-stale')).toBe(false);
    expect(client.rooms.has('ticket:ticket-timeout:staff')).toBe(true);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('cleans partial room changes when a room join fails', async () => {
    const client = createSocket('user-join-fail', ['group:old']);
    client.join = jest.fn(async (room: string) => {
      client.rooms.add(room);
      throw new Error('adapter join failed');
    }) as Socket['join'];
    const membership = {
      roomAccessForUser: jest.fn().mockResolvedValue(snapshot(['new'])),
    };

    await expect(revalidateSocketRooms(client, membership)).rejects.toThrow(
      'adapter join failed',
    );

    expect(client.rooms.has('group:old')).toBe(false);
    expect(client.rooms.has('group:new')).toBe(false);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when a failed authorization read cannot remove a managed room', async () => {
    const client = createSocket('user-leave-fail', ['group:group-1']);
    client.leave = jest.fn(async () => {
      throw new Error('adapter unavailable');
    }) as Socket['leave'];
    const membership = {
      roomAccessForUser: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };

    await expect(revalidateSocketRooms(client, membership)).rejects.toThrow(
      'database unavailable',
    );

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.rooms.size).toBe(0);
  });

  it('reads membership once for sockets belonging to the same user', async () => {
    const first = createSocket('user-tabs', ['group:old']);
    const second = createSocket('user-tabs', ['group:old']);
    const membership = {
      roomAccessForUser: jest.fn().mockResolvedValue(snapshot(['new'])),
    };

    const summary = await revalidateConnectedSocketRooms(
      [first, second],
      membership,
      { warn: jest.fn() },
    );

    expect(summary).toEqual({ checked: 2, joined: 2, left: 2, failed: 0 });
    expect(membership.roomAccessForUser).toHaveBeenCalledTimes(1);
    expect(first.rooms.has('group:new')).toBe(true);
    expect(second.rooms.has('group:new')).toBe(true);
  });

  it('revalidates immediately, then at a bounded interval, and stops on demand', async () => {
    jest.useFakeTimers();
    try {
      const client = createSocket('user-3', []);
      const membership = {
        roomAccessForUser: jest.fn().mockResolvedValue(snapshot(['group-3'])),
      };
      const server = {
        sockets: { sockets: new Map([[client.id, client]]) },
      } as unknown as Server;

      const stop = startSocketRoomRevalidation(server, membership, { warn: jest.fn() });
      await jest.advanceTimersByTimeAsync(0);
      expect(membership.roomAccessForUser).toHaveBeenCalledWith('user-3');
      expect(socketRoomRevalidationIntervalMs).toBe(30_000);
      await jest.advanceTimersByTimeAsync(socketRoomRevalidationIntervalMs);
      expect(membership.roomAccessForUser).toHaveBeenCalledTimes(2);
      expect(client.rooms.has('group:group-3')).toBe(true);

      stop();
      await jest.advanceTimersByTimeAsync(socketRoomRevalidationIntervalMs);
      expect(membership.roomAccessForUser).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not overlap long-running sweeps', async () => {
    jest.useFakeTimers();
    try {
      let finishRead: ((value: SocketRoomAuthorizationSnapshot) => void) | undefined;
      const client = createSocket('user-overlap', []);
      const membership = {
        roomAccessForUser: jest.fn(
          () =>
            new Promise<SocketRoomAuthorizationSnapshot>((resolve) => {
              finishRead = resolve;
            }),
        ),
      };
      const server = {
        sockets: { sockets: new Map([[client.id, client]]) },
      } as unknown as Server;
      const stop = startSocketRoomRevalidation(server, membership, { warn: jest.fn() }, {
        intervalMs: 1_000,
        timeoutMs: 100_000,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(3_000);
      expect(membership.roomAccessForUser).toHaveBeenCalledTimes(1);

      finishRead?.(snapshot([]));
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(membership.roomAccessForUser).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('knows which rooms it owns', () => {
    expect(isManagedSocketRoom('group:group-1')).toBe(true);
    expect(isManagedSocketRoom(adminRealtimeRoomName)).toBe(true);
    expect(isManagedSocketRoom('user:user-1')).toBe(false);
    expect(isManagedSocketRoom('ticket:ticket-1')).toBe(false);
  });
});
