import type { InstallSeedNames } from './install-seed.names';
import type {
  InstallSeedStructureRecord,
  InstallSeedWarning,
} from './install-seed.types';

/**
 * Install wizard v2 (F2): the structure step is idempotent — a repeated seed
 * keeps the records it finds. When the operator typed different names in the
 * meantime, the response says so instead of silently pretending the names were
 * applied; renaming live data is a Settings operation, not a wizard side effect.
 */
export function toInstallSeedStructureWarning(input: {
  readonly requested: InstallSeedNames;
  readonly stored: InstallSeedStructureRecord;
}): InstallSeedWarning | null {
  const requested: InstallSeedStructureRecord = {
    organizationalUnitName: input.requested.organizationalUnitName,
    handlerGroupName: input.requested.fallbackGroupName,
    categoryName: input.requested.categoryName,
    serviceName: input.requested.serviceName,
  };
  if (sameStructure(requested, input.stored)) {
    return null;
  }
  return { code: 'NAMES_ALREADY_SEEDED', requested, stored: input.stored };
}

function sameStructure(
  left: InstallSeedStructureRecord,
  right: InstallSeedStructureRecord,
): boolean {
  return (
    left.organizationalUnitName === right.organizationalUnitName &&
    left.handlerGroupName === right.handlerGroupName &&
    left.serviceName === right.serviceName
  );
}
