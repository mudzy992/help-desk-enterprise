import { closeRedisClient } from './close-redis-client';
import type { ClosableRedisClient } from './redis.types';

function createClient(status: string): ClosableRedisClient & {
  quit: jest.Mock;
  disconnect: jest.Mock;
} {
  return {
    status,
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  };
}

describe('closeRedisClient', () => {
  it('quits a ready client', async () => {
    const client = createClient('ready');
    await closeRedisClient(client);
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a client that never connected', async () => {
    const client = createClient('wait');
    await closeRedisClient(client);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('does not close an already ended client', async () => {
    const client = createClient('end');
    await closeRedisClient(client);
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when quit fails', async () => {
    const client = createClient('ready');
    client.quit.mockRejectedValue(new Error('connection lost'));
    await closeRedisClient(client);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
