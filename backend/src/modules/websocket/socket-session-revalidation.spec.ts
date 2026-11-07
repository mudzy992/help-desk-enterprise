import type { Socket } from 'socket.io';
import type { SocketPrincipal } from './socket-authentication.types';
import { revalidateConnectedSocketSessions } from './socket-session-revalidation';

type FakeClient = Socket & {
  readonly receivedEvents: string[];
  readonly deliver: (event: string) => void;
  readonly connectedState: () => boolean;
};

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

function createClient(id: string, lease: SocketPrincipal): FakeClient {
  let connected = true;
  const receivedEvents: string[] = [];
  return {
    id,
    data: { principal: lease },
    receivedEvents,
    disconnect: jest.fn(() => {
      connected = false;
    }),
    connectedState: () => connected,
    deliver: (event: string) => {
      if (connected) receivedEvents.push(event);
    },
  } as unknown as FakeClient;
}

describe('socket session revalidation (BA-websocket-01)', () => {
  it('disconnects all sockets for a revoked token and delivers no later events', async () => {
    const lease = principal();
    const first = createClient('socket-1', lease);
    const second = createClient('socket-2', lease);
    first.deliver('ticket.updated:before-revoke');
    const checker = { isCurrent: jest.fn(async () => false) };
    const logger = { warn: jest.fn() };

    const result = await revalidateConnectedSocketSessions(
      [first, second],
      checker,
      logger,
      { nowSeconds: 1_800_000_001 },
    );

    expect(result).toEqual({
      checked: 1,
      disconnected: 2,
      expired: 0,
      invalid: 0,
      failed: 0,
    });
    expect(checker.isCurrent).toHaveBeenCalledTimes(1);
    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(second.disconnect).toHaveBeenCalledWith(true);
    first.deliver('ticket.updated:after-revoke');
    expect(first.receivedEvents).toEqual(['ticket.updated:before-revoke']);
    expect(first.connectedState()).toBe(false);
  });

  it('disconnects immediately when the JWT lease has expired', async () => {
    const expired = createClient(
      'socket-expired',
      principal({ issuedAt: 1_799_999_000, expiresAt: 1_800_000_000 }),
    );
    const checker = { isCurrent: jest.fn(async () => true) };

    const result = await revalidateConnectedSocketSessions(
      [expired],
      checker,
      { warn: jest.fn() },
      { nowSeconds: 1_800_000_000 },
    );

    expect(result.expired).toBe(1);
    expect(expired.disconnect).toHaveBeenCalledWith(true);
    expect(checker.isCurrent).not.toHaveBeenCalled();
  });

  it('fails closed when the durable session check throws', async () => {
    const client = createClient('socket-1', principal({ authzVersion: 8 }));
    const logger = { warn: jest.fn() };
    const checker = { isCurrent: jest.fn(async () => { throw new Error('database unavailable'); }) };

    const result = await revalidateConnectedSocketSessions(
      [client],
      checker,
      logger,
      { nowSeconds: 1_800_000_001 },
    );

    expect(result).toMatchObject({ checked: 1, disconnected: 1, failed: 1 });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'socket_session_revalidation_failed groups=1 invalid=0 fail_closed=1',
    );
  });

  it('disconnects sockets with missing or malformed lease metadata', async () => {
    const malformed = {
      id: 'socket-invalid',
      data: { principal: { subjectId: 'user-1' } },
      disconnect: jest.fn(),
    } as unknown as Socket;
    const checker = { isCurrent: jest.fn(async () => true) };

    const result = await revalidateConnectedSocketSessions(
      [malformed],
      checker,
      { warn: jest.fn() },
    );

    expect(result.invalid).toBe(1);
    expect(malformed.disconnect).toHaveBeenCalledWith(true);
    expect(checker.isCurrent).not.toHaveBeenCalled();
  });
});
