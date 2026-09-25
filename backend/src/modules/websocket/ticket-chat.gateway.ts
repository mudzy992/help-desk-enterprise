import { OnModuleDestroy, Optional } from '@nestjs/common';
import { AdminConfigRealtimeHub } from '../../common/admin-realtime/admin-config-realtime.hub';
import {
  ConnectedSocket,
  MessageBody,
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
export class TicketChatGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly ticketsCollaborationService: TicketsCollaborationService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
    private readonly settingsRealtimeHub: SettingsRealtimeHub,
    @Optional()
    private readonly adminConfigRealtimeHub?: AdminConfigRealtimeHub,
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
    await client.leave(ticketRoomName(ticketId));
    await client.leave(ticketPublicRoomName(ticketId));
    await client.leave(ticketStaffRoomName(ticketId));
    return { ok: true };
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
