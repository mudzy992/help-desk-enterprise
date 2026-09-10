import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  attachSocketPrincipal,
  getSocketPrincipal,
} from './authenticated-socket';
import { createSocketAuthenticationFailureError } from './create-socket-authentication-failure-error';
import { isSocketPrincipal } from './is-socket-principal';
import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';
import { SocketAuthenticationService } from './socket-authentication.service';

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigin(),
  },
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly socketAuthenticationService: SocketAuthenticationService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: Socket, next: (error?: Error) => void) => {
      void this.authenticateHandshake(socket, next);
    });
  }

  handleConnection(client: Socket): void {
    const principal = getSocketPrincipal(client);
    if (!isSocketPrincipal(principal)) {
      this.logger.warn(
        `socket_connection_rejected connectionId=${client.id} reason=unauthenticated`,
      );
      client.disconnect(true);
      return;
    }
    this.logger.log(`socket_connected connectionId=${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`socket_disconnected connectionId=${client.id}`);
  }

  private async authenticateHandshake(
    socket: Socket,
    next: (error?: Error) => void,
  ): Promise<void> {
    try {
      const outcome = await this.socketAuthenticationService.authenticate(
        socket.handshake.auth,
      );
      if (outcome.status !== 'authenticated') {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=${outcome.reason}`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }
      attachSocketPrincipal(socket, outcome.principal);
      this.logger.log(`socket_authentication_accepted connectionId=${socket.id}`);
      next();
    } catch {
      this.logger.warn(
        `socket_authentication_rejected connectionId=${socket.id} reason=invalid_credentials`,
      );
      next(createSocketAuthenticationFailureError());
    }
  }
}
