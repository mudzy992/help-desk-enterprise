import { DirectorySyncError } from '../directory-sync.error';
import { isDistinguishedNameWithin } from './distinguished-name';
import type { DirectoryBackoff } from './directory-backoff';
import {
  classifyLdapError,
  connectWithFailover,
  LdapConnectionError,
  type LdapClientFactory,
  type LdapDirectoryClient,
} from './ldap-directory-client';
import {
  ldapsDefaults,
  ldapsGroupAttributes,
  ldapsOrganizationalUnitAttributes,
  ldapsUserAttributes,
  type LdapsDirectoryGroupEntry,
  type LdapsDirectoryOrganizationalUnitEntry,
  type LdapsDirectoryUserEntry,
  type LdapsSyncConfiguration,
} from './ldaps-directory.types';
import { assertLdapsConfigured } from './ldaps-sync-configuration.loader';
import {
  mapLdapsGroupEntry,
  mapLdapsOrganizationalUnitEntry,
  mapLdapsUserEntry,
} from './map-ldaps-entries';

export type LdapsSessionInfo = {
  readonly url: string;
  readonly failedUrls: readonly { readonly url: string; readonly errorCode: string }[];
  readonly queries: number;
};

/**
 * Opens one LDAPS session (failover across DCs), runs `work`, always unbinds.
 * Any LDAP failure opens the backoff window and becomes a secret-free error.
 */
export async function withLdapsSession<T>(input: {
  readonly configuration: LdapsSyncConfiguration;
  readonly backoff: DirectoryBackoff;
  readonly now: () => number;
  readonly factory?: LdapClientFactory;
  readonly work: (reader: LdapsDirectoryReader) => Promise<T>;
}): Promise<{ readonly result: T; readonly session: LdapsSessionInfo }> {
  assertLdapsConfigured(input.configuration);
  input.backoff.assertOpen(input.now(), input.configuration.retryBackoffMilliseconds);
  let connected;
  try {
    connected = await connectWithFailover(input.configuration.connection, input.factory);
  } catch (error) {
    const errorCode = error instanceof LdapConnectionError ? error.errorCode : classifyLdapError(error);
    input.backoff.recordFailure(input.now(), errorCode);
    throw new DirectorySyncError('DIRECTORY_CONNECTION_FAILED', 'LDAPS connection failed', {
      errorCode,
      attempts: error instanceof LdapConnectionError ? error.attempts : [],
    });
  }
  const reader = new LdapsDirectoryReader(connected.client, input.configuration);
  try {
    const result = await input.work(reader);
    input.backoff.recordSuccess();
    return {
      result,
      session: { url: connected.url, failedUrls: connected.attempts, queries: reader.queries },
    };
  } catch (error) {
    if (error instanceof DirectorySyncError) {
      throw error;
    }
    const errorCode = classifyLdapError(error);
    input.backoff.recordFailure(input.now(), errorCode);
    throw new DirectorySyncError('DIRECTORY_CONNECTION_FAILED', 'LDAPS query failed', {
      errorCode,
      url: connected.url,
    });
  } finally {
    await connected.client.close();
  }
}

export class LdapsDirectoryReader {
  queries = 0;

  constructor(
    private readonly client: LdapDirectoryClient,
    private readonly configuration: LdapsSyncConfiguration,
  ) {}

  async readOrganizationalUnits(): Promise<LdapsDirectoryOrganizationalUnitEntry[]> {
    const entries = await this.search(
      this.configuration.usersBaseDn,
      ldapsDefaults.organizationalUnitFilter,
      ldapsOrganizationalUnitAttributes,
    );
    return entries
      .map(mapLdapsOrganizationalUnitEntry)
      .filter((entry): entry is LdapsDirectoryOrganizationalUnitEntry => entry !== null)
      .filter((entry) => isDistinguishedNameWithin(entry.distinguishedName, this.configuration.usersBaseDn));
  }

  async readUsers(filter = this.configuration.userFilter): Promise<LdapsDirectoryUserEntry[]> {
    const entries = await this.search(this.configuration.usersBaseDn, filter, ldapsUserAttributes);
    return entries
      .map(mapLdapsUserEntry)
      .filter((entry): entry is LdapsDirectoryUserEntry => entry !== null)
      .filter((entry) => isDistinguishedNameWithin(entry.distinguishedName, this.configuration.usersBaseDn));
  }

  async readGroups(): Promise<LdapsDirectoryGroupEntry[]> {
    if (this.configuration.groupsBaseDn === '') {
      return [];
    }
    const entries = await this.search(
      this.configuration.groupsBaseDn,
      ldapsDefaults.groupFilter,
      ldapsGroupAttributes,
    );
    return entries
      .map(mapLdapsGroupEntry)
      .filter((entry): entry is LdapsDirectoryGroupEntry => entry !== null)
      .filter((entry) => isDistinguishedNameWithin(entry.distinguishedName, this.configuration.groupsBaseDn));
  }

  /** Test connection: the base exists and one entry can be read. */
  async probe(): Promise<number> {
    this.queries += 1;
    const entries = await this.client.search({
      baseDn: this.configuration.usersBaseDn,
      filter: '(objectClass=*)',
      attributes: ['distinguishedName'],
      pageSize: this.configuration.pageSize,
      scope: 'base',
    });
    return entries.length;
  }

  private async search(
    baseDn: string,
    filter: string,
    attributes: readonly string[],
  ) {
    this.queries += 1;
    return this.client.search({
      baseDn,
      filter,
      attributes,
      pageSize: this.configuration.pageSize,
    });
  }
}
