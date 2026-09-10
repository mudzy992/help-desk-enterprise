import { Injectable } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';

@Injectable()
export class DirectoryReadThrottle {
  private lastAcquiredAtMilliseconds = Number.NEGATIVE_INFINITY;

  acquire(input: {
    readonly maxQueriesPerSecond: number;
    readonly nowMilliseconds: number;
  }): void {
    if (
      !Number.isFinite(input.maxQueriesPerSecond) ||
      input.maxQueriesPerSecond <= 0
    ) {
      throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
    }
    const minimumIntervalMilliseconds =
      directorySyncConstants.millisecondsPerSecond / input.maxQueriesPerSecond;
    if (
      this.lastAcquiredAtMilliseconds + minimumIntervalMilliseconds >
      input.nowMilliseconds
    ) {
      throw new DirectorySyncError('DIRECTORY_READ_THROTTLED');
    }
    this.lastAcquiredAtMilliseconds = input.nowMilliseconds;
  }
}
