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
import {
  resolveSocketClientAddress,
  startSocketConnectionLeaseRenewal,
  WebsocketAbuseLimiter,
} from './websocket-abuse-limiter';
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
import { WebsocketAdapterHealthService } from './websocket-adapter-health.service';
import type {
  WebsocketAdapterHealthReason,
  WebsocketAdapterHealthState,
} from './websocket-adapter-health.types';
import {
  startWebsocketEmitCountReporter,
} from './websocket-emit-counter';
import {
  recordWebsocketRoomSetupFailure,
  startWebsocketRoomSetupFailureReporter,
} from './websocket-room-setup-counter';
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
  private stopRoomSetupFailureReporter: (() => void) | null = null;
  private stopRoomRevalidation: (() => void) | null = null;
  private stopSessionRevalidation: (() => void) | null = null;
  private stopSessionInvalidationSubscriber: (() => void) | null = null;
  private stopRealtimeAdapterHealthMonitor: (() => void) | null = null;
  private stopConnectionLeaseRenewal: (() => void) | null = null;
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
    private readonly adapterHealth: WebsocketAdapterHealthService,
    private readonly websocketAbuseLimiter: WebsocketAbuseLimiter,
    // Optional on purpose: isolated gateway specs build without the global Redis
    // module. A missing runtime configuration is still reported as degraded;
    // in-memory mode is not an effective horizontal fallback.
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
    this.setAdapterHealth('starting', 'startup');
    if (this.redisConfiguration === undefined) {
      this.setAdapterHealth('degraded', 'redis_unconfigured');
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
    this.stopRoomSetupFailureReporter =
      startWebsocketRoomSetupFailureReporter(this.logger);
    // BA-websocket-03: membership and the admin role are read at handshake;
    // this re-reads them every 30 seconds as a bounded reconciliation fallback.
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
    this.stopConnectionLeaseRenewal = startSocketConnectionLeaseRenewal(
      server,
      this.websocketAbuseLimiter,
      this.logger,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stopClientCountReporter?.();
    this.stopClientCountReporter = null;
    this.stopEmitCountReporter?.();
    this.stopEmitCountReporter = null;
    this.stopRoomSetupFailureReporter?.();
    this.stopRoomSetupFailureReporter = null;
    this.stopRoomRevalidation?.();
    this.stopRoomRevalidation = null;
    this.stopSessionRevalidation?.();
    this.stopSessionRevalidation = null;
    this.stopSessionInvalidationSubscriber?.();
    this.stopSessionInvalidationSubscriber = null;
    this.stopRealtimeAdapterHealthMonitor?.();
    this.stopRealtimeAdapterHealthMonitor = null;
    this.stopConnectionLeaseRenewal?.();
    this.stopConnectionLeaseRenewal = null;
    // BA-websocket-12: Nest awaits async destroy hooks, so the Redis adapter
    // clients are actually closed (quit/disconnect) before the process exits
    // instead of being fire-and-forget against a dying event loop.
    const adapter = this.realtimeAdapter;
    this.realtimeAdapter = null;
    await adapter?.close();
  }

  /**
   * Rooms must mean the same thing on every instance, so install the adapter
   * before the first client joins. Runtime Redis loss keeps the Redis adapter
   * installed for ioredis recovery; switching to local rooms would silently split
   * the cluster. Readiness stays failed until a live Pub/Sub probe passes.
   */
  private applyRealtimeAdapter(server: Server): void {
    if (this.adapterSubscriptionCheck === 'denied') {
      this.setAdapterHealth('degraded', 'acl_denied', false);
      this.logger.warn(
        `${formatWebsocketAdapterStatus(false, 'degraded')} fallback=in_memory reason=acl_denied`,
      );
      return;
    }
    if (this.redisConfiguration === undefined) {
      this.setAdapterHealth('degraded', 'redis_unconfigured', false);
      this.logger.warn(
        `${formatWebsocketAdapterStatus(false, 'degraded')} fallback=in_memory reason=redis_unconfigured`,
      );
      return;
    }
    const handle = createWebsocketRedisAdapter(
      this.redisConfiguration,
      this.logger,
      (reason) => this.setAdapterHealth('degraded', reason),
    );
    if (handle === null) {
      this.setAdapterHealth('degraded', 'client_creation_failed', false);
      this.logger.warn(
        `${formatWebsocketAdapterStatus(false, 'degraded')} fallback=in_memory reason=client_creation_failed`,
      );
      return;
    }
    try {
      server.adapter(handle.adapter);
      this.realtimeAdapter = handle;
      this.stopRealtimeAdapterHealthMonitor = handle.startHealthMonitor(
        (state, reason) => this.setAdapterHealth(state, reason),
      );
    } catch (error) {
      this.setAdapterHealth('degraded', 'adapter_install_failed');
      this.logger.warn(
        `ws_adapter_redis_install_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
      void handle.close();
    }
  }

  private setAdapterHealth(
    state: WebsocketAdapterHealthState,
    reason: WebsocketAdapterHealthReason,
    logTransition = true,
  ): void {
    const changed = this.adapterHealth.setState(state, reason);
    if (!changed || !logTransition) {
      return;
    }
    const message = `${formatWebsocketAdapterStatus(state === 'healthy', state)} reason=${reason}`;
    if (state === 'healthy') {
      this.logger.log(message);
      return;
    }
    this.logger.warn(message);
  }

  async handleConnection(client: Socket): Promise<void> {
    await runWithSocketRequestId(client, async () => {
      const principal = getSocketPrincipal(client);
      if (!isSocketPrincipal(principal)) {
        this.logger.warn(
          `socket_connection_rejected connectionId=${client.id} reason=unauthenticated`,
        );
        client.disconnect(true);
        return;
      }
      if (client.data.websocketConnectionLeaseMember !== client.id) {
        this.logger.warn(
          `socket_connection_rejected connectionId=${client.id} reason=admission_missing`,
        );
        client.disconnect(true);
        return;
      }

      try {
        await client.join(userRoomName(principal.subjectId));
      } catch {
        recordWebsocketRoomSetupFailure('user');
        this.logger.warn(
          `socket_room_setup_failed connectionId=${client.id} room=user fail_closed=1`,
        );
        client.disconnect(true);
        return;
      }
      if (client.disconnected) return;

      const groupRoomsReady = await this.joinHandlerGroupRooms(
        client,
        principal.subjectId,
      );
      if (client.disconnected) return;
      this.logger.log(
        `socket_connected connectionId=${client.id} group_rooms_ready=${groupRoomsReady ? 1 : 0}`,
      );
    });
  }

  handleDisconnect(client: Socket): void {
    runWithSocketRequestId(client, () => {
      this.logger.log(`socket_disconnected connectionId=${client.id}`);
      const principal = getSocketPrincipal(client);
      const member = client.data.websocketConnectionLeaseMember;
      delete client.data.websocketConnectionLeaseMember;
      if (isSocketPrincipal(principal) && member === client.id) {
        void this.websocketAbuseLimiter
          .releaseConnection(principal.subjectId, member)
          .catch(() => {
            this.logger.warn(
              `ws_connection_lease_release_failed connectionId=${client.id}`,
            );
          });
      }
    });
  }

  private async joinHandlerGroupRooms(
    client: Socket,
    userId: string,
  ): Promise<boolean> {
    return runWithSocketRequestId(client, async () => {
      const principal = getSocketPrincipal(client);
      if (!isSocketPrincipal(principal) || principal.subjectId !== userId) {
        client.disconnect(true);
        return false;
      }
      try {
        await revalidateSocketRooms(
          client,
          this.socketGroupMembershipService,
        );
        return !client.disconnected;
      } catch {
        // Failed room reconciliation has already removed managed rooms; a
        // failed leave disconnects in the revalidation helper.
        recordWebsocketRoomSetupFailure('group');
        this.logger.warn(
          `socket_group_rooms_failed connectionId=${client.id} fail_closed=1`,
        );
        return false;
      }
    });
  }

  private async authenticateHandshake(
    socket: Socket,
    next: (error?: Error) => void,
  ): Promise<void> {
    const requestId = attachSocketRequestId(socket);
    await runWithSocketRequestId(socket, async () => {
      const clientAddress = resolveSocketClientAddress(socket);
      if (clientAddress === null) {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=client_address_missing`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }

      try {
        if (!(await this.websocketAbuseLimiter.consumeHandshakeIp(clientAddress))) {
          this.logger.warn(
            `socket_authentication_rejected connectionId=${socket.id} reason=ip_rate_limited`,
          );
          next(createSocketAuthenticationFailureError());
          return;
        }
      } catch {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=admission_control_unavailable fail_closed=1`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }

      let outcome: Awaited<
        ReturnType<SocketAuthenticationService['authenticate']>
      >;
      try {
        outcome = await this.socketAuthenticationService.authenticate(
          socket.handshake.auth,
          socket.handshake.headers,
        );
      } catch {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=invalid_credentials`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }
      if (outcome.status !== 'authenticated') {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=${outcome.reason}`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }

      let admitted: boolean;
      try {
        admitted = await this.websocketAbuseLimiter.admitConnection(
          outcome.principal.subjectId,
          socket.id,
        );
      } catch {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=admission_control_unavailable fail_closed=1`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }
      if (!admitted) {
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=user_rate_or_connection_cap`,
        );
        next(createSocketAuthenticationFailureError());
        return;
      }

      try {
        attachSocketPrincipal(socket, outcome.principal);
        socket.data.websocketConnectionLeaseMember = socket.id;
        clearHandshakeCredentials(socket);
        this.logger.log(
          `socket_authentication_accepted connectionId=${socket.id} requestId=${requestId}`,
        );
        next();
      } catch {
        delete socket.data.websocketConnectionLeaseMember;
        await this.websocketAbuseLimiter
          .releaseConnection(outcome.principal.subjectId, socket.id)
          .catch(() => undefined);
        this.logger.warn(
          `socket_authentication_rejected connectionId=${socket.id} reason=handshake_finalize_failed`,
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
