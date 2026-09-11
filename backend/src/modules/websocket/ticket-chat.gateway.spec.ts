import { WsException } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ticketRealtimeEventNames } from '../tickets/collaboration.constants';
import type { TicketRealtimeMessagePayload } from '../tickets/collaboration.types';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';
import { TicketChatGateway } from './ticket-chat.gateway';
import {
  ticketPublicRoomName,
  ticketStaffRoomName,
  userRoomName,
} from './ticket-socket-rooms';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketChatGateway', () => {
  const authorizeSocketJoin = jest.fn();
  let hub: TicketRealtimeHub;
  let gateway: TicketChatGateway;
  const emitted: { room: string; event: string; payload: unknown }[] = [];

  beforeEach(() => {
    authorizeSocketJoin.mockReset();
    emitted.length = 0;
    hub = new TicketRealtimeHub();
    gateway = new TicketChatGateway(
      { authorizeSocketJoin } as never,
      hub,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
    } as unknown as Server;
    gateway.afterInit();
  });

  it('joins public or staff rooms after the same ticket authorization', async () => {
    authorizeSocketJoin.mockResolvedValue({ visibility: 'public' });
    const requester = createClient('user-requester');
    await expect(
      gateway.handleJoin(requester, { ticketId: 'ticket-1' }),
    ).resolves.toEqual({ ok: true, visibility: 'public' });
    expect(authorizeSocketJoin).toHaveBeenCalledWith('ticket-1', {
      actorUserId: 'user-requester',
    });
    expect(requester.join).toHaveBeenCalledWith(ticketPublicRoomName('ticket-1'));
    authorizeSocketJoin.mockResolvedValue({ visibility: 'staff' });
    const agent = createClient('user-agent-it');
    await gateway.handleJoin(agent, { ticketId: 'ticket-1' });
    expect(agent.join).toHaveBeenCalledWith(ticketStaffRoomName('ticket-1'));
  });

  it('rejects unauthorized socket joins and does not join rooms', async () => {
    authorizeSocketJoin.mockRejectedValue({
      response: { code: 'FORBIDDEN' },
    });
    const foreign = createClient('user-agent-hr');
    await expect(
      gateway.handleJoin(foreign, { ticketId: 'ticket-1' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(foreign.join).not.toHaveBeenCalled();
    await expect(gateway.handleJoin(foreign, {})).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('broadcasts public messages to public+staff rooms and keeps notes staff-only', () => {
    const publicPayload: TicketRealtimeMessagePayload = {
      id: 'msg-public',
      ticketId: 'ticket-1',
      type: 'AGENT_REPLY',
      body: 'Working on it',
      authorUserId: 'user-agent-it',
      createdAt: '2026-09-11T12:00:00.000Z',
      requesterId: 'user-requester',
      assignedGroupId: 'group-it',
      visibility: 'public',
    };
    hub.publish(publicPayload);
    expect(emitted.map((item) => item.room).sort()).toEqual([
      'group:group-it',
      ticketPublicRoomName('ticket-1'),
      ticketStaffRoomName('ticket-1'),
      userRoomName('user-requester'),
    ]);
    emitted.length = 0;
    hub.publish({
      ...publicPayload,
      id: 'msg-internal',
      type: 'INTERNAL_NOTE',
      visibility: 'staff',
    });
    expect(emitted.map((item) => item.room).sort()).toEqual([
      'group:group-it',
      ticketStaffRoomName('ticket-1'),
    ]);
    expect(
      emitted.every((item) => item.event === ticketRealtimeEventNames.messageCreated),
    ).toBe(true);
  });
});

function createClient(subjectId: string): Socket {
  return {
    data: { principal: { subjectId } },
    join: jest.fn(),
    leave: jest.fn(),
  } as unknown as Socket;
}
