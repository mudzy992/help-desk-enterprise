# W2.11b — perf: revizija kataloga OJ putuje uz čitanje sesije (0 dodatnih upita)

**Paket:** W2.11b — follow-up na `W2.11`, bez novog ID-a nalaza<br>
**Nalaz:** perf regresija iz `ca75ac7` — `db_queries_per_request` 2,592 prema kapiji 2,1 (nalaz `BA-organizational-units-02` ostaje **zatvoren**)<br>
**Kodni commit:** `f7937fc`<br>
**Finalni testani SHA:** `f7937fc`<br>
**CI:** [`45605301217`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45605301217) (CI) i [`45605301271`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45605301271) (Perf smoke) — vidi § CI<br>
**DB migracije:** nema (koristi se postojeći singleton `OrganizationalUnitCatalogRevision` iz `20271202120000_organizational_unit_catalog_revision`)

## Nalaz

`W2.11` je zatvorio P1 `BA-organizational-units-02` tako što procesni keš `(id, ouPath)` provjerava
**po zahtjevu** prema singleton reviziji koju svaki topološki write bumpuje u istoj transakciji. Provjera je
tačna — i to je jedini dizajn koji prolazi acceptance iz audita 05 („prvi naredni zahtjev nakon reparenta,
uključujući event-delivery fault") — ali je svaki zahtjev koji čita OJ scope plaćao **jedan dodatni
statement** (`SELECT OrganizationalUnitCatalogRevision`, PK lookup).

Perf smoke je zato pao. Brojke su iz CI artefakata (annotation API, `perf_query_budget` + `perf_routes_by_volume`):

| Run | SHA | Paket | avg | zahtjeva | `/tickets` | `/tickets/inbox` | `/search` | detalj tiketa |
|---|---|---|---|---|---|---|---|---|
| `45496189459` | `6d8f33c` | W2.10 (zadnji zelen) | **2,072** | 50.792 | 2,470 | 2,008 | 3,000 | ≈1,98 |
| `45507674274` | `ca75ac7` | W2.11 (prvi crven) | **2,591** | 68.867 | 3,213 | 2,975 | 4,034 | ≈2,09 |
| `45557049338` | `4344b36` | W2.13 (crven, ista regresija) | **2,592** | 69.243 | 3,211 | 2,973 | 4,008 | ≈2,09 |

Delta je ≈ **+0,52** po zahtjevu, i to na rutama koje čitaju OJ scope; `/services` (8,00) i
`/reports/dashboard/summary` (1,08) su nepromijenjeni jer ne idu kroz keš kataloga. `W2.13` nije uzrok —
prvi crveni run je `ca75ac7`, prije njega.

## Odluka

Tri kandidata, provjerena u kodu prije implementacije:

| Opcija | Statementa po zahtjevu | Svježina |
|---|---|---|
| kratki TTL na reviziji (npr. 250 ms) | ~0 | **krši** acceptance: zahtjev unutar TTL-a vidi stari scope |
| revizija u Redisu (GET umjesto SELECT-a) | 0 DB | svježina zavisi od post-commit upisa; klasa kvara koju acceptance izričito isključuje („event-delivery fault") |
| **fuzija u postojeće obavezno čitanje** | **0 dodatnih** | **nepromijenjena**: revizija se čita u prvom statementu zahtjeva |

Odabrana je fuzija, jer je jedina koja čuva `W2.11` acceptance bez TTL-a i bez novog kanala invalidacije.
`SessionRevocationStore.check()` (W2.7) već izvršava **jedan** durable read po autentifikovanom zahtjevu
(`UserSession ⋈ User`, `relationLoadStrategy: 'join'`), i to prije svake autorizacijske odluke. Taj
statement sada nosi i reviziju:

```text
prije:   SELECT UserSession ⋈ User            +  SELECT OrganizationalUnitCatalogRevision
poslije: SELECT UserSession ⋈ User + (SELECT revision)     ← jedan statement
```

Semantika svježine: zahtjev koji **započne** nakon commita reparenta pročita novu reviziju u svom prvom
statementu, pa ne vidi stari scope. Zahtjev koji je već u toku u trenutku commita može završiti sa
snapshotom prije izmjene — isto kao i prije ovog paketa, jer se i tada revizija čitala jednom, na početku
obrade zahtjeva. Nema novog prozora zastarjelosti između zahtjeva.

## Implementacija

- **`src/common/request-context/catalogue-revision-probe.ts`** (novo) — request-scoped kanal
  (`AsyncLocalStorage` koji već nosi `requestId`): `publishOrganizationalUnitCatalogueRevision()`
  (prvi upis pobjeđuje, pa dva authority čitanja u istom zahtjevu ne mogu dati različite vrijednosti) i
  `readPublishedOrganizationalUnitCatalogueRevision()`. Izvan zahtjeva (worker, boot, skripte, socket
  handshake) publish je no-op, pa fallback ostaje netaknut.
- **`src/modules/authentication/session-revocation.store.ts`** — durable read je sada jedan `$queryRaw`:
  `UserSession` (id/userId/revokedAt/expiresAt) ⋈ `User` (authzVersion/isActive/mustChangePassword) +
  scalar subquery na `OrganizationalUnitCatalogRevision.id = 1`. `expiresAt` se poredi kao
  `($3::timestamptz AT TIME ZONE 'UTC')` da poređenje ne zavisi od `TimeZone` sesije. Fail-closed
  ponašanje je nepromijenjeno (bilo kakav izuzetak → `revoked: true`). Revizija se objavljuje **samo** kad
  je red nađen i pripada traženom subjektu; vrijednost koja se ne može parsirati se ignoriše (ona je
  suvozač, ne autoritet).
- **`src/common/cache/scope-catalog-cache.ts`** — `readOrganizationalUnitCatalogRevision()` prvo pita
  request scope; ako revizija nije objavljena, ostaje `W2.11` čitanje preko delegata (i dalje fail-closed:
  nedostajući delegat ili neuspio upit isključuju keš). Konstantni `id` singletona preseljen u probe modul
  da SQL i keš koriste isti broj.
- **`.github/workflows/perf-smoke.yml`** — push trigger sada pokriva i putanje koje mijenjaju cijenu
  zahtjeva: `backend/src/modules/authentication/**`, `common/cache/**`, `common/request-context/**`,
  `common/database/**`, `organizational-units/**`, `directory-sync/**`. Bez toga ovaj paket ne bi ni
  pokrenuo kapiju kojoj je namijenjen.

Nije mijenjano: `W2.11` bump (i dalje u istoj transakciji kao topološki write), semantika keša, TTL-ovi,
`principal_context_cache`, tabela i migracija revizije, perf pragovi (2,1) i cilj (2,0).

## Vizuelna provjera (ručni koraci)

1. `DB_QUERY_METRICS=true DB_QUERY_TRACE=true` uz `npm run start:dev`, pa `GET /tickets` i
   `GET /tickets/inbox` sa validnom sesijom.
2. U `api.log` linija `db_query_trace` za `/tickets` mora glasiti
   `SELECT:UserSession` + `SELECT:Ticket` (bez `SELECT:OrganizationalUnitCatalogRevision`), a
   `db_queries_per_request` za `/tickets` mora biti za **1 manji** nego prije paketa (CI: 3,211 → cilj ≈2,47).
3. Reparent test na dvije instance: podigni API dvaput (isti Postgres/Redis), zagrij `GET /tickets/inbox`
   na obje, pa na instanci A `PATCH /organizational-units/:id` sa novim `parentId`. Prvi `GET /tickets/inbox`
   na instanci B mora vratiti scope po **novom** `ouPath` (isto ponašanje kao u W2.11).
4. Worker poslovi: pokreni SLA scan; `db_query_trace` linije bez `request_id` ne smiju sadržati reviziju
   iz request scopea (worker nema store → čita bazu, kao i prije).

## AD konektor sa testnim OU

Direktni AD/LDAPS konektor nije dio ovog paketa (nema promjene u DN/path izračunu, materijalizaciji ni
bumpu). Provjereno je da je **bump u direktorijumskoj materijalizaciji** i dalje u istoj transakciji
(`materialize-directory-read.ts`, `apply-directory-sync-plan.ts`) i da directory-sync suite prolazi
(`src/modules/directory-sync`: zelen, vidi § Lokalna verifikacija). Pravi AD konektor sa testnim OU nije
pokretan u ovom paketu — to ostaje granica, kao i u `W2.11`.

## Direktni testni dokaz

- `src/common/request-context/catalogue-revision-probe.spec.ts` (novo, 3 testa) — revizija se ne pamti
  izvan request scopea; publish vrijedi samo u svom zahtjevu; drugi publish u istom zahtjevu ne mijenja
  vrijednost.
- `src/common/cache/scope-catalog-cache.revision.spec.ts` (+2 testa) — kada je revizija objavljena,
  `revisionReads === 0` i snapshot se servira iz keša (dokaz da nema dodatnog upita); objavljena revizija
  koja se ne poklapa **reloaduje** snapshot (`OU=A` → `OU=A/B`), pa reparent i dalje nije zastario.
- `src/modules/authentication/session-revocation.spec.ts` (+1 test, 5 prepravljenih fake-ova) — `check()`
  objavljuje reviziju (42) u request scope; test zatim čita reviziju kroz **delegat-bez-klijenta**, što bi
  palo kad bi keš tražio vlastiti `SELECT`. Dodatno: SQL sadrži `"UserSession"` i
  `"OrganizationalUnitCatalogRevision"` u **jednom** pozivu, pa je fuzija eksplicitno dokazana.
- `src/modules/authentication/jwt-socket-authentication.verifier.spec.ts` — socket lease verifikacija
  prolazi kroz isti fusionirani read.

## Lokalna verifikacija i njeno ograničenje

```bash
cd backend
npx jest src/modules/authentication src/common/cache src/common/request-context   # 55 suite, 382 testa ✓
npx jest src/modules/websocket src/modules/authorization src/modules/tickets \
        src/modules/organizational-units src/modules/directory-sync \
        src/modules/privacy src/common                                       # 284 suite, 1576 testa ✓
npx eslint <7 dodirnutih fajlova>                                            # ✓
node scripts/check-backend-wiring.mjs                                        # 99 controllera, 633 rute ✓
```

Ograničenja: `k6` nije dostupan u sandboxu, pa se **kapija ne može izmjeriti lokalno** — mjerodavan je
`perf-smoke.yml` run. `prisma generate` nije moguć u sandboxu (`binaries.prisma.sh` blokiran), pa je
korišten gitignorovani lokalni stub; `npm run test:safety-net:compile` zato pada na stub delegatima
(`Property 'user' does not exist`), što je poznato sandbox ograničenje, ne regresija. Pravi tipovi i
`nest build` provjerava CI.

## Granica paketa

- Ne mijenja `W2.11` acceptance ni bump ugovor; keš i dalje pada natrag na bazu kada revizija nije dostupna.
- Legacy tokeni bez `sid` i dalje čitaju reviziju vlastitim upitom (nisu u perf profilu; svjesno van scopea).
- `principal_context_cache` grane koje ne prolaze kroz `check()` (npr. socket poruke) zadržavaju stari put.
- Perf prag 2,1 i cilj 2,0 nisu dirani; nije bilo „popuštanja" kapije.
- Susjedni nalazi (`BA-organizational-units-03`, `-05`) ostaju otvoreni.

## CI

Perf smoke [`45605301271`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45605301271) na
`f7937fc` — **zelen**. Kapija je izmjerena na istoj razini kao prije W2.11:

| Metrika | Vrijednost |
|---|---|
| avg `db_queries_per_request` | **2,072** preko **50.624** zahtjeva (kapija 2,1; cilj 2,0) |
| p95 / max | 3 / 34 |
| `/tickets` | **2,472** (crveni run: 3,211; baza: 2,470) |
| `/tickets/inbox` | **2,008** (crveni: 2,973; baza: 2,008) |
| `/search` | **3,000** (crveni: 4,008; baza: 3,000) |
| detalj tiketa | **≈1,99** (crveni: ≈2,09; baza: ≈1,98) |
| `/services`, `/reports/dashboard/summary`, `/notifications/unread-count` | 8,003 / 1,079 / 2,083 — nepromijenjeni |
| k6 pragovi | 12 prošlo, 0 palo; `http_req_failed` ispod praga; `/tickets` p95 17,57 ms, detalj p95 14,82 ms, `/services` p95 22,76 ms, payload `/services` 112,42 KB |

Delta iz § Nalaz (+0,52) je uklonjena u cijelosti: revizijski `SELECT` više ne postoji kao zaseban statement,
a `W2.11` provjera je i dalje po zahtjevu.

CI run [`45605301217`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45605301217) na
`f7937fc`:

- **Backend build + test:** success (uključuje `nest build` sa specs, lint, unit/safety-net).
- **Backend PostgreSQL + Redis integration:** success (uključuje `session-revocation.integration.spec.ts`,
  koji izvršava novi fusionirani SQL nad pravim Postgresom — bez njega fuzija ne bi bila dokazana).
- **Frontend build + test:** success (bez izmjena u ovom paketu).
- **Docs guard:** success; **Backend container + supply chain:** success; **CI gate:** success.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E install wizard`, `E2E critical flows` —
  workflow ih preskače za ovaj tip izmjene (nema E2E-relevantnih UI/install putanja).
- **Neuspjeli pokušaji:** nema — `f7937fc` je prvi pokušaj i prošao je i CI i perf kapiju.

## Registar nalaza

- Zatvoreni: nema novih ID-a — `BA-organizational-units-02` je zatvoren u `W2.11` i ostaje zatvoren;
  ovaj paket čuva njegov acceptance dokaz.
- Ostaju otvoreni: `-03`, `-04`, `-05`, `-06`, `-07`, `-08`, `-09`, `-10` (organizational units), plus
  ostatak grupa (`-02`, `-04`–`-10`) — nepromijenjeno.
- Kontrolni zbir: nepromijenjen u odnosu na W2.13 (696 nalaza, 340 zatvoreno / 356 otvoreno).

## Sljedeći paket

**W2.14 — `BA-authentication-01` (P1):** refresh ne smije uskrsnuti sesiju čiji registry red ne postoji
(fail-closed, isti obrazac kao W2.7/W2.13). Nije započet prije zelenog perf gatea.
