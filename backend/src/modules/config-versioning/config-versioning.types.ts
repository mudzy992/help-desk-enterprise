import type {
  ConfigVersionStatus,
  TicketPriority,
} from '../../generated/prisma/enums';
import type { JsonValue } from '../change-log/change-log.types';
import type { SettingValue } from '../settings/settings.types';

export type ConfigVersioningConfiguration = {
  readonly enabled: boolean;
  readonly allowRollback: boolean;
  readonly validationEnabled: boolean;
  readonly blockActivationOnError: boolean;
  readonly shadowModeEnabled: boolean;
  readonly scopes: readonly string[];
};

export type ConfigValidationIssue = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type ConfigRoutingRuleSnapshot = {
  readonly id: string;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly groupId: string;
};

export type ConfigOrganizationalUnitSnapshot = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};

export type ConfigServiceSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: string;
  readonly availability: string;
  readonly classification: string;
  readonly requiresApproval: boolean;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: string;
  readonly slaProfileId: string | null;
  readonly policyPackId: string | null;
};

export type ConfigFormVersionSnapshot = {
  readonly id: string;
  readonly serviceId: string;
  readonly version: number;
  readonly schema: JsonValue;
  readonly status: string;
};

export type ConfigSlaCalendarSnapshot = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: JsonValue;
  readonly isActive: boolean;
  readonly holidays: readonly { readonly date: string; readonly name: string }[];
};

export type ConfigSlaProfileSnapshot = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly calendarId: string;
  readonly isActive: boolean;
};

export type ConfigSlaRuleSnapshot = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly priority: TicketPriority;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly evaluationOrder: number;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
};

export type ConfigSlaEscalationSnapshot = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly triggerOffsetMinutes: number;
  readonly targetGroupId: string | null;
};

export type ConfigPriorityMatrixSnapshot = {
  readonly id: string;
  readonly impact: string;
  readonly urgency: string;
  readonly priority: TicketPriority;
};

export type ConfigSnapshot = {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly scopes: readonly string[];
  readonly rollbackOfVersion: number | null;
  readonly settings: Readonly<Record<string, SettingValue>>;
  readonly routing: {
    readonly rules: readonly ConfigRoutingRuleSnapshot[];
    readonly configuration: {
      readonly unroutedQueueEnabled: boolean;
      readonly unroutedQueueOwnerRole: string;
      /**
       * Mirrors `RoutingConfiguration.requireCoverage` so a snapshot can be
       * re-evaluated by the same coverage logic the runtime uses.
       */
      readonly requireCoverage: boolean;
    };
  };
  readonly sla: {
    readonly calendars: readonly ConfigSlaCalendarSnapshot[];
    readonly profiles: readonly ConfigSlaProfileSnapshot[];
    readonly rules: readonly ConfigSlaRuleSnapshot[];
    readonly escalations: readonly ConfigSlaEscalationSnapshot[];
    readonly priorityMatrix: readonly ConfigPriorityMatrixSnapshot[];
  };
  readonly catalog: {
    readonly services: readonly ConfigServiceSnapshot[];
  };
  readonly forms: {
    readonly versions: readonly ConfigFormVersionSnapshot[];
  };
  readonly references: {
    readonly organizationalUnits: readonly ConfigOrganizationalUnitSnapshot[];
    readonly groups: readonly { readonly id: string }[];
  };
};

export type ConfigVersionResponse = {
  readonly id: string;
  readonly version: number;
  readonly status: ConfigVersionStatus;
  readonly releaseNotes: string | null;
  readonly createdByUserId: string | null;
  readonly activatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rollbackOfVersion: number | null;
};

export type ConfigVersionDetailResponse = ConfigVersionResponse & {
  readonly snapshot: ConfigSnapshot;
};

export type ConfigShadowDiff = {
  readonly sampleSize: number;
  readonly routingGroupMismatches: number;
  readonly slaRuleMismatches: number;
};

export type ShadowTicketSample = {
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly priority: TicketPriority;
};
