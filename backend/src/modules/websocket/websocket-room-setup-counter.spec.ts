import {
  consumeWebsocketRoomSetupFailures,
  formatWebsocketRoomSetupFailures,
  recordWebsocketRoomSetupFailure,
  startWebsocketRoomSetupFailureReporter,
} from './websocket-room-setup-counter';

describe('websocket room setup failure counter', () => {
  beforeEach(() => {
    consumeWebsocketRoomSetupFailures();
  });

  it('counts setup failures by room kind and resets on read', () => {
    recordWebsocketRoomSetupFailure('group');
    recordWebsocketRoomSetupFailure('group');
    recordWebsocketRoomSetupFailure('user');

    expect(consumeWebsocketRoomSetupFailures()).toEqual({ user: 1, group: 2 });
    expect(consumeWebsocketRoomSetupFailures()).toEqual({ user: 0, group: 0 });
  });

  it('formats stable metric names for both required room kinds', () => {
    expect(
      formatWebsocketRoomSetupFailures({ user: 1, group: 0 }),
    ).toBe('ws_room_setup_failures_user=1 ws_room_setup_failures_group=0');
  });

  it('reports and resets setup failures on its interval', () => {
    jest.useFakeTimers();
    const log = jest.fn();
    const stop = startWebsocketRoomSetupFailureReporter({ log }, 1_000);
    recordWebsocketRoomSetupFailure('group');

    jest.advanceTimersByTime(1_000);

    expect(log).toHaveBeenCalledWith(
      'ws_room_setup_failures_user=0 ws_room_setup_failures_group=1',
      'WebsocketMetrics',
    );
    stop();
    jest.advanceTimersByTime(5_000);
    expect(log).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
