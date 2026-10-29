# W7.8 — invariant za primarnu ticket-asset vezu

**Paket:** W7.8 — `BA-assets-08` — ticket primary-link invariant<br>
**Nalaz:** `BA-assets-08` (P2) — zatvoren<br>
**Implementacijski commit:** `f9a90ba057b612451a5f4868947ce32a0e73ef43`<br>
**Finalni testani SHA:** `f9a90ba057b612451a5f4868947ce32a0e73ef43`<br>
**CI:** [`40962089973`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40962089973) — zelen<br>
**DB migracija:** `20271028000000_asset_ticket_primary_invariant`

## Nalaz i tačno pravilo

Baseline je dozvoljavao više primarnih `TicketAsset` redova ili nijedan dok su ticket linkovi postojali. Servis je za link/set-primary radio demote-then-promote, a unlink je birao sljedeću vezu bez parent-ticket locka. Konkurentni link, unlink, set-primary ili merge/split copy mogli su donijeti neispravan konačni skup.

W7.8 zatvara samo `BA-assets-08`: **ticket bez asset linkova nema primary; ticket s jednim ili više linkova ima tačno jedan primary**. Ne mijenjaju se ticket/asset authorization, OU scope, API response shape, limit od 20, historija ili audit semantika drugih nalaza.

## Implementacija

- Migracija dodaje partial unique indeks `TicketAsset_one_primary_per_ticket_key` nad `ticketId` za redove `isPrimary = true`, čime DB sprečava više primarnih redova.
- `TicketAsset_primary_group_lock` BEFORE trigger uzima `FOR UPDATE` lock nad parent `Ticket` redom za INSERT/UPDATE/DELETE. Premještanje `ticketId` zaključava oba postojeća parenta u DB redoslijedu.
- Deferrable, initially-deferred constraint trigger `TicketAsset_primary_required` provjerava konačno stanje na transaction commit-u. Ako linkovi ostanu, mora postojati tačno jedan primary; prazna grupa je dozvoljena. Time aplikacijski demote-then-promote koraci mogu kratko proći kroz nula primary vrijednosti unutar iste transakcije, ali ne mogu commit-ati neispravno stanje.
- `lockTicketAssetPrimaryGroups()` uzima sortirane parent-ticket lockove **prije** nego što aplikacija pročita postojeće linkove i odluči koji je primary. Koriste ga `AssetTicketsService.link/unlink/setPrimary`, create-ticket link i destination strana merge/split kopiranja. Unlink fallback je determinističan: najstariji `linkedAt`, zatim `assetId`.
- Demo seed/remove CLI sada zadržava ili promovira primary prije dodavanja/uklanjanja demo linkova. Ovo je kompatibilnost s novim DB ugovorom, bez izmjene demo sadržaja izvan postojećih označenih redova.
- Nije dodana HTTP ruta ni nova Prisma kolona. Runtime schema sentinel i dokumentacijski komentar `TicketAsset` modela prate DB-only ugovor.

DB granica štiti i direktne/raw SQL writeove. Normalni app tokovi čitaju stanje nakon parent locka, pa se istovremeni linkovi različitih asseta serijalizuju: prvi link postaje primary, a sljedeći sekundarni. Isti asset link i dalje koristi postojeći `ASSET_RELATION_EXISTS` konflikt.

## Direktni testni dokaz

`backend/src/modules/assets/asset-ticket-primary-invariant.integration.spec.ts` je registrovan u izolovanom PostgreSQL runneru i sadrži osam scenarija:

1. finalna transakcija koja ostavi link bez primaryja odbija se i rollbacka;
2. partial unique indeks odbija dva primary linka za isti ticket;
3. privremeni zero-primary korak unutar validnog atomic switcha prolazi, a konačni invalidni switch se rollbacka;
4. dvije istovremene application link operacije uspješno kreiraju oba linka i tačno jedan primary;
5. direktni paralelni PostgreSQL primary inserti ne mogu commit-ati dupli primary;
6. `setPrimary` mijenja primary, a unlink primarnog reda promovira najstariji preostali link;
7. merge/split copy ne zamjenjuje postojeći target primary;
8. Ticket cascade delete uklanja sve linkove bez lažnog deferred-constraint pada.

`backend/src/modules/assets/asset-ticket-primary-lock.spec.ts` zaključava deduplikaciju ID-jeva i DB ordering/`FOR UPDATE` ugovor; `backend/src/modules/tickets/assets/ticket-assets.spec.ts` provjerava da create-ticket link zaključava novokreirani ticket prije inserta.

## Migracija, preflight i reconciliation

Migracija ne popravlja istorijske redove automatski. U jednoj transakciji uzima `SHARE ROW EXCLUSIVE` lock nad `TicketAsset`, pokreće fail-closed preflight i tek zatim instalira indeks/triggere. Ako ijedan ticket ima broj primary linkova različit od jedan dok ima linkove, cijela migracija se prekida bez DDL commita. Preflight pregled svih grupa:

```sql
SELECT
  "ticketId",
  count(*) AS link_count,
  count(*) FILTER (WHERE "isPrimary" = TRUE) AS primary_count
FROM "TicketAsset"
GROUP BY "ticketId"
HAVING count(*) FILTER (WHERE "isPrimary" = TRUE) <> 1
ORDER BY "ticketId";
```

Ako preflight vrati redove, potvrditi s data ownerom pa izvršiti sljedeću determinističnu korekciju **prije** migracije, uz backup i održavanje locka. Postojeći primary ima prednost; ako ih je više, bira se najstariji postojeći primary, pa `assetId`; ako ih nema, promovira se najstariji link, pa `assetId`. Ostali redovi postaju sekundarni; nijedan link se ne briše.

```sql
BEGIN;
LOCK TABLE "TicketAsset" IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT
    "ticketId",
    "assetId",
    row_number() OVER (
      PARTITION BY "ticketId"
      ORDER BY "isPrimary" DESC, "linkedAt" ASC, "assetId" ASC
    ) AS primary_rank
  FROM "TicketAsset"
)
UPDATE "TicketAsset" AS link
SET "isPrimary" = (ranked.primary_rank = 1)
FROM ranked
WHERE link."ticketId" = ranked."ticketId"
  AND link."assetId" = ranked."assetId"
  AND link."isPrimary" IS DISTINCT FROM (ranked.primary_rank = 1);

COMMIT;
```

Pauzirati ticket-asset writeove tokom legacy reconciliation i migracije; ponoviti preflight i tek kad vrati nula redova pokrenuti release migrator `npm run db:migrate:release` kroz single-owner deployment job, uz backup/snapshot i praćenje table-lock waita. Sama migracija ponavlja provjeru pod table lockom, pa će kasni nekonzistentni write u najgorem slučaju zaustaviti migraciju bez instaliranja djelimičnog invariant-a. Nakon uspješnog commit-a provjeriti sentinel `20271028000000_asset_ticket_primary_invariant`, deployati W7.8 aplikacijski commit i tek onda nastaviti ticket-asset write traffic. Ovo je jednokratna legacy reconciliation putanja, ne periodični repair worker: nakon instalacije DB indeksa i triggera neispravno stanje ne može biti commit-ano. Nije dodan novi health metric ili scheduler, koji ostaju izvan `BA-assets-08`.

### Rollback i oporavak

Migracija ne mijenja `isPrimary` podatke i nema backfill-a; ručno odobrena reconciliation ostaje validna i ne treba je vraćati u poznato neispravno stanje. Migracijski redoslijed je forward-only:

- **Aplikacijski rollback:** stari build može se vratiti bez uklanjanja indeksa/trigera, jer nije dodana schema kolona. Zadržati DB guardove; stariji app možda neće klasifikovati rijetki invariant-conflict kao W7.8 race, pa pri rollbacku pauzirati link mutacije ili vratiti hotfix umjesto pretpostaviti da je rollback semantički neutralan.
- **Failed migration:** preflight/DDL su u jednoj PostgreSQL transakciji. Ako Prisma zabilježi neuspjeli pokušaj, popraviti podatke, pa `prisma migrate resolve --rolled-back 20271028000000_asset_ticket_primary_invariant` koristiti samo za taj failed pokušaj prije ponovnog `db:migrate:release`. Ne koristiti `migrate resolve` za uspješno primijenjenu migraciju.
- **Uklanjanje nakon uspješne migracije:** ne editovati već primijenjenu migraciju, ne brisati objekte ručno uz ledger koji kaže da su primijenjeni i ne označavati uspješnu migraciju rolled-back. Ako je potpuno uklanjanje nužno, pauzirati TicketAsset writeove, uzeti backup i pripremiti zasebnu odobrenu forward cleanup migraciju koja pod table lockom uklanja samo objekte W7.8. SQL tijelo te cleanup migracije:

```sql
BEGIN;
LOCK TABLE "TicketAsset" IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER "TicketAsset_primary_required" ON "TicketAsset";
DROP TRIGGER "TicketAsset_primary_group_lock" ON "TicketAsset";
DROP FUNCTION "check_ticket_asset_primary_after_write"();
DROP FUNCTION "assert_ticket_asset_primary_group"(TEXT);
DROP FUNCTION "lock_ticket_asset_primary_group"();
DROP INDEX "TicketAsset_one_primary_per_ticket_key";
COMMIT;
```

Uklanjanje DB guarda vraća raniji race za buduće writeove; odobrava se samo uz odgovarajuće application control/hotfix i jasnu procjenu rizika. Release primjene/cleanup-a koriste single-owner migrator nakon backup/snapshot-a.

## CI, lokalne provjere i ograničenja

Zeleni CI [`40962089973`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40962089973) izvršen je na SHA `f9a90ba057b612451a5f4868947ce32a0e73ef43`:

- **Backend:** Prisma validate/generate, generated artifact guard, wiring snapshot, build, lint, safety-net i Jest suiteovi prošli su.
- **PostgreSQL/Redis:** migration policy, replay svih migracija, runtime DB privilege/backup/restore i izolovani real-PostgreSQL suiteovi prošli su; novi W7.8 acceptance suite je uključen.
- **Frontend:** lint, format, testovi, TypeScript/Vite build i bundle-budget provjere prošli su.
- **Docs/CI/container:** docs guard, CI gate, container hardening, production dependency audit i supply-chain provjere prošli su.
- **Skipped:** `E2E install wizard` i `E2E critical flows` nisu pokretani na pushu; `Enforce zero high/critical image vulnerabilities` je `skipped` jer je scanner actionable count bio 0.
- **Neuspjeli pokušaji:** nema.

Dodatne lokalne provjere: `npm run lint` je imao 0 grešaka i tri postojeća `no-explicit-any` upozorenja u nepovezanom `sla-scan-failure-quarantine.spec.ts`; wiring check je potvrdio 614 ruta, wiring testovi 6/6, migration policy je potvrdio 98 migracija, policy testovi 2/2, integration harness 3/3 i `git diff --check` je prošao. Lokalni backend Jest nije pokretan zbog nedostajućeg generated Prisma clienta, a sandbox nema lokalni PostgreSQL runtime; CI je generisao klijent i pružio PostgreSQL/Redis dokaz.

Dokumentacijski closeout je docs-only; repository CI koristi `paths-ignore` za `docs/**` i Markdown, pa takav push ne generiše zaseban GitHub run. Završni closeout sadržaj lokalno je prošao docs guard (32 stranice, 8 prevoda, 10 provjera), guard testove 9/9, backend traceability 692/692, traceability testove 5/5, JSON parse i `git diff --check`. Behavior/migracijski dokaz ostaje zeleni CI `40962089973` iznad.

## Registar nalaza

- Zatvoren je samo `BA-assets-08` (P2).
- `BA-assets-09`–`BA-assets-19` ostaju otvoreni; W7.9 `BA-assets-09` single-flight directory lock je sljedeći i nije započet.
- Deklarisani agregat nakon W7.8: **581 otvoren / 111 zatvorenih / 692 ukupno**; početnih 19 P1 nalaza u Valu 7 ostaje otvoreno.
- Machine-readable source statusi su **584 otvorena / 97 zatvorenih / 11 historijskih**; ranije dokumentovana razlika prema deklarisanom agregatu ostaje reconciliation obaveza. W7.8 nije je mijenjao.
