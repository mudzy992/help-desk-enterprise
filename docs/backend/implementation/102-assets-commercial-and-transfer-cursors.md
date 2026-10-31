# Package closeout — W7.16

**Paket:** W7.16 — cursor paginacija komercijalnih i transfer lista<br>
**Nalaz:** `BA-assets-16` (P3) — implementacija isporučena; nalaz ostaje otvoren jer finalni CI gate nije zelen<br>
**Kodni commit:** `5647a718b1ef26c6a0eb4280ce7d4dc407d37a85` + korekcija `43547a410061cb48c472db4c2ac887cff756f14c`<br>
**Finalni testani SHA:** `43547a410061cb48c472db4c2ac887cff756f14c`<br>
**CI:** [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) — nije zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit je našao tiho hard-trunciranje lista licenci, ugovora, contract items, license assignments, asset coverage i transfer pogleda `mine`/`forAsset`. Acceptance je bio omogućiti nastavak kroz sve rezultate uz stabilan cursor, determinističan redoslijed i `hasMore`/`nextCursor`, te zadržati OU/scope filtriranje i postojeće limite write operacija.

Implementacija je isporučena, ali `BA-assets-16` se **ne označava zatvorenim**: finalni W7.16 CI run pao je na E2E testu 56. Korisnik je izričito odobrio početak W7.17 uprkos tom padu; to je izuzetak za redoslijed rada, ne zelen CI rezultat, ne waiver za sam test i ne odobrenje da se prag snizi ili test preskoči.

## Implementacija

- Komercijalne licence, license assignments, ugovori, contract items, coverage liste i transfer liste `mine`/`forAsset` koriste cursor stranice sa oblikom `{ items, hasMore, nextCursor }`; podrazumijevani limit je 50, najveći 100.
- Stranice koriste deterministične sort ključeve i odgovarajući ID/composite cursor. UI i API klijenti podržavaju nastavak učitavanja i čuvaju postojeće scope/redaction provjere.
- Postojeći limit do 500 contract items u poslovnoj write operaciji nije mijenjan. Nije uvedena schema promjena niti je obrađen drugi audit nalaz.

## Direktni testni dokaz

- `backend/src/modules/assets/asset-pagination.spec.ts` — `hasMore` i `nextCursor` vraćaju cursor posljednjeg uključenog reda samo kad postoji naredna stranica.
- `backend/src/modules/assets/asset-licenses.spec.ts` — licenca i assignment stranice koriste cursor i traže `limit + 1` red.
- `backend/src/modules/assets/asset-contracts-pagination.spec.ts` — ugovor i composite contract-item cursor; vidljiv broj itema i scope ostaju odvojeni od paginacije.
- `backend/src/modules/assets/transfers/asset-transfers.service.spec.ts` — `mine` i `forAsset` stabilno nastavljaju stranice.
- CI je izvršio backend Jest i PostgreSQL/Redis integration suiteove na finalnom SHA; frontend suiteovi su izvršeni u frontend CI poslu. Nije dodan novi DB integration suite baš za W7.16.

## CI i testni dokaz

Finalni CI run [`41227539110`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539110) na `43547a410061cb48c472db4c2ac887cff756f14c`:

- **Backend build + test:** passed.
- **PostgreSQL/Redis integration:** passed.
- **Frontend build + test:** passed.
- **Docs guard:** passed.
- **Backend container + supply chain:** job passed; enforcement nula high/critical image ranjivosti je `skipped`, jer workflow taj korak pokreće samo kad je vulnerability `count != 0`.
- **E2E critical flows:** failed; sažetak je bio 117 passed / 1 failed / 2 flaky / 2 skipped. Test `56-definitive-frontend-closeout.spec.ts:186` prešao je long-task prag na `/tickets?view=all`: 306 ms prema 250 ms.
- **E2E install wizard:** `skipped` na push triggeru.
- **CI gate:** failed zbog E2E critical flows neuspjeha.
- **Perf smoke:** finalni [`41227539109`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41227539109) na istom SHA je passed.

Neuspjeli pokušaji i korekcije:

- CI [`41226695090`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41226695090) na početnom SHA `5647a718b1ef26c6a0eb4280ce7d4dc407d37a85` pao je na backend route/guard/root-module wiring snapshotu i frontend Prettier provjeri. Wiring manifest i format/wiring korekcije su u `43547a41`.
- Perf smoke [`41226695202`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41226695202) na `5647a718` pao je na `ticket_message_duration` p95: 1358.79 ms prema 1000 ms pragu; finalni perf smoke `41227539109` je prošao.
- E2E run [`41217608145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41217608145) bio je zelen na ranijem SHA `5632fae46d7cb598fea6b71e50a3bd7ff60843d1`; ne mijenja rezultat finalnog runa na W7.16 SHA `43547a41`.
- Zahtjev `gh run rerun 41227539110 --failed` GitHub je odbio uz poruku da se run ne može ponoviti jer workflow file možda nije ispravan. Nema zelenog ponovljenog W7.16 CI gatea. Test 56 nije izmijenjen, preskočen ni prag mu je snižen.

Dodatne lokalne provjere: frontend suiteovi (`427` fajlova / `1.656` testova), frontend build i puni frontend format check su prošli; backend wiring provjera je prijavila 99 controllera i 618 ruta. Lokalno generisanje Prisma klijenta bilo je blokirano TLS preuzimanjem `schema-engine`, pa lokalni backend testovi koji zavise od tog generisanog klijenta nisu prikazani kao prošli. Puni backend i integration suiteovi jesu prošli na CI SHA-u, kako je gore navedeno.

## Registar nalaza

- Zatvoreni: nema.
- Ostaje otvoren: `BA-assets-16` — finalni CI gate nije zelen; nije zatvoren samo na osnovu implementacije.
- Susjedni nalazi `BA-assets-17`–`BA-assets-19` nisu zatvoreni ovim paketom.
- Kontrolni zbir na W7.16 checkpointu: **574 otvorena / 118 zatvorenih / 692 ukupno**. Machine-readable source prikazuje **577 otvorenih / 104 zatvorena / 11 historijskih statusa**; postojeće odstupanje od tri statusa ostaje zasebno i nije mijenjano.

## Migracija, rollout i rollback

Nema Prisma schema promjene ni DB migracije; ciljna baza nije mijenjana. API i frontend ugovor za ove liste promijenjen je zajedno, pa ih treba isporučiti kao kompatibilan backend/frontend release. Rollback je povratak iste verzije backend i frontend aplikacije; nema DB backfilla ni schema rollbacka.

Nije otvoren PR. Svaki novi PR prema `master` i dalje zahtijeva tri zasebna jasna odobrenja korisnika.

## Sljedeći paket

**W7.17 — `BA-assets-17` (P3):** template `latest + 1` version race vraća konflikt bez alokacijskog retry ugovora. Korisnik je izričito odobrio da W7.17 počne uprkos W7.16 testu 56; ova sekvenca je dokumentovani izuzetak i ne mijenja status W7.16 CI gatea.
