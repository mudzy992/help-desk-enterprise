import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { directorySyncConstants } from './directory-sync.constants';
import type {
  DirectoryReadRequest,
  DirectoryReadResult,
  DirectorySyncProvider,
} from './directory-sync.types';
import { doesDirectoryEntryMatchScope } from './does-directory-entry-match-scope';
import { freezeDirectoryReadResult } from './freeze-directory-read-result';
import { loadManualDirectoryCatalog } from './load-manual-directory-catalog';

@Injectable()
export class ManualOnlyDirectorySyncProvider implements DirectorySyncProvider {
  readonly strategy = directorySyncConstants.implementedStrategy;

  constructor(private readonly prisma: PrismaService) {}

  async read(request: DirectoryReadRequest): Promise<DirectoryReadResult> {
    const catalog = await loadManualDirectoryCatalog(this.prisma);
    return freezeDirectoryReadResult({
      strategy: this.strategy,
      operation: request.operation,
      scope: request.scope,
      users:
        request.operation === 'users'
          ? catalog.users.filter((entry) =>
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
          ? catalog.groups.filter((entry) =>
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
          ? catalog.organizationalUnits.filter((entry) =>
              doesDirectoryEntryMatchScope({
                distinguishedName: entry.distinguishedName,
                organizationalUnitPath: entry.organizationalUnitPath,
                scope: request.scope,
                matchMode: 'container',
              }),
            )
          : [],
    });
  }
}
