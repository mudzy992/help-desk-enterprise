import type { BadgeTone } from "@/components/ui/badge";
import { ApiError } from "@/services/api";
import {
  incidentStatuses,
  type Incident,
  type IncidentStatus,
  type ServiceAvailabilityValue,
} from "@/services/status-api";

/** Paket 2.7 (§8): pure presentation rules of the status page. */

export function availabilityTone(value: ServiceAvailabilityValue): BadgeTone {
  switch (value) {
    case "DOWN":
      return "danger";
    case "DEGRADED":
      return "warning";
    case "MAINTENANCE":
      return "info";
    default:
      return "success";
  }
}

/** Dot colour classes for the service grid (same semantics as the badge tones). */
export function availabilityDotClassName(value: ServiceAvailabilityValue): string {
  switch (value) {
    case "DOWN":
      return "bg-danger";
    case "DEGRADED":
      return "bg-warning";
    case "MAINTENANCE":
      return "bg-info";
    default:
      return "bg-ok";
  }
}

export function incidentStatusTone(status: IncidentStatus): BadgeTone {
  switch (status) {
    case "INVESTIGATING":
      return "danger";
    case "IDENTIFIED":
      return "warning";
    case "MONITORING":
      return "info";
    default:
      return "success";
  }
}

export type OverallStatus = "operational" | "partial" | "major" | "maintenance";

/** The banner on top: an outage anywhere wins, then degradation, then maintenance. */
export function overallStatus(incidents: readonly Pick<Incident, "impact">[], affectedServiceCount: number): OverallStatus {
  if (incidents.some((incident) => incident.impact === "DOWN")) return "major";
  if (incidents.some((incident) => incident.impact === "DEGRADED")) return "partial";
  if (incidents.some((incident) => incident.impact === "MAINTENANCE")) return "maintenance";
  return affectedServiceCount > 0 ? "partial" : "operational";
}

export function overallTone(status: OverallStatus): BadgeTone {
  return status === "major" ? "danger" : status === "partial" ? "warning" : status === "maintenance" ? "info" : "success";
}

/** Statuses an operator may pick next: forward only, RESOLVED is final (mirrors the backend). */
export function nextIncidentStatuses(current: IncidentStatus): readonly IncidentStatus[] {
  if (current === "RESOLVED") return [];
  return incidentStatuses.slice(incidentStatuses.indexOf(current));
}

export function localizedIncidentTitle(incident: Pick<Incident, "title" | "titleEn">, language: string): string {
  return language.startsWith("en") && incident.titleEn !== null && incident.titleEn.trim().length > 0
    ? incident.titleEn
    : incident.title;
}

/** Whole minutes between start and resolution (or now), for "trajalo 1 h 20 min". */
export function incidentDurationMinutes(incident: Pick<Incident, "startedAt" | "resolvedAt">, nowMs: number): number {
  const end = incident.resolvedAt === null ? nowMs : Date.parse(incident.resolvedAt);
  return Math.max(0, Math.round((end - Date.parse(incident.startedAt)) / 60_000));
}

export function splitDuration(minutes: number): { readonly days: number; readonly hours: number; readonly minutes: number } {
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/** `ticket_incident_*` event detail is `<incidentId>|<title>`. */
export function parseIncidentEventDetail(detail: string | null): { readonly incidentId: string; readonly title: string } | null {
  if (detail === null) return null;
  const separator = detail.indexOf("|");
  if (separator <= 0) return null;
  return { incidentId: detail.slice(0, separator), title: detail.slice(separator + 1) };
}

export const statusErrorKeys = {
  INCIDENT_CHANGED: "status.errors.changed",
  INCIDENT_RESOLVED: "status.errors.resolved",
  INCIDENT_STATUS_TRANSITION: "status.errors.transition",
  INCIDENT_START_IN_FUTURE: "status.errors.startInFuture",
  INCIDENT_SERVICE_NOT_FOUND: "status.errors.serviceNotFound",
  INCIDENT_TICKET_FORBIDDEN: "status.errors.ticketForbidden",
  INCIDENT_NOT_FOUND: "status.errors.notFound",
  STATUS_PAGE_DISABLED: "status.errors.disabled",
} as const;

export type StatusErrorKey = (typeof statusErrorKeys)[keyof typeof statusErrorKeys];

/** A domain message for known incident codes; null lets the caller fall back to the generic mapper. */
export function mapStatusError(error: unknown): StatusErrorKey | null {
  if (!(error instanceof ApiError)) return null;
  return (statusErrorKeys as Readonly<Record<string, StatusErrorKey>>)[error.code] ?? null;
}
