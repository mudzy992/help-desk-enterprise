# Package closeout — W7.61

**Paket:** nema query-plan/perf dokaza za `contains` nad korisničkim imenom/e-mailom i KB naslovom<br>
**Nalaz:** `BA-search-07` (P2) — **zatvoren**<br>
**Kodni commit:** `c255f60` (prvi pokušaj `6536fa0`) <br>
**Finalni testani SHA:** `c255f60`<br>
**CI:** [`44588559592`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44588559592) — zelen<br>
**DB migracije:** **nema** — trigram indeks nad `User` je predložen, ali **nije primijenjen** (traži izričito odobrenje)

## Nalaz i acceptance

Audit `27-search.md` §7: „Posebno su skupi wildcard-style `contains` upiti bez dokazanog trigram/index plana za
user i KB title.” Do sada je postojao samo kod i namjera — nijedan plan, broj pregledanih redova ni mjerenje.

Acceptance: za oba skena postoji **izvršni dokaz na realnoj šemi** koji pokazuje šta planer stvarno radi, i
odluka (indeks da/ne) je eksplicitna umjesto pretpostavljena. Migracija nije odobrena, pa paket **ne** mijenja
šemu; isporučuje mjerenje i predlog.

## Šta je izmjereno

Novi real-PostgreSQL suite `backend/src/modules/search/search-query-plan.integration.spec.ts` (u
`integrationSpecs`, dakle u CI jobu „Backend PostgreSQL + Redis integration”) puni **12.000 korisnika i 12.000
članaka**, pokreće `ANALYZE`, pa mjeri `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` nad **tačno onim SQL-om koji
Prisma izdaje** za modul — i svaki test pored plana izvrši i Prisma upit i tvrdi da oba vraćaju iste redove, pa
plan ne može opisivati neki drugi upit.

| Sken | Plan | Pregledani redovi | Vrijeme (CI) |
|---|---|---|---|
| `User.displayName`/`email` (`ILIKE '%needle%'`) | `Seq Scan` (predikat je filter, ne index cond) | **cijela tabela** (≈ 12.000) | ≈ 14 ms |
| `KnowledgeArticle.title` — default cost model na 12k redova | `Seq Scan` | cijela tabela | ≈ 7 ms |
| `KnowledgeArticle.title` — isti upit uz `enable_seqscan = off` | `Bitmap Index Scan` na `KnowledgeArticle_title_trgm_idx` | proporcionalno pogodcima (≪ 12.000) | ≈ ms |

Zaključci koje dokaz podržava:

1. **Imenik nema trigram indeks.** `pg_indexes` za `User` ne sadrži nijedan `gin_trgm_ops`; `email` je samo
   unique B-tree, a B-tree ne može odgovoriti na vodeći wildcard. Jedan pogodak i dalje košta prolaz kroz cijelu
   tabelu, a cijena raste linearno s veličinom direktorija.
2. **KB naslov indeks ima i indeks je upotrebljiv.** `KnowledgeArticle_title_trgm_idx`
   (`gin_trgm_ops`, migracija `20260923140000_search_trigram_indexes`) postoji, a isti upit uz
   `enable_seqscan = off` planer rješava bitmap indeksom sa čitanjem proporcionalnim pogodcima. Time je odvojeno
   **„indeks može poslužiti predikat”** (osobina šeme, dokazano) od **„planer preferira sken na 12k redova”**
   (odluka o cijeni koja se mijenja s veličinom tabele) — dvije stvari koje su se ranije miješale u jedno pitanje.
3. **Na 12k redova sken je legitiman.** 12k redova staje u nekoliko stotina stranica i cijeli sken traje ~7–15 ms
   u CI kontejneru; problem nije današnja latencija nego oblik cijene. Zato je preporuka indeksa opravdana
   skaliranjem, ne trenutnim SLO-om.

Endpoint-nivo dokaz već postoji i nije mijenjan: `PERF_BUDGETS.md` drži `/search` na **p95 < 200 ms**, a
izmjereno je **25 ms** na seedanim podacima; DB-upita po `/search` zahtjevu = **3,00** (kapija 2,1 je globalna).
Ovaj paket dodaje plan-nivo koji je nedostajao.

### Zašto mjerenje, a ne indeks

Trigram indeks nad `User` je **schema promjena** i po pravilu repozitorija traži **migraciju**, a migracija traži
**izričito odobrenje** koje za ovaj paket nije dato. Bez odobrenja paket ostaje na dokazu i predlogu, kako je
unaprijed dogovoreno. Predlog (nije primijenjen, čeka odobrenje):

```sql
CREATE INDEX CONCURRENTLY "User_displayName_trgm_idx" ON "User" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX CONCURRENTLY "User_email_trgm_idx" ON "User" USING gin ("email" gin_trgm_ops);
```

Uz to bi `prisma/schema/identity.prisma` dobio dva `@@index([...], type: Gin, map: ...)` unosa sa
`ops: raw("gin_trgm_ops")` (isti obrazac kao `Ticket`/`KnowledgeArticle`/`Asset`), a `pg_trgm` je već instaliran
istom migracijom koja je uvela KB indeks. Efekat: pregledani redovi padaju s `O(veličina direktorija)` na
`O(pogodci)`; na 12k redova dobitak je mali, na 100k+ sken postaje dominantan. Migracija ne mijenja podatke i
rollback je `DROP INDEX` (dvije linije), ali ostaje migracija.

**Interim zaštita koja već postoji:** W7.59 budžet (30/min po actoru, 60/min po adresi) ograničava broj skupih
skenova po minuti, a W7.55 OU-predikat sužava direktorijski sken na caller-ov subtree (sken je i dalje sken, ali
nad manjim skupom).

## Dokaz

- `search-query-plan.integration.spec.ts` (2 testa): direktorijski plan (pregledani redovi ≥ 90 % korpusa dok
  trigram indeksa nema; `Filter` sadrži `~~*`) i KB plan (indeks postoji u `pg_indexes`; default plan se mjeri i
  loguje; uz `enable_seqscan = off` plan koristi `KnowledgeArticle_title_trgm_idx` i čita < 20 % korpusa).
  Pored toga oba testa tvrde **paritet Prisma-vs-raw** redova.
- Registracija u `scripts/run-isolated-integration.mjs` + test u `scripts/run-isolated-integration.test.mjs`
  (21/21 zeleno) — bez toga se suite ne bi izvršio u CI-ju.
- Lokalno: `modules/search` 7 suite/58 testova zeleno (integracijski suite je `describe.skip` bez
  `PRIVACY_IT_DATABASE_URL`), `tsc --noEmit` bez nove greške, `eslint` čist.
- **Mjerenja su iz CI-ja**, jer sandbox nema PostgreSQL: prvi pokušaj (`6536fa0`) pokazao je plan `Seq Scan` na
  oba skena i vrijeme 14,3 ms / 6,9 ms, ali je pao na dvije sopstvene greške u mjerenju (JSON polje se zove
  `Rows Removed by Filter`, bez `Actual` prefiksa — pa je „pregledani redovi” bio 1; i pretpostavka da planer na
  12k redova bira indeks). Ispravljeno u `c255f60`.

## CI

[`44588559592`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44588559592) na `c255f60` —
**success**: backend build/lint/full Jest, **PostgreSQL + Redis integracija sa novim plan-suiteom**, frontend
lint/format/testovi/build/bundle, Docs guard, container/supply-chain i CI gate. E2E install wizard, E2E critical
flows i read-only inventory `skipped` (E2E pokreće korisnik). Perf smoke na `6536fa0`
([`44585792518`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44585792518)) je zelen, uz
`/search` = 3,000 upita po zahtjevu.

## Registar nalaza

- Zatvoreni: `BA-search-07` (P2).
- Ostaju otvoreni u `27-search.md`: 6 nalaza, **P1: nema** — P2: `BA-search-08` (partial/fail-closed ugovor);
  P3: `09` (stable order), `10` (`ArrayUnique`), `11` (telemetrija), `12` (confidential/arhiva), `13` (E2E).

## Rollout, rollback i preostali rizik

Nema šeme, konfiguracije ni runtime promjene — paket dodaje samo test i njegovu registraciju. Rollback: revert
`c255f60` (nestaje dokaz, ne ponašanje). Rizik: (1) **direktorijski sken ostaje O(N)** dok migracija nije
odobrena — raste sa veličinom imenika, a ublažen je budžetom (W7.59) i OU scopeom (W7.55); (2) **mjerenje je na
12k redova** — zakon skaliranja je dokazan oblikom plana, ne mjerenjem na 100k+ (skupo u CI-ju); (3) **planer
nije obavezan** koristiti indeks ni kad postoji — buduća migracija mora doći s vlastitim plan-dokazom (isti
suite, obrnut branch: „ako indeks postoji, pregledani redovi moraju pasti”); (4) `contains` na `Ticket.title`/
`ticketNumber` i `Asset.name`/`assetTag` ima trigram indekse, ali njihovi planovi nisu dio ovog paketa.

## Sljedeći paket

`BA-search-08` (P2) — jedan kvar zavisnosti ruši sve tri grupe, bez definisanog partial/fail-closed ugovora.
Odluka koju paket mora donijeti: **autorizacijska greška je uvijek fail-closed**, a dostupnosni kvar tražene
grupe smije biti kontrolisani partial sa eksplicitnim `incomplete`/`failedGroups` ugovorom u odgovoru i UI-ju.
