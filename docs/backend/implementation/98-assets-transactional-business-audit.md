# Zatvaranje paketa — W7.12

**Paket:** W7.12 — atomski asset business writes i globalni audit<br>
**Nalaz:** `BA-assets-12` (P2) — zatvoren<br>
**Kodni commit:** `2917363eea13a58be6f76850aa39ccc6c2e655c2`<br>
**Finalni testani kodni SHA:** `2917363eea13a58be6f76850aa39ccc6c2e655c2`<br>
**Kod CI:** [`41030516609`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41030516609) — zelen na finalnom kodnom SHA<br>
**DB migracija:** nema

## Nalaz i acceptance

`BA-assets-12` je obuhvatao relevantne asset business writes koji su prvo commitovali business promjenu, a tek zatim upisivali odgovarajući globalni audit red. Pad audit append-a mogao je ostaviti business row bez audit traga i klijentu vratiti grešku nakon uspješne promjene. Acceptance je: business write i postojeći audit entry moraju uspjeti ili pasti zajedno unutar jedne Prisma transakcije; filesystem side effect kod potpisanog transfera mora biti kompenzovan ako DB/audit transakcija ne uspije.

Zatvoren je samo `BA-assets-12`. Nisu prošireni audit coverage niti scope neighboring nalaza: `BA-assets-13`/`BA-assets-14` (import recovery i transfer snapshot/binary lifecycle), ostali `BA-assets-15`–`BA-assets-19` i audit read/export/import/directory workflowi ostaju odvojeni.

## Implementacija

- Novi `withAssetAuditTransaction` izvršava poslovni callback i opcionalni audit factory kroz isti Prisma `$transaction`. Audit writer dobija aktivni transaction client, pa audit append greška rollbackuje business promjenu. `null` audit rezultat podržan je samo za tokove koji već nisu emitovali globalni audit, npr. asset move bez izdatog transfer dokumenta.
- Helper je integrisan u katalog tipova/atributa/lokacija; license create/update/delete/assign/release; contract create/update/delete i item add/remove; transfer issue/cancel/signed-file upload; signatory i template promjene; core asset retire/dispose/delete; te ticket link/unlink. Postojeći `AssetEvent`, ticket system-event i optimistic/CAS ugovori nisu uklonjeni.
- `assetLocationSaved` je dobio audit metadata schema verziju 2 sa dozvoljenim `created` i `archived` poljima. To usklađuje postojeće create/archive payload-e sa zatvorenim audit schema policy-jem; nije potrebna Prisma schema promjena.
- License-key reveal ne mijenja business row; ostaje fail-closed i čeka uspješan audit zapis prije vraćanja dešifrovanog ključa. `setPrimary` nije mijenjan jer nema postojeći global audit poziv.
- Kod signed-transfer upload-a, DB/audit neuspjeh briše novonapisani fajl. Prethodni fajl se uklanja tek nakon uspješnog transaction commita; cleanup greška se ne pretvara u lažno prijavljenu DB transakcijsku grešku.
- Nije uveden audit outbox niti migracija. Export/read audit, spreadsheet import i directory sync ostaju van ovog scopea; import recovery je `BA-assets-13`, a transfer snapshot/signed-file anonymization i retention je `BA-assets-14`.

## Direktni testni dokaz

- `backend/src/modules/assets/asset-audit-transaction.spec.ts` — tri helper testa: audit dobija isti aktivni transaction client, audit greška ne commit-uje poslovni write i eksplicitni `null` audit rezultat ostavlja ranije ne-auditirani tok bez novog događaja.
- `backend/src/modules/assets/asset-business-audit.integration.spec.ts` — real PostgreSQL suite: lokacija i `assetLocationSaved` schema-v2 audit zapis persistuju se zajedno; nevažeća metadata nakon business create odbacuje transakciju, pa ne ostane ni lokacija ni audit red. Suite je dodat u isolated integration runner.
- `backend/src/modules/assets/transfers/asset-transfers.service.spec.ts` — audit append greška sprečava transfer issue commit; signed upload audit greška briše novi fajl i čuva stari; uspješan transaction čuva novi fajl i tek nakon commita uklanja prethodni.
- Audit event policy/schema/compatibility testovi zaključavaju `assetLocationSaved` verziju 2 i dopuštena metadata polja.

## Commit, CI i testni dokaz

Kodni SHA `2917363eea13a58be6f76850aa39ccc6c2e655c2` prošao je CI [`41030516609`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41030516609):

- **Backend:** Prisma schema validate/generate, generated artifact i wiring guardovi, build, lint, suiteovi koji su ranije blokirani Prisma clientom, SLA matrix i puni Jest suite — zeleno.
- **PostgreSQL/Redis integration:** migration policy, isolated harness i release-migrator replay svih 99 postojećih migracija, DB/Redis safety provjere i real PostgreSQL suiteovi — zeleno; novi W7.12 business-audit suite je izvršen.
- **Frontend:** lint, format, testovi, build i bundle/cold-route budžeti — zeleno.
- **Docs/CI/container:** docs guard, CI gate, container contract/model, image build, SBOM, skenovi i provenance — zeleno.
- **Preskočeno:** `E2E critical flows` i `E2E install wizard` nisu pokrenuti na push workflowu. `Enforce zero high/critical image vulnerabilities` je `skipped` jer actionable high/critical broj nije zahtijevao enforcement; nije CI pad.
- **Neuspjeli CI pokušaji:** nema.

Lokalno su prošli `npm run lint -- --no-warn-ignored` (0 grešaka; tri nepovezana `no-explicit-any` upozorenja u `sla-scan-failure-quarantine.spec.ts`), ciljani audit policy/schema/compatibility Jest (3 suite-a, 19 testova), `npm run test:integration-harness` (3/3), `npm run db:migration-policy:check` (99 migracija) i `npm run db:migration-policy:test` (2/2); `git diff --check` je čist. Lokalni Prisma client nije mogao biti generisan: sandbox TLS veza do `binaries.prisma.sh` nije uspostavljena, pa su lokalni Jest/build testovi koji zahtijevaju generated client prepušteni punom CI-ju, koji ga je uspješno generisao i koristio.

## Registar nalaza

- Zatvoren je samo `BA-assets-12` (P2).
- Ostaju otvoreni `BA-assets-13`–`BA-assets-19`, uključujući import recovery `BA-assets-13`, transfer lifecycle `BA-assets-14` i health/metrics `BA-assets-18`.
- Deklarisani zbir nakon W7.12: **577 otvorenih / 115 zatvorenih / 692 ukupno**. Machine-readable source redovi: **580 otvorenih / 101 zatvoren / 11 historijskih**; ranija razlika od tri statusa prema deklarisanom agregatu ostaje dokumentovana i nije rekoncilirana ovim paketom.
- Početna audit ocjena **4,59/10** ostaje baseline snapshot.

## Migracija, rollout i rollback

Nema Prisma modela, kolona, indeksa ni DB migracije; `actionSchemaVersion` je postojeće polje AuditLog modela, a promjena je samo audit policy verzija za `assetLocationSaved`. CI je u disposable okruženju replayovao postojećih 99 migracija kroz single-owner release migrator; nije rađen production migration apply i nema ranije uspješne migracije koju treba ponavljati.

Rollout je application-only. Business/audit writeovi sada dijele jednu Prisma transakciju; API rute i response ugovori nisu mijenjani. Ako signed-file DB/audit transakcija padne, novi fajl se best-effort uklanja, a prethodna signed kopija ostaje. Nakon uspješnog commita prethodna kopija se briše best-effort. Nema rollback SQL-a niti schema rollback koraka; rollback aplikacijskog builda ne zahtijeva promjenu baze.

## Sljedeći paket

**W7.13 — `BA-assets-13` (P2):** import claim-u dodati eksplicitno `APPLYING` lease/recovery/idempotency stanje. Nije započet prije zelenog kodnog CI-ja za W7.12.
