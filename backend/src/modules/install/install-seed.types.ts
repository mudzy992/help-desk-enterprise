import type { ServiceLifecycle } from '../../generated/prisma/enums';
import type { InstallSeedNames } from './install-seed.names';
import type { InstallSeedSlaProfile } from './install-seed-sla-profile';
import type { RoutingConfiguration } from '../routing/routing.types';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';
import type { ServiceFormsConfiguration } from '../service-catalog/service-forms.types';

export type InstallSeedOrganizationalUnit = {
  readonly id: string;
  readonly name: string;
  readonly ouPath: string;
};

export type InstallSeedFallbackGroup = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
  readonly organizationalUnitId: string | null;
};

export type InstallSeedService = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly lifecycle: ServiceLifecycle;
  readonly activeFormVersionRef?: string | null;
  /** F2: the seeded service must be under SLA, so the wizard attaches a profile. */
  readonly slaProfileId?: string | null;
  readonly slaProfileKey?: string | null;
};

export type InstallSeedRoutingRule = {
  readonly id: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
};

export type InstallSeedResolution = {
  readonly outcome: string;
  readonly groupId: string | null;
  readonly fallbackDepth: number;
};

export type InstallSeedPublicRecord = {
  readonly isSeeded: boolean;
  /** F2: the category the first service lives in (may be an existing one). */
  readonly categoryName: string | null;
  readonly organizationalUnit: InstallSeedOrganizationalUnit | null;
  readonly fallbackGroup: InstallSeedFallbackGroup | null;
  readonly service: InstallSeedService | null;
  readonly routingRule: InstallSeedRoutingRule | null;
  readonly resolution: InstallSeedResolution | null;
};

export type InstallSeedCreatedFlags = {
  readonly organizationalUnit: boolean;
  readonly fallbackGroup: boolean;
  readonly serviceCategory: boolean;
  readonly service: boolean;
  readonly serviceFormVersion: boolean;
  readonly routingRule: boolean;
};

export type InstallSeedResult = InstallSeedPublicRecord & {
  readonly created: InstallSeedCreatedFlags;
  /** F2: set when the operator typed names that the existing records do not use. */
  readonly warning?: InstallSeedWarning;
};

export type InstallSeedStatus = {
  readonly seed: InstallSeedPublicRecord;
};

export type InstallSeedContext = {
  readonly actorUserId: string;
  readonly lifecycle: ServiceLifecycleConfiguration;
  readonly routing: RoutingConfiguration;
  readonly forms: ServiceFormsConfiguration;
  /** F2: names from the structure step; omitted means the pre-v2 defaults. */
  readonly names?: InstallSeedNames;
};

/** F2: the names the operator typed, compared with the stored records. */
export type InstallSeedStructureRecord = {
  readonly organizationalUnitName: string;
  readonly handlerGroupName: string;
  readonly categoryName: string | null;
  readonly serviceName: string;
};

export type InstallSeedWarningCode = 'NAMES_ALREADY_SEEDED';

export type InstallSeedSlaContext = InstallSeedSlaProfile | null;

export type InstallSeedWarning = {
  readonly code: InstallSeedWarningCode;
  readonly requested: InstallSeedStructureRecord;
  readonly stored: InstallSeedStructureRecord;
};
