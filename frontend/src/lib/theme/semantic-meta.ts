import type { BadgeTone } from "@/components/ui/badge";
import type { RoutingOutcome } from "@/services/routing-api";
import type { ServiceAvailability, ServiceLifecycle } from "@/services/service-catalog-api";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

export type SemanticMeta = {
  readonly tone: BadgeTone;
  readonly dot: string;
};

/**
 * Dot colours for status indicators. These are CSS variables rather than hex
 * literals so a status dot stays legible in every theme block — no new colours
 * are introduced, only the token that backs them.
 */
export const SEMANTIC_DOT_HEX = {
  primary: "rgb(var(--primary))",
  success: "rgb(var(--ok))",
  warning: "rgb(var(--warning))",
  danger: "rgb(var(--danger))",
  info: "rgb(var(--info))",
  neutral: "rgb(var(--muted))",
} as const;

function meta(tone: BadgeTone, dot: string): SemanticMeta {
  return { tone, dot };
}

export const TICKET_STATUS_META: Record<TicketStatus, SemanticMeta> = {
  PENDING: meta("info", SEMANTIC_DOT_HEX.info),
  UNROUTED: meta("danger", SEMANTIC_DOT_HEX.danger),
  PENDING_APPROVAL: meta("warning", SEMANTIC_DOT_HEX.warning),
  ASSIGNED: meta("primary", SEMANTIC_DOT_HEX.primary),
  IN_PROGRESS: meta("primary", SEMANTIC_DOT_HEX.primary),
  WAITING_FOR_USER: meta("warning", SEMANTIC_DOT_HEX.warning),
  RESOLVED: meta("success", SEMANTIC_DOT_HEX.success),
  CLOSED: meta("neutral", SEMANTIC_DOT_HEX.neutral),
  ARCHIVED: meta("neutral", SEMANTIC_DOT_HEX.neutral),
};

export const TICKET_PRIORITY_META: Record<TicketPriority, SemanticMeta> = {
  LOW: meta("neutral", SEMANTIC_DOT_HEX.neutral),
  MEDIUM: meta("info", SEMANTIC_DOT_HEX.info),
  HIGH: meta("warning", SEMANTIC_DOT_HEX.warning),
  CRITICAL: meta("danger", SEMANTIC_DOT_HEX.danger),
};

export const SERVICE_LIFECYCLE_META: Record<ServiceLifecycle, SemanticMeta> = {
  DRAFT: meta("neutral", SEMANTIC_DOT_HEX.neutral),
  ACTIVE: meta("success", SEMANTIC_DOT_HEX.success),
  DEPRECATED: meta("warning", SEMANTIC_DOT_HEX.warning),
};

/** `OPERATIONAL` is the domain enum; visual meaning is AVAILABLE / “Dostupno”. */
export const SERVICE_AVAILABILITY_META: Record<ServiceAvailability, SemanticMeta> = {
  OPERATIONAL: meta("success", SEMANTIC_DOT_HEX.success),
  DEGRADED: meta("warning", SEMANTIC_DOT_HEX.warning),
  DOWN: meta("danger", SEMANTIC_DOT_HEX.danger),
  MAINTENANCE: meta("info", SEMANTIC_DOT_HEX.info),
};

export const ROUTING_OUTCOME_META: Record<RoutingOutcome, SemanticMeta> = {
  EXACT: meta("success", SEMANTIC_DOT_HEX.success),
  PARENT_FALLBACK: meta("info", SEMANTIC_DOT_HEX.info),
  UNROUTED: meta("danger", SEMANTIC_DOT_HEX.danger),
};

export type SlaVisualState = "OK" | "RISK" | "BREACHED" | "NONE";

export const SLA_STATE_META: Record<SlaVisualState, SemanticMeta> = {
  OK: meta("success", SEMANTIC_DOT_HEX.success),
  RISK: meta("warning", SEMANTIC_DOT_HEX.warning),
  BREACHED: meta("danger", SEMANTIC_DOT_HEX.danger),
  NONE: meta("neutral", SEMANTIC_DOT_HEX.neutral),
};
