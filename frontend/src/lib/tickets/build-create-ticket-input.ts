import type { CreateTicketInput, TicketImpact, TicketUrgency } from "@/services/tickets-api";

export type CreateTicketDraft = {
  readonly title: string;
  readonly description: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly serviceId: string;
  readonly originUnitId: string;
  readonly formVersionRef: string | null;
  readonly formData: Record<string, unknown>;
};

export const emptyCreateTicketDraft: CreateTicketDraft = {
  title: "",
  description: "",
  impact: "MEDIUM",
  urgency: "MEDIUM",
  serviceId: "",
  originUnitId: "",
  formVersionRef: null,
  formData: {},
};

export function isCreateTicketDraftReady(
  draft: CreateTicketDraft,
  options: { readonly isOriginUnitLocked?: boolean } = {},
): boolean {
  const hasOriginUnit =
    draft.originUnitId.trim().length > 0 ||
    options.isOriginUnitLocked === true;
  return (
    draft.title.trim().length > 0 &&
    draft.description.trim().length > 0 &&
    draft.serviceId.trim().length > 0 &&
    hasOriginUnit
  );
}

/// A ticket always stores a formVersionRef, so the backend rejects creation for
/// a service whose form has no ACTIVE version. Blocking here keeps the user
/// from submitting a request that cannot succeed.
export function isServiceReadyForTicketCreation(
  draft: CreateTicketDraft,
  hasActiveForm: boolean,
): boolean {
  return draft.serviceId.trim().length === 0 || hasActiveForm;
}

export function buildCreateTicketInput(
  draft: CreateTicketDraft,
  options: { readonly acknowledgeDuplicate?: boolean } = {},
): CreateTicketInput {
  const originUnitId = draft.originUnitId.trim();
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    impact: draft.impact,
    urgency: draft.urgency,
    serviceId: draft.serviceId,
    ...(originUnitId.length > 0 ? { originUnitId } : {}),
    ...(draft.formVersionRef === null
      ? {}
      : { formVersionRef: draft.formVersionRef }),
    ...(Object.keys(draft.formData).length === 0 ? {} : { formData: draft.formData }),
    ...(options.acknowledgeDuplicate === true ? { acknowledgeDuplicate: true } : {}),
  };
}

export function knowledgeInterceptQuery(draft: CreateTicketDraft): string {
  return `${draft.title.trim()} ${draft.description.trim()}`.trim();
}
