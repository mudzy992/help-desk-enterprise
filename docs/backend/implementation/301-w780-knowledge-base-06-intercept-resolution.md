# W7.80 — `BA-knowledge-base-06`: deflection je tvrdnja koja se provjerava

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Intercept resolution prihvata foreign scope i hidden/unpublished article ID”<br>
**Kod:** `backend/src/modules/knowledge-base/resolve-knowledge-intercept.ts` (prepisano),
`knowledge-base-discovery.service.ts` (kontekst + konfiguracija), `create-in-memory-knowledge-prisma.ts`
(`findMany` nad resolutionima za dokaz), `knowledge-base.intercept-resolution.spec.ts` (novo)<br>
**DB migracija:** nema<br>
**CI:** [`44934728908`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44934728908)

## Nalaz

`POST /knowledge-base/intercept/resolve` prima `{ serviceId, organizationalUnitId, articleId? }` i upisuje
`KnowledgeInterceptResolution` — red iz kojeg izvještaji broje **deflection** („tiket nije ni otvoren jer je
baza znanja pomogla”). Endpoint nije učitavao autorizacijski kontekst; provjeravao je samo **postojanje**:

| Provjera prije | Posljedica |
| --- | --- |
| `serviceId` postoji | korisnik može upisati deflection za **servis koji ne koristi i ne vidi** |
| `organizationalUnitId` postoji | može ga upisati za **tuđu jedinicu** — brojevi u izvještaju te jedinice su tuđi |
| `articleId` postoji | može „pripisati” **DRAFT**, **ARCHIVED** ili članak koji ne smije čitati |
| nepostojeći članak → `NOT_FOUND` | različit odgovor za „ne postoji” i „ne vidiš ga” ⇒ **potvrda postojanja** ID-a |

Sve to je potrošeno u analytics: `buildReportsDashboard` broji resolutione po jedinici
(`organizationalUnitId: { in: scoped }`), pa je jedan autentificiran zahtjev mogao pomjeriti tuđe KPI-jeve, a
`INSERT` je jedini dokaz da se nešto dogodilo — nema audita koji bi ga razotkrio.

## Rješenje

Resolution je **tvrdnja o prošlosti** („ovaj članak mi je odgovorio prije tiketa”), pa se sada provjerava kao
tvrdnja, a ne prima na riječ. Redoslijed provjera je namjeran (svaka je prije jedinog `create`):

1. **Kontekst.** `loadKnowledgeActorContext` — bez prijavljenog aktera nema ni upisa (i prije je bio zaštićen
   guardom, ali sada odluka stvarno koristi kontekst).
2. **Feature je uključen.** Ako `private.addons.kbIntercept` nije uključen, sugestija nije ni bilo, pa nema šta
   da se razriješi → `FORBIDDEN`. Time brojevi ne mogu rasti za funkciju koja je isključena.
3. **Servis i jedinica postoje** (`SERVICE_NOT_FOUND`, `ORGANIZATIONAL_UNIT_NOT_FOUND`) — isti ugovor kao prije;
   katalog servisa i stablo jedinica nisu tajna, pa ove dvije greške ostaju.
4. **Jedinicu akter smije zastupati** — `homeUnitId === organizationalUnitId` **ili**
   `canManageTicketsInScope({ context, originUnitId, originUnitPath, serviceId })` **ili** SuperAdmin. To je
   **isto pravilo koje `assertCanCreateTicket` primjenjuje**: deflection je tiket koji nije otvoren, pa ga smije
   zabilježiti onaj ko bi ga smio otvoriti. Običan korisnik zastupa svoju matičnu jedinicu; agent/admin jedinicu
   i servis koje pokriva dodjela; tuđa jedinica → `FORBIDDEN`.
5. **Članak je stvaran, objavljen, iz traženog servisa i čitljiv.** Jedan `findUnique` po `id`, pa:
   `serviceId` se mora poklapati sa prijavljenim servisom (inače deflection pripisuje servis koji nije odgovorio),
   `status` mora biti `PUBLISHED` (`ARCHIVED` je status, pa ispada istom provjerom), i
   `isKnowledgeArticleVisibleTo(prisma, actor, article, configuration)` mora vratiti `true` — **isti predikat**
   koji koriste detalj, `/search`, lista, portal i feedback, uključujući W7.79 INTERNAL publiku.
6. **Nema oracle-a.** Nepostojeći ID, tuđi servis, nacrt, arhiva i skriveni članak daju **istu** grešku
   `FORBIDDEN`. `NOT_FOUND` iz ovog puta nestaje, pa endpoint ne može potvrditi postojanje članka.

Ako bilo koja provjera padne, **ništa se ne upisuje** — nema „upisa pa provjere”, pa nema ni djelimičnog reda u
analytics.

### Zašto ne „intercept token”

Audit je nudio dvije opcije: vezivanje uz prethodni intercept token ili puna scope/visibility/status provjera.
Odabrana je **provjera**, iz tri razloga:

1. **Nema novog stanja.** Token bi tražio potpisani ključ (novi secret u env-u), TTL, replay zaštitu i novu
   tabelu ili keš — i sve to da bi se reklo isto što i postojeće činjenice: ko je akter, šta smije i šta članak
   jeste. Token bi uz to istekao tačno kad korisnik najduže čita članak, tj. kaznio bi upravo onaj slučaj koji
   mjerimo.
2. **Jedno pravilo.** Provjera koristi `canManageTicketsInScope` i `isKnowledgeArticleVisibleTo` — nijedno novo
   pravilo vidljivosti se ne uvodi, pa nema druge kopije koja može odlutati (to je bila tema W7.49–W7.60).
3. **Odbrana je i dalje potpuna za ono što analytics tvrdi.** Token bi dokazao „ovo je iz ove sesije”, ali ne bi
   dokazao da je članak iz tog servisa i da ga akter smije čitati; provjera dokazuje oboje.

### Cijena

Jedan `user.findUnique` (matična jedinica) + `loadOrganizationalUnitPath` (samo kad matična jedinica ne pogodi) +
jedan `knowledgeArticle.findUnique` + standardni visibility batch nad jednim redom. To je 2–5 primarnih ključeva
po zahtjevu, na akciji koja se dogodi jednom po korisniku — zanemarivo prema tome da analytics ostane tačan.

## Namjerne odluke (trade-off)

1. **`FORBIDDEN` umjesto `NOT_FOUND` za nepoznat članak.** Namjerna promjena ugovora: bez nje endpoint ostaje
   oracle. Klijent ionako tretira neuspjeh kao „telemetrija nije prošla” (web forma i Teams gutaju grešku).
2. **Deflection za tuđu jedinicu nije dozvoljen običnom korisniku**, iako je „statistika”. Granica nije tajnost
   nego tačnost: izvještaj jedinice X ne smije rasti zato što je korisnik iz Y kliknuo „pomoglo mi je”.
3. **Nema deduplikacije.** Dvostruki klik i dalje upisuje dva reda; analytics to zove „deflections”, ne „users”,
   a idempotencija bi tražila ključ sesije/tiketa — to je područje `BA-knowledge-base-08` (from-reply
   idempotencija) i nije dio ovog nalaza. Dokumentovano kao preostali rizik.
4. **Feature switch zatvara upis.** Alternativa je bila da se resolution primi i kad je addon isključen („možda
   je isključen u međuvremenu”); odbijeno, jer bi tada brojevi rasli za funkciju koja ne postoji na ekranu.

## Direktni testni dokaz

`knowledge-base.intercept-resolution.spec.ts` (**10 testova**, novo):

- upis za vlastitu jedinicu prolazi i red stvarno postoji (`findMany`);
- upis sa člankom pamti **taj** `primaryArticleId` (ne prvi iz sugestija);
- običan korisnik sa matičnom jedinicom HR **ne** može upisati deflection za IT → `FORBIDDEN` i **nula redova**;
- agent IT upisuje za IT jedinicu (dodjela pokriva OU + servis), agent HR ne može → `FORBIDDEN`, nula redova;
- članak drugog servisa, `DRAFT` i `ARCHIVED` → `FORBIDDEN`, nula redova;
- `CONFIDENTIAL` članak koji korisnik ne vidi i **nepostojeći** ID daju **istu** grešku (`FORBIDDEN`) — nema
  oracle-a, nula redova;
- korisnik **bez matične jedinice** ne može upisati ni za jednu jedinicu;
- SuperAdmin može za bilo koju jedinicu;
- uz isključen `interceptEnabled` → `FORBIDDEN` i `count = 0`;
- `SERVICE_NOT_FOUND` i `ORGANIZATIONAL_UNIT_NOT_FOUND` ostaju netaknuti i ne ostavljaju red.

Ostalo: `modules/knowledge-base` **21 suite/112 testova**, `knowledge-base` + `teams` **27 suite/208 testova**
(Teams `deflect` šalje matičnu jedinicu, pa prolazi kroz isto pravilo), `eslint` zelen.

## CI i testni dokaz

CI run [`44934728908`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44934728908) na `1e463ba` je
**success**:

- **Backend build + test:** uspješno (`prisma validate`, `db:generate`, `check:prisma-generated`, `wiring`,
  `build`, `lint`, `test:safety-net:compile`, `test:wiring`, `test:sla:matrix`, puni `npm test`).
- **Backend PostgreSQL + Redis integration:** uspješno.
- **Frontend build + test:** uspješno (ugovor `intercept/resolve` nije mijenjan u tijelu zahtjeva).
- **Backend container + supply chain**, **Docs guard**, **CI gate:** uspješno.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-06` (P2). Modul je time **7/19** (`01`–`06`, `11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 12 nalaza, **P1: nema** (`07`–`10`, `12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 298 zatvoreno / 398 otvoreno**; Val 7 **77/111**, otvoreno
  **34** (P1 0 / P2 20 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Ugovorna promjena: `POST /knowledge-base/intercept/resolve` vraća
`FORBIDDEN` (403) tamo gdje je prije vraćao `NOT_FOUND` (404) ili upisivao red; oba klijenta (web forma i Teams
`deflect`) neuspjeh već tretiraju kao best-effort telemetriju. Rollback: revert `1e463ba` vraća neprovjereni upis;
nema podataka za vraćanje.

**Preostali rizik (dokumentovan):** postojeći redovi upisani prije ove provjere nisu revidirani — analytics
historijski može sadržavati deflectione za tuđe jedinice/servise i za skrivene članke. Deduplikacija dvostrukih
klikova nije dio paketa.

## Sljedeći paket

**W7.81 — `BA-knowledge-base-07` (P2).**
