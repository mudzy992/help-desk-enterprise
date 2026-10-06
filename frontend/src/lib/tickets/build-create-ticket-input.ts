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
  /** Paket 3.2 (§8): own equipment, "" = none. */
  readonly assetId: string;
  /** M8 #3: what the request is about, and the wished deadline ("" = none). */
  readonly requestType: string;
  readonly dueAt: string;
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
  assetId: "",
  requestType: "",
  dueAt: "",
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

/// Keep the create flow aligned with the server's form and version settings.
export function isServiceReadyForTicketCreation(
  draft: CreateTicketDraft,
  hasActiveForm: boolean,
  formsEnabled = true,
  requireVersionOnTicket = true,
): boolean {
  return (
    draft.serviceId.trim().length === 0 ||
    !formsEnabled ||
    !requireVersionOnTicket ||
    hasActiveForm
  );
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
    ...(draft.assetId.length > 0 ? { assetId: draft.assetId } : {}),
    // `?? ""` keeps older callers (and persisted drafts) working.
    ...((draft.requestType ?? "").trim().length > 0
      ? { requestType: (draft.requestType ?? "").trim() }
      : {}),
    ...((draft.dueAt ?? "").length > 0
      ? { dueAt: new Date(draft.dueAt).toISOString() }
      : {}),
    ...(options.acknowledgeDuplicate === true ? { acknowledgeDuplicate: true } : {}),
  };
}

export function knowledgeInterceptQuery(draft: CreateTicketDraft): string {
  return `${draft.title.trim()} ${draft.description.trim()}`.trim();
}
