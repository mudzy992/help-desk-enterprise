import { directorySyncConstants } from './directory-sync.constants';

export type DirectorySyncStrategy =
  (typeof directorySyncConstants.strategies)[number];

export type DirectoryReadOperation =
  (typeof directorySyncConstants.operations)[number];

export type DirectoryReadScopeInput = {
  readonly distinguishedName?: string;
  readonly organizationalUnitPath?: string;
  readonly includeSubtree?: boolean;
};

export type NormalizedDirectoryReadScope = {
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly includeSubtree: boolean;
};

export type DirectoryUser = {
  readonly externalId: string;
  readonly login: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
};

export type DirectoryGroup = {
  readonly externalId: string;
  readonly displayName: string;
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
};

export type DirectoryOrganizationalUnit = {
  readonly externalId: string;
  readonly displayName: string;
  readonly distinguishedName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly type?: string | null;
};

export type DirectoryReadResult = {
  readonly strategy: DirectorySyncStrategy;
  readonly operation: DirectoryReadOperation;
  readonly scope: NormalizedDirectoryReadScope;
  readonly users: readonly DirectoryUser[];
  readonly groups: readonly DirectoryGroup[];
  readonly organizationalUnits: readonly DirectoryOrganizationalUnit[];
};

export type DirectorySyncConfiguration = {
  readonly enabled: boolean;
  /** Paket 1.8: manual_catalog (default) or ldaps. */
  readonly source: 'manual_catalog' | 'ldaps';
  readonly strategy: DirectorySyncStrategy;
  readonly usersBaseDistinguishedName: string;
  readonly groupsBaseDistinguishedName: string;
  readonly maxQueriesPerSecond: number;
  readonly cacheTimeToLiveMilliseconds: number;
  readonly organizationalUnitCacheTimeToLiveMilliseconds: number;
};

export type DirectoryReadRequest = {
  readonly operation: DirectoryReadOperation;
  readonly scope: NormalizedDirectoryReadScope;
};

export interface DirectorySyncProvider {
  readonly strategy: DirectorySyncStrategy;
  readonly source?: 'manual_catalog' | 'ldaps';
  read(request: DirectoryReadRequest): Promise<DirectoryReadResult>;
}

export type DirectorySyncClock = () => number;
