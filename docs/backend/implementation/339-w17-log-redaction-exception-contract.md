# W1.7 — `BA-xcut-20`: jedan ugovor za redakciju loga i za exception sanitizer

**Paket:** Val 1, cross-cutting (observability/trust boundary), **P2**<br>
**Nalaz:** „Nema centralnog structured log redaction i exception sanitizer ugovora”<br>
**Kod:** `src/common/logging/log-redaction.ts` (**novo**), `src/common/logging/describe-exception.ts` (**novo**),
`src/common/logging/sanitize-log-value.ts` (**novo**), `request-context/request-context.logger.ts` (jedini emit put),
`request-context/http-exception.filter.ts`, `modules/config-versioning/apply-config-snapshot.ts`,
`modules/notifications/fan-out/notifications-fan-out.service.ts` (3 mjesta), `modules/tickets/archive/ticket-archive-automation.service.ts`,
`modules/tickets/export/tickets-export.service.ts`, `modules/tickets/waiting-for-user/waiting-for-user-automation.service.ts`<br>
**Specovi:** `log-redaction.spec.ts` (**novo, 10**), `describe-exception.spec.ts` (**novo, 9**),
`sanitize-log-value.spec.ts` (**novo, 8**), `log-contract.spec.ts` (**novo, 4**, skenira `src/`), postojeći logger/filter
specovi nepromijenjeni<br>
**DB migracija:** **nema**<br>
**Rute:** nepromijenjene (632) · **Env:** nema novih varijabli

## Nalaz

Audit (`44-cross-cutting-infrastructure.md` §9) je imao dvije rečenice koje su se odnosile na isti nedostatak:

- „nema centralnog structured logger/redaction processor ugovora; više CLI/module mjesta koristi interpolaciju i `console.*`”;
- „exception reason/message iz dependency greške ulazi u warning log na više mjesta bez standardnog sanitizer-a”.

Stanje je bilo tačno takvo. `RequestContextLogger` je dodavao `requestId` prefix i kopirao poruku u bafer, ali nije
*gledao* poruku. Sve ostalo radili su pozivaoci, ručno:

1. **Osam mjesta je pisalo `.stack`** u log (`error instanceof Error ? error.stack : String(error)`), uključujući 5xx
   filter — dakle cijeli stack, onako kako ga je dependency sastavio. Prisma greška u stacku nosi SQL i parametre, HTTP
   klijent nosi URL sa kredencijalima, Redis klijent nosi `redis://:password@host`.
2. **Devedeset mjesta je interpoliralo `error.message`** u warn/error liniju. Poruka je neograničena: jedan `fetch`
   timeout sa tijelom od 8 KB daje 8 KB log liniju, a poruka može sadržavati `password=`, `token=` ili cookie.
3. **Ne-string argument** (`logger.error('failed', error)`) `ConsoleLogger` ispisuje kroz `util.inspect`, pa u log
   odlazi cijeli objekat — `meta`, `params`, sve.
4. **Nije bilo granice dužine** nigdje, pa je „log line” mogao biti megabajt.

Nalaz je P2 jer nije eskalacija, ali je curenje tajni u log koji ide u kontejnerski collector i (moguće) u SIEM.

## Odluka

**Redakcija je centralna i obavezna; exception ima jedan ugovor; pravilo je provjerljivo u CI-ju.**

- **Centralno, ne po pozivaocu.** `RequestContextLogger` je jedini emit put (postavljen u `main.ts` kroz
  `application.useLogger(...)`). Svaka poruka i svaki argument prolaze kroz sanitizer **prije** nego odu u kontejnerski
  sink i **prije** nego uđu u in-memory bafer. Pozivalac ne može zaobići redakciju, čak i ako interpolira sirovu grešku.
- **Konzervativno prepoznavanje, bez pogađanja.** Rediguje se samo ono što ima prepoznatljiv ključ (`password=`,
  `token:`, `client_secret =>`, `cookie`, `session_id`, …) ili prepoznatljiv oblik (`Bearer …`, `Basic …`, kredencijali u
  URL-u, JWT, `sk-…`, `ghp_…`, `AKIA…`). Ne pogađa se da li je „neka riječ od 20 znakova” tajna: pogađanje pravi šum i
  ipak promaši pravu tajnu.
- **Oblik se čuva.** `"password":"x"` postaje `"password":"[redacted]"` (JSON ostaje parsiran), a u URL-u se čuva
  korisničko ime jer ono identificira račun koji je pao — briše se samo lozinka.
- **Ugovor za exception** vraća **jednu liniju**: `Name: message code=<dependency code>`. `code` (`P2002`,
  `ECONNREFUSED`) je jedino polje po kojem se linija može greppati, pa ostaje. Stack je dozvoljen samo kroz
  `formatExceptionStackForLog` (redigovan i ograničen na 4.000 znakova) — dijagnostika ostaje, tajne ne.
- **Granice:** 2.000 znakova za poruku, 4.000 za stack, sa oznakom `…[truncated](+N)` da se vidi da je nešto odsječeno.

## Implementacija

### 1. `log-redaction.ts` — šta se rediguje

| Obrazac | Primjer | Rezultat |
| --- | --- | --- |
| ključ + vrijednost (`=`, `:`, `=>`, JSON) | `password=hunter2` | `password=[redacted]` |
| scheme + token | `Authorization: Bearer abc.def` | `Bearer [redacted]` |
| kredencijali u URL-u | `postgresql://svc:s3cret@db/hd` | `postgresql://svc:[redacted]@db/hd` |
| JWT | `eyJhbGci….eyJzdWIi….c2ln…` | `[redacted]` |
| vendor ključevi | `sk-…`, `ghp_…`, `xoxb-…`, `AKIA…` | `[redacted]` |

Prije redakcije se uklanjaju kontrolni znakovi (osim `\n` i `\t`, jer stack ih ima), pa `\r` ne može „prepisati”
liniju, a NUL ne može odsjeći JSON polje u collector-u. Redakcija je idempotentna (`[redacted]` se ne rediguje
ponovo), pa se već redigovana linija može logovati dvaput.

### 2. `describe-exception.ts` — ugovor

`describeException(unknown)` i `formatExceptionStackForLog(unknown)` primaju **bilo šta što se može baciti** i nikad ne
bacaju same: `Error`, string, `null`, `undefined`, objekat, niz, `Symbol`, ciklični objekat. Pozivaocima više ne treba
`instanceof Error` provjera prije logovanja.

### 3. `sanitize-log-value.ts` + logger — jedan emit put

`RequestContextLogger` ima jednu privatnu `emit` metodu za svih šest nivoa; ona sanitizuje poruku i argumente, upisuje u
bafer i poziva `super.<level>`. Ne-string argument postaje redigovan JSON (ili sanitzovani stack ako je `Error`), pa
`util.inspect` više ne vidi živi objekat. Context label (`TicketsService`) ostaje netaknut i bafer ga i dalje vidi.

### 4. Osam `.stack` mjesta

`http-exception.filter` (5xx), `apply-config-snapshot`, `notifications-fan-out` (3), `ticket-archive-automation`,
`tickets-export`, `waiting-for-user-automation` — svi sada zovu `formatExceptionStackForLog(error)`. Pozivna
konvencija je ista kao ranije (drugi argument je dijagnostika), pa se izlaz u kontejneru ne mijenja osim što je
redigovan i ograničen.

### 5. Ugovor kao test, ne kao običaj — `log-contract.spec.ts`

Test skenira `src/**/*.ts` (bez `*.spec.ts`, `generated/`) i pada ako:

- postoji `console.(log|error|warn|info|debug|trace)` **van** `src/cli/**` (CLI stdout je proizvod komande, ne log),
- postoji `.stack` **van** `src/common/logging/**` (jedino sanitizer smije čitati stack),
- postoji `process.stdout.write`/`process.stderr.write` van CLI-ja i van `flush-worker-telemetry.ts`.

Time nalaz ne može tiho „oživjeti” u sljedećem paketu.

## Direktni testni dokaz

- `log-redaction.spec.ts` (10) — devet oblika `key=value`/JSON/`=>`/header, očuvanje dijagnostičkog teksta, `Bearer` i
  `Basic`, kredencijali u `postgresql://` i `redis://` (uključujući prazno korisničko ime), JWT i vendor ključevi,
  netaknuta operativna linija, idempotencija, kontrolni znakovi, granica + marker.
- `describe-exception.spec.ts` (9) — `Name: message code=`, redakcija u poruci, granica na ogromnoj poruci, svi
  ne-`Error` oblici, ciklični objekat, redigovan i ograničen stack, odsutan stack, primitivi bez JSON omotača.
- `sanitize-log-value.spec.ts` (8) — poruka/argument kroz sanitizer, `Error` → stack, objekat → redigovan JSON,
  primitivi, context label preživljava; **logger testovi** dokazuju da `s3cret`, `abc123` i `sid=xyz` ne dolaze ni do
  `ConsoleLogger.prototype.error` ni do bafera, i da 1 MB poruka izlazi kao ≤ 2.100 znakova.
- `log-contract.spec.ts` (4) — skener nalazi > 500 fajlova (da test ne može biti prazan), nula `console.*` van CLI-ja,
  nula `.stack` van sanitizera, nula stream write-ova van dozvoljenih mjesta.

## CI i testni dokaz

Run [`45451235864`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45451235864) na `89b8d35` — **zelen iz
prvog pokušaja**:

- **Backend build + test:** zeleno (schema/client, `nest build`, pun Jest). Ovo je i dokaz za četiri modula čije su
  log linije izmijenjene — njihove suiteove lokalno nije bilo moguće učitati (vidi napomenu o okruženju), pa se
  ovdje ne tvrdi lokalni prolaz nego CI prolaz.
- **Backend PostgreSQL + Redis integration:** zeleno — nema migracije, harness nepromijenjen.
- **Frontend build + test, Backend container + supply chain, Docs guard, CI gate:** zeleni. Frontend nije diran; nema
  nove audit akcije ni polja, pa parity testovi nemaju šta tražiti.
- **E2E (critical flows, install wizard) i service-form inventory:** `skipped` — nema korisniku vidljivog ponašanja;
  promjena se vidi samo u logu, a browser dokaz ne bi tvrdio ništa što unit testovi ne tvrde.
- Lokalno (u okviru onoga što okruženje dopušta): `src/common/logging` **30** testova i `src/common/request-context`
  **41** test zeleni, `eslint --max-warnings=0` na svim izmijenjenim fajlovima, `check-docs-content` OK,
  `audit:traceability` 696/696 (**335 zatvoreno / 361 otvoreno**).

## Granica paketa

- **Metapodaci audit zapisa** imaju svoj, stroži allowlist (`audit-event-policy`) i nisu dirani; ovaj paket pokriva
  logove, ne audit lanac.
- **Metric label/cardinality budžet** i **OpenTelemetry propagacija** su odvojeni nalazi iz §9 i ostaju otvoreni.
- **Prevoz loga do SIEM-a** (agent, retencija, immutable storage) nije aplikacijska odgovornost i ostaje
  `W3.21`–`W3.23` (uz odobrenje endpointa).
- **Interpolacija `error.message` u 90 warn mjesta** nije prepisana: centralna redakcija i granica je čine bezbjednom
  danas, a `describeException` je dostupan za postepenu migraciju. Nije tvrđeno da je migracija završena.
- **`console.*` u CLI-ju** ostaje: to je izlaz komande koju operator čita, i namjerno je van skenera.

## Napomena o lokalnoj verifikaciji (okruženje)

U ovoj sesiji `prisma generate` nije izvodljiv: CLI traži `schema-engine` sa `binaries.prisma.sh`, koji sandbox ne
doseže (isti zid kao `prisma migrate deploy` u W1.5). Zato su lokalno izvršeni samo suiteovi koji ne učitavaju
generisani klijent — `src/common/logging` (**30**) i `src/common/request-context` (**41**) — plus `eslint` i `tsc` na
izmijenjenim fajlovima. Pune suiteove (uključujući četiri modula sa izmijenjenim log pozivima) izvršava CI, i tamo je
dokaz; ovdje se ne tvrdi da su lokalno prošli.

## Registar nalaza

- Zatvoreno: `BA-xcut-20` (uz zeleni CI i gornji dokaz; bez migracije, bez novih ruta i env varijabli).
- Time je **Val 1 (W1.5–W1.7) zatvoren**; sljedeći val je Val 2 po redu iz plana.
