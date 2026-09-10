import { Injectable } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';
import type {
  DirectorySyncProvider,
  DirectorySyncStrategy,
} from './directory-sync.types';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

@Injectable()
export class DirectorySyncProviderResolver {
  constructor(
    private readonly manualOnlyDirectorySyncProvider: ManualOnlyDirectorySyncProvider,
  ) {}

  resolve(strategy: DirectorySyncStrategy): DirectorySyncProvider {
    if (strategy === directorySyncConstants.implementedStrategy) {
      return this.manualOnlyDirectorySyncProvider;
    }
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
}
