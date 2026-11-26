# W2.23 — `BA-security-02`: bulk reset blokira račun durable prije registry cleanup-a i nikad ne laže o uspjehu

**Paket:** W2.23 — enforcement sloj blokira flagged principal prije registry cleanup-a<br>
**Nalaz:** `BA-security-02` (P1) — **zatvoren**<br>
**Kodni commit:** `7a925419`<br>
**Finalni testani SHA:** `7a925419` (kod + testovi) + docs commit ovog closeout-a<br>
**CI:** [`45876845930`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45876845930) — **zelen** (svi poslovi; `Backend PostgreSQL + Redis integration` uključena, E2E 27/27) + Perf smoke [`45876845979`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45876845979) ✓<br>
**DB migracije:** nema (nema promjene šeme)

## Nalaz i acceptance

`BulkPasswordResetService.execute` je radio u pogrešnom redu i lagao o ishodu:

1. jedan `prisma.user.updateMany({ mustChangePassword: false → true })` za sve kandidate,
2. pa **serijska** petlja `sessionRegistry.revokeAll({ reason: 'admin' })` po korisniku, gdje `catch` samo
   povećava `failedUsers` i piše `warn` — bez ikakvog durable traga da je sesija ostala živa,
3. pa cache invalidacija i audit, oba sa progutanom greškom,
4. i uvijek `@HttpCode(200)` sa `{eligibleUsers, changedUsers, revokedSessions, failedUsers}`.

**Uticaj/root cause:** upravo tokom incidenta (registry/Redis nedostupan) račun je već označen kao „mora promijeniti
lozinku", ali njegova **postojeća** sesija nastavlja raditi, a administrator dobije `200` koji izgleda kao gotov
posao. DB flag i registry side effect nisu bili koordinisani; odgovor nije imao način da kaže „nije gotovo".

**Acceptance (audit `09-security.md` §11):** injected registry outage ostavlja target **odmah neupotrebljivim**
(enforcement blokira flagged principal i prije registry cleanup-a) **ili** durable pending retry koji konvergira;
**nema lažnog terminalnog uspjeha** (202/operation status ili eksplicitni non-success), uz per-target stanje i retry.

## Implementacija

**Novi red izvršavanja u `backend/src/modules/security/bulk-password-reset.service.ts`:**

- **Faza 1 — durable blok, po targetu, u jednoj transakciji** (`blockWithinTransaction`, transakcioni klijent):
  1. `user.updateMany({ where: { id, mustChangePassword: false }, data: { mustChangePassword: true } })` —
     kondicionalno, pa repeat/race ne flipuje isti red dvaput (`changedUsers` ostaje iskren);
  2. `user.updateMany({ where: { id }, data: { tokensInvalidBefore: now, tokensInvalidBeforeExceptJti: null } })`
     — W2.15 cutoff, bezuslovan (repeat run ga **mora** ponovo postaviti) i bez zaostalog `exceptJti`;
  3. `userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt, revokedReason: 'admin',
     revokedByUserId: actor } })` — sve žive sesije, u istoj transakciji.
  Sve tri naredbe commit-uju ili nestaju zajedno: nema „polublokiranog" računa.
- **Faza 2 — volatile pola**, tek nakon commita, i to samo za targete iz faze 1: `sessionRegistry.revokeAll`
  (Redis marker + ponovni cutoff). Kvar se **broji** (`pendingUsers`), loguje i ne baca — durable cutoff već
  odbija svaki token.
- **Politika faktora (razlika prema W2.22):** bulk reset **ne** briše MFA. Prinudna promjena lozinke nije promjena
  identiteta, pa `cutAccountCredentials` (koji gasi `UserMfa`/recovery/passkey) ovdje nije pozvan; koristi se
  lokalni blok bez brisanja faktora.
- **Iskren terminalni status:** `status: 'COMPLETE' | 'PARTIAL'`; `PARTIAL` kad je `failedUsers > 0` **ili**
  `pendingUsers > 0`. `failedUsers` = target čiji blok nije commit-ovan (račun ostaje upotrebljiv do repeat runa),
  `pendingUsers` = target blokiran durable, ali akcelerator još čeka. Ponovni poziv je bezbjedan i **konvergira**
  (kondicionalni flag, bezuslovni cutoff, `revokedAt: null` filter).

**Kontroler — `bulk-password-reset.controller.ts`:** `@Res({ passthrough: true })` postavlja `202` kad
`status !== 'COMPLETE'`, inače ostaje `@HttpCode(200)`. Tijelo odgovora je prošireno **aditivno** (`pendingUsers`,
`status`), pa stari klijenti rade bez izmjene.

**Audit:** `auth.admin_bulk_password_reset` allowlist proširen sa `pendingUsers` i `status` (schema `restricted`,
i dalje samo countovi — bez ID-a, e-maila, IP-a, koda).

**Frontend:** `BulkPasswordResetResult` dobija `pendingUsers`/`status`; kartica
`admin-bulk-password-reset-card` prikazuje `bulkPending` poruku i `warning` toast kad run nije `COMPLETE`
(`bs`/`en` ključevi `admin.security.bulkPending` i `admin.security.bulkPartialToast`).

**E2E:** `37-authentication-security.spec.ts` tip proširen i dodata tvrdnja da je `status` konzistentan sa
brojačima (`COMPLETE` ⇔ `failedUsers === 0 && pendingUsers === 0`). Sretan put ostaje `200 COMPLETE`, pa se
ponašanje specifikacije ne mijenja.

## Direktni testni dokaz

- `bulk-password-reset.service.spec.ts` (**14/14**, prepisan): cutoff + kondicionalni flag + `UserSession`
  revokacija u **istoj** transakciji po targetu; `tokensInvalidBeforeExceptJti: null`; **nula** poziva brisanja
  faktora (`userMfa`/`userMfaRecoveryCode`/`userPasskeyCredential`); **registry outage** → sva tri durable efekta
  postoje, `failedUsers: 0`, `pendingUsers: 2`, `status: 'PARTIAL'`, audit metadata nosi `PARTIAL`;
  **fault targeta** → transakcija tog targeta pada, `revokeAll` za njega se **ne** zove, `failedUsers: 1`,
  `PARTIAL`, ostali blokirani; **idempotencija** → `changedUsers: 0` uz ponovni cutoff i revokaciju ostatka;
  audit red nosi samo countove + status; audit/cache kvar ne obara akciju; step-up testovi nepromijenjeni.
- `bulk-password-reset.controller.spec.ts` (**novo, 3/3**): `COMPLETE` → nema status override (200);
  `PARTIAL` → `response.status(202)` i tijelo nosi per-target stanje; bez principala → 401 prije ikakvog rada.
- `bulk-password-reset.integration.spec.ts` (**novo, 3 slučaja, pravi PostgreSQL**):
  1. sretan put — `tokensInvalidBefore` postavljen, `exceptJti` očišćen, obje sesije `revokedReason='admin'` sa
     akterom, `UserMfa` red **ostaje**, audit red `{…, status:'COMPLETE'}`;
  2. **registry down** — isti durable state u bazi, `status: 'PARTIAL'`, `pendingUsers = eligible`;
  3. **injected DB fault za jedan target** (`userSession.updateMany` baca samo za njega) — taj račun je vraćen
     cijeli (`mustChangePassword=false`, cutoff `null`, sesije žive, faktor na broju), drugi blokiran,
     `failedUsers: 1`, `PARTIAL`, akcelerator za neuspjeli target **nije** pozvan.
- **Registracija u CI runneru (ispravka propusta iz W2.22):** `src/modules/users/account-security-boundary.integration.spec.ts`
  **nije bio** u `integrationSpecs` listi `backend/scripts/run-isolated-integration.mjs`, pa ga izolovani
  PostgreSQL runner nikad nije pokrenuo (u `Backend build + test` se sam preskoči bez `PRIVACY_IT_DATABASE_URL`).
  Sada su registrovana **oba** spec-a, a `run-isolated-integration.test.mjs` dobija guard koji pada ako bilo koji
  `*.integration.spec.ts` u `src/modules/users` ili `src/modules/security` nije registrovan (24/24 testa prolazi).

## Šta je registrovanje W2.22 speca otkrilo

Prvi prolaz kroz pravi PostgreSQL (run `45865307348`) pao je **3/5** u `account-security-boundary.integration.spec.ts`.
Uzrok nije bio W2.22 kod, nego W2.22 **dokaz**, i to na dva načina koje lokalni `skipped` nije mogao pokazati:

- spec je čitao `prisma.auditLog` red, a injektirao *snimajući* lažni notifier ⇒ red nikad nije nastajao; sada se
  boundary gradi sa pravim `AccountSecurityNotifier(prisma)` i tvrdi i `Notification` red;
- `recoveryCodes: 2` u audit metadata je kroz policy redakciju (`recovery.?code`) postajalo `[REDACTED]` ⇒ ključ je
  preimenovan u **`recoveryFactors`** (allowlista šeme, frontend katalog, labele).

Oba su popravljena u ovom paketu (`ff11c927`), a 356 i audit 04 nose ispravku. Bez registracije bi W2.22 ostao
„zelen" sa dokazom koji nikad nije izvršen.

## CI i testni dokaz

PR run [`45876845930`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45876845930) na `7a925419` —
**svi poslovi zeleni**:

| Posao | Rezultat |
| --- | --- |
| `Backend build + test` | **success** — 14 servis testova + 3 kontroler testa, `tsc`/`eslint` čisti |
| `Backend PostgreSQL + Redis integration` | **success** — prvi put izvršava **oba** registrovana spec-a (`users/account-security-boundary` 5/5, `security/bulk-password-reset` 3/3) |
| `Frontend build + test` | **success** — `tsc -b` + 479 fajlova / 1911 testova, i18n katalog usklađen |
| `Backend container + supply chain` | success |
| `Docs guard` | **success** — registar/plan/JSON usklađeni (`698 nalaza, 352 zatvoreno / 346 otvoreno`) |
| `E2E critical flows` | **success** — `27 passed, 0 failed, 0 flaky, 0 skipped`, `errors: []` (uključuje spec 37 sa novim `status` ugovorom) |
| `E2E install wizard`, `Read-only service-form pattern inventory` | skipped (workflow ih sam preskače za ovu vrstu izmjene) |
| `CI gate` | **success** |
| Perf smoke [`45876845979`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45876845979) | **success** (`k6 smoke`) |

**Push run [`45876839098`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45876839098) na istom `7a925419`:** build/test/container/frontend/docs zeleni,
`Backend PostgreSQL + Redis integration` = **skipped**, `CI gate` = **success** — to je novi CI ugovor iz ovog PR-a
(integracija je gate na PR-u, ne smoke na svakom push-u). Jedan paket = jedan integracioni run.

**Iteracije dokaza (svaka je našla stvarni defekt — zato je registracija speca bila vrijedna):**

| Run | Nalaz | Popravka |
| --- | --- | --- |
| [`45865307348`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45865307348) | W2.22 boundary spec 3/5: audit red nikad nije nastajao (spec je čitao `prisma.auditLog`, a injektirao lažni notifier) | pravi `AccountSecurityNotifier(prisma)` + tvrdnja `Notification` reda |
| [`45871173114`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45871173114) | `recoveryCodes: 2` ⇒ `[REDACTED]` (policy redaktuje `recovery.?code`) | ključ preimenovan u `recoveryFactors` |
| [`45874230398`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45874230398) | bulk spec: `revokedByUserId` je FK ⇒ sintetički akter ruši svaku transakciju; `findFirst` je čitao tuđi audit red; `Object.create(tx)` ne vidi Prisma privatna polja | pravi (neaktivan) akter, `beforeEach` izolacija audit redova, Proxy sa `Reflect.get(target, …)` |

**E2E napomena:** run `45868570744` je pao na `STACK OUTAGE` (health probe `api.desk.ba101.top` 2 min nedostupan,
watchdog zaustavio suite) — infrastruktura, ne kod; sljedeći run je zelen bez izmjene speca.

## Registar nalaza

- `BA-security-02` → **zatvoreno (W2.23)** u `docs/backend/audits/09-security.md` (+ implementacijski status u §11).
- Ledger red `W2.23` u `docs/backend/EXECUTION-PLAN-REMAINING.md`.
- Regenerisano guardom `audit:traceability --write` (registar, master plan, plan JSON, audit README).

## DB/migracija/rollout

- **Nema migracije.** Koriste se postojeće kolone (`User.tokensInvalidBefore`, `tokensInvalidBeforeExceptJti`,
  `UserSession.revokedAt/revokedReason/revokedByUserId`) i postojeći registry API.
- Rollout bez koraka. Rollback je vraćanje fajlova; efekat je „reset blokira prije nego što zove registry" — nema
  podataka za migraciju.
- **Kompatibilnost:** tijelo odgovora je prošireno aditivno; `frontend/src/services/security-api.ts` i
  `e2e/tests/37-authentication-security.spec.ts` su ažurirani u istom paketu. Jedina vidljiva promjena je
  statusni kod za `PARTIAL` (202 umjesto 200) — što je i bio cilj nalaza.

## Lokalna provjera i ograničenja

- `npx jest src/modules/security src/modules/users` → **38 suites passed / 3 skipped, 199 testa** (skip = DB
  integracije bez `PRIVACY_IT_DATABASE_URL`).
- `npx tsc --noEmit -p tsconfig.json` → bez greške u fajlovima paketa (jedina greška je preegzistentna
  `announcement-delivery.spec.ts:310` TS2835, van paketa).
- `npm run lint` → 0 grešaka (6 preegzistentnih upozorenja u `sla-scan-failure-quarantine.spec.ts`).
- `npm run wiring:check` → `✓ backend route policy: 99 controllera, 633 ruta` (ruta nepromijenjena).
- `npm run i18n:check` (frontend) → `9388 keys, bs/en parity ok`.
- `node --test scripts/run-isolated-integration.test.mjs` → 24/24.
- Integracijski spec je lokalno `skipped` (nema PostgreSQL-a); izvršava ga posao
  `Backend PostgreSQL + Redis integration` na finalnom push-u.
- Frontend (lokalno, poslije `npm ci`): `npx tsc -b` čist; `npx vitest run` → **479 fajlova / 1911 testova** prolazi
  (prvi prolaz je našao duplikat `status` u audit katalogu — `admin-ops-i18n-coverage` ga pinuje — pa je uklonjen).

## Rizik

- **`PARTIAL` mijenja statusni kod** za nepun ishod. Klijenti u repo-u (`apiRequest`, E2E `requestJson`) tretiraju
  svaki 2xx kao uspjeh za parsiranje; spoljni klijenti koji tvrdo provjeravaju `200` moraju prihvatiti `202`.
- **Per-target transakcije** znače više round-tripova od jednog bulk `updateMany`. Cijena je namjerna: samo
  per-target transakcija može vratiti **taj** target bez diranja ostalih i dati iskren `failedUsers`.
- **Nema automatskog retry-ja** (worker/outbox): ponovni poziv je operaterov, dokumentovan i idempotentan. Ostaje
  susjedni nalaz `BA-security-07` (durable operation manifest) — nije prećutan ovdje.
- **`TOCTOU` između selekcije i bloka** (`BA-security-06`) ostaje otvoren: korisnik kome se u međuvremenu promijeni
  rola/identitet i dalje može biti target jednog runa.

## Granica paketa

- Nije dirana šema, migracija, seed, ni `session-registry`/`session-revocation.store` ponašanje.
- Nije diran W2.22 boundary ugovor (identity tranzicije) — samo je njegov integracijski spec **registrovan** u CI.
- Nije diran rate-limit put (`BA-security-01`).

## Sljedeći paket

**W2.24 — `BA-security-03` (P1):** privilegovani auth audit je best-effort i može nestati.
