import type { CreateTicketDraft } from "@/lib/tickets/build-create-ticket-input";
import type { TicketImpact, TicketUrgency } from "@/services/tickets-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

export type TicketComposerDraft = {
  readonly body: string;
  readonly mode: "reply" | "internal";
};

export type PersistedCreateTicketDraft = {
  readonly serviceId: string;
  readonly originUnitId: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
};

export const CREATE_TICKET_DRAFT_STORAGE_KEY = "helpdesk:ticket-create:draft:v1";

export function ticketComposerDraftStorageKey(ticketId: string): string {
  return `helpdesk:ticket:${encodeURIComponent(ticketId)}:composer-draft:v1`;
}

export function readSessionValue<T>(
  key: string,
  isValue: (value: unknown) => value is T,
): T | null {
  try {
    if (typeof window === "undefined") return null;
    const serialized = window.sessionStorage.getItem(key);
    if (serialized === null) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSessionValue<T>(key: string, value: T): void {
  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Session storage can be disabled or full; drafts are best-effort only.
  }
}

export function clearSessionValue(key: string): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  } catch {
    // Clearing a best-effort draft must not block ticket work.
  }
}

export function isTicketComposerDraft(value: unknown): value is TicketComposerDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<TicketComposerDraft>;
  return typeof draft.body === "string" && (draft.mode === "reply" || draft.mode === "internal");
}

export function isPersistedCreateTicketDraft(value: unknown): value is PersistedCreateTicketDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<PersistedCreateTicketDraft>;
  return (
    typeof draft.serviceId === "string" &&
    typeof draft.originUnitId === "string" &&
    isImpact(draft.impact) &&
    isUrgency(draft.urgency)
  );
}

type CreateTicketDraftServicePrivacy = Pick<
  ServiceResponse,
  "id" | "classification" | "isConfidentialDefault"
>;

export function canPersistCreateTicketDraft(
  service: CreateTicketDraftServicePrivacy | null,
): boolean {
  return (
    service !== null &&
    service.classification === "INTERNAL" &&
    service.isConfidentialDefault === false
  );
}

/**
 * Persist only catalog/routing/severity selections. Free text, asset identifiers,
 * and arbitrary service-form data may contain confidential information and are
 * deliberately excluded even for an INTERNAL service.
 */
export function toPersistedCreateTicketDraft(
  draft: Pick<CreateTicketDraft, "serviceId" | "originUnitId" | "impact" | "urgency">,
  service: CreateTicketDraftServicePrivacy | null,
): PersistedCreateTicketDraft | null {
  if (service === null || !canPersistCreateTicketDraft(service) || service.id !== draft.serviceId) {
    return null;
  }
  return {
    serviceId: draft.serviceId,
    originUnitId: draft.originUnitId,
    impact: draft.impact,
    urgency: draft.urgency,
  };
}

export function restorePersistedCreateTicketDraft(
  saved: PersistedCreateTicketDraft,
  service: CreateTicketDraftServicePrivacy | null,
): Pick<CreateTicketDraft, "serviceId" | "originUnitId" | "impact" | "urgency"> | null {
  if (service === null || !canPersistCreateTicketDraft(service) || service.id !== saved.serviceId) {
    return null;
  }
  return {
    serviceId: saved.serviceId,
    originUnitId: saved.originUnitId,
    impact: saved.impact,
    urgency: saved.urgency,
  };
}

function isImpact(value: unknown): value is TicketImpact {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL";
}

function isUrgency(value: unknown): value is TicketUrgency {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL";
}
