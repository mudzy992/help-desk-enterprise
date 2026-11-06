# W6.27 — BA-notifications-11: bounded group mark-all receipt paging

**Audit nalaz:** `BA-notifications-11` (P2), [audit 17 — notifications, §28](../audits/17-notifications.md#28-statusna-dopuna--ba-notifications-11-closeout-2026-11-06)<br>
**Status:** zatvoren samo ovaj bounded nalaz; Val 6 i BA-15 nisu zatvoreni<br>
**Implementacijski SHA:** [`2f88329`](https://github.com/mudzy992/help-desk-enterprise/commit/2f8832993441c5f393c25c1dc60b6d1ee83333dc)<br>
**Finalni testani SHA:** [`040a308`](https://github.com/mudzy992/help-desk-enterprise/commit/040a30863b4979d88b3dfacbec0115de7b16b03c)<br>
**CI:** [`42277072185`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42277072185) — success<br>
**Perf:** nije pokrenut: `mark-all-notifications-read.ts` i prateći testovi nisu u Perf smoke push path filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) ostaje failure na globalnom query budgetu `2.125 > 2.1`; prag nije mijenjan, a BA-11 nije utvrđen kao uzrok.<br>
**Schema/migracija:** nema promjene; migracija nije potrebna.

## Nalaz i implementacija

BA-11 je prijavio da group `mark-all-read` učitava sve unread notification ID-eve u memoriju i šalje cijeli skup u jednom receipt insertu. Implementacija sada koristi `notificationMarkAllLimits.groupReceiptBatchSize = 250` i čita redove u uzlaznom redoslijedu po `id`, uz keyset uslov `id > lastNotificationId`. Svaka stranica se zasebno pretvara u jedan `createMany` batch; nema `OFFSET` paginacije niti materijalizacije cijelog history skupa.

BA-06 semantika je sačuvana: jedan `readAt` cutoff se uzima prije transakcije; `loadNotificationAudience` provjerava autoritativno group članstvo unutar postojeće `RepeatableRead` transakcije; isti cutoff, audience/unread predicate, receipt dedupe i bounded serialization-conflict retry ostaju na snazi. Lični update i sve group receipt stranice ostaju u istoj transakciji. `countUnreadNotifications` se i dalje računa nakon commita, tako da noviji unread događaji nisu progutani.

## Regresijski dokaz

- `notifications.inbox.spec.ts` obrađuje 517 group notifications kroz tri receipt batcha od **250, 250 i 17**. Provjerava i uzlazne cursore (`id > zadnji obrađeni ID`) te da su svi receipt redovi kreirani.
- `notification-mark-all-read.integration.spec.ts` koristi disposable PostgreSQL sa 251 group notification. Suite bilježi upitne limite `[250, 250]`, stvarno učitane stranice `[250, 1]` i receipt insert batchove `[250, 1]`, te potvrđuje svih 251 receipt.
- Postojeći BA-06 integration testovi i dalje pokrivaju cutoff i rollback kada receipt write zakaže; membership/audience predicate nije oslabljen.
- Nema schema promjene, migracije, ciljne baze ili produkcijskog testa.

## CI, E2E i Perf granice

CI [`42277072185`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42277072185), na finalnom SHA `040a30863b4979d88b3dfacbec0115de7b16b03c`, prošao je backend generated-Prisma build/lint/full Jest, real PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. CI je koristio disposable baze. E2E critical flows, E2E install wizard i read-only service-form inventory bili su `skipped`; nisu `passed`.

Odvojena izmjena speca 36 (`61a7e95`) prihvata sve podržane email delivery statusne tekstove, ali push CI-jevi su preskočili E2E. Ciljani workflow dispatch nije bio dostupan (`HTTP 403`), pa matcher još nema novi browser-run dokaz. To ne mijenja BA-11 integration rezultat i ne predstavlja BA-15 sign-off.

Perf nije pokrenut na ovom SHA-u jer BA-11 putanje nisu navedene u `.github/workflows/perf-smoke.yml` push filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) i dalje je failure na `2.125` naspram nepromijenjenog `2.1` budžeta; nema dokaza da je BA-11 uzrok. Threshold nije mijenjan i Perf se ne prikazuje kao zelen.

## Registar i preostali scope

- Zatvoren je samo `BA-notifications-11`. Notifications sada ima **10/15** zatvorenih; `BA-notifications-10` i `BA-notifications-12`–`15` ostaju otvoreni. BA-10 delivery-state ugovor i njegovi Perf/E2E caveati nisu zatvoreni ovim paketom.
- Val 6 ima **29/109** zatvorenih i **80 otvorenih** nalaza (18 P1 / 42 P2 / 20 P3); `29 — status-page` ostaje **19/19**. BA-15 full critical-flow acceptance je pending; Val 6 nije završen.
- Izvorne audit-tabele/generisani plan: **532 otvorena / 160 zatvorenih**. Redovi globalnog registra: **542 otvorena / 150 zatvorenih**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan.
- Nema PR-a, mergea ni deploymenta. Nije korištena ciljna baza niti pokrenuta migracija. Prethodni Coolify redeploy blocker je odvojen; tačan potreban migration ID ostaje nepotvrđen i ne smije se pogađati. Svaka buduća redeploy uputa mora navesti potvrđeni migration ID i sequencing prije redeploya. Pošto Perf nije zelen, nema pull/merge/redeploy preporuke.
