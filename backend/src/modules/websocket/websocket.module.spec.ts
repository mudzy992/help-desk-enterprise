import { Test } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { createFakeRedisClient } from '../../common/redis/create-fake-redis-client';
import { RedisModule } from '../../common/redis/redis.module';
import { redisTokens } from '../../common/redis/redis.tokens';
import { SOCKET_AUTHENTICATION_FAILED_MESSAGE } from './socket-authentication-failed-message';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketModule } from './websocket.module';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type HandshakeMiddleware = (
  socket: Socket,
  next: (error?: Error) => void,
) => void;

describe('WebsocketModule', () => {
  it('initializes the gateway and rejects handshake with an invalid session token', async () => {
    // Phase 2.2: the session guard resolves through the principal context loader,
    // which lives in the global Redis module — the app graph has it, so the
    // module graph under test has it too (with the client stubbed out).
    process.env.REDIS_HOST = '127.0.0.1';
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, RedisModule, WebsocketModule],
    })
      .overrideProvider(redisTokens.client)
      .useValue(createFakeRedisClient())
      .compile();
    const gateway = moduleRef.get(WebsocketGateway);
    expect(gateway).toBeDefined();
    let middleware: HandshakeMiddleware | undefined;
    const adapter = jest.fn();
    gateway.afterInit({
      use: (handler: HandshakeMiddleware) => {
        middleware = handler;
      },
      adapter,
    } as unknown as Server);
    // Phase 3.1: the Redis adapter is installed at init, so two instances share
    // one set of rooms. The clients are lazy, so this spec opens no connection.
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(middleware).toBeDefined();
    const socket = {
      id: 'connection-module-1',
      handshake: { auth: { token: 'synthetic-handshake-token-test-only' } },
      data: {},
      join: jest.fn(),
    } as unknown as Socket;
    const error = await new Promise<Error | undefined>((resolve) => {
      middleware?.(socket, (handshakeError?: Error) => {
        resolve(handshakeError);
      });
    });
    expect(error?.message).toBe(SOCKET_AUTHENTICATION_FAILED_MESSAGE);
    expect(error?.message).not.toContain('synthetic-handshake-token-test-only');
    expect(socket.data.principal).toBeUndefined();
    await moduleRef.close();
  });
});
