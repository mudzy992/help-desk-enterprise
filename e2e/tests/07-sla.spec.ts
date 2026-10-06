import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type OrganizationalUnitNode = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly OrganizationalUnitNode[];
};

type ComplianceBreakdownRow = {
  readonly dimensionId: string | null;
  readonly sampleCount: number;
};

test.describe('07 SLA', () => {
  test('ticket exposes SLA due fields and compliance is scoped to the selected OU tree', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const tree = await api.requestJson<readonly OrganizationalUnitNode[]>(
      '/organizational-units/tree',
    );
    const root = tree[0];
    const reportingUnitId = root?.id ?? catalog.originUnitId;
    const ticketOriginUnitId = root?.children[0]?.id ?? reportingUnitId;
    const created = await createTicketViaApi(api, {
      title: `E2E sla ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: ticketOriginUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    const detail = await api.requestJson<{
      sla?: {
        slaProfileId?: string | null;
        responseDueAt?: string | null;
        resolutionDueAt?: string | null;
      } | null;
      closePolicy?: { allowedCodes: readonly { key: string }[] };
      isOverdue?: boolean;
    }>(`/tickets/${created.id}`);
    expect(
      detail.sla?.responseDueAt != null ||
        detail.sla?.resolutionDueAt != null ||
        detail.isOverdue !== undefined,
    ).toBe(true);

    await api.requestJson(`/tickets/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    await api.requestJson(`/tickets/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'RESOLVED',
        closeCode: detail.closePolicy?.allowedCodes[0]?.key ?? 'other',
        resolutionNote: 'E2E SLA compliance sample',
      }),
    });

    const missingScope = await api.request('/sla/compliance?days=30');
    expect(missingScope.status).toBe(400);
    const compliance = await api.requestJson<{
      profiles: readonly unknown[];
      byUnit: readonly ComplianceBreakdownRow[];
      byService: readonly ComplianceBreakdownRow[];
      byGroup: readonly ComplianceBreakdownRow[];
      openBreached: { response: number; resolution: number };
    }>(
      `/sla/compliance?organizationalUnitId=${encodeURIComponent(reportingUnitId)}&days=30`,
    );
    expect(Array.isArray(compliance.profiles)).toBe(true);
    expect(Array.isArray(compliance.byUnit)).toBe(true);
    expect(Array.isArray(compliance.byService)).toBe(true);
    expect(Array.isArray(compliance.byGroup)).toBe(true);
    expect(compliance.openBreached).toEqual({
      response: expect.any(Number),
      resolution: expect.any(Number),
    });
    if (detail.sla?.slaProfileId != null) {
      expect(
        compliance.byUnit.some(
          (row) => row.dimensionId === ticketOriginUnitId && row.sampleCount > 0,
        ),
      ).toBe(true);
      expect(
        compliance.byService.some(
          (row) => row.dimensionId === catalog.serviceId && row.sampleCount > 0,
        ),
      ).toBe(true);
    }

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/sla');
    const unitScope = page.getByLabel(/Organizational unit scope|Opseg organizacione jedinice/);
    await expect(unitScope).toBeEnabled({ timeout: 20_000 });
    const selectedUnitId = await unitScope.inputValue();
    expect(selectedUnitId).not.toBe('');
    const availableUnitIds = await unitScope.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(availableUnitIds).toContain(selectedUnitId);
    await page.goto('/tickets');
    await expect(page.getByText(created.title).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
