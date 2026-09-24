import {
  formatWebsocketClientCount,
  readWebsocketClientCount,
  startWebsocketClientCountReporter,
} from './websocket-client-count.reporter';

describe('websocket client count reporter', () => {
  it('reads the count from the socket.io engine', () => {
    expect(readWebsocketClientCount({ engine: { clientsCount: 42 } })).toBe(42);
    expect(readWebsocketClientCount({ engine: {} })).toBeNull();
    expect(readWebsocketClientCount({})).toBeNull();
  });

  it('formats the metric line', () => {
    expect(formatWebsocketClientCount(7)).toBe('ws_clients_count=7');
  });

  it('logs the count every interval', () => {
    jest.useFakeTimers();
    const source = { engine: { clientsCount: 3 } };
    const logger = { debug: jest.fn(), log: jest.fn() };
    try {
      const stop = startWebsocketClientCountReporter(source, logger, {
        intervalMs: 1000,
      });

      jest.advanceTimersByTime(3000);
      expect(logger.debug).toHaveBeenCalledTimes(3);
      expect(logger.debug.mock.calls[0]?.[0]).toBe('ws_clients_count=3');
      expect(logger.log).not.toHaveBeenCalled();

      stop();
      jest.advanceTimersByTime(3000);
      expect(logger.debug).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('follows the connection count while running', () => {
    jest.useFakeTimers();
    const source: { engine: { clientsCount: number } } = { engine: { clientsCount: 1 } };
    const logger = { log: jest.fn() };
    try {
      const stop = startWebsocketClientCountReporter(source, logger, {
        intervalMs: 1000,
      });

      source.engine.clientsCount = 9;
      jest.advanceTimersByTime(1000);

      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log.mock.calls[0]?.[0]).toBe('ws_clients_count=9');
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts no timer when the server exposes no engine', () => {
    jest.useFakeTimers();
    const logger = { log: jest.fn() };
    try {
      const stop = startWebsocketClientCountReporter({}, logger, { intervalMs: 1000 });

      jest.advanceTimersByTime(5000);

      expect(logger.log).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
