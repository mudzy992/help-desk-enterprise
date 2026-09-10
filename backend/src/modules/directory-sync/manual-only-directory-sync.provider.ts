import { Injectable } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import type {
  DirectoryReadRequest,
  DirectoryReadResult,
  DirectorySyncProvider,
} from './directory-sync.types';
import { doesDirectoryEntryMatchScope } from './does-directory-entry-match-scope';
import { freezeDirectoryReadResult } from './freeze-directory-read-result';
import { manualOnlyDirectoryCatalog } from './manual-only-directory-catalog';

@Injectable()
export class ManualOnlyDirectorySyncProvider implements DirectorySyncProvider {
  readonly strategy = directorySyncConstants.implementedStrategy;

  read(request: DirectoryReadRequest): Promise<DirectoryReadResult> {
    return Promise.resolve(
      freezeDirectoryReadResult({
        strategy: this.strategy,
        operation: request.operation,
        scope: request.scope,
        users:
          request.operation === 'users'
            ? manualOnlyDirectoryCatalog.users.filter((entry) =>
                doesDirectoryEntryMatchScope({
                  distinguishedName: entry.distinguishedName,
                  organizationalUnitPath: entry.organizationalUnitPath,
                  scope: request.scope,
                  matchMode: 'member',
                }),
              )
            : [],
        groups:
          request.operation === 'groups'
            ? manualOnlyDirectoryCatalog.groups.filter((entry) =>
                doesDirectoryEntryMatchScope({
                  distinguishedName: entry.distinguishedName,
                  organizationalUnitPath: entry.organizationalUnitPath,
                  scope: request.scope,
                  matchMode: 'member',
                }),
              )
            : [],
        organizationalUnits:
          request.operation === 'organizational_units'
            ? manualOnlyDirectoryCatalog.organizationalUnits.filter((entry) =>
                doesDirectoryEntryMatchScope({
                  distinguishedName: entry.distinguishedName,
                  organizationalUnitPath: entry.organizationalUnitPath,
                  scope: request.scope,
                  matchMode: 'container',
                }),
              )
            : [],
      }),
    );
  }
}
