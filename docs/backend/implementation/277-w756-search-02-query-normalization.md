# Package closeout — W7.56

**Paket:** W7.56 — upit se normalizuje prije validacije (whitespace/NFKC bypass)<br>
**Nalaz:** `BA-search-02` (P2) — **zatvoren**<br>
**Kodni commit:** `989ad15`<br>
**Finalni testani SHA:** `989ad15`<br>
**CI:** [`44538644741`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44538644741) — zelen (10m57s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §3 (i §11): `SearchQueryDto.q` je imao `@MinLength(2)` i `@MaxLength(200)` **na sirovom
stringu**, a `toSearchQuery` je trimovao tek poslije. Zato su prolazili:

- `?q=%20%20` (dvije praznine) → effective query `''`;
- `?q=%20a` (praznina + jedan znak) → effective query `'a'`;
- dva zero-width karaktera (`U+200B`), koji nisu whitespace za `trim()`;
- jedan emoji (`👍` = dvije UTF-16 jedinice, jedan znak) → prošao `MinLength(2)`;
- kompatibilni oblici (`ＶＰＮ`, ligatura `ﬁ`) — različit needle za vizuelno isti upit.

Posljedica: prazan `contains` vraća najnovije vidljive tikete/članke i najširi user set, protivno ugovoru i
zaštiti od skupih upita.

Acceptance (audit §14.2): **effective normalizovan upit kraći od dva znaka uvijek se odbija.**

## Implementacija

- **Novi `normalize-search-query.ts`** — jedno pravilo, dva pozivaoca (DTO i servis), redoslijed je dio
  ugovora: (1) `NFKC` kompatibilno preslikavanje (`ﬁ`→`fi`, `ＶＰＮ`→`VPN`, dekomponovano `e`+akut→`é`),
  (2) uklanjanje format/zero-width karaktera (`U+200B–U+200F`, bidi kontrole, word joiner, BOM) — nisu sadržaj i
  ne smiju dati dužinu, (3) kontrolni karakteri (`\p{Cc}`) postaju razmak, (4) svi nizovi whitespacea se
  svode na jedan razmak, (5) `trim()`. Funkcija je **idempotentna**.
- **Dužina se broji u karakterima (code point), ne u UTF-16 jedinicama**: `👍` je jedan znak i odbija se,
  `👍👍` prolazi.
- **`SearchQueryLengthConstraint`** (novi `search-query.constraints.ts`) zamjenjuje `@MinLength/@MaxLength` i
  validira **normalizovanu** vrijednost preko `@Transform` na `q` (transform ide prije validacije). Poruka
  greške imenuje oba granika i stvarni broj znakova.
- **Gornji granik se primjenjuje poslije normalizacije**, jer NFKC može proširiti unos: `ﬁ` × 101 = 101 znaka
  na žici, 202 karaktera poslije preslikavanja → odbijeno (staro pravilo bi prošlo).
- **`toSearchQuery` ponavlja normalizaciju** (idempotentno), pa ručno konstruisan DTO ne može prokrijumčariti
  padding u servis.
- **`SearchService.search` normalizuje i odbija neupotrebljiv upit sa `400`** (isti status koji daje DTO
  validacija) — nijedan put ne dolazi do praznog `contains`; pri odbijanju se ne pokreće nijedna grupa.
- **Paleta primjenjuje isto pravilo lokalno** (`use-command-palette-search.ts`, sinhronizovano sa backend
  pravilom) i šalje normalizovan needle, pa upit koji bi API odbio ne troši zahtjev. Klijentska granica je i
  dalje prikazna: mjerodavan je server.
- **Bez migracije** — nema schema promjene.

### Namjerne odluke (trade-off)

1. **Unutrašnji whitespace se svodi na jedan razmak.** Alternativa (samo trim) bi pustila `vpn␠␠pristup` i
   `vpn␠pristup` da budu dva različita upita nad istim sadržajem. Cijena: naslov sa dva razmaka neće pogoditi
   dvostruki razmak — u praksi zanemarivo, a stabilnost i predvidivost su važnije.
2. **Code point, ne grapheme.** Audit traži „najmanje dva grapheme/code-point znaka”; NFKC prethodno komponuje
   kombinujuće sekvence, pa su za latinicu te dvije mjere iste. Grapheme-cluster brojanje (`Intl.Segmenter`) bi
   odbilo npr. `👍🏽` (emoji + modifier) kao jedan znak, što je strože nego što ugovor traži i teže objasniti.
3. **Kontrolni karakteri postaju razmak, ne brišu se.** `vpn\0pristup` tako postaje `vpn pristup` (razumljiv
   needle) umjesto `vpnpristup` (lažni pogodak).
4. **`400` iz servisa, ne tiha prazna grupa.** „Uvijek se odbija” iz acceptance znači odbijanje, ne tih
   prazan odgovor koji bi se mogao zamijeniti sa „nema pogodaka”. Status je isti kao kod DTO validacije, pa
   klijent ne vidi novu klasu greške.

## Dokaz

- `normalize-search-query.spec.ts` (novo, 9 testova): Unicode trim (NBSP, ideografski, `U+2028/2029`),
  kolaps unutrašnjeg whitespacea, uklanjanje zero-width/bidi/BOM, NFKC (ligatura, fullwidth, dekomponovani
  akcenat), kontrolni karakteri, brojanje karaktera, granice upotrebljivosti i idempotentnost.
- `search-query.dto.spec.ts` (5 novih testova): devet „padded” upita odbijeno (`'  '`, NBSP×2, ideografski×2,
  `'\n\t'`, `' a '`, ZWSP×2 + `a`, ZWSP×2 + `v`, ZWSP×2, NUL×2), emoji granica, normalizovan needle u
  `toSearchQuery`, gornji granik poslije NFKC ekspanzije, normalizacija i za ručno konstruisan DTO.
- `search.service.spec.ts` (2 nova testa): `400` za `''`, `'   '`, `' a'`, `'\u200b\u200b'` **bez ijednog**
  upita grupe; normalizovan needle (`'  ＶＰＮ␠pristup '` → `'VPN pristup'`) stiže do article grane.
- `use-command-palette-search.spec.tsx` (2 nova testa): nema zahtjeva za odbijene upite (praznine, ZWSP +
  jedan znak, jedan emoji), šalje se NFKC needle.
- Lokalno: `src/modules/search` **41 test** zeleno; pun backend suite **5034/5037** uz tri **pre-egzistirajuća
  okolinska** faila (Prisma stub `Prisma.sql` flattening u `problem-mentions.spec.ts`, sandbox storage u
  `disk-ticket-attachment-storage.streaming.spec.ts`, `announcement-delivery.spec.ts`); frontend `src/components/layout`
  **29 testova** zeleno, `prettier --check` i `eslint` čisti; backend `eslint src/modules/search` čist;
  sandbox `npm run build` nije gate (Prisma klijent je stub).

## CI

- [`44538644741`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44538644741) na `989ad15` —
  **success** (10m57s): backend build/lint/full Jest, PostgreSQL + Redis integracija, frontend
  lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install wizard,
  E2E critical flows i read-only inventory bili su `skipped` (E2E pokreće korisnik, po dogovoru).
- Prvi i jedini pokušaj; jedina ispravka prije pusha bila je ESLint `no-control-regex` nad literalnim
  kontrolnim rasponom (zamijenjen sa `\p{Cc}`), urađena lokalno prije commita.

## Registar nalaza

- Zatvoreni: `BA-search-02` (P2).
- Ostaju otvoreni u `27-search.md`: 11 nalaza, **P1: nema** — P2: `BA-search-03`/`04` (KB kandidati i
  minimalna projekcija), `05` (rate limit/anti-enumeration), `06` (KB owner/reviewer scope), `07` (query
  plan), `08` (partial/fail-closed ugovor); P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija),
  `12` (confidential/arhiva test), `13` (E2E za `/search`).

## Migracija, rollout i rollback

Nema migracije. Ugovor je stroži: upit bez dva znaka sadržaja sada vraća `400` umjesto `200` sa najnovijim
redovima; paleta takav upit više ne šalje. Rollback: revert `989ad15` vraća staro (raw) pravilo dužine; nema
podataka za vraćanje.

**Preostali rizik (dokumentovan):** (1) ugovorna promjena — stariji klijenti koji su slali jednoslovni upit
dobijaju `400` (prije su dobijali širok, ali pogrešan rezultat); (2) klijentsko i serversko pravilo su dvije
implementacije iste norme (frontend ne može uvoziti backend kod) — sinhronizacija je pokrivena testovima na
obje strane, ali buduća izmjena mora dirati oba fajla; (3) rate limit/anti-enumeration (`BA-search-05`) i
stabilan redoslijed (`BA-search-09`) nisu dio ovog paketa.

## Sljedeći paket

Sljedeći P2 u `27-search.md` je `BA-search-03` (KB kandidati prije scope filtera) — otvara se kao W7.57.
