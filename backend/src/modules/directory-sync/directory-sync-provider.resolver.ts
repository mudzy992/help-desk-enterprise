import { Injectable, Optional } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncError } from './directory-sync.error';
import type {
  DirectorySyncProvider,
  DirectorySyncStrategy,
} from './directory-sync.types';
import { LdapsDirectorySyncProvider } from './ldaps/ldaps-directory-sync.provider';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

/**
 * Source decides the provider (paket 1.8): the manual catalog is read on demand
 * only; LDAPS serves both the on-demand reads and the scheduled sync.
 */
@Injectable()
export class DirectorySyncProviderResolver {
  constructor(
    private readonly manualOnlyDirectorySyncProvider: ManualOnlyDirectorySyncProvider,
    @Optional()
    private readonly ldapsDirectorySyncProvider?: LdapsDirectorySyncProvider,
  ) {}

  resolve(
    strategy: DirectorySyncStrategy,
    source: 'manual_catalog' | 'ldaps' = 'manual_catalog',
  ): DirectorySyncProvider {
    if (source === 'ldaps' && this.ldapsDirectorySyncProvider !== undefined) {
      return this.ldapsDirectorySyncProvider;
    }
    if (source === 'manual_catalog' && strategy === directorySyncConstants.implementedStrategy) {
      return this.manualOnlyDirectorySyncProvider;
    }
    throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
  }
}
