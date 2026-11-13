import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { TicketPresenceService } from '../tickets/collaboration-extras/presence/ticket-presence.service';
import { allowPresenceMessage } from '../tickets/collaboration-extras/presence/presence-rate-limiter';
import { parsePresenceUpdate } from '../tickets/collaboration-extras/presence/ticket-presence.types';
import { AdminConfigRealtimeHub } from '../../common/admin-realtime/admin-config-realtime.hub';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { SettingsRealtimeHub } from '../settings/settings-realtime.hub';
import { getSocketPrincipal } from './authenticated-socket';
import {
  broadcastTicketMessage,
  broadcastTicketUpdated,
} from './broadcast-ticket-realtime';
import { broadcastEdgeEventRealtime } from './broadcast-edge-realtime';
import {
  broadcastAdminConfigUpdated,
  broadcastAnnouncementChanged,
  broadcastGroupNotificationRealtime,
  broadcastNotificationRealtime,
  broadcastSettingsUpdated,
} from './broadcast-user-realtime';
import { isSocketPrincipal } from './is-socket-principal';
import { WebsocketAbuseLimiter } from './websocket-abuse-limiter';
import {
  allowJoinLeaveMessage,
  countJoinLeaveRejections,
} from './join-leave-rate-limiter';
import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';
import {
  parseTicketSocketPayload,
  ticketPublicRoomName,
  ticketRoomName,
  ticketStaffRoomName,
} from './ticket-socket-rooms';
import {
  runTicketSocketRevalidationBatch,
  startTicketSocketRevalidation,
  TicketSocketRevalidationLimiter,
} from './ticket-socket-revalidation';
import { TicketSocketSubscriptionRegistry } from './ticket-socket-subscriptions';

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigin(),
    // The browser sends the HttpOnly session cookie with the socket handshake.
    credentials: true,
  },
})
export class TicketChatGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TicketChatGateway.name);
  private readonly unsubscribers: Array<() => void> = [];
  private readonly ticketSubscriptions = new TicketSocketSubscriptionRegistry();
  private readonly ticketRevalidationLimiter = new TicketSocketRevalidationLimiter();
  private readonly pendingTicketRevalidations = new Map<string, Promise<void>>();
  private stopTicketSocketRevalidation: (() => void) | null = null;

  constructor(
    private readonly ticketsCollaborationService: TicketsCollaborationService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
    private readonly settingsRealtimeHub: SettingsRealtimeHub,
    private readonly websocketAbuseLimiter: WebsocketAbuseLimiter,
    @Optional()
    private readonly adminConfigRealtimeHub?: AdminConfigRealtimeHub,
    @Optional()
    private readonly presenceService?: TicketPresenceService,
  ) {}

  afterInit(): void {
    if (this.unsubscribers.length > 0) {
      return;
    }
    this.unsubscribers.push(
      this.ticketRealtimeHub.subscribeAwaited((payload) => {
        if (!this.pendingTicketRevalidations.has(payload.ticketId)) {
          broadcastTicketMessage(this.server, payload);
          return;
        }
        return this.awaitTicketRevalidation(payload.ticketId).then(() => {
          broadcastTicketMessage(this.server, payload);
        });
      }),
      this.ticketRealtimeHub.subscribeTicketUpdatedAwaited((payload) => {
        const pending = this.scheduleTicketAccessRevalidation(payload.ticketId);
        if (!this.pendingTicketRevalidations.has(payload.ticketId)) {
          broadcastTicketUpdated(this.server, payload);
          return;
        }
        return pending.then(() => {
          broadcastTicketUpdated(this.server, payload);
        });
      }),
      this.ticketRealtimeHub.subscribeNotification((payload) => {
        broadcastNotificationRealtime(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeAnnouncementChanged((payload) => {
        broadcastAnnouncementChanged(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeGroupNotification((payload) => {
        broadcastGroupNotificationRealtime(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeEdgeEvent((payload) => {
        const emit = () => broadcastEdgeEventRealtime(this.server, payload);
        if (payload.ticketId === undefined) {
          emit();
          return;
        }
        if (!this.pendingTicketRevalidations.has(payload.ticketId)) {
          emit();
          return;
        }
        void this.awaitTicketRevalidation(payload.ticketId).then(emit).catch((error: unknown) => {
          this.logger.warn(
            `ticket_socket_edge_event_withheld ticketId=${payload.ticketId} reason=${errorText(error)}`,
          );
        });
      }),
      this.settingsRealtimeHub.subscribe((payload) => {
        broadcastSettingsUpdated(this.server, payload);
      }),
    );
    if (this.adminConfigRealtimeHub !== undefined) {
      this.unsubscribers.push(
        this.adminConfigRealtimeHub.subscribe((payload) => {
          broadcastAdminConfigUpdated(this.server, payload);
        }),
      );
    }
    this.stopTicketSocketRevalidation = startTicketSocketRevalidation(
      () => this.revalidateActiveTicketSubscriptions(),
      this.logger,
    );
  }

  onModuleDestroy(): void {
    this.stopTicketSocketRevalidation?.();
    this.stopTicketSocketRevalidation = null;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.ticketSubscriptions.clear();
    this.pendingTicketRevalidations.clear();
  }

  @SubscribeMessage(ticketRealtimeEventNames.join)
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean; visibility?: 'public' | 'staff'; code?: 'TICKET_ROOM_LIMIT' }> {
    if (!(await this.allowJoinLeave(client, ticketRealtimeEventNames.join))) {
      return { ok: false };
    }
    const ticketId = requireTicketId(payload);
    if (socketIsDisconnected(client)) return { ok: false };
    if (!this.ticketSubscriptions.beginJoin(client, ticketId)) {
      return { ok: false, code: 'TICKET_ROOM_LIMIT' };
    }
    let joinAttemptFinished = false;
    try {
      // Do not wait while holding the per-socket lock: the invalidation that owns
      // this promise may itself be waiting to revalidate this joining socket.
      await this.awaitTicketRevalidation(ticketId);
      return await withTicketSocketLock(client, ticketId, async () => {
        try {
          await this.authorizeAndReplaceRooms(client, ticketId);
          const subscription = this.ticketSubscriptions.subscriptionFor(
            client,
            ticketId,
          );
          if (subscription === undefined) {
            throw new WsException({ code: 'FORBIDDEN' });
          }
          return { ok: true, visibility: subscription.visibility };
        } catch (error) {
          await this.revokeTicketSubscription(client, ticketId);
          throw error;
        } finally {
          this.ticketSubscriptions.finishJoin(client, ticketId);
          joinAttemptFinished = true;
        }
      });
    } catch (error) {
      if (!joinAttemptFinished) {
        await withTicketSocketLock(client, ticketId, async () => {
          await this.revokeTicketSubscription(client, ticketId);
          this.ticketSubscriptions.finishJoin(client, ticketId);
          joinAttemptFinished = true;
        });
      }
      throw error;
    } finally {
      if (!joinAttemptFinished) {
        this.ticketSubscriptions.finishJoin(client, ticketId);
      }
    }
  }

  @SubscribeMessage(ticketRealtimeEventNames.leave)
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    if (!(await this.allowJoinLeave(client, ticketRealtimeEventNames.leave))) {
      return { ok: false };
    }
    const ticketId = requireTicketId(payload);
    return withTicketSocketLock(client, ticketId, async () => {
      await this.revokeTicketSubscription(client, ticketId);
      return { ok: true };
    });
  }

  /**
   * Presence is accepted only for a current registered ticket subscription. It
   * waits for a pending access epoch and shares the room-operation lock, so a
   * visibility change cannot race a typing/presence update into the old room.
   */
  @SubscribeMessage(ticketRealtimeEventNames.presence)
  async handlePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const input = parsePresenceUpdate(payload);
    const principal = getSocketPrincipal(client);
    const presenceService = this.presenceService;
    if (
      presenceService === undefined ||
      input === null ||
      !isSocketPrincipal(principal) ||
      !allowPresenceMessage(client.data)
    ) {
      return { ok: false };
    }
    if (!(await this.allowSharedUserAction(client, 'presence', 'presence'))) {
      return { ok: false };
    }
    try {
      await this.awaitTicketRevalidation(input.ticketId);
    } catch {
      return { ok: false };
    }
    return withTicketSocketLock(client, input.ticketId, async () => {
      const subscription = this.ticketSubscriptions.subscriptionFor(
        client,
        input.ticketId,
      );
      if (
        subscription === undefined ||
        !this.ticketSubscriptions.hasCurrentSubscription(client, input.ticketId) ||
        !client.rooms.has(ticketRoomName(input.ticketId))
      ) {
        return { ok: false };
      }
      const epoch = this.ticketSubscriptions.currentEpoch(input.ticketId);
      const payloads = await presenceService.update(input, {
        userId: principal.subjectId,
        role: subscription.visibility === 'staff' ? 'staff' : 'requester',
      });
      if (payloads === null) {
        return { ok: false };
      }
      const tracked = client.data.presenceTickets ?? new Set<string>();
      if (input.state === 'leave') tracked.delete(input.ticketId);
      else tracked.add(input.ticketId);
      client.data.presenceTickets = tracked;
      if (
        epoch !== this.ticketSubscriptions.currentEpoch(input.ticketId) ||
        !this.ticketSubscriptions.hasCurrentSubscription(client, input.ticketId)
      ) {
        if (input.state !== 'leave') {
          await this.leaveTicketRooms(client, input.ticketId);
          await this.leavePresence(client, input.ticketId);
        }
        return { ok: false };
      }
      this.emitPresence(input.ticketId, payloads);
      return { ok: true };
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.ticketSubscriptions.removeSocket(client);
    for (const ticketId of client.data.presenceTickets ?? []) {
      await this.leavePresence(client, ticketId);
    }
  }

  /**
   * The original per-socket window protects one connection; the additional
   * Redis-backed account bucket prevents extra sockets/instances multiplying
   * that budget. Limiter errors fail closed before authorization queries.
   */
  private async allowJoinLeave(client: Socket, event: string): Promise<boolean> {
    if (!allowJoinLeaveMessage(client.data)) {
      this.logger.warn(
        `ws_join_leave_rate_limited event=${event} connectionId=${client.id} rejections=${countJoinLeaveRejections(client.data)}`,
      );
      return false;
    }
    return this.allowSharedUserAction(client, event, 'join_leave');
  }

  private async allowSharedUserAction(
    client: Socket,
    event: string,
    action: 'join_leave' | 'presence',
  ): Promise<boolean> {
    const principal = getSocketPrincipal(client);
    if (
      !isSocketPrincipal(principal) ||
      client.data.websocketConnectionLeaseMember !== client.id
    ) {
      return false;
    }
    try {
      if (
        await this.websocketAbuseLimiter.consumeUserAction(
          principal.subjectId,
          action,
        )
      ) {
        return true;
      }
      this.logSharedLimitRejection(client, event, 'rate_limited');
    } catch {
      this.logSharedLimitRejection(client, event, 'limiter_unavailable');
    }
    return false;
  }

  private logSharedLimitRejection(
    client: Socket,
    event: string,
    reason: 'rate_limited' | 'limiter_unavailable',
  ): void {
    const now = Date.now();
    if (now - (client.data.websocketRateLimitLogAt ?? 0) < 10_000) return;
    client.data.websocketRateLimitLogAt = now;
    this.logger.warn(
      `ws_user_action_rejected event=${event} connectionId=${client.id} reason=${reason} fail_closed=${reason === 'limiter_unavailable' ? 1 : 0}`,
    );
  }

  private async revalidateActiveTicketSubscriptions(): Promise<void> {
    const ticketIds = this.ticketSubscriptions.activeTicketIds();
    await runTicketSocketRevalidationBatch(
      ticketIds,
      async (ticketId) => {
        await this.scheduleTicketAccessRevalidation(ticketId);
      },
      1,
    );
  }

  /**
   * A `ticket.updated` projection is the fast invalidation signal. The epoch is
   * advanced synchronously before this method returns its promise, so message,
   * presence and Edge fan-out can wait on the same local reauthorization pass.
   */
  private scheduleTicketAccessRevalidation(ticketId: string): Promise<void> {
    const previous =
      this.pendingTicketRevalidations.get(ticketId) ?? Promise.resolve();
    if (this.ticketSubscriptions.advanceEpoch(ticketId) === null) {
      return previous;
    }
    const current = previous
      .catch(() => undefined)
      .then(() => this.revalidateTicketSubscribers(ticketId));
    this.pendingTicketRevalidations.set(ticketId, current);
    const clear = () => {
      if (this.pendingTicketRevalidations.get(ticketId) === current) {
        this.pendingTicketRevalidations.delete(ticketId);
      }
    };
    void current.then(clear, clear);
    return current;
  }

  private async revalidateTicketSubscribers(ticketId: string): Promise<void> {
    const clients = this.ticketSubscriptions.socketsForTicket(ticketId);
    try {
      await runTicketSocketRevalidationBatch(clients, async (client) => {
        await this.ticketRevalidationLimiter.run(() =>
          withTicketSocketLock(client, ticketId, async () => {
            if (!this.ticketSubscriptions.hasInterest(client, ticketId)) {
              return;
            }
            const previousVisibility = this.ticketSubscriptions.subscriptionFor(client, ticketId)?.visibility;
            try {
              await this.authorizeAndReplaceRooms(client, ticketId);
              const nextVisibility = this.ticketSubscriptions.subscriptionFor(client, ticketId)?.visibility;
              if (previousVisibility !== undefined && previousVisibility !== nextVisibility) {
                client.emit(ticketRealtimeEventNames.ticketAccessInvalidated, { ticketId });
              }
            } catch (error) {
              await this.revokeTicketSubscription(client, ticketId);
              if (previousVisibility !== undefined) {
                client.emit(ticketRealtimeEventNames.ticketAccessInvalidated, { ticketId });
              }
              this.logger.warn(
                `ticket_socket_access_revoked connectionId=${client.id} ticketId=${ticketId} reason=${errorText(error)}`,
              );
            }
          }),
        );
      });
    } catch (error) {
      // A batch-level failure is fail-closed too; do not let a broken sweep leave
      // the existing room set live while the update event is being forwarded.
      this.logger.warn(
        `ticket_socket_revalidation_batch_failed ticketId=${ticketId} reason=${errorText(error)}`,
      );
      await runTicketSocketRevalidationBatch(clients, async (client) => {
        await withTicketSocketLock(client, ticketId, async () => {
          const wasSubscribed = this.ticketSubscriptions.subscriptionFor(client, ticketId) !== undefined;
          await this.revokeTicketSubscription(client, ticketId);
          if (wasSubscribed) client.emit(ticketRealtimeEventNames.ticketAccessInvalidated, { ticketId });
        });
      });
      throw error;
    }
  }

  private async authorizeAndReplaceRooms(
    client: Socket,
    ticketId: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (socketIsDisconnected(client)) {
        throw new WsException({ code: 'FORBIDDEN' });
      }
      const epoch = this.ticketSubscriptions.currentEpoch(ticketId);
      let access: Awaited<ReturnType<TicketsCollaborationService['authorizeSocketJoin']>>;
      try {
        access = await this.authorize(client, ticketId);
      } catch (error) {
        if (this.ticketSubscriptions.currentEpoch(ticketId) !== epoch) {
          continue;
        }
        throw error;
      }
      if (this.ticketSubscriptions.currentEpoch(ticketId) !== epoch) {
        continue;
      }
      await this.replaceTicketRooms(client, ticketId, access.visibility);
      if (socketIsDisconnected(client)) {
        throw new WsException({ code: 'FORBIDDEN' });
      }
      if (
        this.ticketSubscriptions.register(
          client,
          ticketId,
          access.visibility,
          epoch,
        )
      ) {
        return;
      }
      if (!(await this.leaveTicketRooms(client, ticketId))) {
        throw new WsException({ code: 'FORBIDDEN' });
      }
    }
    throw new WsException({ code: 'FORBIDDEN' });
  }

  /** Leaves both audience rooms before joining exactly one of them. */
  private async replaceTicketRooms(
    client: Socket,
    ticketId: string,
    visibility: 'public' | 'staff',
  ): Promise<void> {
    const baseRoom = ticketRoomName(ticketId);
    const desiredRoom =
      visibility === 'staff'
        ? ticketStaffRoomName(ticketId)
        : ticketPublicRoomName(ticketId);
    const otherRoom =
      visibility === 'staff'
        ? ticketPublicRoomName(ticketId)
        : ticketStaffRoomName(ticketId);
    if (
      client.rooms.has(baseRoom) &&
      client.rooms.has(desiredRoom) &&
      !client.rooms.has(otherRoom)
    ) {
      return;
    }
    const leftPreviousRooms = await this.leaveTicketRooms(client, ticketId);
    await this.leavePresence(client, ticketId);
    if (!leftPreviousRooms) {
      throw new WsException({ code: 'FORBIDDEN' });
    }
    await client.join(baseRoom);
    await client.join(desiredRoom);
  }

  private async revokeTicketSubscription(
    client: Socket,
    ticketId: string,
  ): Promise<void> {
    // Keep the slot occupied until room removal is complete so a concurrent
    // join cannot exceed the limit while an adapter leave is still in flight.
    await this.leaveTicketRooms(client, ticketId);
    this.ticketSubscriptions.remove(client, ticketId);
    await this.leavePresence(client, ticketId);
  }

  /** Returns false and disconnects if a room could not be removed. */
  private async leaveTicketRooms(
    client: Socket,
    ticketId: string,
  ): Promise<boolean> {
    let failed = false;
    for (const room of [
      ticketRoomName(ticketId),
      ticketPublicRoomName(ticketId),
      ticketStaffRoomName(ticketId),
    ]) {
      try {
        await client.leave(room);
      } catch {
        failed = true;
      }
    }
    if (!failed) {
      return true;
    }
    this.logger.warn(
      `ticket_socket_room_leave_failed connectionId=${client.id} ticketId=${ticketId}`,
    );
    try {
      client.disconnect(true);
    } catch {
      // A failed local disconnect is logged; the socket server will also clear
      // rooms when its transport closes.
    }
    return false;
  }

  private async awaitTicketRevalidation(ticketId: string): Promise<void> {
    while (true) {
      const pending = this.pendingTicketRevalidations.get(ticketId);
      if (pending === undefined) {
        return;
      }
      await pending;
      if (this.pendingTicketRevalidations.get(ticketId) === undefined) {
        return;
      }
    }
  }

  private async leavePresence(client: Socket, ticketId: string): Promise<void> {
    const principal = getSocketPrincipal(client);
    if (
      this.presenceService === undefined ||
      !isSocketPrincipal(principal) ||
      client.data.presenceTickets?.has(ticketId) !== true
    ) {
      return;
    }
    client.data.presenceTickets.delete(ticketId);
    try {
      const payloads = await this.presenceService.update(
        { ticketId, state: 'leave', channel: 'public' },
        { userId: principal.subjectId, role: 'staff' },
      );
      if (payloads !== null) this.emitPresence(ticketId, payloads);
    } catch {
      // Presence is best effort; the entry expires on its own after 45 s.
    }
  }

  private emitPresence(
    ticketId: string,
    payloads: NonNullable<Awaited<ReturnType<TicketPresenceService['update']>>>,
  ): void {
    this.server
      .to(ticketStaffRoomName(ticketId))
      .emit(ticketRealtimeEventNames.presenceUpdate, payloads.staff);
    this.server
      .to(ticketPublicRoomName(ticketId))
      .emit(ticketRealtimeEventNames.presenceUpdate, payloads.requester);
  }

  private async authorize(client: Socket, ticketId: string) {
    const principal = getSocketPrincipal(client);
    if (!isSocketPrincipal(principal)) {
      throw new WsException({ code: 'FORBIDDEN' });
    }
    return this.ticketsCollaborationService.authorizeSocketJoin(ticketId, {
      actorUserId: principal.subjectId,
    });
  }
}

function requireTicketId(payload: unknown): string {
  const parsed = parseTicketSocketPayload(payload);
  if (parsed === null) {
    throw new WsException({ code: 'NOT_FOUND' });
  }
  return parsed.ticketId;
}

function socketIsDisconnected(client: Socket): boolean {
  return client.disconnected;
}

const ticketSocketLocks = new WeakMap<Socket, Map<string, Promise<void>>>();

async function withTicketSocketLock<T>(
  client: Socket,
  ticketId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const locks = ticketSocketLocks.get(client) ?? new Map<string, Promise<void>>();
  ticketSocketLocks.set(client, locks);
  const previous = locks.get(ticketId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  locks.set(ticketId, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(ticketId) === queued) {
      locks.delete(ticketId);
    }
    if (locks.size === 0) {
      ticketSocketLocks.delete(client);
    }
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
