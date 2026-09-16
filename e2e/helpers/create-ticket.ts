import { ApiClient } from './api-client';

export type CreatedTicket = {
  readonly id: string;
  readonly status: string;
  readonly assignedGroupId: string | null;
  readonly title: string;
};

export async function createTicketViaApi(
  api: ApiClient,
  input: {
    readonly title: string;
    readonly description?: string;
    readonly serviceId: string;
    readonly originUnitId: string;
    readonly formVersionRef?: string;
    readonly isConfidential?: boolean;
    readonly impact?: string;
    readonly urgency?: string;
  },
): Promise<CreatedTicket> {
  return api.requestJson<CreatedTicket>('/tickets', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? 'E2E ticket body',
      serviceId: input.serviceId,
      originUnitId: input.originUnitId,
      formVersionRef: input.formVersionRef,
      isConfidential: input.isConfidential === true,
      impact: input.impact ?? 'MEDIUM',
      urgency: input.urgency ?? 'MEDIUM',
      formData: {},
    }),
  });
}

export async function loadSeedCatalog(api: ApiClient): Promise<{
  readonly serviceId: string;
  readonly originUnitId: string;
  readonly formVersionRef: string | undefined;
}> {
  const services = await api.requestJson<
    Array<{ id: string; name: string; slug?: string }>
  >('/services');
  const service =
    services.find((item) => item.slug === 'opsti-zahtjev') ??
    services.find((item) => /opšti|opsti|general/i.test(item.name));
  if (service === undefined) {
    throw new Error('Seed service Opšti zahtjev not found');
  }
  const tree = await api.requestJson<{ id: string } | Array<{ id: string }>>(
    '/organizational-units/tree',
  );
  const originUnitId = Array.isArray(tree) ? tree[0]?.id : tree.id;
  if (originUnitId === undefined) {
    throw new Error('Organizational unit tree empty');
  }
  const forms = await api
    .requestJson<Array<{ formVersionRef: string; isActive?: boolean }>>(
      `/services/${service.id}/forms`,
    )
    .catch(() => []);
  const active = forms.find((form) => form.isActive !== false) ?? forms[0];
  return {
    serviceId: service.id,
    originUnitId,
    formVersionRef: active?.formVersionRef,
  };
}
