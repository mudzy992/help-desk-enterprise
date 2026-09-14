# E2E kritični tokovi (F9-3) — overview

Playwright suite za 9 RAW acceptance tokova (`RAW_PROJECT_EPHELPDESK.md` 861–874). Novi sloj testiranja; Jest/Vitest ostaju netaknuti. CI workflow se **ne** uvodi (F9-4).

## Stanje koda (provjereno, 2026-09-14)

| Stavka | Stanje |
|---|---|
| Playwright / Cypress / `e2e/` | **nema** (`frontend` Vitest, `backend` Jest) |
| `.github/workflows/` i drugi CI | **nema** |
| F7-A durable queue | `backend/src/modules/integration-queue/` + `GET /integration-jobs` |
| F8-1 config versions | `POST /config-versions/:id/{validate,activate,shadow,rollback}` + UI `/admin/config-versions` |
| Ticket create UI | `/tickets/new` — katalog → forma → KB intercept → create |
| Group inbox | `GET /tickets/inbox` + `/tickets?view=inbox` |
| Approvals | `POST /tickets/:id/approvals/:id/approve\|reject` |
| Bulk broadcast | `POST /tickets/bulk` + `/tickets/bulk/preview` |
| Confidential | `POST /tickets/:id/break-glass`; SuperAdmin **nema** implicitan ACL |
| SLA overdue | `isOverdue` na listi; scanner interval **60s** |
| CSAT KPI | `GET /tickets/csat/summary` + report pack `monthly-kpi` |
| User CRUD HTTP | **nema** (samo install SuperAdmin + directory-sync read) |
| Login UI | shell `#session-email` / `#session-password` → `POST /auth/login` |

## Odluke (predloženo — treba potvrda)

1. **Framework: Playwright** (`@playwright/test`), ne Cypress. Pravi Chromium kroz frontend + backend; `request` API za setup i queue/audit assert.
2. **Lokacija: root `e2e/`** sa sopstvenim `package.json`. Ne `frontend/e2e` niti `backend/e2e` — tokovi presijecaju oba sloja.
3. **Hibrid:** UI za korake koje korisnik vidi; Playwright `APIRequestContext` na stvarni backend za install/fixtures i za assert koji UI ne pokazuje (IntegrationJob EMAIL/EDGE_EVENT, internal-only skip, audit).
4. **Nema novih produkcijskih endpointa.** Guardovi/eventi se ne diraju.
5. **Aktori (blocking):** vidi pitanje ispod. Preporuka A.
6. **Selektor politika:** postojeći `id` / role / i18n (BS default). `data-testid` samo ako korak nema stabilan selector; mali frontend diff, bez UX refaktora.
7. **Env:** `e2e/.env.example` (`E2E_BASE_URL`, `E2E_API_URL`, nalozi). Pretpostavka: Postgres + Redis + backend + worker + Vite **već rade**. Playwright ne startuje DB (Coolify ugovor).
8. **CI:** README spominje F9-4; ovdje nema `.github/workflows/`.
9. **Email sink:** ne dodajemo MailHog u `docker-compose.yml`. Test #4 assertuje `IntegrationJob` tip `EMAIL` / `EDGE_EVENT` kroz admin API; SMTP delivery failure i dalje dokazuje enqueue.
10. **Edge ekstenzija UI:** van scope. Test #4 dokazuje da fan-out enqueue-a `EDGE_EVENT` u durable queue.

## Blocking pitanje

Nema HTTP User CRUD. Confidential tok **zahtijeva** drugog aktora (USER bez ACL) jer SuperAdmin nema implicitan pristup, ali je jedini nalog iz wizarda.

- **A (preporuka):** E2E-only Prisma seeder u `e2e/helpers/` kreira lokalne USER/AGENT naloge. Nije controller; nije produkcijski API.
- **B:** Dodati admin User API (van ovog TASKS scope-a).
- **C:** Preskočiti drugi nalog — **ne zadovoljava** RAW #6.

Jedno pitanje: **potvrdi A, ili drugačije?**

## Faze

1. Scaffold Playwright + fixtures + matrica + README
2. Tokovi 1–3 (create, routing/fallback, approvals)
3. Tokovi 4–6 (realtime/queue, bulk, confidential)
4. Tokovi 7–9 (SLA, close codes+CSAT, config ops) + lokalni full-suite run

## Van scope

- F9-4 CI / RBAC suite
- Pretvaranje Jest/Vitest u E2E
- Novi backend moduli / User CRUD (osim ako se izabere B)
- MailHog u compose, visual regression, Cypress
- AI / advanced routing / puni Teams / mobile (RAW OUT)
- Izmjena routing/SLA/approval poslovne logike da test “prođe”
