# W6.25 — BA-notifications-08: stabilna cursor-paginacija inboxa

**Audit nalaz:** `BA-notifications-08` (P2), [audit 17 — notifications, §26](../audits/17-notifications.md#26-statusna-dopuna--ba-notifications-08-closeout-2026-11-06)<br>
**Status:** zatvoren samo ovaj bounded nalaz; Val 6 nije završen<br>
**Kodni i finalni testani SHA:** [`9a581f0`](https://github.com/mudzy992/help-desk-enterprise/commit/9a581f07b7103c2b7d33b5068b2db3af5dda0782)<br>
**CI:** [`42233259247`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259247) — success<br>
**Perf:** [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) — failure na globalnom query budgetu; nije zelen<br>
**Schema/migracija:** nema promjene, nije potrebna migracija za BA-08

## Nalaz i prihvatni uslov

Inbox je ranije vraćao samo ograničen najnoviji skup redova, bez cursor/`hasMore` ugovora; starija historija nije bila dohvatljiva. Prihvatni uslov je stabilna paginacija bez offseta i bez preskakanja/dupliranja redova pri istim timestampovima, uz isti unread-only filter na svakoj stranici i vidljivu UI kontrolu za nastavak/ponovni pokušaj.

## Implementacija

- Backend koristi deterministički redoslijed `createdAt DESC, id DESC` i keyset granicu `(createdAt,id)`. Upit čita `limit + 1` red radi `hasMore`; `nextCursor` se izdaje samo kada postoji naredna stranica, inače je `null`.
- Cursor je verzionirani base64url payload sa kanonskim timestampom i ID-em. Dekoder validira verziju, format, dužine, korisnika i unread-filter binding te neispravan/nepodudaran cursor odbija kao `INVALID_NOTIFICATION_CURSOR`. Efektivni `limit` ostaje ograničen na default **30** i maksimum **50**.
- `unreadOnly` ulazi i u list predicate i u filter binding cursora, pa se unread-only semantika zadržava preko svih stranica. Postojeća audience/membership vidljivost i unread count se nastavljaju računati server-side.
- API response sada vraća `hasMore` i `nextCursor`; nema offset contracta, Prisma schema/index promjene ni migracije.
- Frontend inbox dobija unread filter, „učitaj starije“ i retry UI. Hook čuva cursor/page stanje, odbacuje zastarjele odgovore, i nakon mark-one/mark-all read akcije otkazuje pending list zahtjev te osvježava prvu stranicu ako je zahtjev bio u toku.

## Direktni testni dokaz

- `notification-list-cursor.spec.ts` pokriva validan cursor, neispravne payload/timestamp/ID slučajeve i odbijanje cursora vezanog za drugi user ili unread filter.
- `notifications-list-pagination.spec.ts` pokriva stabilne tie-breakove pri jednakom `createdAt`, stranice bez dupliranih/propuštenih redova, `hasMore`/`nextCursor` i unread-only filter kroz više stranica.
- `notifications-list-pagination.integration.spec.ts` provjerava istu keyset semantiku nad disposable PostgreSQL-om; suite je registrovan u `run-isolated-integration.mjs`, a guard test potvrđuje registraciju.
- Frontend hook/panel/API testovi pokrivaju cursor slanje, unread parity, load-more/retry i UI prikaz. Hook regresija posebno dokazuje da stale page response nakon `markAllRead` ne vrati već pročitane notifikacije u listu.

## CI i lokalni dokaz

CI [`42233259247`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259247) na SHA `9a581f0` je **success**:

- **Backend:** Prisma client generation, build, lint i puni Jest suite su prošli.
- **PostgreSQL/Redis integration:** integration posao je prošao, uključujući registrovani BA-08 real-PostgreSQL suite i migration replay samo u disposable CI bazama.
- **Frontend:** ESLint, Prettier, puni Vitest suite, production build i bundle/cold-route budget su prošli.
- **Docs/container/CI gate:** Docs guard, container/supply-chain i CI gate su prošli.
- **Skipped:** E2E critical flows, E2E install wizard, read-only service-form inventory i uslovni image-enforcement korak bili su `skipped`; nisu passed niti su ručno dispatchani.

Lokalno, `frontend npm run build` je prošao, a puni frontend suite je prošao **441 fajl / 1.695 testova**. Ciljani frontend ESLint, backend ESLint i `node --test scripts/run-isolated-integration.test.mjs` (**15/15**) su prošli. Cursor/pagination logic testovi su lokalno prošli **6/6** sa `ts-jest` diagnostics isključenim. Normalni lokalni backend typechecked test run nije bio dostupan jer generisani Prisma artefakti nedostaju; `npm run db:generate` se zaustavio pri mrežnom preuzimanju Prisma schema enginea (`binaries.prisma.sh`) prije bilo kakvog DB pristupa. To ograničenje ne zamjenjuje CI rezultat: CI je generisao klijent i prošao puni backend suite.

Nakon izrade docs closeouta, `node scripts/check-backend-findings.mjs`, njegovih testova (**13/13**), `node scripts/check-docs-content.mjs` i docs guard testova (**9/9**) su prošli. Dokumentacijski commit je `docs/**`/Markdown-only i zato nije očekivano da push-triggeruje novi CI/Perf run; code CI/Perf evidencija iznad odnosi se tačno na SHA `9a581f0`.

## Perf, acceptance i otvorena ograničenja

Automatski Perf [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) završio je sa `avg db_queries_per_request=2.125`, iznad nepromijenjenog budgeta **2.1**. Ostali prijavljeni latency/payload gateovi su prošli. Run ne izoluje inbox cursor putanju niti dokazuje da je BA-08 uzrok globalnog prosjeka; query pragovi nisu mijenjani i scope nije proširen radi ovog rezultata. Perf zato nije zelen.

E2E critical/install/inventory poslovi u push CI-ju bili su `skipped`; BA-15 full critical-flow acceptance ostaje zasebno pending. Ovaj closeout ne zatvara BA-15 niti druge Val 6 nalaze.

## Registar, migracija i handoff

- Zatvoren je samo `BA-notifications-08`. Notifications sada ima **8/15** zatvorenih; `BA-notifications-09`–`15` ostaju otvoreni.
- Val 6 ima **27/109** zatvorenih i **82 otvorena** nalaza (18 P1 / 44 P2 / 20 P3); cijeli Val 6 nije završen. Status-page 29 ostaje **19/19**. BA-15 full critical-flow acceptance je i dalje pending.
- Izvorni audit/generisani plan: **534 otvorena / 158 zatvorenih**. Redovi globalnog registra: **544 otvorena / 148 zatvorenih**. Deset ranijih izvor/global statusnih razlika nije mijenjano. Baseline **5,05/10** nije rescoraan.
- BA-08 nema schema promjene i ne zahtijeva migraciju. Nije korištena target baza niti je lokalno pokretana migracija; CI koristi disposable baze. Nema PR-a, mergea ni deploymenta.
- Prethodni Coolify redeploy blocker je zaseban; raniji redeploy handoff je propustio navesti potrebnu migraciju, a tačan migration ID u ovoj sesiji nije utvrđen. Ne zaključivati niti pogađati ID iz BA-08. Prije bilo kakve buduće redeploy preporuke treba prvo potvrditi tačan potreban migration ID i sequencing. S obzirom da Perf nije zelen, nema sadašnje pull/merge/redeploy preporuke.
- Sljedeći mogući bounded nalaz je `BA-notifications-09` (P2), ali nije započet i traži zasebnu autorizaciju; ovo nije odobrenje za ostatak Val 6.
