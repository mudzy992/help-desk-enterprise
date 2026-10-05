import {
  allowJoinLeaveMessage,
  countJoinLeaveRejections,
  joinLeaveRateLimit,
} from './join-leave-rate-limiter';

type SocketData = Parameters<typeof allowJoinLeaveMessage>[0];

function createData(): SocketData {
  return {};
}

describe('join/leave rate limiter (Val 3, M11/B2)', () => {
  const now = Date.parse('2026-10-04T10:00:00.000Z');

  it('allows the configured number of messages per minute and then blocks', () => {
    const data = createData();
    for (let i = 0; i < joinLeaveRateLimit.maxMessagesPerMinute; i += 1) {
      expect(allowJoinLeaveMessage(data, now)).toBe(true);
    }
    expect(allowJoinLeaveMessage(data, now)).toBe(false);
    expect(allowJoinLeaveMessage(data, now)).toBe(false);
    expect(countJoinLeaveRejections(data)).toBe(2);
  });

  it('opens a fresh window after a minute', () => {
    const data = createData();
    for (let i = 0; i < joinLeaveRateLimit.maxMessagesPerMinute; i += 1) {
      allowJoinLeaveMessage(data, now);
    }
    expect(allowJoinLeaveMessage(data, now)).toBe(false);
    expect(allowJoinLeaveMessage(data, now + 60_000)).toBe(true);
    expect(countJoinLeaveRejections(data)).toBe(0);
  });

  it('counts per socket, not globally', () => {
    const first = createData();
    const second = createData();
    for (let i = 0; i < joinLeaveRateLimit.maxMessagesPerMinute; i += 1) {
      allowJoinLeaveMessage(first, now);
    }
    expect(allowJoinLeaveMessage(first, now)).toBe(false);
    expect(allowJoinLeaveMessage(second, now)).toBe(true);
  });

  it('reports zero rejections before the first message', () => {
    expect(countJoinLeaveRejections(createData())).toBe(0);
  });
});
