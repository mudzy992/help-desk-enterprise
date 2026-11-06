# W6.23 — BA-notifications-06: mark-all-read sa cutoffom i transakcijom

**Status:** zatvoren samo ovaj nalaz; Val 6 ostaje otvoren<br>
**Audit nalaz:** `BA-notifications-06` (P2), [audit 17 — notifications](../audits/17-notifications.md#24-statusna-dopuna--ba-notifications-06-closeout-2026-11-06)<br>
**Branch:** `arena/864951a6-help-desk-enterprise`<br>
**Implementacijski/testani SHA:** [`d7ba5f39e0851e711afeaf8247aa336967e57901`](https://github.com/mudzy992/help-desk-enterprise/commit/d7ba5f39e0851e711afeaf8247aa336967e57901)<br>
**Automatski CI:** [`42178850754`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850754) — success<br>
**Automatski Perf smoke:** [`42178850841`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850841) — failure samo na globalnom DB-query budgetu

## Problem i acceptance

`markAllNotificationsRead` je prvo izvan transakcije ažurirao personal redove, zatim čitao group unread redove i upisivao receipts; odgovor je hard-coded vraćao `unreadCount: 0`. Novi red koji stigne tokom operacije mogao je biti uvučen u read-all snapshot ili ostati nevidljiv u odgovoru/realtime badge-u.

Acceptance za `BA-notifications-06`: uhvatiti server-side cutoff, atomarno obraditi personal rows i group receipts iz stabilnog transaction snapshot-a, ostaviti kasnije pristigle notifikacije unread i vratiti svježi unread count nakon commita.

## Implementacija

- `readAt` se uhvati jednom prije transakcije; personal update i group unread selekcija koriste `createdAt <= readAt`.
- Membership se učitava autoritativno kao prvi query unutar `RepeatableRead` transakcije. Personal update, group lookup i receipt insert zato dijele isti snapshot i commit/rollback granicu.
- `P2034` serialization conflict dobija jedan bounded retry uz isti cutoff; drugi conflict se propagira.
- Nakon commita unread count se računa ponovo izvan transakcije, pa helper i `NotificationsService` vraćaju/emituju aktuelan broj.
- In-memory notification delegate podržava `createdAt.lte`; nije uvedena schema promjena ni nova migracija.

## Regresioni dokazi

Unit regresija ubacuje personal notifikaciju nakon cutoffa prije personal update-a i drugu između personal/group koraka; obje ostaju unread, a rezultat vraća `unreadCount: 2`. Service test potvrđuje da isti svježi count ide u HTTP rezultat i oba realtime badge/read događaja.

Novi disposable-PostgreSQL integration spec umeće personal i group red sa cutoff vremenom poslije prvog query-ja transakcije. Potvrđuje `RepeatableRead` granicu, stare personal/group redove označene read, kasnije redove unread i count od 2. Drugi scenarij namjerno ruši group receipt write i potvrđuje rollback personal update-a. Spec je registrovan u isolated integration runneru i njegovom guard testu.

Lokalno su ciljani ESLint, `git diff --check` i integration-runner harness prošli; harness je 13/13. Lokalni Jest nije mogao kompajlirati bez generated Prisma client-a, a `prisma generate` nije uspio jer sandbox ne može doći do `binaries.prisma.sh`. CI je generisao Prisma client i izvršio backend build/lint/full Jest i PostgreSQL/Redis integration suites uspješno.

## CI, Perf i granice dokaza

Automatski CI [`42178850754`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850754) na SHA `d7ba5f39e0851e711afeaf8247aa336967e57901` je **success**: backend generated-Prisma build/lint/full Jest, disposable PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate.

Automatski Perf smoke [`42178850841`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42178850841) je **failure** isključivo na provjeri ukupnog query budžeta: `avg db_queries_per_request=2.126`, prag je nepromijenjenih `2.1`. K6 latency/payload gates su passed; API-log route prosjek uključuje `/notifications/unread-count=2.110` i `/services=10.002`, ali run ne izoluje mark-all-read niti dokazuje da je ovaj bounded kod uzrok. Pragovi nisu mijenjani i nije proširen scope radi nepovezanog perf popravka. Ovo znači da Perf nije zelen.

E2E critical flows, install wizard i read-only inventory su `skipped`, ne passed. BA-15 full critical-flow acceptance zato ostaje zasebno pending. Nije korištena target baza niti lokalno pokretana migracija; disposable CI jobs su koristili vlastite testne baze. Nije otvoren PR, nije mergeano i nije deployano.

## Statusni opseg nakon closeouta

Zatvoren je samo `BA-notifications-06`; notifications je sada **6/15** zatvorenih. Val 6 je **25/109** zatvorenih i **84 otvorenih** (18 P1 / 46 P2 / 20 P3); Val 6 nije završen. Source audit/generisani plan su **536 otvoren / 156 zatvoren**; redovi globalnog registra su **546 otvoren / 146 zatvoren**. Deset ranijih statusnih razlika ostaje netaknuto. `BA-status-page-01`–`19` ostaju 19/19.

Baseline audit score **5,05/10** i odvojeni BA-15 full critical-flow acceptance ostaju nepromijenjeni/pending. Zbog crvenog Perf runa nema pull/merge/redeploy preporuke; query-budget status ostaje neriješen bez promjene praga. Ovaj bounded closeout nije Val 6 completion niti BA-15 sign-off.
