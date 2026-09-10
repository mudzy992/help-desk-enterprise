import { DirectoryReadThrottle } from './directory-read.throttle';
import { DirectorySyncError } from './directory-sync.error';

describe('DirectoryReadThrottle', () => {
  it('allows the first read and throttles a repeated rapid read', () => {
    const throttle = new DirectoryReadThrottle();
    throttle.acquire({ maxQueriesPerSecond: 0.5, nowMilliseconds: 0 });
    expect(() =>
      throttle.acquire({ maxQueriesPerSecond: 0.5, nowMilliseconds: 1_999 }),
    ).toThrow(new DirectorySyncError('DIRECTORY_READ_THROTTLED'));
  });

  it('allows another read after the configured interval', () => {
    const throttle = new DirectoryReadThrottle();
    throttle.acquire({ maxQueriesPerSecond: 0.5, nowMilliseconds: 0 });
    expect(() =>
      throttle.acquire({ maxQueriesPerSecond: 0.5, nowMilliseconds: 2_000 }),
    ).not.toThrow();
  });

  it('fails closed for a non-positive rate instead of bypassing throttling', () => {
    const throttle = new DirectoryReadThrottle();
    expect(() =>
      throttle.acquire({ maxQueriesPerSecond: 0, nowMilliseconds: 0 }),
    ).toThrow(new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'));
  });
});
