import {
  consumeWebsocketEmitCounts,
  formatWebsocketEmitCounts,
  recordWebsocketEmit,
  startWebsocketEmitCountReporter,
} from './websocket-emit-counter';

describe('websocket emit counter', () => {
  it('counts per room kind and resets on read', () => {
    consumeWebsocketEmitCounts();
    recordWebsocketEmit('group');
    recordWebsocketEmit('group');
    recordWebsocketEmit('staff');
    const first = consumeWebsocketEmitCounts();
    expect(first.group).toBe(2);
    expect(first.staff).toBe(1);
    expect(first.public).toBe(0);
    const second = consumeWebsocketEmitCounts();
    expect(second.group).toBe(0);
    expect(second.staff).toBe(0);
  });

  it('formats one ws_emits_* line per room kind', () => {
    const line = formatWebsocketEmitCounts({
      staff: 3,
      public: 1,
      user: 0,
      group: 200,
      broadcast: 0,
    });
    expect(line).toContain('ws_emits_group=200');
    expect(line).toContain('ws_emits_staff=3');
  });

  it('logs the counters on its interval', () => {
    jest.useFakeTimers();
    const log = jest.fn();
    const stop = startWebsocketEmitCountReporter({ log }, 1_000);
    recordWebsocketEmit('user');
    jest.advanceTimersByTime(1_000);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('ws_emits_user=1');
    stop();
    jest.advanceTimersByTime(5_000);
    expect(log).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
