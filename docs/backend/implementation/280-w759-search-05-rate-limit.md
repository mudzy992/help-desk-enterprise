# Package closeout — W7.59

**Paket:** W7.59 — endpoint nema server-side rate limit ni anti-enumeration zaštitu (distribuirani budžet po actoru/IP-u + fail-closed)<br>
**Nalaz:** `BA-search-05` (P2) — **zatvoren**<br>
**Kodni commit:** `4b15dfa` (funkcionalni `12b5825`, manifest `a208aab`, log-throttle `4b15dfa`)<br>
**Finalni testani SHA:** `4b15dfa`<br>
**CI:** [`44567637578`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44567637578) — zelen (17m00s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §7 (i §11): `GET /search` nije imao **nikakav** server-side budžet. Browser debounce nije
kontrola — direktni klijent može poslati neograničen broj zahtjeva, a svaki zahtjev pokreće tri grupe
(auth/authorization + do 200 KB kandidata + ticket/directory upiti). `contains` nad imenom/e-mailom i naslovom
bez limita omogućava brzu prefix/substring **enumeraciju** imenika i naslova; jedina preostala barijera bila je
permisija `user.directory.read` (W7.55).

Acceptance (audit §14.5 i §14.6): **endpoint ima distribuiran bounded rate/query budget**, a security greška se
nikad ne pretvara u „dozvoljeno”. Zahtjev korisnika je to precizirao: *distribuirani token bucket po actoru/IP-u
+ fail-closed ponašanje*.

## Implementacija

- **Dva fiksna prozora po zahtjevu** (`search-rate-limit.ts`):
  - **actor** (`search:rate:actor:v1:<digest>`) — subject sesije; sprječava da jedna osoba enumerira sadržaj i
    da drugi tab ili novi token daju veći budžet;
  - **adresa** (`search:rate:ip:v1:<digest>`) — `request.ip` (već razriješen kroz `TRUST_PROXY`); pokriva više
    sesija s istog hosta i drži agregat ograničenim kad su računi jeftini.
  - Oba se provjeravaju **prije** DTO validacije i prije ijedne grupne pretrage: odbijen zahtjev ne troši bazu.
- **Distribuirano, atomično**: `createRedisSearchRateLimitStore` šalje Lua `INCR` + `EXPIRE` u jednom pozivu
  (kao login limiter), pa replika koja padne između dvije komande ne može ostaviti ključ bez isteka — to je
  režim koji rate limit pretvara u trajnu blokadu.
- **Degradacija je i dalje budžet, ne fail-open**: kad Redis ne odgovori, limiter pada na **per-instance**
  in-memory brojač sa **istim brojevima**. Efektivni limit je tada `broj replika × limit` — bounded, ali ne
  globalan. Ovo je svjesno drugačije od keš-komponenti iz `ops/runbook/redis-down.md` (keševi fail-open, budžet
  ne) i runbook ima novi red koji to opisuje.
- **Fail-closed kad se odluka ne može donijeti**: ako i lokalni brojač padne, endpoint vraća
  `503 SEARCH_RATE_LIMIT_UNAVAILABLE` (`details.retryAfterSeconds`), nikad `200`. Bez verdikta bi endpoint bio
  neograničena površina za enumeraciju, pa se pretpostavka „dozvoljeno” ne koristi.
- **`429` sa `Retry-After`**: `TOO_MANY_SEARCH_REQUESTS` + `details.retryAfterSeconds` (prozor), a guard postavlja
  i `Retry-After` header iz istih detalja.
- **Guard, ne servis** (`search-rate-limit.guard.ts`): budžet se naplaćuje u
  `@UseGuards(SessionAuthenticationGuard, RoleGuard, SearchRateLimitGuard)` — poslije autentikacije (anonimni
  poziv se ne mjeri; njega rješava session guard) i prije svega skupog. Upit se ne dira, pa se ne može ni logovati.
- **Pseudonimni ključevi**: SHA-256 digest sa namespace prefiksom; ni adresa ni actor id se ne pojavljuju u Redis
  ključu (dump, slow-log ili `MONITOR` ne postaju imenik klijenata). Adresa se normalizuje (trim + lowercase) da
  varijante istog IP-a ne otvore drugi bucket.
- **Konfiguracija je deployment ugovor** (`search-rate-limit.configuration.ts`): `SEARCH_RATE_LIMIT_ENABLED`,
  `SEARCH_RATE_LIMIT_WINDOW_SECONDS`, `SEARCH_RATE_LIMIT_ACTOR_PER_WINDOW`,
  `SEARCH_RATE_LIMIT_IP_PER_WINDOW`. Default: **uključeno**, prozor 60 s, actor **30**, adresa **60**.
  Neispravna vrijednost (npr. `0`, `abc`, `12.5`) pada na **default**, nikad na slabiji limit; granice su 5–10.000
  i 10–3.600 s. Gasi se samo eksplicitnim `false`/`0`/`off`/`no` (break-glass, traži restart).
- **Paleta razlikuje budžet od praznog rezultata**: `useCommandPaletteSearch` vraća `isRateLimited` (samo za
  `429`), a komandna paleta prikazuje `palette.rateLimited` (bs/en) umjesto „nema rezultata”.
- **Bez migracije** — nema schema promjene ni perzistentnog stanja (brojači su Redis ključevi sa TTL-om).

### Namjerne odluke (trade-off)

1. **Fiksni prozor, ne token bucket sa burst kapacitetom.** Fiksni prozor (`INCR` + `EXPIRE`) je jedan atomični
   poziv i već je dokazan obrazac u repozitoriju (login limiter). Njegov nedostatak — do 2× limit na granici
   dva prozora — za ovaj endpoint nije bitan: 60 zahtjeva u minuti i dalje ne daje praktičnu enumeraciju, a
   složena token-bucket skripta bi tražila novo stanje i novi dokaz.
2. **Dva bucket-a umjesto jednog.** Samo actor: jedan host sa mnogo računa zaobilazi budžet. Samo IP: NAT-ovana
   kancelarija pati zbog jedne osobe, a napadač sa mnogo adresa zaobilazi budžet. Zajedno: actor štiti od
   pojedinca, adresa od mnoštva.
3. **Per-instance fallback umjesto fail-open ili totalnog `503`.** Fail-open bi vratio tačno nalaz iz audita;
   `503` na svaki zahtjev tokom Redis incidenta obara funkciju koja nije sigurnosno osjetljiva na dostupnost.
   Fallback drži budžet (samo pomnožen brojem replika) i to je dokumentovano u runbooku.
4. **`503`, ne `429`, kad nema verdikta.** `429` bi tvrdio „potrošio si budžet”, što bi bilo netačno i poslalo
   klijenta da čeka bez razloga; `503` govori da je riječ o dostupnosti.
5. **Guard, ne servis.** U servisu bi budžet bio naplaćen tek poslije DTO normalizacije i (kod nekih grešaka)
   poslije rada; guard je jedino mjesto koje je zajamčeno prije svega skupog.
6. **Bez captcha-e.** Login ima Turnstile jer je bránjeni resurs kredencijal; za pretragu je dovoljan budžet, a
   captcha bi korisnicima pokvarila typeahead. Anti-enumeration sloj ostaje: minimalna dužina upita (W7.56),
   `limit ≤ 25` po grupi, permisija za imenik (W7.55) i sada budžet.
7. **Bez telemetrije.** Brojači i latencija po grupi su `BA-search-11` (P3); ovaj paket ne uvodi novi metrički
   sloj, ali log linija o degradaciji je ograničena na **jednu po prozoru** (inače bi incident od hiljada zahtjeva
   proizveo hiljade linija).

## Dokaz

- **`search-rate-limit.configuration.spec.ts` (4 testa)**: default uključen; eksplicitne vrijednosti; neispravne
  vrijednosti (`0`, `-5`, `abc`, `12.5`, prazno) i prevelika vrijednost padaju na default (limit se ne može
  oslabiti); samo `false/0/off/no` gasi budžet.
- **`search-rate-limit.spec.ts` (9 testova)**: 429 sa `retryAfterSeconds` poslije 3 zahtjeva; actor bucket se
  troši prije adresnog, a treći actor na istoj adresi je odbijen adresnim budžetom; 5 paralelnih zahtjeva daje
  tačno 3 dozvoljena i 2 odbijena (nema trke); Redis put šalje dva pseudonimna ključa i degradira na lokalni
  bucket kad Redis padne (i tada 429 — nije fail-open); **503 kad brojač ne može odgovoriti**; isključen budžet ne
  dira Redis; prozor ističe (nema trajne blokade); ključevi su 64-hex digesti bez adrese/ID-a, normalizovani po
  trim/lowercase; log linija degradacije **jedna po prozoru** i bez adrese.
- **`search-rate-limit.guard.spec.ts` (3 testa)**: budžet dozvoljen pa odbijen uz `Retry-After: 60`; anonimni
  zahtjev se ne mjeri (10 poziva bez efekta); `Retry-After` se dodaje samo na odgovor budžeta.
- **Frontend**: `use-command-palette-search.spec.tsx` (+2: `429` → `isRateLimited`, uspjeh čisti flag, obična
  greška nije rate limit) i `command-palette.spec.tsx` (+1: napomena se prikazuje i nestaje).
- Lokalno: backend `src/modules/search` + `app.module.spec.ts` + `knowledge-base` **26 suite / 145 testova**
  zeleno (search: 58), `tsc --noEmit` bez novih grešaka, `eslint` čist; frontend `vitest src/components/layout`
  (32) i `src/i18n` (8 suiteova) zeleno, `prettier --check`, `tsc --noEmit` i `eslint` čisti;
  `check-env-example.mjs` (93 varijable) i `check-docs-content.mjs` zeleni.

## CI

- [`44567637578`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44567637578) na `4b15dfa` —
  **success** (16:34:34Z–16:51:34Z, 17m00s): backend build/lint/full Jest, PostgreSQL + Redis integracija,
  frontend lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install
  wizard, E2E critical flows i read-only inventory bili su `skipped` (E2E pokreće korisnik, po dogovoru).
- **Prvi run je pao** ([`44564645071`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44564645071)
  na `12b5825`) u koraku `Verify route/guard and root-module wiring snapshot`: novi guard je dio rute `/search`,
  pa je `docs/backend/backend-wiring-manifest.json` bio zastario. Ispravka: `npm run wiring:write`
  (99 controllera, 631 ruta; `/search` → `SessionAuthenticationGuard, RoleGuard, SearchRateLimitGuard`).
  Commit samog manifesta je `docs/**` ⇒ **nije pokrenuo CI** (`paths-ignore`), pa je uz njega išao i stvarni
  kod (`4b15dfa`: log-throttle degradacije + test), koji je pokrenuo gornji zeleni run.

## Registar nalaza

- Zatvoreni: `BA-search-05` (P2).
- Ostaju otvoreni u `27-search.md`: 8 nalaza, **P1: nema** — P2: `BA-search-06` (KB owner/reviewer scope iz
  audita 25), `07` (query plan), `08` (partial/fail-closed ugovor); P3: `09` (stable order), `10`
  (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E za `/search`).

## Migracija, rollout i rollback

Nema migracije. Rollout: env varijable iz `.env.example`/`backend/.env.example`; default je uključen, pa
deployment bez ijedne izmjene dobija budžet 30/60 po minuti. Rollback: `SEARCH_RATE_LIMIT_ENABLED=false` +
restart (bez promjene koda), ili revert `12b5825` (uklanja budžet i `isRateLimited` u paleti).

**Preostali rizik (dokumentovan):** (1) **legitimna granica** — skript koji legitimno radi 30+ pretraga u minuti
(integracija preko sesije) dobija `429`; limit je zato konfigurabilan po deploymentu; (2) **degradirana
distribucija** — bez Redisa budžet važi po replici (`replike × limit`), što je i dalje bounded ali nije globalno;
(3) **fiksni prozor** dopušta do 2× limit na granici prozora (prihvaćeno, vidi odluku 1); (4) budžet ne
rješava `contains` bez indeksa (`BA-search-07`) niti telemetriju (`11`); (5) `429` u paleti je samo poruka —
nema automatskog retryja ni backoff-a na klijentu.

## Sljedeći paket

Sljedeći P2 u `27-search.md` je `BA-search-06` (modul nasljeđuje KB owner/reviewer scope bypass iz audita 25) —
otvara se kao W7.60, uz ponovnu provjeru korekcija iz `25-knowledge-base.md` prije oslanjanja na centralni KB
predikat.
