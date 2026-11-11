import { expect, test } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

type UnitNode = { readonly id: string; readonly children?: readonly UnitNode[] };
type ServiceRecord = { readonly id: string; readonly name: string };
type UserRecord = { readonly id: string; readonly email: string };
type CategoryRecord = { readonly id: string; readonly nameBs: string; readonly nameEn: string };
type ArticleRecord = { readonly id: string; readonly title: string; readonly status: string };
type PortalHome = {
  readonly categories: ReadonlyArray<{ readonly id: string; readonly nameBs: string; readonly nameEn: string }>;
};
type PortalArticle = {
  readonly id: string;
  readonly title: string;
  readonly viewCount: number;
  readonly ratingCount: number;
  readonly averageRating: number | null;
};

function firstUnitId(tree: UnitNode | readonly UnitNode[]): string | null {
  const roots = Array.isArray(tree) ? tree : [tree];
  const first = roots[0];
  if (first === undefined) return null;
  return first.children?.[0]?.id ?? first.id;
}

/** Admin publishes a category-scoped article through the real workflow API. */
async function publishArticle(
  admin: ApiClient,
  input: {
    readonly serviceId: string;
    readonly organizationalUnitId: string;
    readonly ownerUserId: string;
    readonly categoryId: string;
    readonly title: string;
  },
): Promise<ArticleRecord> {
  const article = await admin.requestJson<ArticleRecord>('/knowledge-base/articles', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      body: 'Probno tijelo članka za E2E (portal baze znanja).',
      serviceId: input.serviceId,
      organizationalUnitId: input.organizationalUnitId,
      ownerUserId: input.ownerUserId,
      reviewerUserId: input.ownerUserId,
      categoryId: input.categoryId,
      reason: 'E2E 34 knowledge portal',
    }),
  });
  for (const action of ['submit-review', 'approve-review', 'publish']) {
    await admin.requestJson(`/knowledge-base/articles/${article.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'E2E 34 knowledge portal' }),
    });
  }
  return article;
}

async function categoryArticles(user: ApiClient, categoryId: string): Promise<readonly PortalArticle[]> {
  return await user.requestJson<readonly PortalArticle[]>(
    `/knowledge-base/portal/categories/${categoryId}/articles`,
  );
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > until) throw new Error(`poll timed out, last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    value = await read();
  }
  return value;
}

/**
 * Paket 2.9 (K1): the knowledge portal end to end for a plain user - the
 * published article shows up in its category, opening it counts one view and
 * the five-star rating is stored; a draft never appears and a user cannot
 * create articles.
 */
test.describe('34 knowledge portal', () => {
  test('a user sees a published article, opens it and rates it', async ({ page }) => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await admin.requestJson<UnitNode | readonly UnitNode[]>('/organizational-units/tree');
    const organizationalUnitId = firstUnitId(tree);
    expect(organizationalUnitId).not.toBeNull();
    const services = await admin.requestJson<readonly ServiceRecord[]>('/services');
    const service = services[0];
    expect(service).toBeDefined();
    const users = await admin.requestJson<readonly UserRecord[]>('/users?limit=50');
    const owner = users.find((user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase()) ?? users[0];
    expect(owner).toBeDefined();

    const stamp = Date.now();
    // The same text in both languages so the assertion is locale-independent.
    const categoryName = `E2E portal ${stamp}`;
    const articleTitle = `E2E članak portala ${stamp}`;
    const category = await admin.requestJson<CategoryRecord>('/knowledge-base/portal/categories', {
      method: 'POST',
      body: JSON.stringify({
        key: `e2e-portal-${stamp}`,
        nameBs: categoryName,
        nameEn: categoryName,
        icon: 'book-open',
      }),
    });
    const article = await publishArticle(admin, {
      serviceId: service.id,
      organizationalUnitId: organizationalUnitId as string,
      ownerUserId: owner.id,
      categoryId: category.id,
      title: articleTitle,
    });

    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    const home = await user.requestJson<PortalHome>('/knowledge-base/portal');
    expect(home.categories.map((item) => item.id)).toContain(category.id);

    await signIn(page, env.userEmail, env.userPassword);
    await page.goto('/knowledge-base');
    await expect(page.getByTestId('knowledge-portal')).toBeVisible({ timeout: 30_000 });

    // Portal → category → article.
    const portal = page.getByTestId('knowledge-portal');
    await portal.getByRole('button', { name: categoryName }).click();
    await portal.getByRole('link', { name: articleTitle }).first().click();
    await expect(page).toHaveURL(new RegExp(`/knowledge-base/${article.id}$`));
    await expect(page.getByRole('heading', { name: articleTitle })).toBeVisible({ timeout: 20_000 });

    // Opening a published article records a view (Paket 2.9 K1b). The counter
    // lives in Redis and is flushed into `KnowledgeArticle.viewCount` by the
    // worker every 15 minutes (`knowledge-article-views.ts`), so only the
    // acceptance (204) can be asserted from a running frontend.
    const view = await user.request(`/knowledge-base/portal/articles/${article.id}/view`, {
      method: 'POST',
      body: '{}',
    });
    expect(view.status).toBe(204);

    // Five stars: no comment dialog, the rating is stored immediately.
    const rating = page.getByTestId('knowledge-star-rating');
    await expect(rating).toBeVisible({ timeout: 20_000 });
    await rating.locator('[data-star="5"]').click();
    const rated = await poll(
      () => categoryArticles(user, category.id),
      (items) => items.some((item) => item.id === article.id && item.ratingCount >= 1),
    );
    const stored = rated.find((item) => item.id === article.id);
    expect(stored?.averageRating).toBe(5);
  });

  test('a draft stays out of the portal and a plain user cannot create articles', async () => {
    const env = readE2EEnvironment();
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await admin.requestJson<UnitNode | readonly UnitNode[]>('/organizational-units/tree');
    const organizationalUnitId = firstUnitId(tree);
    const services = await admin.requestJson<readonly ServiceRecord[]>('/services');
    const users = await admin.requestJson<readonly UserRecord[]>('/users?limit=50');
    const owner = users.find((user) => user.email.toLowerCase() === env.superAdminEmail.toLowerCase()) ?? users[0];

    const draftTitle = `E2E nacrt portala ${Date.now()}`;
    await admin.requestJson<ArticleRecord>('/knowledge-base/articles', {
      method: 'POST',
      body: JSON.stringify({
        title: draftTitle,
        body: 'Nacrt koji korisnik ne smije vidjeti.',
        serviceId: services[0]?.id,
        organizationalUnitId,
        ownerUserId: owner?.id,
        reviewerUserId: owner?.id,
        reason: 'E2E 34 draft',
      }),
    });

    const user = new ApiClient();
    await user.login(env.userEmail, env.userPassword);
    const home = await user.requestJson<PortalHome>('/knowledge-base/portal');
    expect(JSON.stringify(home)).not.toContain(draftTitle);

    const refused = await user.request('/knowledge-base/articles', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Ne smije proći',
        body: 'Bez dozvole.',
        serviceId: services[0]?.id,
        organizationalUnitId,
        ownerUserId: owner?.id,
        reason: 'E2E 34 forbidden',
      }),
    });
    expect(refused.status).toBe(403);
  });
});
