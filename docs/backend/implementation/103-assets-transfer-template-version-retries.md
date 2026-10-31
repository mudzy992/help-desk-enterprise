# Package closeout — W7.17

**Paket:** W7.17 — template version alokacija i bounded retry ugovor<br>
**Nalaz:** `BA-assets-17` (P3) — zatvoren; acceptance je prošao na zelenom CI gateu<br>
**Kodni commit:** `f8fff7e5f651fa2d57f49e03d1950af917514c7e`<br>
**Finalni testani SHA:** `f8fff7e5f651fa2d57f49e03d1950af917514c7e`<br>
**CI:** [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097) — CI gate zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

`AssetTransferTemplate.version` je jedinstven, ali paralelni uploadi su izračunavali `latest + 1` bez alokacijskog retry ugovora. W7.17 je ograničen samo na `BA-assets-17`: konkurentna alokacija, precizno prepoznavanje konflikta nad `AssetTransferTemplate_version_key`, nova transakcija i novi `latest + 1` izračun za svaki pokušaj, te stabilan HTTP `409` nakon iscrpljenja najviše tri ukupna pokušaja. `BA-assets-16`, `BA-assets-18` i `BA-assets-19` nisu mijenjani ovim paketom.

W7.17 je započet nakon izričitog korisničkog odobrenja uprkos W7.16 CI padu na testu 56. W7.16 test nije mijenjan, preskočen ni oslabljen. W7.16 nalaz ostaje otvoren prema zasebnom closeoutu; njegov status se ovim paketom ne mijenja.

## Implementacija

- `asset-transfer-template-version.ts` uzima PostgreSQL transaction-scoped advisory lock prije čitanja najveće postojeće verzije. U svakom pokušaju `withAssetAuditTransaction` pokreće novu Prisma transakciju, lock se ponovo uzima i `latest + 1` se ponovo računa.
- Ograničeni loop ima najviše **3 ukupna pokušaja**. Retry se radi samo za prepoznati Prisma `P2002` ili PostgreSQL `23505` konflikt koji navodi `AssetTransferTemplate_version_key`, odnosno kombinaciju `modelName=AssetTransferTemplate` i `target=version`. Nepovezani unique konflikti, audit greške i ostale DB greške odmah se prosljeđuju bez retrya.
- Upis templatea i `asset.transfer.template_uploaded` audit zapis ostaju u istoj `withAssetAuditTransaction` transakciji. Audit se formira tek nakon uspješnog template upisa; konfliktni i rollbackani pokušaji ne ostavljaju audit.
- Iscrpljenje pokušaja vraća `AssetError` kod `ASSET_TRANSFER_TEMPLATE_VERSION_CONFLICT`, mapiran na HTTP `409 Conflict`. Stabilni JSON body je `{ code: "ASSET_TRANSFER_TEMPLATE_VERSION_CONFLICT", message: "ASSET_TRANSFER_TEMPLATE_VERSION_CONFLICT", detail: null }`; bosanski i engleski frontend prevodi mapiraju taj kod na poruku za konkurentni upload.
- API ruta ostaje `POST /assets/transfers/templates`; nije uveden request format, Prisma schema ni poslovni scope za susjedne nalaze.

## Direktni testni dokaz

- `backend/src/modules/assets/transfers/asset-transfer-template-version.spec.ts` — lock prije čitanja, početna verzija 1, prepoznavanje tačnog unique indeksa i odbijanje nepovezanih/ambiguous konflikata.
- `backend/src/modules/assets/transfers/asset-transfers.service.spec.ts` — uspješan bounded retry u dvije različite transakcije sa ponovnim latest-readom; audit samo za uspješan upis; najviše tri pokušaja pa stabilni error kod; nepovezani unique konflikt bez retrya; audit greška bez retrya i bez commita.
- `backend/src/modules/assets/assets-version.dto.spec.ts` — novi domain error mapira se na HTTP 409.
- `backend/src/modules/assets/transfers/asset-transfer-template-version.integration.spec.ts` — real-PostgreSQL concurrency acceptance izvršava pet paralelnih uploadova, provjerava jedinstvene uzastopne verzije i tačno jedan odgovarajući transactional audit zapis po uspješnom uploadu. Suite je registrovan u isolated integration runneru i njegovom harness testu.

## CI i testni dokaz

CI run [`41235280097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280097) na `f8fff7e5f651fa2d57f49e03d1950af917514c7e`:

- **Backend build + test:** passed; Prisma schema/klijent, lint, suiteovi koji su ranije bili blokirani nedostajućim generisanim Prisma tipovima, wiring/SLA provjere i puni Jest prolaz.
- **PostgreSQL/Redis integration:** passed; real PostgreSQL suiteovi su izvršeni, uključujući novi W7.17 concurrency suite.
- **Frontend build + test:** passed; lint, format, testovi, build i bundle/cold-route budžeti.
- **Docs guard:** passed.
- **Backend container + supply chain:** job passed; inventory, vulnerability scan, provenance i runtime contract su prošli. Korak `Enforce zero high/critical image vulnerabilities` je `skipped` jer high/critical broj nije aktivirao workflow uslov; ne računati ga kao izvršen.
- **E2E critical flows:** passed. Test 56 nije mijenjan u ovom paketu; W7.16 neuspjeh ostaje evidentiran u svom closeoutu i ovaj run ne zatvara `BA-assets-16`.
- **E2E install wizard:** `skipped` na push triggeru.
- **CI gate:** passed.

Odvojeni Perf smoke [`41235280078`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41235280078) na istom SHA je **failed**, nije prikazan kao passed: k6 pragovi `search_duration: p(95)<500` i `ticket_message_duration: p(95)<1000` nisu prošli; `http_req_failed`, `tickets_list_duration`, `ticket_detail_duration` i DB query budget (`1.890` prosječno prema `2.1`) jesu prošli. To su zasebne search/ticket rute, izvan W7.17 asset-template diff-a; nije rađen out-of-scope popravak niti mijenjan prag. `gh run view ... --log-failed` vratio je EOF, a GitHub je odbio `gh run rerun 41235280078 --failed` porukom da workflow možda nije ispravan. Neuspjeh Perf smokea je zasebno evidentiran; paketni CI gate i W7.17 acceptance iznad su prošli.

Prethodni W7.16 CI [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) na W7.16 finalnom SHA pao je na E2E testu 56; korisnik je izričito odobrio da se W7.17 nastavi bez izmjene tog testa. W7.17 CI run iznad je zaseban i njegov gate je zelen; `BA-assets-16` se ovim paketom ne zatvara.

## Lokalna provjera i ograničenja

- Backend `npm run lint` prošao je bez grešaka uz tri postojeća `no-explicit-any` upozorenja u `src/modules/sla/sla-scan-failure-quarantine.spec.ts`.
- `npm run audit:traceability` i `npm run audit:traceability:test` su prošli (692/692 nalaza; 11/11 guard testova); `npm run wiring:check`, `npm run db:migration-policy:check` i `npm run test:integration-harness` su prošli (harness 3/3).
- Lokalni targeted Jest helper suite nije mogao kompajlirati jer nedostaje generisani `backend/src/generated/prisma/client`; ponovni Prisma generate bio je blokiran ranijom sandbox TLS greškom prema Prisma schema-engine hostu. DTO spec je lokalno prošao. Ovo lokalno ograničenje nije prikazano kao testni prolaz; CI je generisao klijent i izvršio suiteove.
- Lokalni PostgreSQL concurrency suite nije izvršen jer sandbox nema `PRIVACY_IT_DATABASE_URL`; realni suite je prošao u CI integration poslu.
- Frontend `npm run lint`, `npm run format:check`, `npm run i18n:check`, puni `npm test -- --run` i `npm run build` su prošli; bs/en parity je provjeren za 8.869 ključeva. Lokalni frontend testovi su bili 427 fajlova / 1.656 testova.
- `node scripts/check-docs-content.mjs`, njegov testni suite i `git diff --check` su prošli. Docs guard prijavio je samo ranije poznate datumske razlike u tri mirrored stranice; ukupna provjera je `OK`.

## Registar nalaza

- Zatvoren: samo `BA-assets-17` (P3), uz unit, real-PostgreSQL concurrency acceptance i zeleni W7.17 CI gate.
- Ostaju otvoreni: `BA-assets-16` (status se ne mijenja ovim paketom), `BA-assets-18` i `BA-assets-19`.
- Deklarisani kontrolni zbir nakon W7.17: **573 otvorena / 119 zatvorenih / 692 ukupno**.
- Machine-readable source nakon zatvaranja samo `BA-assets-17`: **576 otvorenih / 105 zatvorenih / 11 historijskih statusa**. Preegzistentna razlika od tri statusa ostaje zasebna reconciliation obaveza; nije izmijenjena radi ovog paketa.

## Migracija, rollout i rollback

Nema Prisma schema promjene ni DB migracije; constraint `AssetTransferTemplate_version_key` i postojeća `version` kolona ostaju nepromijenjeni. Nijedna ciljna baza nije mijenjana; W7.14 migracija se ne ponavlja. Release backend/frontend se može isporučiti bez DB koraka; API error kod je aditivan, a frontend ga prevodi. Rollback je povratak aplikacijskih artefakata na prethodni kompatibilni release; nema migration rollbacka ni data backfilla.

Nije otvoren PR. Novi PR prema `master` zahtijeva tri zasebna jasna odobrenja; ne mergeovati/brisati PR ili granu bez zasebne dozvole.

## Sljedeći paket

**Nije započet — nema narednog W7 paketa odobrenog ovim closeoutom.** `BA-assets-18` i `BA-assets-19` ostaju otvoreni i izvan scopea; tražiti zasebno odobrenje prije bilo kakve njihove implementacije.
