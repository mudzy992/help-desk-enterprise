# Faza 2 — Tokovi 1–3

Svaki tok = jedan spec. Fixtures iz faze 1. Nema mock kataloga.

## 1. Ticket create — `e2e/tests/01-ticket-create.spec.ts`

UI `/tickets/new` (stvarni `CreateTicketForm`):

1. Katalog: izabrati seed servis `Opšti zahtjev` (`install-seed.constants`).
2. Forma: prazan required submit → ostaje na details; popuniti title/description (+ opciono `dodatne_informacije`).
3. KB intercept korak (stepper `kb`) — `POST /knowledge-base/intercept` se desi prije create; prazna lista je validna.
4. Submit → navigacija na `/tickets/:id`.
5. Agent/SuperAdmin: `/tickets?view=inbox` ili `GET /tickets/inbox` pokazuje tiket u fallback grupi.

KB članak: ako seed nema PUBLISHED članak, setup kreira jedan kroz `POST /knowledge-base/articles` (pravi API) da intercept nije prazan kad je addon on.

## 2. Routing / fallback — `e2e/tests/02-routing-fallback.spec.ts`

1. **Match:** create na seed `(Direkcija + opsti-zahtjev)` → `EXACT`, `assignedGroupId` = fallback grupa. UI lista/inbox.
2. **Unrouted:** `POST /services` + forma (pravi catalog API), **bez** routing rule → create → `status = UNROUTED`, `assignedGroupId = null`. Inbox fallback grupe ga **nema**. Coverage `GET /routing/coverage` ćelija Unrouted.

Ne hardkodovati OU stablo; čitati seed / `GET /organizational-units/tree` i `GET /routing/rules`.

## 3. Approvals — `e2e/tests/03-approvals.spec.ts`

1. Servis s `requiresApproval` (catalog/onboarding API) + routing rule na fallback grupu.
2. Create → `PENDING_APPROVAL`; claim/assign UI/API odbija dok je hold.
3. Approve (`comment` obavezan) → status ide dalje (`PENDING` + postojeći auto-assign ako je addon on).
4. Drugi tiket: reject → `CLOSED`, nema assign.

UI na ticket detail ako već postoji approvals panel; inače HTTP + reload detail da se vidi status (i dalje pravi API, ne mock).
