# W6.32 — BA-websocket-02: ticket-room revalidation (closeout)

**Datum:** 2026-11-07
**Finding:** `BA-websocket-02` (P1)
**Status:** zatvoren na finding nivou nakon generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration i actual Socket.IO room-revocation dokaza; ukupni CI gate nije zelen.
**Kodni commitovi:** [`1dc8814`](https://github.com/mudzy992/help-desk-enterprise/commit/1dc8814fc43c3acf7b36d031569579d27f7ccfdc), type-check follow-up [`5e8e45f`](https://github.com/mudzy992/help-desk-enterprise/commit/5e8e45fa2cfeb986d7f1bcd1e3961d88917c19ab) i outbox-idempotency follow-up [`af79131`](https://github.com/mudzy992/help-desk-enterprise/commit/af79131724316599e0cefc974ac9894e705bafd8).
**Finalni testani SHA:** `af79131724316599e0cefc974ac9894e705bafd8`.
**CI:** [`42387445250`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42387445250) — backend build/test, PostgreSQL+Redis integration, frontend i Docs su passed; ukupni gate je failed samo na image vulnerability enforcement.
**DB migracije:** nema.

## Nalaz i acceptance

Izvorni audit je našao da aktivne `ticket:<id>`, `ticket:<id>:staff` i `ticket:<id>:public` sobe nisu ponovo autorizovane nakon joina. Sada se lokalne aktivne/pending subscriptione označava ticket access epochom, room audience se mijenja tek nakon autoritativne provjere, a izgubljeni pristup uklanja ticket sobe i presence. Ako uklanjanje sobe ne uspije, socket se prekida umjesto da ostane u nesigurnoj sobi. Periodični safety sweep pokriva promjene koje ne stignu kroz fast event putanju.

Zatvara se samo finding da socket može neograničeno zadržati zastarjeli ticket-room pristup. Ne tvrdimo da je dokazana isporuka svake access-change invalidacije na svaku instancu: `ticket.updated` je brzi signal za subscriptione lokalne instance, dok je fallback po instanci najviše 60 sekundi između sweep tickova, uz dodatno vrijeme trajanja bounded authorization batcha. Potpun producer/cross-instance E2E acceptance ostaje u širem `BA-websocket-14`; `BA-websocket-03` takođe nije dio ovog paketa.

## Implementacija

- `TicketSocketSubscriptionRegistry` prati aktivne i pending joinove, vidljivost i epoch po ticketu. Promjena epohe tokom authorizationa sprečava registraciju stare odluke; per-socket/per-ticket lock serijalizuje join, leave i revalidation.
- `TicketChatGateway` reautorizuje ticket subscriptione na `ticket.updated`, a na svakoj instanci pokreće 60-sekundni single-flight fallback. Sweep prolazi ticket ID-eve kontrolisano; authorization poslovi dijele per-process limiter od 25 konkurenata.
- Reauthorization prvo napušta prethodne base/staff/public sobe pa se pridružuje base sobi i tačno jednoj audience sobi (`staff` ili `public`). Authorization denial/error uklanja sve ticket sobe i presence; neuspješan `leave` prisilno disconnecta socket.
- Ticket message, ticket update i ticket-scoped Edge fan-out čekaju tekuću access revalidation; presence zahtijeva trenutnu subscription/epoch provjeru i ponovo se provjerava nakon awaita. User-room fan-out je odvojeni put i nije mijenjan.
- `publish-persisted-ticket-messages.ts` objavljuje `ticket.updated` prije pripadajuće poruke. Durable awaited outbox putanja koristi `TicketRealtimeHub.publishTicketUpdatedAwaitedOnce`: isti `(ticketId, sourceMessageId)` uspješno objavljen ticket-update ne emituje se ponovo na retryju prateće poruke. Istovremeni isti publish se coalesce-a; neuspjeli publish se ne kešira i retry ostaje moguć. Dedupe cache je procesni, ograničen na 10.000 zapisa / 24 sata; nije durable ni cross-instance exactly-once garancija.
- Ostali ticket mutation producenti i potpuna cross-instance invalidation pokrivenost nisu iscrpno inventarisani; 60-sekundni safety sweep ostaje fallback, a BA-14 acceptance ostaje otvoren.

## Direktni testni dokaz

- `ticket-chat.gateway.spec.ts` pokriva stale authorization, fail-closed revoke, public/staff upgrade/downgrade bez preklapanja soba, čekanje message/Edge fan-outa tokom revalidationa, presence odbijanje i periodic fallback.
- `ticket-chat.gateway.socket.spec.ts` podiže stvarni Socket.IO server i stvarni `socket.io-client`. Sa mock autorizacijskim servisom test drži konekciju otvorenom, potvrđuje staff delivery prije promjene, staff→public zamjenu, uskraćivanje stare staff sobe, zatim revocation bez staff/public/base/Edge/presence isporuke dok klijent ostaje povezan. Ovo nije PostgreSQL test niti cross-instance/Redis test.
- `ticket-socket-subscriptions.spec.ts` i `ticket-socket-revalidation.spec.ts` pokrivaju registry epoch/pending lifecycle, limiter, bounded batch, single-flight sweep i failure handling.
- `ticket-realtime.hub.spec.ts` pokriva dedupe uspješnog updatea na outbox retryju, coalescing konkuretnog istog publish-a i retry nakon neuspješnog publish-a; `publish-persisted-ticket-messages.spec.ts` potvrđuje update-before-message redoslijed u awaited i best-effort putanjama.
- Lokalno na finalnom kodnom SHA-u: targeted ESLint passed; **6 Jest suites / 26 tests passed** uz ts-jest diagnostics isključene zbog nedostajućih lokalno generisanih Prisma artefakata; `git diff --check` passed. Ovo lokalno Jest izvršavanje samo po sebi nije type-check dokaz.

## CI i testni dokaz

Automatski push CI [`42387445250`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42387445250) na `af79131724316599e0cefc974ac9894e705bafd8`:

- **Passed:** generated-Prisma backend build sa annotated diagnostics, backend lint, suites ranije blokirane Prisma tipovima, wiring/SLA provjere i puni backend Jest; cijeli PostgreSQL+Redis integration job, uključujući `Verify deployment-wide connection budget` i `Run real PostgreSQL integration suites`; frontend audit/guardovi/lint/format/test/build/budgets; Docs guard.
- **Container/supply-chain — nije prošao u cjelini:** digest-pinned image build, SBOM, attestacija i runtime-contract provjere su passed, ali zero-high/critical enforcement je pao na `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (annotated fixed version `1.4-r0`). Ovaj dependency/image scope nije mijenjan.
- **Ukupni CI gate — failed** samo zbog container/supply-chain vulnerability enforcementa. **Skipped:** E2E critical flows, E2E install wizard i read-only service-form inventory; ništa nije ručno dispatchano.
- **Perf:** nije pokrenut za WebSocket path. Posljednji opaženi Perf [`42379825934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42379825934) ostaje **failed** na globalnom query budgetu `2.124 > 2.1` (50.707 requests, p95 3, max 34); nema BA-02 atribucije i prag nije mijenjan.

### Neuspjeli CI pokušaji i korekcije

1. Automatski CI [`42385698263`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42385698263) na `1dc8814` prijavio je `TS2367` za drugi direktni `client.disconnected === true` check zbog TypeScript control-flow narrowing-a. `socketIsDisconnected()` helper u `5e8e45f` to je ispravio; finalni generated-Prisma build je passed. U tom runu connection-budget i image-build koraci takođe nisu prošli; raw failed-job log preuzimanja vratila su `EOF`, pa se uzrok tih ranijih koraka ne nagađa.
2. CI [`42386156410`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42386156410) na `5e8e45f` prošao je backend build/lint/full Jest, ali real PostgreSQL suite je otkrio paketnu grešku: outbox retry je nakon uspješnog `ticket.updated` publish-a ponovio isti update kada je kasnije prateći message publish pao, te je `ticket-playbook-auto-attach.integration.spec.ts` vidio dupli `sourceMessageId`. Ovo je bilo uvedeno u ovom paketu, nije preegzistentni/nepovezani kvar. `af79131` je dodao bounded, retry-safe idempotency za uspješne awaited ticket-update publikacije i unit testove; finalni real PostgreSQL+Redis integration job u `42387445250` je passed.
3. Image vulnerability enforcement ostaje jedini failed job u finalnom runu zbog navedene critical zlib CVE; image build i attestacija su u finalnom runu prošli.

## Registar nalaza

- Zatvoren: `BA-websocket-02` (P1), samo na finding nivou.
- Ostaju otvoreni: `BA-websocket-03` (P1), `BA-websocket-05`–`13` i širi `BA-websocket-14` (P3); globalni BA-15 full critical-flow acceptance ostaje pending.
- Val 6: **36/109 zatvorenih**, **73 otvorena** (15 P1 / 41 P2 / 17 P3). Status-page ostaje 19/19; notifications ostaje 14/15.
- Izvorni audit/generisani plan: **525 otvoren / 167 zatvoren / 692 ukupno**. Redovi globalnog registra: **535 otvoren / 157 zatvoren / 692 ukupno**. Ista deset statusnih divergencija (`BA-authorization-02`, `BA-rbac-04`, `BA-routing-05/06/07`, `BA-status-page-07/08/10`, `BA-users-04/05`) ostaje netaknuta; nisu usklađivani drugi nalazi. Baseline websocket ocjena **4,88/10** nije rescoraan.

## Migracija, rollout i preostale granice

Nema schema promjene niti migracije; nije korištena target baza. Kod je samo commitan i pushan na `arena/864951a6-help-desk-enterprise`; nema PR-a, mergea ili deploymenta. Live-socket acceptance je jedan lokalni Socket.IO server sa mock authorizationom, ne deployed runtime potvrda. `ticket.updated` fast-path delivery na sve instance, potpuni audit svih mutation producenata i `BA-websocket-14` E2E ostaju izvan ovog closeouta.

## Sljedeći paket

**W6.33 — `BA-websocket-03` (P1):** group/admin revocation i fail-closed room lease. Nije započet u ovom paketu; full CI gate ostaje failed zbog image vulnerability enforcementa.