# W2.24 — `BA-security-03`: privilegovani auth audit je durable (outbox + replay), nikad prećutan

**Paket:** W2.24 — privilegovani auth audit: transactional outbox, idempotency key, alarm i reconciliation<br>
**Nalaz:** `BA-security-03` (P1) — **zatvoren**<br>
**Kodni commit:** `8ec208d4` (kod + testovi; prethodni `51180565`, `e14c04ff`, `d4b627d5` su iteracije dokaza)<br>
**Finalni testani SHA:** `8ec208d4` (kod + testovi) + docs commit ovog closeout-a<br>
**CI:** [`45891193873`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45891193873) — **zelen** (svi poslovi; `Backend PostgreSQL + Redis integration` uključena, E2E 27/27)<br>
**DB migracije:** nema (koristi se postojeća tabela `OutboxMessage`)

## Nalaz i acceptance

Audit trag privilegovanih auth akcija bio je *best-effort* i mogao je nestati tačno kada je najpotrebniji:

- `SecurityRateLimitsService.audit()` — `try { recordAuditEntry(…) } catch { /* ništa */ }`: retune rate limita (slabljenje
  zaštite prijave) mogao je ostati bez auth zapisa, a komentar je to i priznavao („settings modul je već zapisao“);
- `BulkPasswordResetService` — zbirni `auth.admin_bulk_password_reset` u istom `try/catch` obrascu: emergency akcija
  nad **svim** lokalnim računima mogla je završiti bez ijednog forenzičkog reda;
- `AccountSecurityNotifier.audit()` (MFA/passkey/lozinka događaji) — isti obrazac;
- rate-limit događaj nije bio u transakciji settings promjene, pa je i redoslijed bio neodređen.

**Acceptance (audit `09-security.md` §11, verbatim):** „audit outage ne gubi događaj; nakon oporavka tačno jedan
koreliran zapis postoji.“ Korekcija iz nalaza: transactional outbox / durable pending audit sa idempotency keyem,
alarm i reconciliation, plus **eksplicitna odluka** da li kritični write fail-closed ili durable-accept.

## Odluka: durable-accept, sa namjerom u transakciji pozivaoca

**Odluka je durable-accept.** Privilegovana akcija se **nikad** ne obara zbog audit problema — rate-limiti se
primjenjuju, bulk reset opoziva sesije, prijava se ne blokira. Razlog je konkretan: audit tabela je u istoj
PostgreSQL bazi kao i sve ostalo, pa „audit je pao“ praktično znači da je pao *chained append* (particija, lock,
policy odbijanje, tranzijentna greška jednog statementa), a ne cijela baza. Fail-closed bi u tom slučaju pretvorio
nemogućnost pisanja forenzičkog reda u nemogućnost **opoziva** kompromitovanih sesija — pogrešna strana na kojoj
se gubi sigurnost.

Durable-accept nije „progutaj grešku“:

1. **Namjera se upisuje u transakciji pozivaoca** (`recordWithinTransaction(tx, …)`) — commit-uje se ili nestaje
   zajedno sa promjenom koju opisuje. Nema zapisa o promjeni koja nije prošla, ni promjene bez zapisa.
2. **Standalone put** (`record(…)`) prvo commit-uje namjeru, pa odmah pokuša dostavu; vraća
   `delivered | pending | unavailable` umjesto `void`. Pozivaoci loguju `pending` kao upozorenje, a `unavailable`
   (ne može se upisati ni namjera — dakle ni sam outbox) kao grešku; to je jedini slučaj koji je stvarna rupa i
   tako se i prijavljuje.
3. **Dostava je atomska sa svojom markicom** (vidi dolje), pa replay daje **tačno jedan** zapis.
4. **Alarm i reconciliation** su dio paketa, ne „poslije“: `health()` / `GET /security/metrics/privileged-audit` i
   red u „Nadzor“ kartici; timer drenira, operater ima `replayDeadLetter` za ručni replay.

## Implementacija

### Outbox: `dispatchOneTransactionally`

`backend/src/common/outbox/transactional-outbox.service.ts` — nova metoda pored `dispatchOne`:

```
claim → prisma.$transaction(async tx => { handler(delivery, tx); updateMany({ … status: 'SUCCEEDED' … }) })
      → ako `count !== 1` ⇒ claimLost ⇒ rollback side effect-a
      → ako handler baci ⇒ fail(claim) (backoff / dead-letter po `maxAttempts`)
```

Ključna razlika prema `dispatchOne`: side effect i `SUCCEEDED` markica su **jedan commit**. Crash ili neuspjela
markica vraćaju i side effect, pa replay ne može napraviti drugi zapis — zato handler ne mora biti idempotent, a
garancija je „exactly once“ a ne „at least once“.

### `PrivilegedAuditService` (`backend/src/common/privileged-audit/`)

- `privileged-audit.outbox.ts` — topic `audit.privileged`, `maxAttempts = 20`, `pendingWarningMs = 5 min`, codec
  (`toPrivilegedAuditPayload` / `readPrivilegedAuditPayload`, strogo tipiziran — malformed payload je permanentna
  greška i ide u dead letter, ne u prećutno odbacivanje), `defaultPrivilegedAuditKey` = `action:entityId:uuid`.
- `privileged-audit.service.ts` — `record`, `recordWithinTransaction`, `deliverPending`, `drain`, `health`;
  timer 2 s (`unref`), `draining` guard, backoff iz outbox-a.
  **Dostava koristi `appendAuditLog`, ne `recordAuditEntry`** — namjerno: `recordAuditEntry` bi unutar dostavne
  transakcije otvorio *novu* transakciju, a upravo je poenta da su chained append i `SUCCEEDED` isti commit.
- `privileged-audit.module.ts` — `@Global()`: `AuditLogModule` već importuje `AuthenticationModule`, pa bi import u
  drugom smjeru bio ciklus (`AuditLogModule ↔ AuthenticationModule`). Registrovan u `app.module.ts`.

### Pozivaoci (tri prećutna `catch` bloka)

| Put | Prije | Sada |
| --- | --- | --- |
| `SecurityRateLimitsService.audit()` | `try/catch {}` | `record({ action: auth.rate_limits_changed, … })` + `warn` na `pending`/`unavailable` |
| `BulkPasswordResetService` (zbirni) | `try/catch {}` | `record({ action: auth.admin_bulk_password_reset, …, dedupeKey: bulk-password-reset:<actor>:<run> })` |
| `AccountSecurityNotifier.audit()` | `try/catch + warn` | `record(...)`; `pending` → `warn`, `unavailable` → `error` |

`PrismaService` je uklonjen iz `SecurityRateLimitsService` (bio je tu samo za audit). Status bulk runa se **ne
mijenja** — audit je dokaz, ne dio opoziva; `COMPLETE`/`PARTIAL` i dalje opisuju samo revokaciju (W2.23).

### Alarm i reconciliation

- `health(now)` → `{ status: 'ok' | 'degraded', pending, processing, deadLetter, oldestPendingAgeMs, stale }`;
  `degraded` ⇔ `stale` (> 5 min) ili `deadLetter > 0`.
- `GET /security/metrics/privileged-audit` — SUPER_ADMIN (class-level guard), `Cache-Control: no-store`, samo
  brojevi i starost; bez akcije, aktera i ID-a.
- Dead letter se loguje kao `privileged_audit_dead_letter` (nema tišine), a `replayDeadLetter` iz outbox-a ostaje
  operaterov alat sa provenance-om (akter, razlog, broj replay-eva).
- Frontend: `SecurityPrivilegedAuditHealth` + `getPrivilegedAuditHealth()`; red „Privilegovani audit trag“ u
  „Nadzor“ kartici („Zapisano“/„Kasni“, broj na čekanju, dead-letter, najstariji u sekundama, `refetchInterval` 60 s),
  `bs`/`en` ključevi `admin.ops.securityMetrics.privilegedAudit.*`.

## Direktni testni dokaz

**Unit (bez baze):**

- `src/common/privileged-audit/privileged-audit.service.spec.ts` (**novo, 11/11**): `delivered` samo kad je dostava
  commit-ovala zapis; `pending` ostavlja intent; `unavailable` kad ni intent ne može stati i **nikad ne baca**;
  odbijena `$transaction` je ishod, ne izuzetak; ključ je jedinstven po događaju i malformisan se odbija
  (`PRIVILEGED_AUDIT_KEY_INVALID`); dva poziva sa istim ključem = jedan intent; `recordWithinTransaction` piše na
  transakciji pozivaoca i **ne** dostavlja sam; `drain` broji samo stvarne dostave i loguje dead letter; `health`
  `ok`/`degraded` (stale, dead letter); codec round-trip i odbijanje malformisanog payload-a.
- `security-rate-limits.service.spec.ts` (**9/9**, +2): retune i dalje prolazi kad je audit `pending` odnosno
  `unavailable`, a writer vidi događaj **tačno jednom**; postojeći testovi sada idu kroz pravi ugovor writer-a
  (metadata bez identiteta i dalje pinovana).
- `bulk-password-reset.service.spec.ts` (**15/15**, +1): **audit outage** → run je `COMPLETE`, nema audit reda,
  jedan parkiran intent, a replay poslije oporavka daje **tačno jedan** red sa `status: 'COMPLETE'`; stari test
  „audit kvar ne obara akciju“ i dalje prolazi kroz `unavailable` granu.
- `security-metrics.controller.spec.ts` (**7/7**, +2): nova ruta je `no-store`, vraća `health()` nepromijenjen i
  izlaže **samo** šest polja (nema sadržaja zapisa).

**PostgreSQL (registrovano u `run-isolated-integration.mjs`):**

- `src/common/privileged-audit/privileged-audit.integration.spec.ts` (**novo, 4 slučaja**), fault je stvarni —
  `auditLog.create` baca unutar dostavne transakcije:
  1. **outage** → `record` vraća `pending`, `AuditLog` je prazan, intent je `PENDING` sa `attempts ≥ 1` i
     `lastError`, `health()` je `ok` (još nije stale, ali `pending: 1`);
  2. **oporavak** → jedan `deliverPending()` daje **tačno jedan** red, intent je `SUCCEEDED`; **drugi**
     `deliverPending()` ne dodaje ništa; `health()` se vraća na `ok`/`pending: 0`;
  3. **dedupe** → dva `record` poziva sa istim ključem = jedan audit red i jedan outbox red;
  4. **transakcija pozivaoca** → `recordWithinTransaction` commit-uje sa mutacijom (i dostavlja se poslije), a
     rollback mutacije odnosi i intent (`0` redova, `0` outbox redova); plus `degraded` za dead letter i za stale
     intent (stariji od 5 min).
- `src/common/outbox/transactional-outbox.integration.spec.ts` (**+2**): `dispatchOneTransactionally` vraća side
  effect kada handler padne (audit red **ne** postoji, poruka ostaje `PENDING` sa `attempts: 1`) i commit-uje side
  effect + `SUCCEEDED` zajedno u sretnom slučaju (`completedAt`, `ownerToken: null`).
- Tri postojeća integracijska spec-a (`users/account-security-boundary`, `authentication/passkey-clone-revocation`,
  `security/bulk-password-reset`) sada grade **pravi** `PrivilegedAuditService` nad istim klijentom umjesto da
  očekuju da notifier sam piše red — inače bi tvrdili `prisma.auditLog` nad putem koji više ne postoji. Njihove
  tvrdnje o audit redu tako sada dokazuju i dostavu kroz outbox.

**E2E** (`e2e/tests/37-authentication-security.spec.ts`, +1 test): `/security/metrics/privileged-audit` odgovara
samo SUPER_ADMIN-u (`401` bez sesije, `403` za običnog korisnika), tijelo ima tačno šest polja, a `status` je
konzistentan sa `stale`/`deadLetter` i `oldestPendingAgeMs` sa brojem na čekanju.

## Registar nalaza

- `BA-security-03` → **zatvoreno (W2.24)** u `docs/backend/audits/09-security.md` (§10 red, §11 implementacijski
  status i `Severity/status`, §15 traceability red).
- Ledger red `W2.24` u `docs/backend/EXECUTION-PLAN-REMAINING.md`.
- Regenerisano guardom `audit:traceability --write`: **698 nalaza, 353 zatvoreno / 345 otvoreno**.

## DB/migracija/rollout

- **Nema migracije i nema nove šeme.** Koristi se postojeći `OutboxMessage` (topic `audit.privileged`, unique
  `(topic, dedupeKey)`, claim/lease/retry/dead-letter) i postojeći `AuditLog` chained append.
- Rollout bez koraka: nova ruta je aditivna, a tri pozivaoca mijenjaju samo *način* pisanja istog događaja.
  Rollback je vraćanje fajlova; outbox redovi ostaju i mogu se odigrati rukom (`replayDeadLetter`).
- **Kompatibilnost:** tijela odgovora se ne mijenjaju (`BulkPasswordResetResult` netaknut); frontend dobija jedan
  novi tip i jedan novi red u kartici.

## Lokalna provjera i ograničenja

- `npx tsc --noEmit -p tsconfig.json` (backend) → bez greške u fajlovima paketa; jedina greška je preegzistentna
  `announcement-delivery.spec.ts:310` TS2835, van paketa.
- `npx eslint` nad svim diranjenim fajlovima → 0 grešaka.
- `npx jest src/modules/security src/common/privileged-audit src/modules/authentication/security` → **27 suites
  passed / 3 skipped, 250 testa**; `npx jest src/modules/users src/modules/audit-log src/common/outbox` → **47
  suites passed / 4 skipped, 188 testa** (skip = DB integracije bez `PRIVACY_IT_DATABASE_URL`).
- `npm run wiring:check` → `✓ 99 controllera, 634 ruta` (nova ruta je u manifestu).
- `npm run audit:traceability` → `698/698, zatvoreno=353 otvoreno=345, registar=usklađen`; guard testovi
  (`check-backend-findings.test.mjs`, `run-isolated-integration.test.mjs`) prolaze.
- Frontend: `npx tsc -b` čist; `npx vitest run src/lib/i18n src/components/admin` → **12 fajlova / 76 testova**;
  `npm run i18n:check` → `9396 keys, bs/en parity ok`.
- **Integracijski specovi su lokalno `skipped`** (u sandboxu nema PostgreSQL-a) — izvršava ih posao
  `Backend PostgreSQL + Redis integration` na PR-u; ovdje se to **ne** prijavljuje kao prolaz.

## CI i testni dokaz

PR run [`45891193873`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45891193873) na `8ec208d4` —
**svi poslovi zeleni**:

| Posao | Rezultat |
| --- | --- |
| `Backend build + test` | **success** — `tsc` sa anotiranim dijagnostikama, `eslint` (0 grešaka, 6 preegzistentnih upozorenja), svi Jest poslovi uključujući 11 novih unit testova writer-a |
| `Backend PostgreSQL + Redis integration` | **success** — `common/privileged-audit` (4/4) + `common/outbox` (7/7, uključujući 2 nova `dispatchOneTransactionally` slučaja) + `security/bulk-password-reset` (3/3) + `users/account-security-boundary` (5/5) |
| `Frontend build + test` | **success** — prettier, `tsc`, vitest, bundle budžeti |
| `Backend container + supply chain` | success |
| `Docs guard` | **success** — registar/plan/JSON usklađeni (`698 nalaza, 353 zatvoreno / 345 otvoreno`) |
| `E2E critical flows` | **success** — `27 passed, 0 failed, 0 flaky, 0 skipped`, `errors: []` (uključuje novi test privilegovanog traga u specu 37) |
| `E2E install wizard`, `Read-only service-form pattern inventory` | skipped (workflow ih sam preskače za ovu vrstu izmjene) |
| `CI gate` | **success** |

**Iteracije dokaza — svaka je našla stvarni defekt, nijedan nije bio flake:**

| Run | Nalaz | Popravka |
| --- | --- | --- |
| [`45883710368`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45883710368) | `worker.module.spec`: `WorkerModule` boota `AuthenticationModule` bez novog globalnog modula ⇒ `AccountSecurityNotifier` ne može razriješiti `PrivilegedAuditService`; `record()` je čekao dostavu i status **bez** guard-a ⇒ djelimični/fault klijent je obarao privilegovanu akciju; bulk fault-klijent nije imao `outboxMessage` delegate; frontend prettier | modul u `WorkerModule`, `record()` guard-ovan (greška u statusu ⇒ `pending`) + regresioni test, delegate dodat u fault klijent, prettier |
| [`45885971738`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45885971738) | integracija: spec je koristio nedozvoljeno audit metadata polje (`phase`) ⇒ policy je odbijala **svaku** dostavu (`AUDIT_METADATA_FIELD_NOT_ALLOWED`), pa je outage izgledao „zdrav“; wiring snapshot se promijenio sa `WorkerModule` importom | metadata samo iz allowliste (`ipMaxFailures`, `ipWindowSeconds`, …), dokumentovano u specu; manifest regenerisan |
| [`45888362283`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45888362283) | `settings-http.module.spec` + websocket boot: svaki podgraf sa `AuthenticationModule` mora sam razriješiti notifier | `AuthenticationModule` **sam** importuje `PrivilegedAuditModule` (bez ciklusa: on uvodi samo `OutboxModule`), globalna registracija ostaje za security/users puteve |

Prva dva runa su pala i na frontend formatu i na wiring snapshotu — oba su posljedica istog paketa, ne infrastrukture.

## Rizik

- **Durable-accept je odluka, ne nemar:** ako padne i outbox (ista baza), događaj je stvarno izgubljen; zato
  `record` tada vraća `unavailable` i pozivalac piše `error` u log. Alternativa (fail-closed) bila bi sigurnija za
  forenziku, ali bi blokirala opoziv sesija tokom audit incidenta — dokumentovano gore.
- **Kašnjenje do 2 s** u najgorem slučaju (timer) između akcije i audit reda. Za forenziku je prihvatljivo, ali
  čitač koji odmah traži zapis mora znati da postoji prozor (`deliverPending` ga svodi na jedan round-trip).
- **Outbox raste** sa svakim privilegovanim događajem; rješava ga postojeći `purgeExpired` (retention), isto kao
  ostali topic-i.
- **Dedupe je payload-striktan** (`OUTBOX_PAYLOAD_MISMATCH`): retry mora ponoviti **isti** payload ili uzeti novi
  ključ. Bulk reset zato koristi ključ po runu, a ne po akteru.
- **Dead letter nije samo metrika:** ako intent uđe u dead letter, zapis ne postoji dok ga operater ne replay-uje.
  `health()` i log to objavljuju, ali automatskog „popravi sam“ nema — namjerno, jer bi tiho prepisivanje
  audit traga bilo gore od priznatog propusta.

## Granica paketa

- Nije dirana šema, migracija, seed, ni `AuditLog` chained append (hash/partition logika netaknuta).
- Nije diran W2.23 ugovor bulk reseta (`status`, `202`, `pendingUsers`/`failedUsers`) — samo način pisanja audita.
- Nije diran outbox protokol (`claim`, `fail`, `replayDeadLetter`, `purgeExpired`); dodata je jedna metoda
  (`dispatchOneTransactionally`) i dva testa za nju.
- Ostaju otvoreni susjedni nalazi: `BA-security-07` (durable operation manifest za bulk), `BA-security-09`
  (concurrency grane bez dokaza), `BA-security-11` (failure observability — ovaj paket daje *jednu* metriku, ne
  potpunu korelaciju).

## Sljedeći paket

**W2.25 — `BA-groups-02` (P2):** membership revoke kasni do 30 s za HTTP i do 5 min za WebSocket group room.
