import type { Server, Socket } from 'socket.io';
import {
  parseSocketSessionInvalidation,
  type SocketSessionInvalidation,
} from '../../common/security/socket-session-invalidation';
import {
  applySocketSessionInvalidation,
  disconnectInvalidatedSockets,
  leaveGroupRoomForSubject,
} from './socket-session-invalidation-subscriber';
import type { SocketPrincipal } from './socket-authentication.types';

type FakeClient = Socket & { readonly connectedState: () => boolean };

function createClient(
  id: string,
  principal: SocketPrincipal,
  sockets: Map<string, Socket>,
): FakeClient {
  let connected = true;
  const rooms = new Set<string>([id]);
  const client = {
    id,
    data: { principal },
    rooms,
    leave: jest.fn(async (room: string) => {
      rooms.delete(room);
    }),
    disconnect: jest.fn(() => {
      connected = false;
      sockets.delete(id);
    }),
    connectedState: () => connected,
  } as unknown as FakeClient;
  sockets.set(id, client);
  return client;
}

function principal(overrides: Partial<SocketPrincipal> = {}): SocketPrincipal {
  return {
    subjectId: 'user-1',
    sessionId: 'session-1',
    jti: 'token-1',
    issuedAt: 1_800_000_000,
    expiresAt: 1_800_003_600,
    authzVersion: 7,
    ...overrides,
  };
}

function createServer(sockets: Map<string, Socket>): Server {
  return { sockets: { sockets } } as unknown as Server;
}

describe('socket session invalidation delivery', () => {
  it('promptly disconnects only the token revoked by logout', () => {
    const sockets = new Map<string, Socket>();
    const loggedOut = createClient('socket-1', principal(), sockets);
    const otherToken = createClient(
      'socket-2',
      principal({ jti: 'token-2', expiresAt: 1_800_003_700 }),
      sockets,
    );
    const event: SocketSessionInvalidation = {
      version: 1,
      kind: 'token',
      jti: 'token-1',
    };

    expect(disconnectInvalidatedSockets(createServer(sockets), event)).toBe(1);
    expect(loggedOut.disconnect).toHaveBeenCalledWith(true);
    expect(otherToken.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects every socket tied to a revoked registry session', () => {
    const sockets = new Map<string, Socket>();
    const revoked = createClient(
      'socket-1',
      principal({ jti: 'refreshed-token', expiresAt: 1_800_004_000 }),
      sockets,
    );
    const active = createClient(
      'socket-2',
      principal({ sessionId: 'session-2', jti: 'token-2' }),
      sockets,
    );

    expect(
      disconnectInvalidatedSockets(createServer(sockets), {
        version: 1,
        kind: 'session',
        sessionId: 'session-1',
      }),
    ).toBe(1);
    expect(revoked.disconnect).toHaveBeenCalledWith(true);
    expect(active.disconnect).not.toHaveBeenCalled();
  });

  it('preserves only the explicitly excepted session/token during password revoke-all', () => {
    const sockets = new Map<string, Socket>();
    const currentSession = createClient(
      'socket-current',
      principal({ sessionId: 'session-keep' }),
      sockets,
    );
    const oldSession = createClient(
      'socket-old',
      principal({ sessionId: 'session-old', jti: 'token-old' }),
      sockets,
    );
    const legacyKeep = createClient(
      'socket-legacy-keep',
      principal({ sessionId: null, jti: 'legacy-keep' }),
      sockets,
    );
    const legacyOld = createClient(
      'socket-legacy-old',
      principal({ sessionId: null, jti: 'legacy-old' }),
      sockets,
    );
    const event: SocketSessionInvalidation = {
      version: 1,
      kind: 'user',
      subjectId: 'user-1',
      exceptSessionId: 'session-keep',
      exceptJti: 'legacy-keep',
    };

    expect(disconnectInvalidatedSockets(createServer(sockets), event)).toBe(2);
    expect(currentSession.disconnect).not.toHaveBeenCalled();
    expect(oldSession.disconnect).toHaveBeenCalledWith(true);
    expect(legacyKeep.disconnect).not.toHaveBeenCalled();
    expect(legacyOld.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects all sessions after deactivation/authz invalidation batch delivery', () => {
    const sockets = new Map<string, Socket>();
    const affected = createClient('socket-1', principal(), sockets);
    const unaffected = createClient(
      'socket-2',
      principal({ subjectId: 'user-2', sessionId: 'session-2', jti: 'token-2' }),
      sockets,
    );
    const event = parseSocketSessionInvalidation(
      JSON.stringify({ version: 1, kind: 'users', subjectIds: ['user-1'] }),
    );
    expect(event).not.toBeNull();

    expect(disconnectInvalidatedSockets(createServer(sockets), event!)).toBe(1);
    expect(affected.disconnect).toHaveBeenCalledWith(true);
    expect(unaffected.disconnect).not.toHaveBeenCalled();
  });

  /*
    W2.25 (`BA-groups-02`): a `group` event is a room loss, not a session loss. The
    removed member keeps working (their other groups, their session) but stops
    receiving anything from that group's room — on every instance, immediately after
    the membership transaction commits.
  */
  it('drops the group room of the revoked member without ending the session', async () => {
    const sockets = new Map<string, Socket>();
    const removed = createClient('socket-1', principal(), sockets);
    const otherMember = createClient('socket-2', principal({ subjectId: 'user-2' }), sockets);
    (removed.rooms as Set<string>).add('group:group-1');
    (otherMember.rooms as Set<string>).add('group:group-1');

    const event = parseSocketSessionInvalidation(
      JSON.stringify({ version: 1, kind: 'group', subjectId: 'user-1', groupId: 'group-1' }),
    );
    expect(event).not.toBeNull();

    await expect(applySocketSessionInvalidation(createServer(sockets), event!)).resolves.toBe(1);

    expect(removed.leave).toHaveBeenCalledWith('group:group-1');
    expect((removed.rooms as Set<string>).has('group:group-1')).toBe(false);
    // The session itself stays: only the room was revoked.
    expect(removed.disconnect).not.toHaveBeenCalled();
    // Another member of the same group is untouched.
    expect(otherMember.leave).not.toHaveBeenCalled();
    expect((otherMember.rooms as Set<string>).has('group:group-1')).toBe(true);
  });

  it('ignores a room the subject is not in, and never touches other subjects', async () => {
    const sockets = new Map<string, Socket>();
    const outsider = createClient('socket-1', principal(), sockets);

    await expect(leaveGroupRoomForSubject(createServer(sockets), 'user-1', 'group-9')).resolves.toBe(0);
    expect(outsider.leave).not.toHaveBeenCalled();
  });

  it('disconnects the socket when the room leave cannot be confirmed', async () => {
    const sockets = new Map<string, Socket>();
    const broken = createClient('socket-1', principal(), sockets);
    (broken.rooms as Set<string>).add('group:group-1');
    (broken.leave as jest.Mock).mockRejectedValueOnce(new Error('adapter down'));

    await expect(leaveGroupRoomForSubject(createServer(sockets), 'user-1', 'group-1')).resolves.toBe(0);
    // Fail closed: an uncertain subscription must not survive a revocation.
    expect(broken.disconnect).toHaveBeenCalledWith(true);
  });

  it('does not disconnect anything for a group event through the session path', () => {
    const sockets = new Map<string, Socket>();
    const client = createClient('socket-1', principal(), sockets);
    const event = parseSocketSessionInvalidation(
      JSON.stringify({ version: 1, kind: 'group', subjectId: 'user-1', groupId: 'group-1' }),
    )!;

    expect(disconnectInvalidatedSockets(createServer(sockets), event)).toBe(0);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects malformed and oversized invalidation messages', () => {
    expect(parseSocketSessionInvalidation('{invalid-json')).toBeNull();
    expect(
      parseSocketSessionInvalidation(
        JSON.stringify({ version: 2, kind: 'session', sessionId: 's1' }),
      ),
    ).toBeNull();
    expect(
      parseSocketSessionInvalidation(
        JSON.stringify({ version: 1, kind: 'group', subjectId: 'user-1' }),
      ),
    ).toBeNull();
    expect(
      parseSocketSessionInvalidation(
        JSON.stringify({ version: 1, kind: 'group', groupId: 'group-1' }),
      ),
    ).toBeNull();
    expect(
      parseSocketSessionInvalidation(
        JSON.stringify({
          version: 1,
          kind: 'users',
          subjectIds: Array.from({ length: 201 }, (_unused, index) => `u-${index}`),
        }),
      ),
    ).toBeNull();
  });
});
