import type { CreateTicketInput, TicketImpact, TicketUrgency } from "@/services/tickets-api";

export type CreateTicketDraft = {
  readonly title: string;
  readonly description: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly serviceId: string;
  readonly formVersionRef: string | null;
  readonly formData: Record<string, unknown>;
};

export function isCreateTicketDraftReady(draft: CreateTicketDraft): boolean {
  return (
    draft.title.trim().length > 0 &&
    draft.description.trim().length > 0 &&
    draft.serviceId.trim().length > 0
  );
}

export function buildCreateTicketInput(draft: CreateTicketDraft): CreateTicketInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    impact: draft.impact,
    urgency: draft.urgency,
    serviceId: draft.serviceId,
    ...(draft.formVersionRef === null
      ? {}
      : { formVersionRef: draft.formVersionRef }),
    ...(Object.keys(draft.formData).length === 0 ? {} : { formData: draft.formData }),
  };
}

export function knowledgeInterceptQuery(draft: CreateTicketDraft): string {
  return `${draft.title.trim()} ${draft.description.trim()}`.trim();
}
