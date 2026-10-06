import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import {
  createTicketViaApi,
  createOfferedService,
  firstServiceCategoryId,
  loadSeedCatalog,
} from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

test.describe('02 routing / fallback', () => {
  test('seed service routes to a group; unrouted service stays UNROUTED', async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    const routed = await createTicketViaApi(api, {
      title: `E2E routed ${Date.now()}`,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
    });
    expect(routed.status === 'UNROUTED' || routed.assignedGroupId !== null).toBe(
      true,
    );
    const service = await createOfferedService(api, {
      label: 'Unrouted',
    });
    const unrouted = await createTicketViaApi(api, {
      title: `E2E unrouted ${Date.now()}`,
      serviceId: service.id,
      originUnitId: catalog.originUnitId,
    });
    expect(unrouted.status).toBe('UNROUTED');
    expect(unrouted.assignedGroupId).toBeNull();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    // The inbox shows only the viewer's own groups; the SuperAdmin need not be a
    // member of the group the ticket was routed to. The full list shows it (as in 07).
    await page.goto('/tickets?view=all');
    await expect(page.getByText(routed.title).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('routing coverage filters service state and origin, then paginates complete service rows', async () => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(api);
    await createOfferedService(api, { label: 'Coverage pagination' });

    const stamp = Date.now();
    const draft = await api.requestJson<{ readonly id: string }>('/services', {
      method: 'POST',
      body: JSON.stringify({
        name: `E2E Coverage draft ${stamp}`,
        slug: `e2e-coverage-draft-${stamp}`,
        categoryId: await firstServiceCategoryId(api),
        classification: 'INTERNAL',
      }),
    });

    const pageOne = await api.requestJson<{
      readonly items: readonly {
        readonly originUnitId: string;
        readonly serviceId: string;
        readonly serviceLifecycle: string;
      }[];
      readonly total: number;
      readonly take: number;
      readonly nextCursor: string | null;
    }>('/routing/coverage?take=1');
    expect(pageOne.take).toBe(1);
    expect(pageOne.total).toBeGreaterThan(1);
    expect(pageOne.items.length).toBeGreaterThan(0);
    const firstServiceId = pageOne.items[0]?.serviceId;
    expect(pageOne.items.every((item) => item.serviceId === firstServiceId)).toBe(true);
    expect(pageOne.nextCursor).not.toBeNull();

    const nextQuery = new URLSearchParams({
      take: '1',
      cursor: pageOne.nextCursor ?? '',
    });
    const pageTwo = await api.requestJson<typeof pageOne>(
      `/routing/coverage?${nextQuery.toString()}`,
    );
    expect(pageTwo.total).toBe(pageOne.total);
    expect(pageTwo.items.length).toBeGreaterThan(0);
    expect(pageTwo.items.every((item) => item.serviceId !== firstServiceId)).toBe(true);

    const filteredQuery = new URLSearchParams({
      originUnitId: catalog.originUnitId,
      serviceId: catalog.serviceId,
      take: '1',
    });
    const filtered = await api.requestJson<typeof pageOne>(
      `/routing/coverage?${filteredQuery.toString()}`,
    );
    const returnedOriginUnitIds = [
      ...new Set(filtered.items.map((item) => item.originUnitId)),
    ].sort();
    const returnedServiceIds = [
      ...new Set(filtered.items.map((item) => item.serviceId)),
    ].sort();
    const filterDiagnostics = [
      `query=${filteredQuery.toString()}`,
      `total=${filtered.total}`,
      `itemCount=${filtered.items.length}`,
      `originUnitIds=${returnedOriginUnitIds.join(',')}`,
      `serviceIds=${returnedServiceIds.join(',')}`,
    ].join('; ');
    expect(returnedOriginUnitIds, filterDiagnostics).toEqual([
      catalog.originUnitId,
    ]);
    expect(filtered.total, filterDiagnostics).toBe(1);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      originUnitId: catalog.originUnitId,
      serviceId: catalog.serviceId,
      serviceLifecycle: 'ACTIVE',
    });

    const excludedDraftQuery = new URLSearchParams({ serviceId: draft.id, take: '1' });
    const excludedDraft = await api.requestJson<typeof pageOne>(
      `/routing/coverage?${excludedDraftQuery.toString()}`,
    );
    expect(excludedDraft.total).toBe(0);
    expect(excludedDraft.items).toHaveLength(0);

    excludedDraftQuery.set('includeInactive', 'true');
    const includedDraft = await api.requestJson<typeof pageOne>(
      `/routing/coverage?${excludedDraftQuery.toString()}`,
    );
    expect(includedDraft.total).toBe(1);
    expect(includedDraft.items).toHaveLength(1);
    expect(includedDraft.items[0]).toMatchObject({
      serviceId: draft.id,
      serviceLifecycle: 'DRAFT',
    });
  });
});
