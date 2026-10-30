# Package closeout — W7.15

**Paket:** W7.15 — hard-delete zavisnosti i asset-event historija<br>
**Nalaz:** `BA-assets-15` (P2) — zatvoren<br>
**Kodni commit:** `11f43efd37d448142f6c33f99096555ee8f7419d`<br>
**Finalni testani SHA:** `11f43efd37d448142f6c33f99096555ee8f7419d`<br>
**CI (push):** [`41067304475`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41067304475) — zelen; završni docs CI [`41068758830`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41068758830) — zelen<br>
**PR:** [#11](https://github.com/mudzy992/help-desk-enterprise/pull/11) otvoren prema `master`; dodatni PR gate nije zelen zbog E2E/performance provjera izvan W7.15 (detalji ispod), nije mergeovan.<br>
**DB migracije:** `20271030120000_asset_hard_delete_event_history`; aditivna migracija, još nije primijenjena na ciljnu instalaciju.

## Nalaz i acceptance

Prije W7.15 `Asset.delete()` mogao je implicitno ukloniti dio poslovnih veza kroz FK cascade/SET NULL, a FK cascade na `AssetEvent` brisao je cijelu asset-event historiju. Potvrđena politika je fizički hard-delete samo kada nema poslovnih veza; postojeće veze s ticketima, relacijama, transferima, ugovorima, licencama, problemima i change requestovima blokiraju brisanje sa stabilnim HTTP `409`. Asset eventi se čuvaju odvojeno kao historija s originalnim asset ID-om i tag snapshotom. Automatski se smiju ukloniti samo izvedeni pomoćni redovi.

Zatvoren je samo `BA-assets-15`. `BA-assets-16`–`BA-assets-19` i ostali auditi nisu dio ovog paketa.

## Implementacija

- `AssetsService.remove()` zaključava asset red prije provjere, broji `tickets`, `relationsFrom`, `relationsTo`, `transferItems`, `contractItems`, `licenseAssignments`, `problems` i `changes`, te vraća `AssetError(hasDependents)` ako postoji ijedna poslovna veza. Greška se mapira na stabilni HTTP `409`; odgovor sadrži samo tipove i broj veza.
- Kada nema zavisnosti, jedna transakcija upisuje završni `deleted` `AssetEvent`, fizički briše asset i zapisuje globalni audit. Lock štiti provjeru od paralelnog kreiranja FK-backed linka; baza ponavlja provjeru kao zaštitu za direktne DB/CLI delete putanje.
- Nova aditivna migracija dodaje `AssetEventArchive` bez FK-a prema `Asset`, indeks po originalnom ID-u/vremenu i `BEFORE DELETE` trigger. Trigger fail-closed blokira svih osam grupa zavisnosti i kopira event ID, originalni asset ID/tag, akciju, actor ID, JSON detalj i `createdAt` prije cascadea postojećih live `AssetEvent` redova.
- `AssetsService.history()` zadržava OU-scope provjeru za aktivnu imovinu. Za obrisani asset historiju može dohvatiti samo `SUPER_ADMIN`; svaki vraćeni red označen je sa `retainedAfterAssetDelete` i sadrži snapshot identitet.
- Demo seed cleanup više ne uklanja ticket/relations/transfer/contract/license/problem/change veze prije hard-deletea i ne briše evente. Baza ga blokira ako postoje poslovne veze; samostalni demo objekti uklanjaju se samo kada nemaju zavisne redove.
- `BA-assets-16`–`BA-assets-19` ostaju otvoreni; nije mijenjan njihov acceptance niti status.

## Direktni testni dokaz

- `backend/src/modules/assets/asset-hard-delete.spec.ts` — svih osam dependency countova vraća `hasDependents`; lock prethodi provjeri; blokirani delete ne upisuje event/audit; čisti delete upisuje završni event i audit; SuperAdmin gate ostaje obavezan; `mapAssetError()` daje HTTP `409` sa sigurnim count detaljem.
- `backend/src/modules/assets/asset-hard-delete.integration.spec.ts` — PostgreSQL provjerava fizičko brisanje, cascade prazni live event redove, arhiva zadržava originalni event ID/tag/detalj i završni `deleted` event, history endpoint ograničen na SuperAdmin, globalni audit i DB-trigger blokadu direktnog brisanja kada postoji relacija.
- `backend/src/modules/assets/asset-relations-concurrency.integration.spec.ts` — cleanup fixturea prvo uklanja relacije, a event/asset state se usklađuje s novom arhivskom strategijom.
- `backend/src/common/database/database-runtime-contract.spec.ts` — runtime schema contract zahtijeva W7.15 migracijski sentinel.

## CI i testni dokaz

CI run [`41067304475`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41067304475) na finalnom testanom kodnom SHA `11f43efd37d448142f6c33f99096555ee8f7419d`:

- **Backend:** Prisma schema validate i generate, generisani client guard, build, lint, safety-net, wiring/SLA matrica i puni Jest suite — prošli.
- **PostgreSQL/Redis integration:** dependency/isolation harnessi, transakcijski rollback, real PostgreSQL integration i provjera release migrator historije — prošli. Svih 102 migracije replayovano je na disposable CI bazi.
- **Frontend:** lint, format, i18n, 427 testnih fajlova / 1.656 testova, build i bundle budžet — prošli.
- **Docs/CI gate/container:** docs guard, container/supply-chain provjere i CI gate — prošli.
- **Push CI skipped:** E2E install wizard i critical-flows poslovi preskočeni su na push triggeru; image high/critical enforcement korak imao je status `skipped`.
- **Prva PR validacija:** PR workflow `41071433209` prošao je backend build/test, PostgreSQL/Redis integration, container/supply-chain, docs guard i frontend build/test, ali je pao na `E2E critical flows`. Test `tests/54-dashboard.spec.ts:17` dobio je strict-mode grešku jer selector za neusmjerene tikete pronađe dva linka. Perf run [`41071433185`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41071433185) pao je na k6 pragovima; prosjek `db_queries_per_request` bio je `6.323` prema budžetu `2.1` preko 3.158 aplikacijskih zahtjeva.
- **Ponovna PR validacija na SHA `0bd5970593da5791efcec9c5e548a0db2e1fdb5d`:** CI [`41073878957`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41073878957) ponovo je prošao backend build/test, PostgreSQL/Redis integration, container/supply-chain, docs guard i frontend build/test, ali E2E critical flows nije mogao dohvatiti `GET /services` zbog `UND_ERR_CONNECT_TIMEOUT` prema `api.desk.ba101.top`. Perf run [`41073878668`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41073878668) prošao je 7/9 k6 pragova; `tickets_list_duration` i `http_req_failed` su pali, a query prosjek bio je `6.216` prema budžetu `2.1` preko 3.381 zahtjeva. Ovi padovi su u dashboard/ticket/performance provjerama izvan W7.15 putanja; nije rađen out-of-scope popravak. PR gate zato nije zelen i merge je blokiran dok se te provjere ne razriješe zasebno.
- **Neuspjeli push CI pokušaji:** nema; oba navedena push runa su zelena. PR-triggered padovi su posebno evidentirani iznad.

Lokalne ciljane provjere: `npm run lint` u backendu prošao je bez grešaka uz tri postojeća upozorenja u SLA testu; migration policy je prošao za 102 migracije i 2/2 testa. Frontend lint, format check, i18n, build i svi testovi prošli su lokalno. Lokalni ciljani Jest za asset unit test nije mogao učitati nedostajući generisani Prisma client jer je sandbox ranije blokirao TLS preuzimanje Prisma schema enginea; puni CI je uspješno generisao client i izvršio sve suiteove.

## Registar nalaza

- Zatvoren: `BA-assets-15` (P2).
- Ostaju otvoreni: `BA-assets-16`–`BA-assets-19`; nijedan susjedni nalaz nije zatvoren.
- Kontrolni zbir: **574** otvorena / **118** zatvorenih / **692** ukupno.
- Machine-readable source statusi: **577** otvorenih / **104** zatvorena / **11** historijskih. Ranija razlika od tri statusa ostaje zasebna obaveza usaglašavanja.

## Migracija, rollout i rollback

Migracija `20271030120000_asset_hard_delete_event_history` dodaje samo arhivsku tabelu, indeks, funkciju i trigger; nema `DROP` niti destruktivnog DDL-a i migration-policy approval hash nije potreban. Migracija je replayovana samo na disposable CI bazi. Ciljna instalacija nije poznata, `DATABASE_URL` nije postavljen, W7.15 migracija nije primijenjena i njen target migration status nije provjeren. Korisnička potvrda ranije uspješne primjene W7.14 ne koristi se kao dokaz statusa W7.15.

Prije rollouta provjeriti migracijsku historiju baš na ciljnoj bazi (`prisma migrate status`), osigurati backup i primijeniti samo W7.15 migraciju preko single-owner release migratora. Ne ponavljati W7.14 migraciju `20271030110000_asset_transfer_retention_lifecycle`. Aplikacijski runtime contract nakon deploya zahtijeva W7.15 sentinel.

Migracija je aditivna, ali trigger i arhiva se ne smiju ukloniti nakon što postoje arhivirani eventi: uklanjanje bi ponovo omogućilo gubitak historije ili implicitni cascade. Preferirati forward-only popravku. Povratak na staru aplikacijsku verziju uz zadržan trigger ne gubi podatke, ali može vratiti generičku DB grešku umjesto stabilnog API `409`; zato downgrade aplikacije nije potpuni API rollback i zahtijeva kompatibilnu korekciju prije upotrebe.

## Sljedeći paket

Nije odobren niti započet naredni paket. `BA-assets-16`–`BA-assets-19` ostaju otvoreni i zahtijevaju zasebno odobrenje prije implementacije.
