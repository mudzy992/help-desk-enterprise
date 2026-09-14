# Faza 1 — Playwright scaffold, fixtures, matrica

## Target

- `e2e/package.json` (novo; `test`, `test:headed`, `test:ui`)
- `e2e/playwright.config.ts` (novo; `testDir: ./tests`, Chromium, `baseURL` iz env)
- `e2e/.env.example` (novo)
- `e2e/README.md` (novo) — preduslovi: migrate + backend `start:dev` + worker + frontend `dev`; `cd e2e && npm install && npx playwright install chromium && npm test`
- `e2e/helpers/api-client.ts` — Bearer login, JSON, `{ code, message }` greške
- `e2e/helpers/wait-for-stack.ts` — `GET /health` → `{ status: "ok" }`
- `e2e/helpers/ensure-install.ts` — ako `GET /install/status` nije complete: SuperAdmin `@epbih.ba`, `local` provider, SMTP on (host iz env, default `127.0.0.1`), seed, addons (sla/csat/approvals/confidential/kbIntercept/bulkActions/email/edge), `POST /install/complete`
- `e2e/helpers/provision-test-actors.ts` — **samo ako je odluka A potvrđena**
- `e2e/helpers/sign-in.ts` — UI login na `#session-email` / `#session-password`
- `e2e/global-setup.ts`
- `e2e/tests/.gitkeep` (specovi u fazama 2–4)
- `.cursor/docs/matrices/quality-e2e-critical-flows/MATRIX.md` + `CHANGELOG.md`

Ne dirati `frontend/package.json` / `backend/package.json` test scripte.

## Env (nema secreta u gitu)

| Key | Default (dev) |
|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` |
| `E2E_API_URL` | `http://localhost:10001` |
| `E2E_SUPERADMIN_EMAIL` | `e2e.superadmin@epbih.ba` |
| `E2E_SUPERADMIN_PASSWORD` | iz `.env.example` placeholder |
| `E2E_USER_EMAIL` | `e2e.user@epbih.ba` (aktor A) |
| `E2E_SMTP_HOST` / `E2E_SMTP_PORT` | `127.0.0.1` / `25` |

Ako je wizard već `COMPLETED` drugim nalogom, setup **ne** prepisuje install; koristi postojeći SuperAdmin iz env ili fail-closed s jasnom porukom.

## Matrica

Format kao `redis-bullmq/MATRIX.md`: cilj, 9 tokova → spec fajl, stack preduslovi, aktori, šta E2E **nije** (CI, unit, Edge popup).

## File length

Helperi < 150 linija; install koraci u zasebne funkcije.
