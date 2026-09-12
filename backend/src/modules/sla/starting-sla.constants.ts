import type { TicketPriority } from '../../generated/prisma/enums';
import { slaConstants, standardWeeklyHours } from './sla.constants';
import type { SlaMutationContext } from './sla.types';

export const startingSlaCalendarKey = 'BH_STANDARD';

export const startingSlaProfileKeys = [
  'INCIDENT',
  'ACCESS',
  'STANDARD_REQUEST',
  'FINANCE',
  'HR',
] as const;

export type StartingSlaProfileKey = (typeof startingSlaProfileKeys)[number];

export type StartingSlaDurationUnit = 'minutes' | 'hours' | 'businessDays';

export type StartingSlaDuration = {
  readonly unit: StartingSlaDurationUnit;
  readonly value: number;
};

export type StartingSlaRuleDefinition = {
  readonly priority: TicketPriority;
  readonly response: StartingSlaDuration;
  readonly resolution: StartingSlaDuration;
};

export type StartingSlaProfileDefinition = {
  readonly key: StartingSlaProfileKey;
  readonly name: string;
  readonly rules: readonly StartingSlaRuleDefinition[];
};

export const startingSlaSeedReason = 'sla_starting_profiles_seed';

export const startingSlaSeedContext: SlaMutationContext = {
  actorUserId: null,
};

export const startingSlaCalendarSeed = {
  key: startingSlaCalendarKey,
  name: 'BH Standard',
  timezone: slaConstants.defaultTimezone,
  weeklyHours: standardWeeklyHours,
} as const;

const minutes = (value: number): StartingSlaDuration => ({
  unit: 'minutes',
  value,
});

const hours = (value: number): StartingSlaDuration => ({
  unit: 'hours',
  value,
});

const businessDays = (value: number): StartingSlaDuration => ({
  unit: 'businessDays',
  value,
});

// RAW_PROJECT_EPHELPDESK.md — Startni SLA profili (BH_STANDARD).
export const startingSlaProfileDefinitions: readonly StartingSlaProfileDefinition[] =
  [
    {
      key: 'INCIDENT',
      name: 'Incident',
      rules: [
        { priority: 'CRITICAL', response: minutes(10), resolution: hours(2) },
        { priority: 'HIGH', response: minutes(30), resolution: hours(4) },
        { priority: 'MEDIUM', response: hours(2), resolution: businessDays(1) },
        { priority: 'LOW', response: hours(4), resolution: businessDays(3) },
      ],
    },
    {
      key: 'ACCESS',
      name: 'Access',
      rules: [
        { priority: 'CRITICAL', response: minutes(30), resolution: hours(8) },
        { priority: 'HIGH', response: hours(2), resolution: businessDays(2) },
        { priority: 'MEDIUM', response: businessDays(1), resolution: businessDays(5) },
        { priority: 'LOW', response: businessDays(2), resolution: businessDays(10) },
      ],
    },
    {
      key: 'STANDARD_REQUEST',
      name: 'Standard request',
      rules: [
        { priority: 'CRITICAL', response: minutes(15), resolution: hours(4) },
        { priority: 'HIGH', response: hours(1), resolution: hours(8) },
        { priority: 'MEDIUM', response: hours(4), resolution: businessDays(3) },
        { priority: 'LOW', response: businessDays(1), resolution: businessDays(10) },
      ],
    },
    {
      key: 'FINANCE',
      name: 'Finance',
      rules: [
        { priority: 'CRITICAL', response: hours(1), resolution: businessDays(1) },
        { priority: 'HIGH', response: hours(4), resolution: businessDays(3) },
        { priority: 'MEDIUM', response: businessDays(1), resolution: businessDays(7) },
        { priority: 'LOW', response: businessDays(2), resolution: businessDays(15) },
      ],
    },
    {
      key: 'HR',
      name: 'HR',
      rules: [
        { priority: 'CRITICAL', response: hours(4), resolution: businessDays(2) },
        { priority: 'HIGH', response: businessDays(1), resolution: businessDays(5) },
        { priority: 'MEDIUM', response: businessDays(2), resolution: businessDays(10) },
        { priority: 'LOW', response: businessDays(5), resolution: businessDays(20) },
      ],
    },
  ];
