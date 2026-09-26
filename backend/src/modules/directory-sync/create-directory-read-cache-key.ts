import type {
  DirectoryReadOperation,
  DirectorySyncStrategy,
  NormalizedDirectoryReadScope,
} from './directory-sync.types';

export function createDirectoryReadCacheKey(input: {
  readonly strategy: DirectorySyncStrategy;
  readonly operation: DirectoryReadOperation;
  readonly scope: NormalizedDirectoryReadScope;
  /** Paket 1.8: manual catalog and LDAPS results never share an entry. */
  readonly source?: string;
}): string {
  return [
    ...(input.source === undefined || input.source === 'manual_catalog' ? [] : [input.source]),
    input.strategy,
    input.operation,
    `dn=${input.scope.distinguishedName ?? ''}`,
    `path=${input.scope.organizationalUnitPath ?? ''}`,
    `subtree=${input.scope.includeSubtree ? '1' : '0'}`,
  ].join('|');
}
