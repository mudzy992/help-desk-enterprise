import type { TicketPriority } from '../../../generated/prisma/enums';
import type { JsonValue } from '../../change-log/change-log.types';
import type { SettingValue } from '../../settings/settings.types';
import type { ConfigPackageReferenceKind } from './config-package.constants';

/**
 * Environment-neutral configuration: every reference is a natural key
 * (group `key`, service and category `slug`, OU `ouPath`, SLA calendar and
 * profile `key`, policy pack `key`, template/playbook `name`), never a cuid.
 */
export type PortableConfig = {
  readonly scopes: readonly string[];
  readonly settings: Readonly<Record<string, SettingValue>>;
  readonly routing: {
    readonly rules: readonly {
      readonly originUnit: string;
      readonly service: string;
      readonly group: string;
    }[];
  };
  readonly sla: {
    readonly calendars: readonly {
      readonly key: string;
      readonly name: string;
      readonly timezone: string;
      readonly weeklyHours: JsonValue;
      readonly isActive: boolean;
      readonly holidays: readonly { readonly date: string; readonly name: string }[];
    }[];
    readonly profiles: readonly {
      readonly key: string;
      readonly name: string;
      readonly description: string | null;
      readonly calendar: string;
      readonly isActive: boolean;
    }[];
    readonly rules: readonly {
      readonly profile: string;
      readonly priority: TicketPriority;
      readonly responseMinutes: number;
      readonly resolutionMinutes: number;
      readonly evaluationOrder: number;
      readonly organizationalUnit: string | null;
      readonly service: string | null;
    }[];
    readonly escalations: readonly {
      readonly profile: string;
      readonly triggerOffsetMinutes: number;
      readonly targetGroup: string | null;
    }[];
    readonly priorityMatrix: readonly {
      readonly impact: string;
      readonly urgency: string;
      readonly priority: TicketPriority;
    }[];
  };
  readonly catalog: {
    readonly services: readonly {
      readonly slug: string;
      readonly name: string;
      readonly category: string;
      readonly lifecycle: string;
      readonly availability: string;
      readonly classification: string;
      readonly requiresApproval: boolean;
      readonly isConfidentialDefault: boolean;
      readonly autoAssignStrategy: string;
      readonly slaProfile: string | null;
      readonly policyPack: string | null;
    }[];
  };
  readonly forms: {
    readonly versions: readonly {
      readonly service: string;
      readonly version: number;
      readonly schema: JsonValue;
      readonly status: string;
    }[];
  };
  readonly templates: {
    readonly responseTemplates: readonly {
      readonly name: string;
      readonly bodyBs: string;
      readonly bodyEn: string | null;
      readonly kind: string;
      readonly tags: readonly string[];
      readonly isActive: boolean;
      readonly deletedAt: string | null;
    }[];
    readonly playbooks: readonly {
      readonly name: string;
      readonly description: string | null;
      readonly isActive: boolean;
      readonly deletedAt: string | null;
    }[];
  } | null;
};

export type ConfigPackageHeader = {
  readonly format: string;
  readonly formatVersion: number;
  readonly appVersion: string;
  readonly sourceEnvironment: string;
  readonly sourceVersion: number;
  readonly exportedAt: string;
  readonly includesEnvironmentBound: boolean;
};

export type ConfigPackage = ConfigPackageHeader & {
  readonly content: PortableConfig;
  /** SHA-256 (hex) of the canonical JSON of header + content. */
  readonly checksum: string;
  /** HMAC-SHA256 (hex) of the checksum with CONFIG_PACKAGE_SIGNING_KEY, or null. */
  readonly signature: string | null;
};

/** Natural key ↔ local id for one environment. */
export type ConfigReferenceIndex = {
  readonly organizationalUnits: readonly { readonly id: string; readonly key: string }[];
  readonly groups: readonly { readonly id: string; readonly key: string }[];
  readonly services: readonly { readonly id: string; readonly key: string }[];
  readonly serviceCategories: readonly { readonly id: string; readonly key: string }[];
  readonly policyPacks: readonly { readonly id: string; readonly key: string }[];
  readonly calendars: readonly { readonly id: string; readonly key: string }[];
  readonly slaProfiles: readonly { readonly id: string; readonly key: string }[];
  readonly responseTemplates: readonly { readonly id: string; readonly key: string }[];
  readonly playbooks: readonly { readonly id: string; readonly key: string }[];
  /** Key is `<service slug>@<version>`. */
  readonly formVersions: readonly { readonly id: string; readonly key: string }[];
};

export type ConfigPackageMappings = Partial<
  Record<ConfigPackageReferenceKind, Readonly<Record<string, string>>>
>;

export type ConfigPackageResolutionStatus = 'resolved' | 'mapped' | 'missing' | 'ambiguous';

export type ConfigPackageResolutionItem = {
  readonly kind: ConfigPackageReferenceKind;
  readonly key: string;
  readonly status: ConfigPackageResolutionStatus;
  readonly localId: string | null;
  /** Missing references in routing/SLA/catalog block the import; skipped rows do not. */
  readonly blocking: boolean;
  readonly usedBy: readonly string[];
};

export type ConfigPackageSignatureState = 'valid' | 'invalid' | 'unsigned' | 'no_key';

export type ConfigPackageImportReport = {
  readonly header: ConfigPackageHeader;
  /**
   * Target entities offered for manual mapping, only for mappable kinds that
   * have unresolved (blocking or mapped) references in this package.
   */
  readonly candidates: Partial<
    Record<ConfigPackageReferenceKind, readonly { readonly id: string; readonly key: string }[]>
  >;
  readonly checksum: string;
  readonly checksumValid: boolean;
  readonly signature: ConfigPackageSignatureState;
  readonly items: readonly ConfigPackageResolutionItem[];
  readonly settings: {
    readonly applied: readonly string[];
    readonly skippedEnvironmentBound: readonly string[];
    readonly skippedUnknown: readonly string[];
  };
  readonly created: {
    readonly calendars: readonly string[];
    readonly slaProfiles: readonly string[];
  };
  readonly skipped: {
    readonly services: readonly string[];
    readonly formVersions: readonly string[];
    readonly responseTemplates: readonly string[];
    readonly playbooks: readonly string[];
  };
  readonly blockingCount: number;
  readonly canImport: boolean;
};
