import type {
  DirectoryReadOperation,
  DirectorySyncStrategy,
  NormalizedDirectoryReadScope,
} from './directory-sync.types';

export function createDirectoryReadCacheKey(input: {
  readonly strategy: DirectorySyncStrategy;
  readonly operation: DirectoryReadOperation;
  readonly scope: NormalizedDirectoryReadScope;
}): string {
  return [
    input.strategy,
    input.operation,
    `dn=${input.scope.distinguishedName ?? ''}`,
    `path=${input.scope.organizationalUnitPath ?? ''}`,
    `subtree=${input.scope.includeSubtree ? '1' : '0'}`,
  ].join('|');
}
