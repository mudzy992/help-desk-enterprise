import { buildInstallSeedSlug } from './build-install-seed-slug';
import { installSeedConstants, installSeedErrorCodes } from './install-seed.constants';
import { InstallSeedError } from './install-seed.error';

/**
 * Install wizard v2 (F2): the structure step fills in what the operator sees,
 * this resolves what the database stores. Names come from the step, keys are
 * derived from them; without input the pre-v2 defaults keep the flow
 * byte-identical (`e2e/helpers/ensure-install.ts` never sends a body).
 */
export type InstallSeedNames = {
  readonly organizationalUnitName: string;
  readonly distinguishedName: string;
  readonly fallbackGroupName: string;
  readonly fallbackGroupKey: string;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly serviceName: string;
  readonly serviceSlug: string;
};

export type InstallSeedNameInput = {
  readonly organizationalUnitName?: string;
  readonly handlerGroupName?: string;
  readonly serviceName?: string;
  readonly categoryName?: string;
};

export const installSeedNameLimits = {
  organizationalUnitName: 120,
  handlerGroupName: 120,
  serviceName: 120,
  categoryName: 120,
} as const;

export const defaultInstallSeedNames: InstallSeedNames = {
  organizationalUnitName: installSeedConstants.organizationalUnitName,
  distinguishedName: installSeedConstants.distinguishedName,
  fallbackGroupName: installSeedConstants.fallbackGroupName,
  fallbackGroupKey: installSeedConstants.fallbackGroupKey,
  categoryName: installSeedConstants.categoryName,
  categorySlug: installSeedConstants.categorySlug,
  serviceName: installSeedConstants.serviceName,
  serviceSlug: installSeedConstants.serviceSlug,
};

export function resolveInstallSeedNames(input?: InstallSeedNameInput): InstallSeedNames {
  const organizationalUnitName = resolveName(
    input?.organizationalUnitName,
    defaultInstallSeedNames.organizationalUnitName,
    installSeedNameLimits.organizationalUnitName,
  );
  const fallbackGroupName = resolveName(
    input?.handlerGroupName,
    defaultInstallSeedNames.fallbackGroupName,
    installSeedNameLimits.handlerGroupName,
  );
  const serviceName = resolveName(
    input?.serviceName,
    defaultInstallSeedNames.serviceName,
    installSeedNameLimits.serviceName,
  );
  const categoryName = resolveName(
    input?.categoryName,
    defaultInstallSeedNames.categoryName,
    installSeedNameLimits.categoryName,
  );
  const isDefaultUnit = organizationalUnitName === defaultInstallSeedNames.organizationalUnitName;
  const isDefaultGroup = fallbackGroupName === defaultInstallSeedNames.fallbackGroupName;
  const categorySlug = buildInstallSeedSlug(categoryName);
  const serviceSlug = buildInstallSeedSlug(serviceName);
  requireSlug(categorySlug);
  requireSlug(serviceSlug);
  return {
    organizationalUnitName,
    // The wizard creates a root unit, so the DN keeps the pre-v2 shape with the
    // operator's name (`OU=Direkcija,DC=local` when nothing was typed).
    distinguishedName: isDefaultUnit
      ? defaultInstallSeedNames.distinguishedName
      : `OU=${organizationalUnitName},DC=local`,
    fallbackGroupName,
    fallbackGroupKey: isDefaultGroup
      ? defaultInstallSeedNames.fallbackGroupKey
      : requireSlug(buildInstallSeedSlug(fallbackGroupName)),
    categoryName,
    categorySlug,
    serviceName,
    serviceSlug,
  };
}

function resolveName(value: string | undefined, fallback: string, maxLength: number): string {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return fallback;
  }
  // `,` and `=` would break the distinguished name the unit is created with.
  if (normalized.length > maxLength || /[,=]/.test(normalized)) {
    throw new InstallSeedError(installSeedErrorCodes.invalidStructure);
  }
  return normalized;
}

function requireSlug(slug: string): string {
  if (slug.length === 0) {
    throw new InstallSeedError(installSeedErrorCodes.invalidStructure);
  }
  return slug;
}
