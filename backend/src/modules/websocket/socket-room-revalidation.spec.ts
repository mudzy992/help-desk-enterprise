import type { Server, Socket } from 'socket.io';
import { adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import {
  isManagedSocketRoom,
  revalidateConnectedSocketRooms,
  revalidateSocketRooms,
  socketRoomRevalidationIntervalMs,
  startSocketRoomRevalidation,
} from './socket-room-revalidation';

type FakeSocket = Socket & { rooms: Set<string> };

function createSocket(
  userId: string,
  rooms: readonly string[] = [],
): FakeSocket {
  const set = new Set(rooms);
  const socket = {
    id: `socket-${userId}`,
    data: { principal: { subjectId: userId } },
    rooms: set,
    join: jest.fn(async (room: string) => {
      set.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      set.delete(room);
    }),
  };
  return socket as unknown as FakeSocket;
}

describe('socket room revalidation (Val 3, M11/B1)', () => {
  it('leaves revoked group and admin rooms and joins the new ones', async () => {
    const client = createSocket('user-1', [
      'user:user-1',
      'group:group-old',
      adminRealtimeRoomName,
      'ticket:ticket-1:staff',
    ]);
    const membership = {
      groupIdsForUser: jest.fn().mockResolvedValue(['group-new']),
      isAdmin: jest.fn().mockResolvedValue(false),
    };

    const result = await revalidateSocketRooms(client, membership);

    expect(result).toEqual({ joined: 1, left: 2 });
    expect(client.leave).toHaveBeenCalledWith('group:group-old');
    expect(client.leave).toHaveBeenCalledWith(adminRealtimeRoomName);
    expect(client.join).toHaveBeenCalledWith('group:group-new');
    // Personal and ticket rooms are not this revalidation's business.
    expect(client.leave).not.toHaveBeenCalledWith('user:user-1');
    expect(client.leave).not.toHaveBeenCalledWith('ticket:ticket-1:staff');
    expect([...client.rooms].sort()).toEqual(
      ['group:group-new', 'ticket:ticket-1:staff', 'user:user-1'].sort(),
    );
  });

  it('adds the admin room when the role was granted after connect', async () => {
    const client = createSocket('user-2', ['group:group-1']);
    const membership = {
      groupIdsForUser: jest.fn().mockResolvedValue(['group-1']),
      isAdmin: jest.fn().mockResolvedValue(true),
    };

    await expect(revalidateSocketRooms(client, membership)).resolves.toEqual({
      joined: 1,
      left: 0,
    });
    expect(client.rooms.has(adminRealtimeRoomName)).toBe(true);
  });

  it('does nothing for a socket without a principal', async () => {
    const client = {
      data: {},
      rooms: new Set(['group:group-1']),
      id: 'socket-x',
    } as unknown as Socket;
    const membership = { groupIdsForUser: jest.fn() };

    await expect(revalidateSocketRooms(client, membership)).resolves.toEqual({
      joined: 0,
      left: 0,
    });
    expect(membership.groupIdsForUser).not.toHaveBeenCalled();
  });

  it('keeps the other sockets going when one membership read fails', async () => {
    const failing = createSocket('user-fail', ['group:group-1']);
    const working = createSocket('user-ok', []);
    const membership = {
      groupIdsForUser: jest.fn(async (userId: string) => {
        if (userId === 'user-fail') throw new Error('database unavailable');
        return ['group-2'];
      }),
      isAdmin: jest.fn().mockResolvedValue(false),
    };
    const logger = { warn: jest.fn() };

    const summary = await revalidateConnectedSocketRooms(
      [failing, working],
      membership,
      logger,
    );

    expect(summary).toEqual({ checked: 2, joined: 1, left: 0, failed: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('socket_room_revalidation_failed connectionId=socket-user-fail'),
    );
    // The failed socket keeps its rooms (fail-open, same as the handshake).
    expect(failing.rooms.has('group:group-1')).toBe(true);
  });

  it('revalidates on every interval tick and stops on demand', async () => {
    jest.useFakeTimers();
    try {
      const client = createSocket('user-3', []);
      const membership = {
        groupIdsForUser: jest.fn().mockResolvedValue(['group-3']),
        isAdmin: jest.fn().mockResolvedValue(false),
      };
      const server = {
        sockets: { sockets: new Map([[client.id, client]]) },
      } as unknown as Server;

      const stop = startSocketRoomRevalidation(server, membership, { warn: jest.fn() });

      expect(membership.groupIdsForUser).not.toHaveBeenCalled();
      expect(socketRoomRevalidationIntervalMs).toBe(300_000);
      await jest.advanceTimersByTimeAsync(socketRoomRevalidationIntervalMs);
      expect(membership.groupIdsForUser).toHaveBeenCalledWith('user-3');
      expect(client.rooms.has('group:group-3')).toBe(true);

      stop();
      await jest.advanceTimersByTimeAsync(socketRoomRevalidationIntervalMs);
      expect(membership.groupIdsForUser).toHaveBeenCalledTimes(1);
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
