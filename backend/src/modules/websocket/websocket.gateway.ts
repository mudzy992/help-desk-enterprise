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
import {
  attachSocketRequestId,
  runWithSocketRequestId,
} from './attach-socket-request-id';
import { createSocketAuthenticationFailureError } from './create-socket-authentication-failure-error';
import { isSocketPrincipal } from './is-socket-principal';
import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';
import { SocketAuthenticationService } from './socket-authentication.service';
import { SocketGroupMembershipService } from './socket-group-membership.service';
import { groupRoomName, userRoomName } from './ticket-socket-rooms';

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
    private readonly socketGroupMembershipService: SocketGroupMembershipService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: Socket, next: (error?: Error) => void) => {
      void this.authenticateHandshake(socket, next);
    });
  }

  handleConnection(client: Socket): void {
    runWithSocketRequestId(client, () => {
      const principal = getSocketPrincipal(client);
      if (!isSocketPrincipal(principal)) {
        this.logger.warn(
          `socket_connection_rejected connectionId=${client.id} reason=unauthenticated`,
        );
        client.disconnect(true);
        return;
      }
      void client.join(userRoomName(principal.subjectId));
      void this.joinHandlerGroupRooms(client, principal.subjectId);
      this.logger.log(`socket_connected connectionId=${client.id}`);
    });
  }

  handleDisconnect(client: Socket): void {
    runWithSocketRequestId(client, () => {
      this.logger.log(`socket_disconnected connectionId=${client.id}`);
    });
  }

  private async joinHandlerGroupRooms(
    client: Socket,
    userId: string,
  ): Promise<void> {
    await runWithSocketRequestId(client, async () => {
      try {
        const groupIds =
          await this.socketGroupMembershipService.groupIdsForUser(userId);
        await Promise.all(
          groupIds.map((groupId) => client.join(groupRoomName(groupId))),
        );
      } catch {
        this.logger.warn(
          `socket_group_rooms_failed connectionId=${client.id}`,
        );
      }
    });
  }

  private async authenticateHandshake(
    socket: Socket,
    next: (error?: Error) => void,
  ): Promise<void> {
    const requestId = attachSocketRequestId(socket);
    await runWithSocketRequestId(socket, async () => {
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
        this.logger.log(
          `socket_authentication_accepted connectionId=${socket.id} requestId=${requestId}`,
        );
        next();
      } catch {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=invalid_credentials`,
        );
        next(createSocketAuthenticationFailureError());
      }
    });
  }
}
