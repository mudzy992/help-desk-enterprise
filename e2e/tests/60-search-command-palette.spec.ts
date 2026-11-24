import { expect, test } from '@playwright/test';
import { ApiClient, ApiRequestError } from '../helpers/api-client';
import { createTicketViaApi, loadSeedCatalog } from '../helpers/create-ticket';
import { readE2EEnvironment } from '../helpers/environment';
import { signIn } from '../helpers/sign-in';

/*
  W7.114 (BA-search-13, spec 60): `GET /search` at the wire edge and the palette
  that consumes it, against the running stack instead of a mocked service.

  The unit suites (`backend/src/modules/search/*.spec.ts`, 11 suites) prove the
  visibility rules, the ticket semantics the palette inherits and the limiter
  policy in isolation. What no unit test can prove is that the *deployed* edge —
  the session guard, the validation pipe, the controller mapping and the HTTP
  projection — keeps the contract the palette is written against. `27-search.md`
  §8 therefore listed "no direct E2E for /search and no click-through of a hit"
  as an open item; this spec is that item closed, not a duplicate of the unit
  coverage.

  Two tests, on purpose:

  1. the HTTP contract (one request, three groups, the minimal ticket
     projection, and the refusals the DTO promises: short/whitespace-only
     needles, a repeated group, an unknown group, an over-ceiling limit, an
     unknown parameter, no session);
  2. the click-through: open the palette with the header trigger, type a title
     that exists only for this run, click the hit and land on the ticket it
     names. The hit's href (`/tickets/<id>`) is built from the search answer, so
     a wrong projection or a wrong id would navigate somewhere else.

  Deliberately **not** here: the 429 of `SearchRateLimitGuard`. Its budget is
  30 requests / 60 s per actor and 60 / 60 s per **address**, and every spec in
  the run shares that address — exhausting it from a browser spec would poison
  the bucket for the specs that follow (workers: 1) and turn a green run red for
  a reason that has nothing to do with search. The guard's window, buckets,
  fail-closed 503 and `Retry-After` are covered by
  `search-rate-limit.spec.ts` and `search-rate-limit.guard.spec.ts`.
*/

type TicketHit = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
};

type SearchResponse = {
  readonly tickets: readonly TicketHit[];
  readonly articles: readonly { id: string; slug: string; title: string }[];
  readonly users: readonly { id: string; displayName: string; email: string | null }[];
  readonly articlesIncomplete: boolean;
  readonly failedGroups: readonly string[];
};

/** The palette's own selectors (`header-search-trigger.tsx`, `command-palette.tsx`). */
const paletteTrigger = /Open command palette|Otvori komandnu paletu/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchPath(query: string, extra = ''): string {
  return `/search?q=${encodeURIComponent(query)}${extra}`;
}

/** Status of a refused request, so a test can say "400" instead of "it threw". */
async function refusalStatus(api: ApiClient, path: string): Promise<number> {
  try {
    await api.requestJson(path);
  } catch (caught) {
    if (caught instanceof ApiRequestError) {
      return caught.status;
    }
    throw caught;
  }
  throw new Error(`Expected ${path} to be refused, but it answered 200`);
}

test.describe('60 search / command palette', () => {
  test.describe.configure({ mode: 'serial' });

  const env = readE2EEnvironment();
  const admin = new ApiClient();
  let ticketId = '';
  let ticketNumber = '';
  const title = `E2E paleta ${Date.now()}`;

  test.beforeAll(async () => {
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const catalog = await loadSeedCatalog(admin);
    const created = await createTicketViaApi(admin, {
      title,
      serviceId: catalog.serviceId,
      originUnitId: catalog.originUnitId,
      formVersionRef: catalog.formVersionRef,
      description: 'W7.114 search E2E — the palette must find this by title only',
    });
    ticketId = created.id;
    const detail = await admin.requestJson<{ ticketNumber: string }>(
      `/tickets/${created.id}`,
    );
    ticketNumber = detail.ticketNumber;
  });

  test('the endpoint answers one request with three groups and a minimal ticket projection', async () => {
    const answer = await admin.requestJson<SearchResponse>(searchPath(title));

    const hit = answer.tickets.find((candidate) => candidate.id === ticketId);
    expect(
      hit,
      `the ticket created for this run (${ticketNumber}) must be found by its own title`,
    ).toBeDefined();
    // The projection is the contract, not a detail: the palette renders a number
    // and a title, so the group must not ship the body, the form data or the
    // requester of every hit (`searchTickets` in `tickets.service.ts`).
    expect(Object.keys(hit ?? {}).sort()).toEqual(['id', 'ticketNumber', 'title']);
    expect(hit?.ticketNumber).toBe(ticketNumber);
    expect(hit?.title).toBe(title);

    // An empty group is a valid answer and never invents `failedGroups`.
    expect(Array.isArray(answer.articles)).toBe(true);
    expect(Array.isArray(answer.users)).toBe(true);
    expect(answer.articlesIncomplete === true || answer.articlesIncomplete === false).toBe(true);
    expect(answer.failedGroups).toEqual([]);

    // `types` narrows the request, it does not decorate the answer: asking for
    // tickets only must leave the other two groups empty on purpose.
    const ticketsOnly = await admin.requestJson<SearchResponse>(
      searchPath(title, '&types=ticket'),
    );
    expect(ticketsOnly.tickets.map((candidate) => candidate.id)).toContain(ticketId);
    expect(ticketsOnly.articles).toEqual([]);
    expect(ticketsOnly.users).toEqual([]);
    expect(ticketsOnly.failedGroups).toEqual([]);
  });

  test('the edge refuses what the DTO refuses, and anonymous callers first', async () => {
    // Normalization runs before validation (W7.56): a whitespace-only or
    // one-character needle is refused instead of becoming "everything visible".
    expect(await refusalStatus(admin, searchPath('   '))).toBe(400);
    expect(await refusalStatus(admin, searchPath(' a '))).toBe(400);
    // W7.111: `types` is a set at the wire edge, so a repeated group is refused
    // instead of being silently collapsed by the service.
    expect(await refusalStatus(admin, searchPath('abc', '&types=ticket,ticket'))).toBe(400);
    // An unknown group and a limit above the ceiling are both refusals.
    expect(await refusalStatus(admin, searchPath('abc', '&types=audit'))).toBe(400);
    expect(await refusalStatus(admin, searchPath('abc', '&limit=26'))).toBe(400);
    // `forbidNonWhitelisted`: a parameter the endpoint does not implement must
    // not be accepted and ignored. The palette never sends one.
    expect(await refusalStatus(admin, searchPath('abc', '&sort=title'))).toBe(400);

    // No session, no search — and the session guard answers before any group
    // query runs or any rate-limit bucket is charged.
    const anonymous = new ApiClient();
    expect(await refusalStatus(anonymous, searchPath('abc'))).toBe(401);
  });

  test('a palette hit opens the ticket it names', async ({ page }) => {
    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto('/');
    await page.locator('#main-content').waitFor({ state: 'visible' });

    const trigger = page.getByRole('button', { name: paletteTrigger });
    await trigger.click();
    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible();

    await page.getByRole('combobox').fill(title);

    // The hit row is the answer of this very run's ticket: number as subtitle,
    // title as label. Waiting for the number keeps a stale or cached answer from
    // satisfying the assertion.
    const hit = palette.getByRole('option', {
      name: new RegExp(escapeRegExp(ticketNumber)),
    });
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(title);

    await hit.click();

    await expect(page).toHaveURL(new RegExp(`/tickets/${escapeRegExp(ticketId)}$`));
    await expect(palette).toBeHidden();
    await expect(page.locator('#main-content')).toContainText(title);
  });
});
