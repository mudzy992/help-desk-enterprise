import type { TicketPriority } from '../../generated/prisma/enums';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import {
  isPlainObject,
  readBoolean,
  readNumber,
  readNullableString,
  readString,
} from './read-snapshot-primitives';
import { toJsonValue } from './serialize-config-snapshot';

const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export function parseSlaSection(value: unknown): ConfigSnapshot['sla'] {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  if (
    !Array.isArray(value.calendars) ||
    !Array.isArray(value.profiles) ||
    !Array.isArray(value.rules) ||
    !Array.isArray(value.escalations) ||
    !Array.isArray(value.priorityMatrix)
  ) {
    throw invalid();
  }
  return {
    calendars: value.calendars.map(parseCalendar),
    profiles: value.profiles.map(parseProfile),
    rules: value.rules.map(parseRule),
    escalations: value.escalations.map(parseEscalation),
    priorityMatrix: value.priorityMatrix.map(parseMatrix),
  };
}

function parseCalendar(value: unknown) {
  if (!isPlainObject(value) || !Array.isArray(value.holidays)) {
    throw invalid();
  }
  const id = readString(value.id);
  const key = readString(value.key);
  const name = readString(value.name);
  const timezone = readString(value.timezone);
  const isActive = readBoolean(value.isActive);
  if (
    id === null ||
    key === null ||
    name === null ||
    timezone === null ||
    isActive === null
  ) {
    throw invalid();
  }
  return {
    id,
    key,
    name,
    timezone,
    weeklyHours: toJsonValue(value.weeklyHours ?? {}),
    isActive,
    holidays: value.holidays.map((holiday) => {
      if (!isPlainObject(holiday)) {
        throw invalid();
      }
      const date = readString(holiday.date);
      const holidayName = readString(holiday.name);
      if (date === null || holidayName === null) {
        throw invalid();
      }
      return { date, name: holidayName };
    }),
  };
}

function parseProfile(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const key = readString(value.key);
  const name = readString(value.name);
  const calendarId = readString(value.calendarId);
  const isActive = readBoolean(value.isActive);
  const description = readNullableString(value.description);
  if (
    id === null ||
    key === null ||
    name === null ||
    calendarId === null ||
    isActive === null ||
    description === undefined
  ) {
    throw invalid();
  }
  return { id, key, name, description, calendarId, isActive };
}

function parseRule(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const priority = readString(value.priority);
  if (priority === null || !priorities.has(priority)) {
    throw invalid();
  }
  const id = readString(value.id);
  const slaProfileId = readString(value.slaProfileId);
  const responseMinutes = readNumber(value.responseMinutes);
  const resolutionMinutes = readNumber(value.resolutionMinutes);
  const evaluationOrder = readNumber(value.evaluationOrder);
  const organizationalUnitId = readNullableString(value.organizationalUnitId);
  const serviceId = readNullableString(value.serviceId);
  if (
    id === null ||
    slaProfileId === null ||
    responseMinutes === null ||
    resolutionMinutes === null ||
    evaluationOrder === null ||
    organizationalUnitId === undefined ||
    serviceId === undefined
  ) {
    throw invalid();
  }
  return {
    id,
    slaProfileId,
    priority: priority as TicketPriority,
    responseMinutes,
    resolutionMinutes,
    evaluationOrder,
    organizationalUnitId,
    serviceId,
  };
}

function parseEscalation(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const id = readString(value.id);
  const slaProfileId = readString(value.slaProfileId);
  const triggerOffsetMinutes = readNumber(value.triggerOffsetMinutes);
  const targetGroupId = readNullableString(value.targetGroupId);
  if (
    id === null ||
    slaProfileId === null ||
    triggerOffsetMinutes === null ||
    targetGroupId === undefined
  ) {
    throw invalid();
  }
  return { id, slaProfileId, triggerOffsetMinutes, targetGroupId };
}

function parseMatrix(value: unknown) {
  if (!isPlainObject(value)) {
    throw invalid();
  }
  const priority = readString(value.priority);
  if (priority === null || !priorities.has(priority)) {
    throw invalid();
  }
  const id = readString(value.id);
  const impact = readString(value.impact);
  const urgency = readString(value.urgency);
  if (id === null || impact === null || urgency === null) {
    throw invalid();
  }
  return { id, impact, urgency, priority: priority as TicketPriority };
}

function invalid(): ConfigVersioningError {
  return new ConfigVersioningError(configVersioningErrorCodes.invalidSnapshot);
}
