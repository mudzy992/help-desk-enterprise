import { OnModuleDestroy, Optional } from '@nestjs/common';
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
  broadcastGroupNotificationRealtime,
  broadcastNotificationRealtime,
  broadcastSettingsUpdated,
} from './broadcast-user-realtime';
import { isSocketPrincipal } from './is-socket-principal';
import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';
import {
  parseTicketSocketPayload,
  ticketPublicRoomName,
  ticketRoomName,
  ticketStaffRoomName,
} from './ticket-socket-rooms';

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigin(),
  },
})
export class TicketChatGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly ticketsCollaborationService: TicketsCollaborationService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
    private readonly settingsRealtimeHub: SettingsRealtimeHub,
    @Optional()
    private readonly adminConfigRealtimeHub?: AdminConfigRealtimeHub,
    @Optional()
    private readonly presenceService?: TicketPresenceService,
  ) {}

  afterInit(): void {
    this.unsubscribers.push(
      this.ticketRealtimeHub.subscribe((payload) => {
        broadcastTicketMessage(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeTicketUpdated((payload) => {
        broadcastTicketUpdated(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeNotification((payload) => {
        broadcastNotificationRealtime(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeGroupNotification((payload) => {
        broadcastGroupNotificationRealtime(this.server, payload);
      }),
      this.ticketRealtimeHub.subscribeEdgeEvent((payload) => {
        broadcastEdgeEventRealtime(this.server, payload);
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
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
  }

  @SubscribeMessage(ticketRealtimeEventNames.join)
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true; visibility: 'public' | 'staff' }> {
    const ticketId = requireTicketId(payload);
    const access = await this.authorize(client, ticketId);
    await client.join(ticketRoomName(ticketId));
    await client.join(
      access.visibility === 'staff'
        ? ticketStaffRoomName(ticketId)
        : ticketPublicRoomName(ticketId),
    );
    return { ok: true, visibility: access.visibility };
  }

  @SubscribeMessage(ticketRealtimeEventNames.leave)
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true }> {
    const ticketId = requireTicketId(payload);
    await this.leavePresence(client, ticketId);
    await client.leave(ticketRoomName(ticketId));
    await client.leave(ticketPublicRoomName(ticketId));
    await client.leave(ticketStaffRoomName(ticketId));
    return { ok: true };
  }

  /**
   * Paket 2.4 (A): presence heartbeat / typing state. Only for a socket that
   * already joined the ticket (authorisation happened at join). Staff payloads
   * go to the :staff room only; the :public room gets the anonymous
   * "agent is typing a reply" flag. Excess messages are silently ignored.
   */
  @SubscribeMessage(ticketRealtimeEventNames.presence)
  async handlePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: boolean }> {
    const input = parsePresenceUpdate(payload);
    const principal = getSocketPrincipal(client);
    if (
      this.presenceService === undefined ||
      input === null ||
      !isSocketPrincipal(principal) ||
      !client.rooms.has(ticketRoomName(input.ticketId)) ||
      !allowPresenceMessage(client.data)
    ) {
      return { ok: false };
    }
    const role = client.rooms.has(ticketStaffRoomName(input.ticketId)) ? 'staff' : 'requester';
    const payloads = await this.presenceService.update(input, {
      userId: principal.subjectId,
      role,
    });
    if (payloads === null) {
      return { ok: false };
    }
    const tracked = client.data.presenceTickets ?? new Set<string>();
    if (input.state === 'leave') tracked.delete(input.ticketId);
    else tracked.add(input.ticketId);
    client.data.presenceTickets = tracked;
    this.emitPresence(input.ticketId, payloads);
    return { ok: true };
  }

  async handleDisconnect(client: Socket): Promise<void> {
    for (const ticketId of client.data.presenceTickets ?? []) {
      await this.leavePresence(client, ticketId);
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
