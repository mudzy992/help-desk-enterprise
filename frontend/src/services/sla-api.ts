import { apiRequest } from "@/services/api";
import type {
  BusinessHoursCalendar,
  CalendarWriteInput,
  ProfileWriteInput,
  RuleWriteInput,
  SlaChangeLogEntry,
  SlaProfile,
  SlaRule,
} from "@/services/sla-types";

export type {
  BusinessHoursCalendar,
  CalendarWriteInput,
  ProfileWriteInput,
  RuleWriteInput,
  SlaChangeLogEntry,
  SlaHoliday,
  SlaProfile,
  SlaRule,
  WeeklyHours,
} from "@/services/sla-types";

export function listSlaCalendars(): Promise<readonly BusinessHoursCalendar[]> {
  return apiRequest("/sla/calendars");
}

export function createSlaCalendar(
  input: CalendarWriteInput & { readonly key: string },
): Promise<BusinessHoursCalendar> {
  return apiRequest("/sla/calendars", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSlaCalendar(
  calendarId: string,
  input: CalendarWriteInput,
): Promise<BusinessHoursCalendar> {
  return apiRequest(`/sla/calendars/${calendarId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSlaCalendar(calendarId: string, reason: string): Promise<void> {
  return apiRequest(`/sla/calendars/${calendarId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function listSlaCalendarChanges(
  calendarId: string,
): Promise<readonly SlaChangeLogEntry[]> {
  return apiRequest(`/sla/calendars/${calendarId}/changes`);
}

export function listSlaProfiles(): Promise<readonly SlaProfile[]> {
  return apiRequest("/sla/profiles");
}

export function createSlaProfile(
  input: ProfileWriteInput & { readonly key: string },
): Promise<SlaProfile> {
  return apiRequest("/sla/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSlaProfile(
  profileId: string,
  input: ProfileWriteInput,
): Promise<SlaProfile> {
  return apiRequest(`/sla/profiles/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      calendarId: input.calendarId,
      isActive: input.isActive,
      reason: input.reason,
    }),
  });
}

export function deleteSlaProfile(profileId: string, reason: string): Promise<void> {
  return apiRequest(`/sla/profiles/${profileId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function listSlaProfileChanges(
  profileId: string,
): Promise<readonly SlaChangeLogEntry[]> {
  return apiRequest(`/sla/profiles/${profileId}/changes`);
}

export function listSlaRules(slaProfileId: string): Promise<readonly SlaRule[]> {
  return apiRequest(`/sla/rules?slaProfileId=${encodeURIComponent(slaProfileId)}`);
}

export function createSlaRule(
  input: RuleWriteInput & { readonly slaProfileId: string },
): Promise<SlaRule> {
  return apiRequest("/sla/rules", {
    method: "POST",
    body: JSON.stringify(toRulePayload(input)),
  });
}

export function updateSlaRule(ruleId: string, input: RuleWriteInput): Promise<SlaRule> {
  return apiRequest(`/sla/rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(toRulePayload(input)),
  });
}

export function deleteSlaRule(ruleId: string, reason: string): Promise<void> {
  return apiRequest(`/sla/rules/${ruleId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function listSlaRuleChanges(ruleId: string): Promise<readonly SlaChangeLogEntry[]> {
  return apiRequest(`/sla/rules/${ruleId}/changes`);
}

function toRulePayload(input: RuleWriteInput) {
  return {
    slaProfileId: input.slaProfileId,
    priority: input.priority,
    responseMinutes: input.responseMinutes,
    resolutionMinutes: input.resolutionMinutes,
    evaluationOrder: input.evaluationOrder,
    organizationalUnitId:
      input.organizationalUnitId.trim().length === 0
        ? null
        : input.organizationalUnitId,
    serviceId: input.serviceId.trim().length === 0 ? null : input.serviceId,
    reason: input.reason,
  };
}
