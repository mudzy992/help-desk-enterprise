# W1.6 — `BA-xcut-18`: request ID ima trust policy, pa ne može ući u log, envelope ni audit lanac kao neograničen string

**Paket:** Val 1, cross-cutting (observability/trust boundary), **P2**<br>
**Nalaz:** „Request ID je neograničen untrusted input u logovima/envelopeu”<br>
**Kod:** `src/common/request-context/request-id.policy.ts` (**novo**), `read-request-id-header.ts` (jedini ulaz za
header), `request-context.storage.ts` (`runWithRequestId`), `request-metrics.middleware.ts` (vlastiti raw reader
uklonjen), `src/modules/audit-log/audit-event-policy.ts` (envelope)<br>
**Specovi:** `request-id.policy.spec.ts` (**novo, 5 testova**), `resolve-request-id.spec.ts` (+2),
`request-id.middleware.spec.ts` (+2), `request-id-correlation.spec.ts` (+1), `request-metrics.middleware.spec.ts` (+2),
`audit-event-policy.spec.ts` (+1)<br>
**DB migracija:** **nema** (kolone `requestId` ostaju `String?`; ograničenje je na ulazu, ne u šemi)<br>
**Rute:** nepromijenjene (632)<br>
**Env:** nema novih varijabli

## Nalaz

Audit (`44-cross-cutting-infrastructure.md` §9) je bio konkretan: `x-request-id` je bio **proizvoljan ne-prazan
string** koji je ulazio u sistem bez ijednog ograničenja. Posljedice nisu bile teorijske:

1. **Ograničenje dužine nije postojalo nigdje.** Header od 8 KB je završavao u `X-Request-Id` response headeru, u
   error envelope-u (`requestId`), u `recent-request-log` baferu (50.000 zapisa u memoriji) i — najgore — u
   `audit_log.requestId`, koloni koja je **hash-bound**: vrijednost ulazi u lanac i ostaje tamo.
2. **Charset nije bio provjeren.** Vrijednost sa kontrolnim znakom (`\r\n`) je dolazila do `response.setHeader`, gdje
   Node baca — dakle mjesto gdje je trebalo biti „samo loše korelacije” postajalo je **500 na svakom zahtjevu**, sa
   unosom koji kontroliše klijent.
3. **Dva čitača, dva različita odgovora.** `RequestIdMiddleware` je čitao header kroz `readRequestIdHeader`, a
   `RequestMetricsMiddleware` je imao svoj privatni `readRequestId` koji je uzimao **sirovu** vrijednost i stavljao je u
   `query_budget_exceeded request_id=…` warn liniju i u ključeve DB query trace mape.

Nalaz je P2: nije eskalacija privilegija, ali jeste (a) injection u log/envelope, (b) rast audit lanca koji se ne može
obrisati, (c) DoS putanja preko header-writera.

## Odluka

**Jedna politika, primijenjena na svakom mjestu koje vrijednost prima; neispravna vrijednost se zamjenjuje, ne odbija i
ne skraćuje.**

```
requestIdMaxLength = 128
requestIdPattern   = /^[A-Za-z0-9._:-]+$/u     (trim, pa provjera)
sanitizeRequestId(value: unknown): string | null
```

Tri namjerne odluke:

- **Zamjena, ne 400.** Odbijanje bi slomilo svakog klijenta iza proxyja koji šalje svoj dugačak id; korisnik bi dobio
  grešku zbog headerа koji nije ni poslao. Umjesto toga vrijednost koja ne prolazi politiku **nikad ne uđe** u sistem i
  generiše se `randomUUID()` — korelacija unutar sistema uvijek postoji i uvijek je naša.
- **Bez skraćivanja.** Skraćivanje na 128 znakova bi dva različita zahtjeva tiho spojilo pod isti id, što je gore od
  gubitka klijentskog id-a (lažna korelacija izgleda kao dokaz).
- **Trim, ali bez „popravljanja”.** Okolni whitespace se uklanja (` 'req-1\n'` → `req-1`), sve ostalo van charseta je
  razlog za zamjenu. Nema Unicode normalizacije, nema lowercase-anja, nema izmišljanja UUID-a iz heša napadačevog
  stringa — heš bi bio stabilan identifikator koji napadač može birati.

Charset je namjerno uzak (`. _ : -`): pokriva UUID, `req-1`, `trace:span`, `svc_42.v2`, a isključuje sve što bi
tražilo escaping u logu, headeru ili JSON-u.

## Implementacija

### 1. Politika — `request-id.policy.ts`

`requestIdMaxLength`, `requestIdPattern`, `sanitizeRequestId`, `isWellFormedRequestId`. Funkcija prima `unknown`, jer
header može doći kao string, niz ili broj; sve osim stringa je `null`.

### 2. Ulaz — `read-request-id-header.ts`

Jedini čitač headera (i `readAuditRequestId` alias za reports/support-bundle). Promjene:

- svaka vrijednost prolazi `sanitizeRequestId`;
- duplikat headera (Node ih spaja sa `, `) se **siječe na prvi segment** — to je ono što tracer iza proxyja očekuje, a
  spojeni string bi ionako pao politiku;
- niz vrijednosti uzima prvi ne-prazan string.

### 3. Kontekst — `request-context.storage.ts`

`runWithRequestId` sada pušta u AsyncLocalStorage samo vrijednost koju politika prihvata; u suprotnom generiše UUID.
Time je **svaki** čitač konteksta (`prefixRequestId`, error envelope, audit policy, DB instrumentation, metrics)
zaštićen jednim mjestom, uključujući workere i skripte koje zovu `runWithRequestId` direktno, bez HTTP-a.

### 4. Metrike — `request-metrics.middleware.ts`

Privatni `readRequestId` je obrisan; middleware koristi isti `readRequestIdHeader`. `query_budget_exceeded` linija više
ne može sadržavati sirov header, a ključevi DB query trace mape su ograničeni na isti charset.

### 5. Envelope — `audit-log/audit-event-policy.ts`

`requestId` u audit redu je sada `sanitizeRequestId(input.requestId ?? getRequestId() ?? null)`. Redoslijed je
namjeran: kontekst je već očišćen, pa ovo hvata samo **buduće** pozivaoce koji proslijede sirov string (npr. novi
kontroler koji pročita header sam). Takav red dobija `null` umjesto neupotrebljive vrijednosti — red se i dalje piše,
lanac ostaje konzistentan, a korelacija se ne lažira. Auditu je važnije da radnja bude zapisana nego da nosi id koji se
ne može pročitati.

## Direktni testni dokaz

- `request-id.policy.spec.ts` (5) — prihvata oblike koje traceri šalju (uključujući tačno 128 znakova), trim, odbija
  129 znakova **i dokazuje da se skraćeni prefiks ipak prihvata** (dakle nema tihog skraćivanja), odbija kontrolne
  znakove/CRLF/zarez/razmak/ne-ASCII/`<script>`, odbija sve ne-string tipove.
- `resolve-request-id.spec.ts` (4) — validan header se reciklira; **neispravan se zamjenjuje UUID-om i original se ne
  pojavljuje u rezultatu** (5 slučajeva: 129 znakova, CRLF, ćirilica, razmak, prazno); spojen duplikat daje prvi
  segment, niz daje prvi element, `x-requestid` legacy varijanta radi; prazan header daje UUID.
- `request-id.middleware.spec.ts` (4) — normalan prolaz; **hostile id se ne reflektuje** ni u request header ni u
  `X-Request-Id` ni u ALS (i `setHeader` nikad ne vidi `Set-Cookie` iz napadačevog stringa — što je ranije bacalo
  izuzetak); 4.096-znakovni id izlazi kao ≤128; prazan header daje generisani id.
- `request-id-correlation.spec.ts` (3) — 5xx stack ostaje u primarnoj log liniji; **`runWithRequestId('bad\r\nid')` u
  store stavlja generisani UUID**, pa svaki čitač vidi ispravan id.
- `request-metrics.middleware.spec.ts` (9) — u produkcijskom redoslijedu (request-id middleware prvi) warn linija nosi
  generisani UUID; **bez** request-id middleware-a linija kaže `request_id=unknown`, a sirovi `Injected` string se ne
  pojavljuje ni u jednom slučaju.
- `audit-event-policy.spec.ts` (20) — kontekst sa 400-znakovnim id-om daje validan UUID u redu umjesto sirove
  vrijednosti; eksplicitno proslijeđen `req\r\nInjected: 1` daje `null`; čist `edge-1` prolazi nepromijenjen.

## CI i testni dokaz

Run [`45420849606`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45420849606) na `4d71f71` — **zelen** iz
prvog pokušaja:

- **Detect / Docs guard:** zeleni (docs guard čita i `338` stranicu i dodatak u auditu 44).
- **Backend build + test:** zeleno. Lokalno: **pun Jest 965 suite / 5.690 testova**, 0 padova (13 testova više nego u
  W1.5: 5 novih u `request-id.policy.spec.ts` + 8 dodanih u postojeće specove).
- **Backend PostgreSQL + Redis integration:** zeleno — nema migracije, pa nema ni nove šeme za harness.
- **Frontend build + test, Backend container + supply chain, CI gate:** zeleni i nepromijenjeni (paket nema frontend
  dodira; nema nove audit akcije ni polja, pa parity testovi nemaju šta tražiti).
- **E2E (critical flows, install wizard) i service-form inventory:** `skipped`. Razlog je stvaran, ne praktičan: nema
  korisniku vidljive promjene — `X-Request-Id` izgleda isto, a promjena se vidi samo na neispravnom ulazu. Browser
  dokaz ne bi ništa tvrdio što unit testovi već ne tvrde; dispatch bi trošio demo stack bez pokrivanja novog koda.
- Lokalno: `tsc --noEmit` (jedina greška je **pre-existing** `announcement-delivery.spec.ts` TS2835, nepromijenjen u
  ovom paketu), `eslint --max-warnings=0` na `src/common/request-context` + `src/modules/audit-log`,
  `check-docs-content` OK (32 stranice, 8 prevoda, 10 provjera), `audit:traceability` regenerisan — **334 zatvoreno /
  362 otvoreno**.

## Granica paketa

- **Centralni structured log redaction i exception sanitizer** ostaju `BA-xcut-20` (**W1.7**) — ovaj paket ograničava
  jedno polje (request id), ne sadržaj log poruka.
- **Meta-podaci koje audit upisuje** (payload, allowlist) nisu dirani; njihov ugovor je već zaključan u audit registryju.
- **Recent request log bafer** ostaje in-memory i po replici — to je `BA-xcut-18`-u srodan, ali odvojen nalaz u §9 i ne
  rješava se ovdje.
- **Validacija na ingress-u (proxy/WAF)** nije dio ovog paketa: aplikacija sada ne vjeruje headeru, pa je guard
  deployment-nezavisan. Proxy koji i dalje prosljeđuje ogroman id ne može ništa pokvariti — aplikacija ga zamjenjuje.

## Registar nalaza

- Zatvoreno: `BA-xcut-18` (uz zeleni CI i gornji dokaz; bez migracije, bez novih ruta i env varijabli).
- Ostaje otvoreno iz istog klastera: `BA-xcut-20` (W1.7 — centralni log redaction/exception sanitizer).
