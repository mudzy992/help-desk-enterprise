import type { Server, Socket } from 'socket.io';
import {
  parseSocketSessionInvalidation,
  type SocketSessionInvalidation,
} from '../../common/security/socket-session-invalidation';
import { disconnectInvalidatedSockets } from './socket-session-invalidation-subscriber';
import type { SocketPrincipal } from './socket-authentication.types';

type FakeClient = Socket & { readonly connectedState: () => boolean };

function createClient(
  id: string,
  principal: SocketPrincipal,
  sockets: Map<string, Socket>,
): FakeClient {
  let connected = true;
  const client = {
    id,
    data: { principal },
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

  it('rejects malformed and oversized invalidation messages', () => {
    expect(parseSocketSessionInvalidation('{invalid-json')).toBeNull();
    expect(
      parseSocketSessionInvalidation(
        JSON.stringify({ version: 2, kind: 'session', sessionId: 's1' }),
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
