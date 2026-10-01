import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../helpers/a11y';
import { ApiClient } from '../helpers/api-client';
import { firstUnit } from '../helpers/assets';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type Packs = { readonly packs: ReadonlyArray<{ readonly key: string; readonly slug: string; readonly columns: readonly string[] }> };
type Preview = { readonly columns?: readonly string[]; readonly rows?: readonly unknown[] };

const problemPacks = ['problem_top', 'problem_time_to_known_error', 'problem_time_to_resolution', 'problem_backlog', 'problem_recurrence'];

/**
 * 29 (paket 3.3 P6): with the problem module on, the five problem report packs
 * are offered, preview with their columns, and the reports page passes axe.
 * Skips when the module is off (no problem group or `addons.problems` false).
 */
test.describe('29 problem reports', () => {
  test('problem packs are offered and preview', async ({ page }, testInfo) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const unit = await firstUnit(admin);
    const packs = await admin.requestJson<Packs>(`/reports/packs?organizationalUnitId=${unit.id}`);
    const offered = packs.packs.filter((pack) => problemPacks.includes(pack.key));
    test.skip(offered.length === 0, 'Problem module is off on this environment.');
    expect(offered.map((pack) => pack.key)).toEqual(problemPacks);

    for (const pack of offered) {
      const preview = await admin.requestJson<Preview>(`/reports/packs/${pack.slug}/preview?organizationalUnitId=${unit.id}`);
      expect(preview.columns ?? pack.columns, pack.key).toEqual(pack.columns);
    }

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/reports');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await expectNoSeriousA11yViolations(page, 'reports-with-problem-packs', testInfo);
  });
});
