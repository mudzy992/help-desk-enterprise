import { Inject, Injectable, Optional } from '@nestjs/common';
import { doesDirectoryEntryMatchScope } from '../does-directory-entry-match-scope';
import { freezeDirectoryReadResult } from '../freeze-directory-read-result';
import type {
  DirectoryReadRequest,
  DirectoryReadResult,
  DirectorySyncProvider,
} from '../directory-sync.types';
import { organizationalUnitPathFromDistinguishedName } from './distinguished-name';
import { DirectoryBackoff } from './directory-backoff';
import type { LdapClientFactory } from './ldap-directory-client';
import { withLdapsSession } from './ldaps-directory-reader';
import { LdapsSyncConfigurationLoader } from './ldaps-sync-configuration.loader';
import { LDAP_CLIENT_FACTORY } from './ldaps-sync.tokens';
import { classifyOrganizationalUnit } from './classify-organizational-unit';

import { ldapsExternalIdPrefix } from './ldaps-directory.types';

export { ldapsExternalIdPrefix };

/**
 * Paket 1.8 (A3): the existing on-demand read API (`POST /directory-sync/read`,
 * user linking) backed by LDAPS. The full sync lives in DirectoryFullSyncService.
 */
@Injectable()
export class LdapsDirectorySyncProvider implements DirectorySyncProvider {
  readonly strategy = 'manual_only' as const;
  readonly source = 'ldaps' as const;

  constructor(
    private readonly configurationLoader: LdapsSyncConfigurationLoader,
    private readonly backoff: DirectoryBackoff,
    @Optional() @Inject(LDAP_CLIENT_FACTORY) private readonly clientFactory?: LdapClientFactory,
  ) {}

  async read(request: DirectoryReadRequest): Promise<DirectoryReadResult> {
    const configuration = await this.configurationLoader.load();
    const rootPath = organizationalUnitPathFromDistinguishedName(configuration.usersBaseDn) ?? '/';
    const { result } = await withLdapsSession({
      configuration,
      backoff: this.backoff,
      now: Date.now,
      factory: this.clientFactory,
      work: async (reader) => {
        if (request.operation === 'users') {
          const users = await reader.readUsers();
          return {
            users: users
              .filter((user) => user.guid !== null && !user.disabled)
              .map((user) => ({
                externalId: `${ldapsExternalIdPrefix}${user.guid}`,
                login: user.samAccountName ?? user.userPrincipalName,
                email: user.email,
                displayName: user.displayName,
                distinguishedName: user.distinguishedName,
                organizationalUnitPath: organizationalUnitPathFromDistinguishedName(user.distinguishedName),
              })),
            groups: [],
            organizationalUnits: [],
          };
        }
        if (request.operation === 'groups') {
          const groups = await reader.readGroups();
          return {
            users: [],
            groups: groups
              .filter((group) => group.guid !== null)
              .map((group) => ({
                externalId: `${ldapsExternalIdPrefix}${group.guid}`,
                displayName: group.name,
                distinguishedName: group.distinguishedName,
                organizationalUnitPath: organizationalUnitPathFromDistinguishedName(group.distinguishedName),
              })),
            organizationalUnits: [],
          };
        }
        const units = await reader.readOrganizationalUnits();
        return {
          users: [],
          groups: [],
          organizationalUnits: units.map((unit) => ({
            externalId: `${ldapsExternalIdPrefix}${unit.guid ?? unit.distinguishedName}`,
            displayName: unit.name,
            distinguishedName: unit.distinguishedName,
            organizationalUnitPath: unit.path,
            type: classifyOrganizationalUnit({ path: unit.path, rootPath }),
          })),
        };
      },
    });
    const matchMode = request.operation === 'organizational_units' ? 'container' : 'member';
    const inScope = <T extends { distinguishedName: string | null; organizationalUnitPath: string | null }>(entry: T) =>
      doesDirectoryEntryMatchScope({
        distinguishedName: entry.distinguishedName,
        organizationalUnitPath: entry.organizationalUnitPath,
        scope: request.scope,
        matchMode,
      });
    return freezeDirectoryReadResult({
      strategy: this.strategy,
      operation: request.operation,
      scope: request.scope,
      users: result.users.filter(inScope),
      groups: result.groups.filter(inScope),
      organizationalUnits: result.organizationalUnits.filter(inScope),
    });
  }
}
