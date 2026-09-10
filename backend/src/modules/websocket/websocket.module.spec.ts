import { Test } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { SOCKET_AUTHENTICATION_FAILED_MESSAGE } from './socket-authentication-failed-message';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketModule } from './websocket.module';

type HandshakeMiddleware = (
  socket: Socket,
  next: (error?: Error) => void,
) => void;

describe('WebsocketModule', () => {
  it('initializes the gateway and rejects handshake until an auth provider exists', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WebsocketModule],
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
