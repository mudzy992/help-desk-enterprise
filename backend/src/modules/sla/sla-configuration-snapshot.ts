import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import type { SlaRuleRecord } from './sla.types';

export const slaConfigurationPolicies = {
  grandfather: 'GRANDFATHER',
  recompute: 'RECOMPUTE',
} as const;

export type SlaConfigurationSnapshot = {
  readonly schemaVersion: 1;
  readonly ruleId: string;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly calendar: BusinessMinutesCalendar;
};

export function createSlaConfigurationSnapshot(
  rule: Pick<SlaRuleRecord, 'id' | 'responseMinutes' | 'resolutionMinutes'>,
  calendar: BusinessMinutesCalendar,
): { readonly snapshot: SlaConfigurationSnapshot; readonly version: string } {
  const snapshot: SlaConfigurationSnapshot = {
    schemaVersion: 1,
    ruleId: rule.id,
    responseMinutes: rule.responseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
    calendar: {
      timezone: calendar.timezone,
      weeklyHours: calendar.weeklyHours,
      holidays: calendar.holidays.map((holiday) => ({ date: holiday.date })),
    },
  };
  return {
    snapshot,
    version: createHash('sha256').update(stableJson(snapshot)).digest('hex'),
  };
}

export function parseSlaConfigurationCalendar(
  value: Prisma.JsonValue | null | undefined,
): BusinessMinutesCalendar | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const calendar = (value as Record<string, unknown>).calendar;
  if (calendar === null || typeof calendar !== 'object' || Array.isArray(calendar)) return null;
  const candidate = calendar as Record<string, unknown>;
  if (typeof candidate.timezone !== 'string' || candidate.weeklyHours === null || typeof candidate.weeklyHours !== 'object' || !Array.isArray(candidate.holidays)) return null;
  return candidate as unknown as BusinessMinutesCalendar;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
