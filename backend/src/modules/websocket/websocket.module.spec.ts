import { Test } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { PrismaModule } from '../../common/prisma/prisma.module';
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
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, WebsocketModule],
    }).compile();
    const gateway = moduleRef.get(WebsocketGateway);
    expect(gateway).toBeDefined();
    let middleware: HandshakeMiddleware | undefined;
    gateway.afterInit({
      use: (handler: HandshakeMiddleware) => {
        middleware = handler;
      },
    } as Server);
    expect(middleware).toBeDefined();
    const socket = {
      id: 'connection-module-1',
      handshake: { auth: { token: 'synthetic-handshake-token-test-only' } },
      data: {},
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
