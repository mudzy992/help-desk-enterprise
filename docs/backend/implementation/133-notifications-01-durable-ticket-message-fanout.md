# W6.18 — BA-notifications-01 durable ticket-message fan-out closeout

**Paket:** W6.18 — durable ticket-message notification fan-out<br>
**Nalaz:** `BA-notifications-01` (P1) — zatvoren na nivou nalaza<br>
**Kodni commit:** [`c5cfac4`](https://github.com/mudzy992/help-desk-enterprise/commit/c5cfac49c5fc11081203ed90506cf3e444eeed99)<br>
**Test-fix commit:** [`0e84472`](https://github.com/mudzy992/help-desk-enterprise/commit/0e84472f0ec625af6453efef5641ac10e982378c)<br>
**Finalni testani SHA:** `0e84472f0ec625af6453efef5641ac10e982378c`<br>
**CI:** [`42043805181`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42043805181) — success<br>
**Perf:** [`42042167541`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42042167541) — success na performance-relevant SHA `c5cfac4`; naredni commit je mijenjao samo testne fajlove<br>
**DB migracija:** `20271031160000_notifications_ticket_message_fanout_outbox` — aditivna, replayovana samo na disposable CI PostgreSQL bazi; target nije provjeren niti migriran

## Nalaz i acceptance

Prije paketa, primarni ticket-message fan-out zavisio je od process-local `TicketRealtimeHub` subscriptiona i detached `void` rada. Pad/restart između ticket commita i obrade mogao je izgubiti inbox/email/downstream obradu, bez trajnog work itema za replay.

Paket zatvara samo `BA-notifications-01`: novi ticket message atomski dobija durable fan-out intent, worker obrađuje intent poslije commita i može ga retry/replayati, a integration acceptance dokazuje da se nakon consumer restarta upisuje tačno jedan deduplicirani requester inbox red. Ne tvrdi exactly-once ishod svakog eksternog SMTP/Edge providera i ne zatvara susjedne notification nalaze.

## Implementacija

- PostgreSQL trigger `TicketMessage_notification_fanout_outbox` dodaje `notification.ticket-message.fanout` poruku u `OutboxMessage` u istoj transakciji kao svaki novi `TicketMessage`. `dedupeKey` je message ID; rollback business transakcije vraća i intent.
- Namjerno nema historical backfilla: nije pouzdano razlikovati stare neobrađene od već isporučenih poruka, a replay historije bi mogao izazvati notification storm.
- `NotificationFanOutOutboxProcessor` validira intent/source zapise i koristi zajednički transactional outbox claim/retry/dead-letter/replay ugovor. Nedostajući izvorni message/ticket je no-op; neispravan ili nepodudaran payload retryable je greška. Replay dead-lettera ima cooldown i health vraća pending/processing/dead-letter stanje.
- `NotificationsFanOutService` više se ne pretplaćuje na process-local ticket hub kao izvor istine. Worker pokušava in-app i email kanale nezavisno; greške se propagiraju radi outbox retryja. Postojeći dedupe ključevi štite persisted notification/email redove, dok realtime/Edge ostaju posljedica obrađenog fan-outa.
- SLA runtime sistemski ticket eventi ulaze u isti DB-trigger put; odvojen detached SLA notification dispatch je uklonjen.
- Backend OpsHealth izlaže `notificationFanOutOutbox`; frontend prikazuje status uz rolling-deploy kompatibilan optional API field, a odsutan field ne pogoršava status.
- Schema sentinel i isolated integration registry su ažurirani na novu migraciju/suite. Nema HTTP API breaking promjene.

## Direktni testni dokaz

- `notification-fan-out-outbox.integration.spec.ts` koristi ticket sa `assignedUserId` agent fixtureom i čisti oba testna usera u `afterAll`.
- PostgreSQL integration test potvrđuje da commit kreira tačno jedan `PENDING` intent, a rollback uklanja i `TicketMessage` i intent.
- Replay test kreira `AGENT_REPLY`, zatim instancira processor nakon commita (restart simulacija), poziva `drain` dva puta i provjerava tačno jedan requester `Notification` red sa `dedupeKey=ticket.message:<messageId>` i `OutboxMessage.status=SUCCEEDED`.
- `notification-fan-out-outbox.processor.spec.ts` i fan-out service unit suite provjeravaju validaciju, source mismatch/no-op, retry, health/replay i nezavisnu obradu kanala.
- SLA scan batching test je ažuriran da poslije trajnog outbox prelaza očekuje nula dodatnih per-ticket `findUnique` čitanja u scanneru.

## CI i Perf dokaz

Prvi automatski CI pokušaj [`42042167658`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42042167658) na implementation SHA-u pao je iz dva korigovana test razloga: integration callback je imao implicitni `any`, a SLA batch test je još očekivao stari process-local notification read. `0e84472` dodao je eksplicitan `TicketRealtimeMessagePayload` tip i ispravio query assertion; nije mijenjao produkcijski runtime kod.

Finalni CI [`42043805181`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42043805181) na `0e84472` je **success**:

- Backend generated-Prisma schema/client, build, lint, executable SLA matrix i full Jest suite — passed.
- PostgreSQL + Redis migration replay i real integration suites — passed; CI je generisao Prisma client i primijenio migracije samo na disposable DB-u. New notification fan-out integration suite je registrovan i pokrenut u tom jobu.
- Frontend lint/format, testovi, build i bundle checks — passed; docs guard, container/supply-chain job i CI gate — passed.
- `E2E critical flows`, `E2E install wizard` i read-only service-form inventory bili su `skipped` na pushu; nisu dio BA-notifications-01 replay acceptancea i ne označavaju se kao passed.

Perf smoke [`42042167541`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42042167541) je **success** na performance-relevant runtime SHA `c5cfac4`: query-budget prosjek `1.915` kroz `50,393` zahtjeva, p95 `2`, max `34`, gate `2.1`; svi k6 pragovi prošli su. Follow-up SHA `0e84472` mijenja samo dvije testne datoteke, zato novi Perf run nije pokrenut po path filteru. Pragovi nisu mijenjani.

Dodatne lokalne provjere prije finalnog CI-ja: backend ESLint za izmijenjene specove, migration-policy check za 106 migracija, isolated integration harness 12/12, wiring testovi 6/6, Pulse design-system check, `git diff --check`, frontend testovi 19/19, frontend ESLint/Prettier i production build — passed. Lokalni generated Prisma client nije prisutan, pa lokalni backend Jest/real-PostgreSQL test nije tvrdnja ovog closeouta; te provjere su izvršene u CI-u nakon Prisma generationa.

## Registar nalaza

- Zatvoren samo `BA-notifications-01` (P1).
- `BA-notifications-02`–`BA-notifications-15` ostaju otvoreni; ne mijenja se status ni severity susjednih nalaza, `BA-tickets-12`, ili bilo kojeg status-page findinga.
- Izvorne audit tabele / generated plan nakon ovog closeouta: **541 otvoren / 151 zatvoren / 692 ukupno**.
- Globalni register redovi nakon ovog closeouta: **551 otvoren / 141 zatvoren / 692 ukupno**. Poznatih 10 statusnih razlika iz drugih jedinica ostaje netaknuto.
- Val 6 je **20/109 zatvorenih / 89 otvorenih** (`20 P1 / 49 P2 / 20 P3` otvorenih). Audit jedinica 29 ostaje 19/19 zatvorena. Cijeli Val 6 nije zatvoren.
- `BA-15` full critical-flow acceptance iz service-cataloga ostaje zasebno pending; ovaj paket ne tvrdi puni Val-5/BA-15 E2E acceptance.

## Migracija, rollout i rollback

Migracija `20271031160000_notifications_ticket_message_fanout_outbox` je aditivna: dodaje trigger/funkciju i ne ubacuje historijske redove. CI ju je replayovao kroz release-migrator putanju na disposable PostgreSQL bazi. Target `DATABASE_URL` nije korištena, migracijski status targeta nije provjeravan i target migracija nije pokrenuta.

Nema PR-a, mergea ili deploymenta u ovom paketu. Uspješno primijenjenu migraciju ne označavati kao `rolled back`; nakon primjene oporavak je forward-only. Produkcijski pull/merge/redeploy i single-owner migrator korak ostaju pod korisničkom kontrolom.

## Sljedeći Val 6 paket

Sljedeći kandidat je `BA-notifications-02` (P1): autoritativno opozivanje group-notification pristupa nakon membership revoke-a, uključujući zagrijan membership cache. Taj paket nije započet ovim closeoutom; zahtijeva vlastitu usku acceptance provjeru.
