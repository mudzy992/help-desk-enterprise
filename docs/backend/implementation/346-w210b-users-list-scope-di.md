# W2.10b — `BA-users-10`: `import type` + `@Optional()` tiho isključuje OU scope liste korisnika

**Paket:** W2.10b — regresija isporuke `W2.10`<br>
**Nalaz:** `BA-users-10` (P1) — zatvoren<br>
**Kodni commit:** `a4d6204` (+ `499c019` baseline fixture guarda)<br>
**Finalni testani SHA:** `499c019`<br>
**CI:** [`45639458079`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45639458079) — zelen<br>
**DB migracije:** nema

## Nalaz

Prijava iz produkcije: lokalni SuperAdmin (`isSuperAdmin: true`, `principal.isLocalOnly: true`,
`roleKeys: ["SUPER_ADMIN"]`) otvori administraciju → Korisnici i vidi **praznu listu**, dok se USER i AGENT
nalozi normalno prijavljuju. `GET /users?take=100` vraća `[]` uz `X-Total-Count: 0` (HTTP 304/200).

Uzrok je u `users.service.ts`: `AuthorizationContextLoader` je uvezen kao `import type`. TypeScript briše
takav uvoz pri transpajliranju, pa emitovani dekorator metadata za taj parametar glasi `Object`. Nest tada
ne može razriješiti provajdera i — pošto je parametar označen `@Optional()` — **tiho injektuje
`undefined`**. `listSummaryPageForActor` je zato uvijek radio sa `resolveUserListScope(undefined)`:

```ts
if (context === null || context === undefined) return emptyScope;   // unrestricted: false, paths: []
```

`emptyScope` daje `organizationalUnitIds: []`, a to u Prismi znači `organizationalUnitId: { in: [] }` —
nula redova. Guard je propuštao aktera jer `RoleGuard` dobija `AuthorizationService` regularno, pa je
simptom bio samo prazna lista, bez 403.

Isti kvar je oborio E2E: global setup (`provision-test-actors.ts::ensureUser`) traži aktere u `GET /users`,
ne nađe ih, pa `POST /users` udari u unique e-mail → `EMAIL_CONFLICT` **prije ijednog speca**. Zato je E2E
bio crven od deploya `W2.10` (`ca75ac7`, run `45507674274`) i na PR-u i noću.

Nijedan unit test nije ovo uhvatio jer svi konstruišu `UsersService` poziciono i predaju loader ručno —
test nikad ne prolazi kroz DI.

## Implementacija

- **`users.service.ts`** — vrijednosni uvoz `import { AuthorizationContextLoader }` (uz komentar zašto ne
  smije biti `import type`) i `Logger.error` kada loader ipak nedostaje: fail-closed ponašanje ostaje
  (prazan scope, nikad širi), ali prestaje tišina koja je simptom pretvorila u „nema korisnika".
- **`policy-packs.service.ts`, `report-summary.service.ts`** — isti skener je našao još dva ista slučaja
  (`@Optional() SettingsService` kroz `import type`): policy-pack čitanja su uvijek koristila fallback
  „nema postavki", a `ReportSummaryService` uvijek instalacioni timezone umjesto postavke. Oba su sada
  vrijednosni uvozi.
- **`app.module.optional-dependencies.spec.ts`** (novo) — kompajlira **pravi `AppModule`** i tvrdi da su
  `UsersService.authorizationContextLoader`, `PolicyPacksService.settingsService` i
  `ReportSummaryService.settingsService` injektovani; drugi test dokazuje sam mehanizam kvara
  (`resolveUserListScope(undefined)` → prazan scope, a SuperAdmin kontekst → unrestricted).
- **`e2e/helpers/provision-test-actors.ts`** — `GET /users` se poziva sa `?q=<email>`: lista je tvrdo
  ograničena na 500 redova sortiranih po imenu, pa na dugoživućem stacku postojeći akter može ispasti iz
  prvog „prozora". Upit ide kroz indeksirani filter koji koristi i admin ekran, a tačno poređenje i dalje
  odlučuje.

Nije mijenjano: pravilo scope-a iz `W2.10` (servisni grant ne proširuje listu, scoped grant se sužava na
podstablo, `SUPER_ADMIN` je slobodan), rute, DTO-ovi, frontend.

## Vizuelna provjera (ručni koraci)

1. Prijava kao lokalni SuperAdmin → Administracija → Korisnici: lista prikazuje sve korisnike.
2. DevTools → Network → `GET /users?take=100`: HTTP 200, `X-Total-Count` jednak broju korisnika u bazi.
3. Prijava kao ADMIN scoped na jednu OU: lista prikazuje samo korisnike tog podstabla (`X-Total-Count`
   manji od globalnog) — `W2.10` acceptance i dalje vrijedi.
4. Prijava kao USER/AGENT: `/users` je 403 (nema `user.manage`) — regresija nije „otvorila" listu.
5. `GET /auth/session`: `isSuperAdmin: true`, `permissionKeys` sadrži sve permisije.

## AD konektor sa testnim OU

Nije primjenjivo na ovaj paket (nema promjene u directory sync-u, DN/path izračunu ni u mapiranju
identiteta). Provjereno je da `PolicyPacksService`/`ReportSummaryService` popravke ne diraju directory sync
i da njihovi testovi prolaze.

## Direktni testni dokaz

- `src/app.module.optional-dependencies.spec.ts` — **3 testa**:
  - „injects the authorization context loader into UsersService" — **pada prije popravke**
    (`Received: undefined`), prolazi poslije; provjerava i `principalContextInvalidator` i
    `hibpPasswordChecker`;
  - „injects the settings service into the optional consumers that declare it" — pokriva druga dva ista
    slučaja;
  - „proves the failure mode this wiring caused" — `resolveUserListScope(undefined)` je prazan scope, a
    SuperAdmin kontekst je `unrestricted` (dakle prazna lista nije poslovno pravilo).
- `src/modules/users/**` — 28 suite / 114 testa ✓ (uključujući `users.list-scope.spec.ts` i
  `resolve-user-list-scope.spec.ts`).
- `src/modules/policy-packs`, `src/modules/reports`, `src/modules/settings`, `src/app.module.spec.ts` —
  zajedno sa users: **116 suite / 650 testa** ✓.
- `e2e`: `npx tsc --noEmit -p tsconfig.json` ✓.

## Lokalna verifikacija i njeno ograničenje

```bash
cd backend
npx jest src/app.module.optional-dependencies.spec.ts   # 3 ✓ (prije popravke: 1 ✕, "Received: undefined")
npx jest src/modules/users src/modules/policy-packs src/modules/reports \
        src/modules/settings src/app.module.spec.ts     # 116 suite / 650 testa ✓
cd ../e2e && npx tsc --noEmit -p tsconfig.json          # ✓
```

Ograničenja: `prisma generate` nije moguć u sandboxu; korišten je gitignorovani lokalni stub (poznato
ograničenje, ne regresija). E2E se **ne može** pokrenuti lokalno (stack je eksterni), a i u CI-ju E2E radi
protiv **deployanog** stacka — zato E2E zelenilo zahtijeva deploy ove popravke, nezavisno od zelenog CI-ja.

## Granica paketa

- Popravka je uvezivanje i observabilnost, ne promjena autorizacijskog modela; `W2.10` acceptance ostaje.
- Ostali `@Optional()` saradnici provjereni su skenerom (`import type` + `@Optional()` bez `@Inject`):
  pronađena su i popravljena tri slučaja, drugih nema.
- E2E harness i dalje radi list-then-create; `?q=` sužava prozor, ali idempotentnost na nivou API-ja
  (POST sa `EMAIL_CONFLICT` → re-read) ostaje kao zaseban, manji follow-up ako se pokaže potreba.
- Ne mijenja `W2.11b` fusion ni OU revizijski keš.

## CI

CI [`45639458079`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45639458079) na
`499c019` — **success**:

- **Backend build + test:** success (uključuje `audit:traceability` 697/697, `prisma validate`/`db:generate`,
  `nest build` sa specovima, lint, `test:safety-net:compile`, `test:wiring`, SLA matricu i puni unit suite —
  dakle i `app.module.optional-dependencies.spec.ts`).
- **Backend PostgreSQL + Redis integration:** success.
- **Frontend build + test**, **Backend container + supply chain**, **Docs guard**, **CI gate:** success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`
  (push profil ne pokreće E2E; E2E ide na `pull_request`/`schedule`/dispatch).
- **Neuspjeli pokušaj:** [`45633604779`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45633604779)
  na `a4d6204` — pao na **vlastitoj** konzistentnosti: `npm run audit:traceability:test` (i `Docs guard`) drže
  fixture sa baseline-om 696 nalaza / P1 174, a novi `BA-users-10` je sedmi stoti i 175. P1. Popravka:
  baseline u `scripts/check-backend-findings.test.mjs` + komentar zašto se mijenja (`499c019`). Zeleni run je
  prvi nakon popravke.

**E2E je i dalje crven i to se ne prikazuje kao zeleno:** E2E radi protiv **deployanog** stacka
(`E2E_API_URL`/`E2E_DATABASE_URL`), ne protiv SHA-a iz runa. Dok se ova popravka ne deploya, `GET /users` na
tom stacku vraća praznu listu i global setup pada na `EMAIL_CONFLICT` (potvrđeno na `3c4a8af`, `71dae45`,
`ceb4a96`). Nestanak `EMAIL_CONFLICT`-a je očekivani znak da je popravka u produkciji.

### Dopuna (2026-11-25): E2E crvenilo zatvoreno

1. **Popravka je u produkciji** — puni dispatch
   [`45645224458`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45645224458) pokrenuo je
   global setup **uspješno** (nema `EMAIL_CONFLICT`-a), pa je i `GET /users` na stacku vraćao korisnike.
2. **Taj run je ipak bio crven, ali zbog stacka, ne koda:** `126 passed / 1 failed / 3 flaky / 1 skipped`, uz
   `GET https://api.desk.ba101.top/health` koji je pao **12 od 60 proba u 11 epizoda** između
   `15:37:02Z` i `16:23:18Z` (46 min) i oporavio se prije kraja joba. Jedini finalni pad je
   `15-workflow-unrouted-realtime.spec.ts:275` — `expect.poll` na socket frame `routing.rules.updated` sa
   timeoutom od 10 s; flaky rezultati nose `UND_ERR_CONNECT_TIMEOUT` na `api.desk.ba101.top:443`, tj. mrežu,
   ne 5xx aplikacije. Lokalno su `admin-realtime` + `websocket` + `routing` specovi zeleni (**229 testova**),
   pa emitovanje u `role:admins` sobu nije dirano ovim paketom.
3. **Ciljani dokaz:** PR #27 je mergovan (`master` = `d76ceeb`) i odmah je pokrenut dispatch
   [`45654921819`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45654921819) — `specs=15`,
   `retries=0` ⇒ **E2E critical flows: success**. Time je pad iz punog runa dokazan kao posljedica prekida
   stacka; puni E2E set nije ponavljan u ovom paketu.

## Registar nalaza

- Zatvoreni: `BA-users-10` (novi nalaz, P1 — regresija isporuke `W2.10`).
- Ostaju otvoreni: `BA-users-02`, `-03`, `-06`, `-07`, `-08`, `-09` (nepromijenjeno).
- Kontrolni zbir: regenerisani blok u registru (guard `audit:traceability`).

## Sljedeći paket

**W2.14 — `BA-authentication-01` (P1):** refresh ne smije uskrsnuti sesiju čiji registry red ne postoji.
Nije započet prije zelenog gatea za ovaj paket.
