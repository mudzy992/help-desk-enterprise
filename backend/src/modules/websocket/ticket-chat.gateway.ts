import { OnModuleDestroy } from '@nestjs/common';
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
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import { TicketsCollaborationService } from '../tickets/tickets-collaboration.service';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';
import { resolveSocketCorsOrigin } from './resolve-socket-cors-origin';
import {
  groupRoomName,
  parseTicketSocketPayload,
  ticketPublicRoomName,
  ticketRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

@WebSocketGateway({
  cors: {
    origin: resolveSocketCorsOrigin(),
  },
})
export class TicketChatGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly ticketsCollaborationService: TicketsCollaborationService,
    private readonly ticketRealtimeHub: TicketRealtimeHub,
  ) {}

  afterInit(): void {
    this.unsubscribe = this.ticketRealtimeHub.subscribe((payload) => {
      this.broadcastMessage(payload);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
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

  private broadcastMessage(payload: TicketRealtimeMessagePayload): void {
    const event = ticketRealtimeEventNames.messageCreated;
    this.server.to(ticketStaffRoomName(payload.ticketId)).emit(event, payload);
    if (payload.visibility === 'public') {
      this.server
        .to(ticketPublicRoomName(payload.ticketId))
        .emit(event, payload);
      this.server.to(userRoomName(payload.requesterId)).emit(event, payload);
    }
    if (payload.assignedGroupId !== null) {
      this.server
        .to(groupRoomName(payload.assignedGroupId))
        .emit(event, payload);
    }
  }
}

function requireTicketId(payload: unknown): string {
  const parsed = parseTicketSocketPayload(payload);
  if (parsed === null) {
    throw new WsException({ code: 'NOT_FOUND' });
  }
  return parsed.ticketId;
}
