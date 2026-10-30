# Package closeout — W7.14

**Paket:** W7.14 — transfer snapshot/signed-binary retention lifecycle<br>
**Nalaz:** `BA-assets-14` (P2) — zatvoren<br>
**Kodni commit:** `d7dcc659bd883d80471a659cc8907ba1a2e69d41`<br>
**Test-fixture korekcija:** `55531c14ec6b8b7fcb1bcec28cf5b2bf9fb135c5`<br>
**Finalni testani SHA:** `55531c14ec6b8b7fcb1bcec28cf5b2bf9fb135c5`<br>
**CI:** [`41057855403`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41057855403) — zelen<br>
**DB migracija:** `20271030110000_asset_transfer_retention_lifecycle` — aditivna; replayovana na disposable CI bazi, nije primijenjena na ciljnu instalaciju.

## Nalaz i acceptance

Prije W7.14 transfer snapshot i potpisani binar nisu imali konfigurisan lifecycle za anonimizaciju i retention. Acceptance je tražio DPO-konfigurabilan period bez izmišljanja fiksnog pravnog roka, podrazumijevano isključenje (`0`), obavezni dry run prije izvršenja, obradu samo terminalnih transfera, redakciju sadržaja, uklanjanje potpisane datoteke i očuvanje minimalnog zapisa. Purge zahtjev mora biti trajan i retryable, a endpoint za potpisanu kopiju mora odbiti isporuku čim je purge marker commitovan.

Zatvoren je samo `BA-assets-14`. `BA-assets-15`–`BA-assets-19` nisu obrađeni.

## Implementacija

- Dodana je DPO postavka `assetTransfers` sa defaultom `0` (isključeno) i minimumom od 1 dana kada je period uključen. Nije uveden fiksni pravni period. Kategorija zahtijeva fresh dry-run gate za izvršenje.
- Retention executor bira samo `SIGNED` transfere sa starim `signedAt` i `CANCELLED` transfere sa starim `cancelledAt`; `ISSUED`, recent i legal-hold zapisi se preskaču. Batch redaktuje frozen snapshot i personal/reference/free-text polja, briše `templateId` i asset reference, a zadržava broj, status, scenario, datume i minimalni transfer skeleton. Relacijski broj stavki se čuva.
- Uvedeni su `retentionRedactedAt` i `signedFilePurgeRequestedAt`. Marker zahtjeva se postavlja prije filesystem unlinka; dok marker postoji, signed-copy endpoint fail-closed odbija čitanje, a API/UI skrivaju metapodatke i prikazuju redaction/purge stanje. Datoteka se briše uz row-lock, bounded/idempotent helper i ponovljivi maintenance retry, nezavisno od toga je li retention period `0`.
- Anonymization sada scrubuje frozen transfer snapshot i povezani slobodni tekst, uklanja personal user reference i queue-a potpisanu datoteku za purge. Immediate pokušaj je ograničen na 100 fajlova; ostatak ostaje trajno označen za naredni maintenance retry.
- Ažurirani su backend retention wiring, processing-record/email izvještavanje, API tipovi, transfer panel i bosanski/engleski locale tekstovi. Nisu uvedeni hard delete transfera, promjene adjacent findings ni zakonska odluka o tačnom retention roku.

## Direktni testni dokaz

- `backend/src/modules/privacy/retention/asset-transfer-retention.executor.spec.ts` — preview ne briše sadržaj; redakcija terminalnog zapisa; čuvanje skeleta i item counta; marker prije purgea; partial rezultat kada storage unlink ne uspije.
- `backend/src/modules/assets/transfers/purge-asset-transfer-files.spec.ts` — storage failure ostavlja marker/path i uspješan retry čisti metapodatke; prazan ciljani skup je no-op.
- `backend/src/modules/assets/transfers/asset-transfer-retention.spec.ts` — transfer free-text scrub, uklanjanje user referenci, signed-copy fail-closed uslov i zabrana nove upload/cancel operacije nakon purge/redaction markera.
- `backend/src/modules/privacy/retention/retention.integration.spec.ts` — PostgreSQL acceptance pokriva dry-run count, signed/cancelled redakciju, purge stvarne datoteke, legal hold/recent/ISSUED isključenja i retry dok je `assetTransfers: 0`.
- `backend/src/modules/privacy/anonymization/anonymization.integration.spec.ts` — stvarni signed-file fixture se queue-a i uklanja uz transfer snapshot/text anonymization.
- `backend/src/modules/tickets/attachments/attachments.constants.spec.ts` — executor registry dopušta novu `assetTransfers` kategoriju uz postojeći attachment retention ugovor.

## CI i testni dokaz

CI [`41057855403`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41057855403) testirao je finalni SHA `55531c14ec6b8b7fcb1bcec28cf5b2bf9fb135c5`:

- **Backend:** Prisma schema validate/generate, artifact/wiring guardovi, backend build, lint i `npm test -- --ci --coverage=false` — zeleni.
- **PostgreSQL/Redis:** kompletan migracijski replay i current-history provjera, izolovani PostgreSQL+Redis integration suites, uključujući retention i anonymization — zeleni. CI je replayovao svih 101 migracija na disposable bazi.
- **Frontend:** lint, Prettier, i18n guard, Vitest i production build — zeleni.
- **Docs/container/CI gate:** docs guard, container hardening, production audit, image build/SBOM/provenance i završni CI gate — zeleni.
- **Preskočeno:** `E2E critical flows` i `E2E install wizard` nisu pokrenuti na `push` triggeru. Image high/critical enforcement korak je `skipped` nakon skeniranja bez actionable high/critical nalaza.
- **Neuspjeli pokušaj:** CI [`41056869558`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41056869558) na početnom kodnom SHA `d7dcc659bd883d80471a659cc8907ba1a2e69d41` pao je na dvije testne greške: attachment executor-key assertion nije uključivao novu kategoriju, a integration fixture je koristio 1-dnevni rok iako je „recent” transfer bio star 10 dana. Očekivani registry spisak i test period (30 dana) su ispravljeni u `55531c1`; finalni CI run iznad je zelen.

Dodatne lokalne provjere: frontend Vitest `427` fajlova / `1.656` testova prošao; frontend build, lint, format, i18n prošli; backend ESLint nad izmijenjenim TypeScript fajlovima prošao; ciljane backend Jest suiteove `plan-asset-transfer.spec.ts` i `retention-plan.spec.ts` prošle su `2/2` suite-a, `18/18` testova; traceability guard `8/8`; migration-policy testovi `2/2` i provjera `101` migracije; `git diff --check` čist. Lokalni backend integration nije mogao koristiti bazu jer `PRIVACY_IT_DATABASE_URL` nije postavljen; CI izvršio real PostgreSQL/Redis suites.

## Registar nalaza

- Zatvoren: `BA-assets-14` (P2), nakon acceptance dokaza i zelenog CI-ja.
- Ostaju otvoreni: `BA-assets-15`–`BA-assets-19`; nijedan susjedni nalaz nije zatvoren.
- Kontrolni zbir: **575 otvorenih / 117 zatvorenih / 692 ukupno**. Machine-readable source statusi su **578 otvorenih / 103 zatvorena / 11 historijskih**; preegzistentna razlika od tri statusa ostaje nepromijenjena.

## Migracija, rollout i rollback

Migracija `20271030110000_asset_transfer_retention_lifecycle` dodaje nullable markere i retention/purge indekse; nema backfilla niti briše postojeće snapshotove/binarne fajlove. CI migracijski replay se izvršio isključivo na disposable release-test bazi.

Ciljna instalacija nije bila dostupna: lokalno `DATABASE_URL` nije postavljen, pa migration status nije provjeren i W7.14 migracija nije primijenjena. Korisnik je ranije potvrdio da je prethodna W7.13 migracija `20271030100000_asset_import_apply_lease` primijenjena; ta potvrda nije korištena kao dokaz za W7.14 i W7.13 migracija nije ponovo primijenjena na ciljnu bazu. Prije deployment applyja provjeriti target `prisma migrate status` i primijeniti samo pending W7.14 migraciju kroz single-owner release migrator.

Schema promjena je aditivna i ne mijenja stare API response zahtjeve. Code rollback prije korištenja novih markera ostavlja nullable schema additive. Nakon što aplikacija počne pisati purge/redaction markere, ne uklanjati kolone: gubitak purge markera može ostaviti orphan binare, a gubitak redaction markera može ponovo izložiti očuvane podatke. Uspješnu Prisma migraciju ne označavati rollbackom; ako se kasnije mora ukloniti schema, koristiti zasebnu, unaprijed procijenjenu forward cleanup migraciju nakon što nema aktivnih referenci i queue markera.

## Sljedeći paket

**W7.15 — `BA-assets-15` (P2):** hard-delete dependency cleanup i očuvanje asset event history. Nije započet; čeka zasebno odobrenje.
