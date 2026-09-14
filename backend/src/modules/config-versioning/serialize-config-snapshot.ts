import { settingKeys } from '../settings/setting-keys';
import type { SettingValue } from '../settings/settings.types';
import type { JsonValue } from '../change-log/change-log.types';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { dateToHolidayDate } from '../sla/parse-calendar-holidays';
import type {
  ConfigFormVersionSnapshot,
  ConfigServiceSnapshot,
  ConfigSnapshot,
} from './config-versioning.types';

export function mergeSettingRecords(
  publicSettings: Readonly<Record<string, SettingValue | undefined>>,
  privateSettings: Readonly<Record<string, SettingValue | undefined>>,
): Readonly<Record<string, SettingValue>> {
  const merged: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries({
    ...publicSettings,
    ...privateSettings,
  })) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

export function routingConfigurationFromSettings(
  settings: Readonly<Record<string, SettingValue>>,
): ConfigSnapshot['routing']['configuration'] {
  const enabled = settings[settingKeys.privateTicketUnroutedQueueEnabled];
  const ownerRole = settings[settingKeys.privateTicketUnroutedQueueOwnerRole];
  return {
    unroutedQueueEnabled:
      typeof enabled === 'boolean'
        ? enabled
        : defaultRoutingConfiguration.unroutedQueueEnabled,
    unroutedQueueOwnerRole:
      typeof ownerRole === 'string' && ownerRole.trim().length > 0
        ? ownerRole
        : defaultRoutingConfiguration.unroutedQueueOwnerRole,
  };
}

export function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return dateToHolidayDate(value);
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function toServiceSnapshot(record: {
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
}): ConfigServiceSnapshot {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    categoryId: record.categoryId,
    lifecycle: record.lifecycle,
    availability: record.availability,
    classification: record.classification,
    requiresApproval: record.requiresApproval,
    isConfidentialDefault: record.isConfidentialDefault,
    autoAssignStrategy: record.autoAssignStrategy,
    slaProfileId: record.slaProfileId,
    policyPackId: record.policyPackId,
  };
}

export function toFormVersionSnapshot(record: {
  readonly id: string;
  readonly serviceId: string;
  readonly version: number;
  readonly schema: unknown;
  readonly status: string;
}): ConfigFormVersionSnapshot {
  return {
    id: record.id,
    serviceId: record.serviceId,
    version: record.version,
    schema: toJsonValue(record.schema),
    status: record.status,
  };
}
