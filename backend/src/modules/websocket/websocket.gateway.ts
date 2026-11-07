import { Inject, Logger, Optional } from '@nestjs/common';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { redisTokens } from '../../common/redis/redis.tokens';
import type { RedisConfiguration } from '../../common/redis/redis.types';
import { SESSION_COOKIE_NAME } from '../authentication/session-cookie';
import { SessionTokenService } from '../authentication/session-token.service';
import { startWebsocketClientCountReporter } from '../observability/metrics/websocket-client-count.reporter';
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
import {
  revalidateSocketRooms,
  startSocketRoomRevalidation,
} from './socket-room-revalidation';
import { startSocketSessionInvalidationSubscriber } from './socket-session-invalidation-subscriber';
import { startSocketSessionRevalidation } from './socket-session-revalidation';
import { userRoomName } from './ticket-socket-rooms';
import {
  startWebsocketEmitCountReporter,
} from './websocket-emit-counter';
import {
  checkRealtimeAdapterSubscriptions,
  createWebsocketRedisAdapter,
  formatWebsocketAdapterStatus,
  type RealtimeAdapterSubscriptionCheck,
  type WebsocketRedisAdapterHandle,
} from './ws-redis-adapter';

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigin(),
    // The browser sends the HttpOnly session cookie with the socket handshake.
    credentials: true,
  },
})
export class WebsocketGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(WebsocketGateway.name);

  private stopClientCountReporter: (() => void) | null = null;
  private stopEmitCountReporter: (() => void) | null = null;
  private stopRoomRevalidation: (() => void) | null = null;
  private stopSessionRevalidation: (() => void) | null = null;
  private stopSessionInvalidationSubscriber: (() => void) | null = null;
  private realtimeAdapter: WebsocketRedisAdapterHandle | null = null;

  /**
   * Faza 3.1, dopuna: whether the ACL lets this user subscribe to the adapter's
   * channels. Resolved once at module init (before the WebSocket server exists)
   * and read synchronously when the adapter is installed.
   */
  private adapterSubscriptionCheck: RealtimeAdapterSubscriptionCheck = 'unknown';

  constructor(
    private readonly socketAuthenticationService: SocketAuthenticationService,
    private readonly socketGroupMembershipService: SocketGroupMembershipService,
    private readonly sessionTokenService: SessionTokenService,
    // Optional on purpose: the unit specs build the gateway without the global
    // Redis module. No configuration means no adapter — the in-memory one stays,
    // which is exactly the degraded mode Phase 3.1 asks for.
    @Optional()
    @Inject(redisTokens.configuration)
    private readonly redisConfiguration?: RedisConfiguration,
  ) {}

  /**
   * Runs before `afterInit` (Nest calls every `onModuleInit` in `init()`, while
   * the WebSocket server is created when the HTTP server starts listening), so
   * the adapter decision is already known when it is applied.
   */
  async onModuleInit(): Promise<void> {
    if (this.redisConfiguration === undefined) {
      return;
    }
    this.adapterSubscriptionCheck = await checkRealtimeAdapterSubscriptions(
      this.redisConfiguration,
      this.logger,
    );
  }

  afterInit(server: Server): void {
    server.use((socket: Socket, next: (error?: Error) => void) => {
      void this.authenticateHandshake(socket, next);
    });
    this.applyRealtimeAdapter(server);
    // Phase 0 observability only: one debug line per interval, no room or auth
    // behaviour is touched here.
    this.stopClientCountReporter = startWebsocketClientCountReporter(
      server,
      this.logger,
    );
    // Phase 3.2 metric: emit-ova/s po vrsti sobe (staff/public/user/group).
    this.stopEmitCountReporter = startWebsocketEmitCountReporter(this.logger);
    // Val 3 (M11/B1): membership and the admin role are read at handshake; this
    // re-reads them every 5 minutes so a revoked room is actually left.
    this.stopRoomRevalidation = startSocketRoomRevalidation(
      server,
      this.socketGroupMembershipService,
      this.logger,
    );
    this.stopSessionRevalidation = startSocketSessionRevalidation(
      server,
      {
        isCurrent: (principal) =>
          this.sessionTokenService.isSocketSessionCurrent(principal),
      },
      this.logger,
    );
    if (this.redisConfiguration !== undefined) {
      this.stopSessionInvalidationSubscriber =
        startSocketSessionInvalidationSubscriber(
          this.redisConfiguration,
          server,
          this.logger,
        );
    }
  }

  onModuleDestroy(): void {
    this.stopClientCountReporter?.();
    this.stopClientCountReporter = null;
    this.stopEmitCountReporter?.();
    this.stopEmitCountReporter = null;
    this.stopRoomRevalidation?.();
    this.stopRoomRevalidation = null;
    this.stopSessionRevalidation?.();
    this.stopSessionRevalidation = null;
    this.stopSessionInvalidationSubscriber?.();
    this.stopSessionInvalidationSubscriber = null;
    void this.realtimeAdapter?.close();
    this.realtimeAdapter = null;
  }

  /**
   * Phase 3.1 (plan §3.1): rooms must mean the same thing on every instance, so
   * the adapter is installed before the first client joins. Nothing here touches
   * the handshake or the room rules — only how an emit travels between processes.
   */
  private applyRealtimeAdapter(server: Server): void {
    // An ACL that denies the channel would kill the process on the adapter's
    // first `PSUBSCRIBE` (the adapter does not await it), so a known denial is
    // answered here instead: in-memory adapter, one explicit log line, API up.
    if (this.adapterSubscriptionCheck === 'denied') {
      this.logger.warn(
        `${formatWebsocketAdapterStatus(false)} fallback=in_memory reason=acl_denied`,
      );
      return;
    }
    const handle =
      this.redisConfiguration === undefined
        ? null
        : createWebsocketRedisAdapter(this.redisConfiguration, this.logger);
    if (handle === null) {
      this.logger.warn(
        `${formatWebsocketAdapterStatus(false)} fallback=in_memory`,
      );
      return;
    }
    server.adapter(handle.adapter);
    this.realtimeAdapter = handle;
    this.logger.log(formatWebsocketAdapterStatus(true));
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
      const principal = getSocketPrincipal(client);
      if (!isSocketPrincipal(principal) || principal.subjectId !== userId) {
        client.disconnect(true);
        return;
      }
      try {
        await revalidateSocketRooms(
          client,
          this.socketGroupMembershipService,
        );
      } catch {
        // Failed room reconciliation has already removed managed rooms; a
        // failed leave disconnects in the revalidation helper.
        this.logger.warn(
          `socket_group_rooms_failed connectionId=${client.id} fail_closed=1`,
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
          socket.handshake.headers,
        );
        if (outcome.status !== 'authenticated') {
          this.logger.warn(
            `socket_authentication_rejected connectionId=${socket.id} reason=${outcome.reason}`,
          );
          next(createSocketAuthenticationFailureError());
          return;
        }
        attachSocketPrincipal(socket, outcome.principal);
        clearHandshakeCredentials(socket);
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

function clearHandshakeCredentials(socket: Socket): void {
  if (typeof socket.handshake.auth === 'object' && socket.handshake.auth !== null) {
    delete socket.handshake.auth['token'];
  }
  const cookieHeader = socket.handshake.headers.cookie;
  if (typeof cookieHeader === 'string') {
    const remainingCookies = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => {
        const separator = cookie.indexOf('=');
        return (
          separator < 0 ||
          cookie.slice(0, separator).trim() !== SESSION_COOKIE_NAME
        );
      });
    if (remainingCookies.length === 0) {
      delete socket.handshake.headers.cookie;
    } else {
      socket.handshake.headers.cookie = remainingCookies.join('; ');
    }
  }
  delete socket.handshake.headers.authorization;
}
