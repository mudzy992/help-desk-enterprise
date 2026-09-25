import { apiRequest } from "@/services/api";

/** Paket 1.4 — response templates and playbooks (backend `modules/templates`). */

export const responseTemplateVariables = [
  "ticketNumber",
  "ticketTitle",
  "ticketUrl",
  "serviceName",
  "categoryName",
  "groupName",
  "statusLabel",
  "priorityLabel",
  "requesterName",
  "requesterFirstName",
  "agentName",
  "agentFirstName",
  "organizationalUnitName",
  "slaResolutionDue",
  "appName",
  "today",
] as const;
export type ResponseTemplateVariable = (typeof responseTemplateVariables)[number];

export type ResponseTemplateKind = "REPLY" | "INTERNAL" | "ANY";
export type ResponseTemplateOwnership = "shared" | "personal";
export type TemplateLocale = "bs" | "en";
export type PlaybookRequiredStepsMode = "off" | "warn" | "block";

export type ResponseTemplate = {
  readonly id: string;
  readonly name: string;
  readonly bodyBs: string;
  readonly bodyEn: string | null;
  readonly kind: ResponseTemplateKind;
  readonly tags: readonly string[];
  readonly isActive: boolean;
  readonly ownership: ResponseTemplateOwnership;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly variables: readonly string[];
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
  readonly updatedAt: string;
  readonly canEdit: boolean;
};

export type ResponseTemplatePickerItem = {
  readonly id: string;
  readonly name: string;
  readonly kind: ResponseTemplateKind;
  readonly tags: readonly string[];
  readonly ownership: ResponseTemplateOwnership;
  /** 3 service, 2 category, 1 group, 0 global, -1 scoped elsewhere. */
  readonly scopeMatch: number;
  readonly usageCount: number;
  readonly preview: string;
  readonly hasEnglish: boolean;
};

export type RenderedTemplate = {
  readonly templateId: string | null;
  readonly text: string;
  readonly locale: TemplateLocale;
  readonly missing: readonly ResponseTemplateVariable[];
  readonly unknown: readonly string[];
};

export type SaveResponseTemplateInput = {
  readonly name: string;
  readonly bodyBs: string;
  readonly bodyEn?: string | null;
  readonly kind: ResponseTemplateKind;
  readonly tags?: readonly string[];
  readonly isActive?: boolean;
  readonly serviceIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly reason?: string;
};

export type TemplateListState = "active" | "inactive" | "all";

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : "";
}

export function listPickerTemplates(input: {
  readonly ticketId?: string;
  readonly kind?: "REPLY" | "INTERNAL";
  readonly q?: string;
  readonly all?: boolean;
}): Promise<readonly ResponseTemplatePickerItem[]> {
  return apiRequest(
    `/response-templates${query({
      ticketId: input.ticketId,
      kind: input.kind,
      q: input.q,
      all: input.all === true ? "true" : undefined,
    })}`,
  );
}

export function renderTicketTemplate(
  ticketId: string,
  templateId: string,
  locale?: TemplateLocale,
): Promise<RenderedTemplate> {
  return apiRequest(`/tickets/${ticketId}/response-templates/${templateId}/render`, {
    method: "POST",
    body: JSON.stringify(locale === undefined ? {} : { locale }),
  });
}

export function listManagedTemplates(input: {
  readonly ownership: "shared" | "mine";
  readonly q?: string;
  readonly serviceId?: string;
  readonly state?: TemplateListState;
}): Promise<readonly ResponseTemplate[]> {
  return apiRequest(
    `/response-templates/manage${query({
      ownership: input.ownership,
      q: input.q,
      serviceId: input.serviceId,
      state: input.state,
    })}`,
  );
}

export function getResponseTemplate(templateId: string): Promise<ResponseTemplate> {
  return apiRequest(`/response-templates/${templateId}`);
}

function basePath(ownership: ResponseTemplateOwnership): string {
  return ownership === "personal" ? "/response-templates/mine" : "/response-templates";
}

export function createResponseTemplate(
  ownership: ResponseTemplateOwnership,
  input: SaveResponseTemplateInput,
): Promise<ResponseTemplate> {
  return apiRequest(basePath(ownership), { method: "POST", body: JSON.stringify(input) });
}

export function updateResponseTemplate(
  ownership: ResponseTemplateOwnership,
  templateId: string,
  input: SaveResponseTemplateInput,
): Promise<ResponseTemplate> {
  return apiRequest(`${basePath(ownership)}/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteResponseTemplate(
  ownership: ResponseTemplateOwnership,
  templateId: string,
  reason?: string,
): Promise<{ readonly id: string }> {
  return apiRequest(`${basePath(ownership)}/${templateId}`, {
    method: "DELETE",
    ...(ownership === "shared" ? { body: JSON.stringify({ reason }) } : {}),
  });
}

export function previewResponseTemplate(input: {
  readonly body: string;
  readonly locale?: TemplateLocale;
  readonly ticketId?: string;
}): Promise<RenderedTemplate> {
  return apiRequest("/response-templates/preview", { method: "POST", body: JSON.stringify(input) });
}

// ------------------------------------------------------------- playbooks

export type PlaybookStep = {
  readonly stepKey: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly required: boolean;
  readonly knowledgeArticleId: string | null;
  readonly responseTemplateId: string | null;
};

export type Playbook = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly steps: readonly PlaybookStep[];
  readonly activeTicketCount: number;
  readonly updatedAt: string;
  readonly canEdit: boolean;
};

export type SavePlaybookInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly isActive?: boolean;
  readonly serviceIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly steps: readonly {
    readonly stepKey?: string;
    readonly title: string;
    readonly instructions?: string | null;
    readonly required?: boolean;
    readonly knowledgeArticleId?: string | null;
    readonly responseTemplateId?: string | null;
  }[];
  readonly reason?: string;
};

export function listPlaybooks(input: {
  readonly q?: string;
  readonly serviceId?: string;
  readonly state?: TemplateListState;
}): Promise<readonly Playbook[]> {
  return apiRequest(`/playbooks${query({ q: input.q, serviceId: input.serviceId, state: input.state })}`);
}

export function getPlaybook(playbookId: string): Promise<Playbook> {
  return apiRequest(`/playbooks/${playbookId}`);
}

export function createPlaybook(input: SavePlaybookInput): Promise<Playbook> {
  return apiRequest("/playbooks", { method: "POST", body: JSON.stringify(input) });
}

export function updatePlaybook(playbookId: string, input: SavePlaybookInput): Promise<Playbook> {
  return apiRequest(`/playbooks/${playbookId}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deletePlaybook(playbookId: string, reason: string): Promise<{ readonly id: string }> {
  return apiRequest(`/playbooks/${playbookId}`, { method: "DELETE", body: JSON.stringify({ reason }) });
}

// ------------------------------------------------------ ticket checklist

type PersonRef = { readonly id: string; readonly displayName: string } | null;

export type TicketPlaybookStep = PlaybookStep & {
  readonly checked: boolean;
  readonly checkedBy: PersonRef;
  readonly checkedAt: string | null;
  readonly knowledgeArticleTitle: string | null;
  readonly knowledgeArticleSlug: string | null;
  readonly responseTemplateName: string | null;
};

export type PlaybookProgress = {
  readonly total: number;
  readonly done: number;
  readonly requiredTotal: number;
  readonly requiredDone: number;
  readonly openRequired: readonly { readonly stepKey: string; readonly title: string }[];
  readonly complete: boolean;
};

export type TicketPlaybookView = {
  readonly enabled: boolean;
  readonly mode: PlaybookRequiredStepsMode;
  readonly readOnly: boolean;
  readonly playbook: null | {
    readonly id: string;
    readonly playbookId: string;
    readonly name: string;
    readonly version: number;
    readonly latestVersion: number | null;
    readonly autoAttached: boolean;
    readonly attachedBy: PersonRef;
    readonly attachedAt: string;
    readonly steps: readonly TicketPlaybookStep[];
    readonly progress: PlaybookProgress;
  };
  readonly available: readonly {
    readonly id: string;
    readonly name: string;
    readonly match: "service" | "category" | "other";
  }[];
};

export function getTicketPlaybook(ticketId: string): Promise<TicketPlaybookView> {
  return apiRequest(`/tickets/${ticketId}/playbook`);
}

export function attachTicketPlaybook(ticketId: string, playbookId: string): Promise<TicketPlaybookView> {
  return apiRequest(`/tickets/${ticketId}/playbook`, {
    method: "POST",
    body: JSON.stringify({ playbookId }),
  });
}

export function detachTicketPlaybook(ticketId: string, reason: string): Promise<TicketPlaybookView> {
  return apiRequest(`/tickets/${ticketId}/playbook`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function upgradeTicketPlaybook(ticketId: string): Promise<TicketPlaybookView> {
  return apiRequest(`/tickets/${ticketId}/playbook/upgrade`, { method: "POST" });
}

export function setTicketPlaybookStep(
  ticketId: string,
  stepKey: string,
  checked: boolean,
): Promise<TicketPlaybookView> {
  return apiRequest(`/tickets/${ticketId}/playbook/steps/${encodeURIComponent(stepKey)}`, {
    method: "PUT",
    body: JSON.stringify({ checked }),
  });
}
