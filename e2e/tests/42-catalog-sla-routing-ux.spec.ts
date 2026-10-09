import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { firstServiceCategoryId } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = {
  readonly id: string;
  readonly children?: readonly UnitNode[];
};

type NamedRecord = {
  readonly id: string;
  readonly name: string;
};

type ServiceRecord = NamedRecord & {
  readonly slug: string;
  readonly lifecycle: string;
};

type CalendarRecord = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
};

function firstUnitId(tree: readonly UnitNode[]): string | null {
  const queue = [...tree];
  while (queue.length > 0) {
    const unit = queue.shift();
    if (unit === undefined) break;
    if (unit.id.length > 0) return unit.id;
    queue.push(...(unit.children ?? []));
  }
  return null;
}

async function createDraftService(api: ApiClient, label: string): Promise<ServiceRecord> {
  const stamp = Date.now();
  return api.requestJson<ServiceRecord>('/services', {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E ${label} ${stamp}`,
      slug: `e2e-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
      categoryId: await firstServiceCategoryId(api),
      classification: 'INTERNAL',
      reason: `E2E setup: ${label} ${stamp}`,
    }),
  });
}

async function deleteRoutingRule(
  api: ApiClient,
  ruleId: string | null,
  originUnitId: string,
  serviceId: string,
): Promise<void> {
  if (ruleId === null) return;
  const response = await api.request(`/routing/rules/${ruleId}`, {
    method: 'DELETE',
    body: JSON.stringify({
      originUnitId,
      serviceId,
      reason: 'E2E 5.3.6 cleanup',
    }),
  });
  if (!response.ok && response.status !== 404) {
    console.warn(`[e2e] cleanup of routing rule ${ruleId} returned HTTP ${response.status}`);
  }
}

/** §4.7 first three modules: catalogue, SLA and routing admin UX. */
test.describe('42 catalog, SLA and routing UX (5.3.6)', () => {
  test('service create/edit and lifecycle + explicit-OU filters work together', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    const { originUnitId, targetGroup, categoryId } = await test.step(
      'load service, OU, and routing prerequisites',
      async () => {
        await api.login(env.superAdminEmail, env.superAdminPassword);
        const tree = await api.requestJson<readonly UnitNode[]>('/organizational-units/tree');
        const originUnitId = firstUnitId(tree);
        const groups = await api.requestJson<readonly NamedRecord[]>('/routing/groups');
        const targetGroup = groups[0];
        if (originUnitId === null || targetGroup === undefined) {
          throw new Error('[e2e] an organizational unit and routing group are required.');
        }
        const categoryId = await firstServiceCategoryId(api);
        return { originUnitId, targetGroup, categoryId };
      },
    );

    const stamp = Date.now();
    const serviceName = `E2E Catalog UX ${stamp}`;
    const editedName = `${serviceName} edited`;
    const slug = `e2e-catalog-ux-${stamp}`;
    let serviceId: string | null = null;
    let ruleId: string | null = null;

    try {
      const dialog = page.getByRole('dialog');
      await test.step('sign in and open the service create form', async () => {
        await signIn(page, env.superAdminEmail, env.superAdminPassword);
        await page.goto('/services');
        await page.getByRole('button', { name: /New service|Nova usluga/i }).first().click();
        await expect(dialog).toBeVisible();
      });

      await test.step('fill and submit the service create form', async () => {
        await dialog.getByRole('textbox', { name: /^(?:Name|Naziv)(?:\s+\([^)]*\))?$/i }).fill(serviceName);
        await dialog.getByLabel(/Slug/i).fill(slug);
        await dialog.getByLabel(/Category|Kategorija/).selectOption(categoryId);

        const classification = dialog.getByLabel(/Classification|Klasifikacija/);
        await expect(classification.locator('option').filter({ hasText: /Internal|Interna/ })).toHaveCount(1);
        await expect(
          dialog.getByLabel(/Auto-assign strategy|Strategija auto-dodjele/)
            .locator('option')
            .filter({ hasText: /Round robin|Kružno/ }),
        ).toHaveCount(1);
        await dialog.getByLabel(/Change reason|Razlog izmjene/).fill('Create from catalogue UX E2E');
        await dialog.locator('form button[type="submit"]').click();
        await expect(dialog).toBeHidden();
      });

      await test.step('create the explicit-OU routing rule', async () => {
        const services = await api.requestJson<readonly ServiceRecord[]>('/services');
        const created = services.find((service) => service.slug === slug);
        if (created === undefined) {
          throw new Error('[e2e] service created in the UI was not returned by GET /services.');
        }
        serviceId = created.id;
        const route = await api.requestJson<{ readonly id: string }>('/routing/rules', {
          method: 'POST',
          body: JSON.stringify({
            originUnitId,
            serviceId,
            groupId: targetGroup.id,
            reason: 'E2E exact OU filter setup',
          }),
        });
        ruleId = route.id;
      });

      await test.step('filter the catalog and edit the service', async () => {
        await page.reload();
        const serviceCard = page.getByTestId(`service-card-${serviceId}`);
        await expect(serviceCard).toBeVisible({ timeout: 20_000 });
        await page.getByRole('searchbox', { name: /Search services|Pretraga usluga/i }).fill(serviceName);
        await page.getByLabel(/Lifecycle|Životni ciklus/).selectOption('DRAFT');
        await page
          .getByLabel(/OU with an explicit routing rule|OJ s izričitim pravilom usmjeravanja/)
          .selectOption(originUnitId);
        await expect(serviceCard).toBeVisible();

        await serviceCard.getByRole('button', { name: /Edit|Izmijeni/i }).first().click();
        const editDialog = page.getByRole('dialog');
        await editDialog.getByRole('textbox', { name: /^(?:Name|Naziv)(?:\s+\([^)]*\))?$/i }).fill(editedName);
        await editDialog.getByLabel(/Change reason|Razlog izmjene/).fill('Edit from catalogue UX E2E');
        await editDialog.locator('form button[type="submit"]').click();
        await expect(editDialog).toBeHidden();
        await expect(serviceCard.getByText(editedName)).toBeVisible();

        await page.getByRole('button', { name: /Clear all filters|Očisti sve filtere/i }).click();
        await expect(serviceCard).toBeVisible();
      });
    } finally {
      if (serviceId === null) {
        const services = await api
          .requestJson<readonly ServiceRecord[]>('/services')
          .catch(() => [] as readonly ServiceRecord[]);
        serviceId = services.find((service) => service.slug === slug)?.id ?? null;
      }
      if (serviceId !== null) {
        await deleteRoutingRule(api, ruleId, originUnitId, serviceId);
        const response = await api.request(`/services/${serviceId}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          console.warn(`[e2e] cleanup of service ${serviceId} returned HTTP ${response.status}`);
        }
      }
    }
  });

  test('SLA calendar can be created, edited and safely deleted; priority matrix is editable but unsaved', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const stamp = Date.now();
    const key = `E2E_CAL_${stamp}`;
    const calendarName = `E2E SLA calendar ${stamp}`;
    const editedName = `${calendarName} edited`;

    let calendarId: string | null = null;
    try {
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto('/sla');
      await expect(page.getByLabel(/Organizational unit scope|Opseg organizacione jedinice/)).toBeEnabled({
        timeout: 20_000,
      });
      await page.getByRole('button', { name: /Manage calendars|Upravljaj kalendarima/i }).click();
      const newCalendarButton = page.getByRole('button', { name: /New calendar|Novi kalendar/i });
      await expect(newCalendarButton).toBeEnabled({ timeout: 20_000 });
      await newCalendarButton.click();
      const calendarForm = page.locator('form');
      await calendarForm.getByLabel(/Key|Ključ/).fill(key);
      await calendarForm.getByLabel(/^(Name|Naziv)$/).fill(calendarName);
      await calendarForm.getByLabel(/Change reason|Razlog izmjene/).fill('Create calendar UX E2E');
      await expect(calendarForm.getByLabel(/Key|Ključ/)).toBeVisible();
      await calendarForm.locator('button[type="submit"]').click();
      await expect(page.getByRole('button', { name: new RegExp(calendarName) })).toBeVisible({
        timeout: 20_000,
      });

      const calendars = await api.requestJson<readonly CalendarRecord[]>('/sla/calendars');
      const created = calendars.find((calendar) => calendar.key === key);
      if (created === undefined) {
        throw new Error('[e2e] calendar created in the UI was not returned by GET /sla/calendars.');
      }
      calendarId = created.id;

      await calendarForm.getByLabel(/^(Name|Naziv)$/).fill(editedName);
      await calendarForm.getByLabel(/Change reason|Razlog izmjene/).fill('Edit calendar UX E2E');
      await calendarForm.locator('button[type="submit"]').click();
      await expect(page.getByRole('button', { name: new RegExp(editedName) })).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole('button', { name: /Delete calendar|Obriši kalendar/i }).click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm.getByLabel(/Change reason|Razlog izmjene/).fill('Delete calendar UX E2E');
      await confirm.getByTestId('confirm-dialog-confirm').click();
      await expect(confirm).toBeHidden();
      calendarId = null;
      expect(
        (await api.requestJson<readonly CalendarRecord[]>('/sla/calendars')).some(
          (calendar) => calendar.key === key,
        ),
      ).toBe(false);

      const backToProfiles = page.getByRole('button', { name: /Back to profiles|Nazad na profile/i });
      await expect(backToProfiles).toBeVisible();
      await backToProfiles.click();
      const openPriorityMatrix = page.getByRole('button', {
        name: /Priority matrix|Matrica prioriteta/i,
      });
      await expect(openPriorityMatrix).toBeVisible();
      await openPriorityMatrix.click();
      const matrix = page.getByRole('table');
      await expect(matrix).toBeVisible();
      const cells = matrix.getByRole('combobox');
      await expect(cells).toHaveCount(16);
      const firstCell = cells.first();
      const original = await firstCell.inputValue();
      await firstCell.selectOption(original === 'CRITICAL' ? 'LOW' : 'CRITICAL');
      const saveMatrix = page.getByRole('button', { name: /Save matrix|Sačuvaj matricu/i });
      await expect(saveMatrix).toBeDisabled();
      await page.getByLabel(/Change reason|Razlog izmjene/).fill('Unpersisted matrix draft E2E');
      await expect(saveMatrix).toBeEnabled();
    } finally {
      if (calendarId === null) {
        const calendars = await api
          .requestJson<readonly CalendarRecord[]>('/sla/calendars')
          .catch(() => [] as readonly CalendarRecord[]);
        calendarId = calendars.find((calendar) => calendar.key === key)?.id ?? null;
      }
      if (calendarId !== null) {
        const response = await api.request(`/sla/calendars/${calendarId}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: 'E2E 5.3.6 cleanup' }),
        });
        if (!response.ok && response.status !== 404) {
          console.warn(`[e2e] cleanup of calendar ${calendarId} returned HTTP ${response.status}`);
        }
      }
    }
  });

  test('routing rules read as WHEN/THEN and the resolution tester shows the exact route', async ({ page }) => {
    test.setTimeout(90_000);
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<readonly UnitNode[]>('/organizational-units/tree');
    const originUnitId = firstUnitId(tree);
    const groups = await api.requestJson<readonly NamedRecord[]>('/routing/groups');
    const targetGroup = groups[0];
    if (originUnitId === null || targetGroup === undefined) {
      throw new Error('[e2e] an organizational unit and routing group are required.');
    }
    const service = await createDraftService(api, 'routing-ux');
    let ruleId: string | null = null;

    try {
      const rule = await api.requestJson<{ readonly id: string }>('/routing/rules', {
        method: 'POST',
        body: JSON.stringify({
          originUnitId,
          serviceId: service.id,
          groupId: targetGroup.id,
          reason: 'E2E exact routing result setup',
        }),
      });
      ruleId = rule.id;
      await signIn(page, env.superAdminEmail, env.superAdminPassword);
      await page.goto(
        `/routing?originUnitId=${encodeURIComponent(originUnitId)}&serviceId=${encodeURIComponent(service.id)}`,
      );
      const rulesTable = page.getByRole('table');
      await expect(rulesTable.getByRole('columnheader', { name: 'WHEN' })).toBeVisible({ timeout: 20_000 });
      await expect(rulesTable.getByRole('columnheader', { name: 'THEN' })).toBeVisible();
      await expect(rulesTable.getByText(service.name, { exact: true })).toBeVisible();
      const matchingRuleRow = rulesTable.getByRole('row').filter({ hasText: service.name });
      await expect(matchingRuleRow).toHaveCount(1);
      await expect(matchingRuleRow.getByText(targetGroup.name, { exact: true })).toBeVisible();

      await page.getByTestId('tab-tester').click();
      await page.getByLabel(/Origin organizational unit|Origin organizacijska jedinica/i)
        .selectOption(originUnitId);
      await page.getByLabel(/Service|Servis/i).selectOption(service.id);
      await expect(page.getByText(/Exact|Tačno/).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(targetGroup.name, { exact: true })).toBeVisible();
    } finally {
      await deleteRoutingRule(api, ruleId, originUnitId, service.id);
      const response = await api.request(`/services/${service.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        console.warn(`[e2e] cleanup of service ${service.id} returned HTTP ${response.status}`);
      }
    }
  });

  test('catalog, SLA and routing have no page-level horizontal overflow at target widths', async ({ page }) => {
    const env = readE2EEnvironment();
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    const widths = [360, 768, 1024, 1440, 1920, 2560];
    const screens = [
      { path: '/services', heading: /Service catalog|Katalog usluga/i },
      { path: '/sla', heading: /SLA rules|SLA pravila/i },
      { path: '/routing', heading: /Routing|Usmjeravanje/i },
    ];

    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { name: screen.heading })).toBeVisible({
          timeout: 20_000,
        });
        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(documentWidth, `${screen.path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });
});
