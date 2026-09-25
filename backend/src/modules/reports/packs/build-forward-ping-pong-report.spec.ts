import {
  buildForwardPingPongReport,
  confidentialTitlePlaceholder,
} from './build-forward-ping-pong-report';
import type { ForwardPingPongEvent, ForwardPingPongTicket } from '../reports.types';

function event(from: string | null, to: string, minute: number, isCrossOu = false): ForwardPingPongEvent {
  return {
    fromGroupId: from,
    fromGroupName: from === null ? null : from.toUpperCase(),
    fromUnitId: 'ou',
    toGroupId: to,
    toGroupName: to.toUpperCase(),
    toUnitId: 'ou',
    isCrossOu,
    createdAt: new Date(Date.UTC(2026, 8, 1, 8, minute)),
  };
}

function ticket(id: string, events: ForwardPingPongEvent[], isConfidential = false): ForwardPingPongTicket {
  return {
    id,
    ticketNumber: `HD-${id}`,
    title: `Naslov ${id}`,
    isConfidential,
    status: 'IN_PROGRESS',
    serviceName: 'VPN',
    currentGroupName: 'SD',
    events,
  };
}

describe('buildForwardPingPongReport', () => {
  const pingPong = [event('sd', 'net', 1), event('net', 'sd', 2, true), event('sd', 'app', 3)];

  it('lists tickets at or above the threshold, most forwarded first, with the path', () => {
    const rows = buildForwardPingPongReport({
      pingPongThreshold: 3,
      forwardTickets: [
        ticket('1', pingPong),
        ticket('2', [...pingPong, event('app', 'sd', 4)]),
        ticket('3', pingPong.slice(0, 2)),
      ],
    });
    expect(rows.map((row) => row.ticketNumber)).toEqual(['HD-2', 'HD-1']);
    expect(rows[1]).toMatchObject({
      forwardsInPeriod: 3,
      crossOuForwards: 1,
      distinctGroups: 3,
      groupPath: 'SD → NET → SD → APP',
      firstForwardAt: '2026-09-01T08:01:00.000Z',
      lastForwardAt: '2026-09-01T08:03:00.000Z',
    });
  });

  it('honours a custom threshold and masks confidential titles', () => {
    const rows = buildForwardPingPongReport({
      pingPongThreshold: 2,
      forwardTickets: [ticket('9', pingPong.slice(0, 2), true)],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe(confidentialTitlePlaceholder);
  });
});
