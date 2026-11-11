# Package closeout — W7.19

**Paket:** W7.19 — concurrency/failure E2E matrica za assets<br>
**Nalaz:** `BA-assets-19` (P3) — zatvoren samo ovaj nalaz; `BA-assets-16` i svi susjedni nalazi ostaju netaknuti<br>
**Kodni commit:** `93f9feb8ada3aef1ce9d8480ce4f96d1472f751a` (`test(assets): add concurrency and failure matrix`)<br>
**Dodatni CI-fix commit:** `3ee7de073639719d5591a399ffbc0f3057668f14` (`fix(e2e): correct dashboard and asset metrics semantics`)<br>
**Testani SHA-jevi:** package E2E `93f9feb8ada3aef1ce9d8480ce4f96d1472f751a`; push CI `3ee7de073639719d5591a399ffbc0f3057668f14`<br>
**CI:** targeted E2E [`41314175993`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41314175993) zelen za odabrane assets specove; branch push CI [`41302730701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41302730701) zelen za poslove koji su pokrenuti<br>
**DB migracije:** nema; nije mijenjan Prisma schema ni produkcijski DB ugovor

## Nalaz i acceptance

`BA-assets-19` traži dokazivu concurrency/failure E2E matricu i zatvaranje lokalne compile blokade za asset service suiteove kroz CI koji generiše Prisma client. W7.19 dodaje ciljane race/failure scenarije u E2E 23, 27 i 28, registruje postojeći hard-delete PostgreSQL acceptance suite u isolated integration runneru i provjerava sam runner. CI backend posao generiše Prisma client, pokreće compile-safety suites i puni Jest; na SHA `3ee7…` taj posao je prošao. Lokalni sandbox i dalje nema potpun generated Prisma client za svih sedam service suiteova, pa se lokalno compile izvršenje tih suiteova ne tvrdi.

Ciljani E2E run `41314175993` izvršio je baš specove 23, 27 i 28 na SHA `93f9…`: **8 passed, 0 failed, 0 flaky, 0 skipped**; svi testovi su prošli iz prvog pokušaja. Run je pokrenut na `master`, ne na aktivnoj Arena grani. W7.19 testni sadržaj je na istom SHA-u; naknadni `3ee7…` branch commit ne mijenja specove 23/27/28, a njegov push CI je zasebno prošao. Zato se runovi navode odvojeno, bez predstavljanja targeted runa kao CI na SHA `3ee7…`.

Puni scheduled run [`41283381903`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41283381903) nije acceptance run za W7.19: pokrenut je na `master` SHA `24ed17a0a347d0205ef5f0b4496e5830ed2e250e`, prije test-matrix SHA-a. Bio je ne-zelen i ostaje evidentiran ispod; ne prikazuje se kao pass niti se njegov E2E neuspjeh prešućuje.

U istom punom runu test 56 je mjerio `/services` long-task **359 ms** prema nepromijenjenom pragu **250 ms**. Nije pronađen uzrok u zatvorenim `BA-assets` stavkama. Najdirektnije odgovara otvorenom P2 `BA-service-catalog-10` u auditu 15: `/services` i povezani form/downtime readovi su neograničeni, bez paginacije/row-byte-time budžeta, a katalog može učitati sve servise i povezane podatke. To je snažna podudarnost sa scenarijem od 500 servisa, ali bez trace/artefakta koji je bio dostupan nije dokazano koji pojedinačni API/React korak proizveo svih 359 ms. Zatvoreni `BA-status-page-10` odnosi se na status-page rutu, ne na `/services`; audit 34 je onboarding workflow i ne opisuje ovaj list-read nalaz. `/services` performansni rad se ne uvodi u W7.19.

Ovo zatvara **samo `BA-assets-19` kao paketni nalaz** na osnovu ciljanog E2E acceptancea i zelenog package/code CI gatea. Ne tvrdi da je cijeli assets segment završio full E2E/Perf sign-off: puni E2E run `41283381903` je pao, a zaseban Perf smoke nije pokrenut. `BA-assets-16` ostaje otvoren; nijedan susjedni status nije promijenjen.

## Implementacija

- `e2e/helpers/assets.ts` daje zajedničke API/settings/cleanup pomoćnike za E2E 23–28; privremena testna podešavanja vraćaju se u `finally`, a stvorena oprema se čisti bez ostavljanja aktivnih asseta.
- E2E 23 šalje dva status updatea sa istom verzijom: tačno jedan CAS upis uspijeva, drugi dobija `409 ASSET_VERSION_CONFLICT`; završna verzija raste jednom i nastaje jedan status event.
- E2E 27 paralelno primjenjuje isti import: jedan zahtjev primjenjuje batch, drugi dobija stabilan `409`; ponovna primjena odbija se kao ne-pending. Test provjerava terminalni rezultat i nastale redove.
- E2E 28 pokriva konkurentno kreiranje iste unique vrijednosti atributa (`ASSET_ATTRIBUTE_NOT_UNIQUE`) i dupli relation edge (`ASSET_RELATION_EXISTS`); svaki race ostavlja tačno jedan DB/API rezultat i jedan odgovarajući event.
- `backend/scripts/run-isolated-integration.mjs` sadrži `asset-hard-delete.integration.spec.ts`; harness testovi provjeravaju suite registry, izolovano/sigurno ime baze i URL path. Nema izmjene hard-delete politike: W7.15 fail-closed dependency gate i AssetEvent arhiva ostaju nepromijenjeni.
- Follow-up commit `3ee7…` ispravlja još dva CI nalaza iz runa `41283381903`: validnu `<dl>` semantiku za asset operations metrike uz structural regression assertion i scope dashboard ticket-link assertiona na metric grid. To nisu promjene statusa susjednih BA nalaza.
- Nisu mijenjani `BA-assets-16`, druga W7.19/asset poslovna pravila, W7.15 hard-delete ponašanje, audit arhiva, API response ugovori ni DB schema.

## Direktni testni dokaz

- `e2e/tests/23-assets.spec.ts` — konkurentni status CAS: jedan pobjednik, jedan 409, jedna verzija i jedan event.
- `e2e/tests/27-assets-import-export.spec.ts` — paralelni APPLY claim, tačno jedan uspješan apply, stabilno odbijanje konkurentnog/ponovljenog zahtjeva i očekivani asset redovi.
- `e2e/tests/28-assets-catalog-coverage.spec.ts` — unique-attribute i relation duplikat race; tačno jedan commit/event za svaki invariant.
- `backend/scripts/run-isolated-integration.test.mjs` — **3/3** harness testa prošla lokalno; `node --check backend/scripts/run-isolated-integration.mjs` prošao.
- `asset-hard-delete.integration.spec.ts` je uključen u `integrationSpecs`; CI PostgreSQL/Redis integration job je passed. Suite-specific raw CI log/test-count nije korišten za tvrdnju o pojedinačnom broju testova.
- Lokalni E2E `npx tsc --noEmit -p tsconfig.json` prošao; Playwright discovery je našao **8** testa u specovima 23/27/28. Lokalna discovery/typecheck nisu predstavljeni kao live-stack E2E izvršenje.
- Frontend follow-up lokalna provjera: ciljani `ops-health-metrics` spec **4/4**; puni Vitest **428 fajlova / 1.660 testova**; ESLint, Prettier, i18n check, production build i bundle/cold-route budget su prošli.

## CI i testni dokaz

### Targeted E2E — [`41314175993`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41314175993)

- SHA: `93f9feb8ada3aef1ce9d8480ce4f96d1472f751a`; `head_branch=master`; `workflow_dispatch`; odabrani specovi `23,27,28`.
- **E2E critical flows:** passed; rezultat `8 passed, 0 failed, 0 flaky, 0 skipped`.
- **Detect changes, Docs guard, CI gate:** passed.
- **Frontend build/test, backend build/test, PostgreSQL/Redis integration, container/supply chain, E2E install wizard:** `skipped` u ovom targeted dispatchu; nisu passed niti se računaju kao takvi.

### Push CI aktivne grane — [`41302730701`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41302730701)

- SHA: `3ee7de073639719d5591a399ffbc0f3057668f14`; branch `arena/864951a6-help-desk-enterprise`.
- **Detect changes, frontend build/test, backend build/test, PostgreSQL/Redis integration, backend container/supply chain, Docs guard, CI gate:** passed.
- **E2E critical flows i E2E install wizard:** `skipped` po push cadence politici.
- **Image high/critical enforcement korak:** `skipped` zbog workflow uslova; nije tretiran kao izvršen.
- Run ne uključuje full E2E niti Perf smoke.

### Neuspjeli full E2E pokušaj — [`41283381903`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41283381903)

- Scheduled run na `master` SHA `24ed17a0a347d0205ef5f0b4496e5830ed2e250e`, ne na W7.19 branch SHA.
- **Passed:** Detect changes, backend build/test, PostgreSQL/Redis integration, frontend build/test, Docs guard i container/supply-chain job.
- **Failed:** E2E critical flows i CI gate. E2E check-run summary prijavio je `0 passed, 9 unexpected, 2 flaky, 2 skipped, 0 not-run`; dva flaky naziva nisu dostupna u sažetku.
- **E2E install wizard:** `skipped`. Container koraci za image materialization/provenance/high-critical enforcement također su bili `skipped`; nisu passed.
- Prijavljeni problemi: API connection timeouts prema `api.desk.ba101.top:443` u specovima 12, 14, 15 i 45; host navigation timeout u specu 55; neispravna definition-list semantika u specu 22 (korigovana u `3ee7…`); dupli dashboard ticket-link locator u specu 54 (locator sužen u `3ee7…`); `/services` test 56 `359 ms / 250 ms` (ostaje za otvoreni `BA-service-catalog-10`). Dva testna skipa bila su 30 i 38. Pokušano preuzimanje failure loga i Playwright artefakta završilo je `EOF`; zato se flaky nazivi ne izmišljaju.
- Ručni `gh workflow run` poziv iz ovog sandboxa ranije je vraćao `HTTP 403: Resource not accessible by integration`. Korisnički pokrenuti targeted run `41314175993` je uspio; neuspjeli dispatch pokušaj nije prikazan kao pass.

### Perf i lokalna ograničenja

- Zaseban Perf smoke za W7.19 nije pokrenut. E2E test 56 je browser long-task mjerenje, nije Perf workflow rezultat.
- Lokalni sandbox nema podešenu E2E live-stack konfiguraciju niti potvrđenu ciljnu bazu; lokalni full live E2E, target DB status i migracije nisu pokretani. Nisu tražene niti izložene tajne. CI je koristio izolovane/disposable servise.
- `gh workflow run` dispatch iz integracijskog konteksta dobio je 403; zato se oslanja na postojeći korisnički targeted run i push CI, bez ponavljanja istog dispatch pokušaja.

## Registar nalaza

- Zatvoren: samo `BA-assets-19` (P3), uz W7.19 ciljane E2E scenarije i package CI gate.
- Ostaje otvoren: `BA-assets-16` (P3); ne mijenja se ovim closeoutom.
- `BA-assets-01`–`BA-assets-15`, `BA-assets-17` i `BA-assets-18` zadržavaju ranije statuse; nijedan susjedni nalaz nije izmijenjen.
- Deklarisani kontrolni zbir nakon W7.19: **571 otvoren / 121 zatvoren / 692 ukupno**.
- Machine-readable source nakon W7.19: **574 otvorena / 107 zatvorenih / 11 historijskih / 692 ukupno**. Preegzistentna razlika od tri statusa ostaje netaknuta i izvan ovog paketa.
- Severity baseline ostaje **174 P1 / 368 P2 / 150 P3**; W7.19 mijenja samo status jednog P3 nalaza.
- PR: nije otvoren za aktivnu Arena granu; nema mergea, brisanja ni prebacivanja grane.

## Migracija, rollout i rollback

- Nema Prisma schema promjene, migracije, backfill-a ni promjene produkcijskog API contracta. Nema manual DB apply koraka.
- Test/harness rollout je code-only; E2E helper vraća settings i čisti testne assete u `finally`. Runtime rollout ne zahtijeva dodatne korake.
- Ako se testna matrica ili harness pokaže problematičnim, mogu se vratiti samo W7.19 test/helper/runner promjene; nema DB rollbacka ni produkcijskih podataka koje bi trebalo popraviti. W7.15 hard-delete trigger/arhiva ne smiju se uklanjati kroz ovaj rollback.

## Sljedeći paket

**Preporuka nakon W7.19:** otvoriti usko definisan rad na `BA-service-catalog-10` (P2) iz [audita 15 — service-catalog](../audits/15-service-catalog.md), umjesto da se `/services` long-task problem pripiše `BA-service-onboarding-20` iz audita 34. `BA-service-catalog-10` direktno pokriva neograničene service/list/form/downtime reads i povezano neograničeno učitavanje. Prije implementacije sačuvati 250 ms prag, reproducirati 500-service fixture, razdvojiti server payload/query i browser render long-task te uvesti bounded/paginated read i regression testove. Ovaj sljedeći paket nije započet niti mijenja `BA-service-catalog-10` status.

**Segment-level gate:** full E2E i Perf smoke ostaju zasebno nezavršeni; ne označavati ih kao passed na osnovu targeted runa ili push CI-a. `BA-assets-16` također ostaje otvoren i izvan W7.19 scopea.
