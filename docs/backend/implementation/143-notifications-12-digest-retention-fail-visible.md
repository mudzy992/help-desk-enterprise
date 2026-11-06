# W6.28 — BA-notifications-12: vidljiv i retryable digest retention kvar

**Audit nalaz:** `BA-notifications-12` (P3), [audit 17 — notifications, §29](../audits/17-notifications.md#29-statusna-dopuna--ba-notifications-12-closeout-2026-11-06)<br>
**Status:** zatvoren samo ovaj bounded nalaz; Val 6 i BA-15 nisu zatvoreni<br>
**Implementacijski i testani SHA:** [`cc801ef`](https://github.com/mudzy992/help-desk-enterprise/commit/cc801ef41c6698b5d7a068c06634380e673589ff)<br>
**CI:** [`42280702579`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42280702579) — success<br>
**Perf:** nije pokrenut: notification retention processor putanja nije u Perf smoke push path filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) ostaje failure na globalnom query budgetu `2.125 > 2.1`; prag nije mijenjan, a BA-12 nije utvrđen kao uzrok.<br>
**Schema/migracija:** nema promjene; migracija nije potrebna.

## Nalaz i implementacija

Digest retention processor je nakon digest stavki `deleteMany` hvatao svaki kvar i pretvarao ga u broj `0`, pa je nastavio zapisivati success log. Tako se neuspjelo brisanje nije razlikovalo od uspješnog sweeepa koji nije imao redova za brisanje.

Sada se brišejući Prisma poziv obavlja bez fallbacka na nulu. Kvar se bilježi sanitizovano, samo s tipom greške (`notification_digest_retention_failed type=...`), a zatim se isti exception propagira iz BullMQ processora. Zbog toga se ne zapisuje normalni success log i postojeća retention job politika može primijeniti retry. Worker scheduler već postavlja **2 pokušaja** uz eksponencijalni backoff od **30 sekundi**; ponovljeno brisanje je idempotentno. Uklonjen je i optional-delegate fallback: nedostajući generated delegate sada takođe postaje vidljiv kvar umjesto lažnog `0`.

Obična notification purge koraka može biti završena prije digest delete greške. Ako se cijeli job ponovi, notification delete je siguran za ponavljanje, a digest retention pokušaj se ponovo izvršava.

## Regresijski dokaz

`notification-retention.processor.spec.ts` pokriva:

- uspješan digest delete bilježi stvarni vraćeni count zajedno s notification purge countom;
- `deleteMany` rejection emituje sanitizovani failure signal, ponovo baca isti exception i ne emituje success log;
- nedostajući digest delegate odbija job umjesto da ga prijavi kao zero-row success.

Postojeći scheduler spec već zaključava retry/backoff ugovor. Nema schema promjene, migration, target-DB pristupa niti potrebe za PostgreSQL-only scenarijem: kvar se injektuje direktno na delegate granici.

## CI, E2E i Perf granice

CI [`42280702579`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42280702579) na SHA `cc801ef41c6698b5d7a068c06634380e673589ff` je **success** za generated-Prisma backend build/lint/full Jest, real PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. E2E critical flows, E2E install wizard i read-only service-form inventory bili su `skipped`, ne `passed`.

Ovaj package ne validira zasebni spec-36 email-status matcher: push E2E i dalje nije pokrenuo browser suite; matcher nema novi browser-run dokaz. BA-15 full critical-flow acceptance ostaje pending.

Perf nije pokrenut jer `notification-retention.processor.ts` nije u `.github/workflows/perf-smoke.yml` push filteru. Posljednji automatski Perf [`42269793891`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42269793891) i dalje je globalni query-budget failure `2.125` prema `2.1`; BA-12 nije utvrđen kao uzrok i prag nije mijenjan. Rezultat se ne prikazuje kao zelen.

## Registar i preostali scope

- Zatvoren je samo `BA-notifications-12`. Notifications sada ima **11/15** zatvorenih; `BA-notifications-10`, `BA-notifications-13`, `BA-notifications-14` i `BA-notifications-15` ostaju otvoreni.
- Val 6 ima **30/109** zatvorenih i **79 otvorenih** nalaza (18 P1 / 42 P2 / 19 P3); `29 — status-page` ostaje **19/19**. BA-15 full critical-flow acceptance je pending; Val 6 nije završen.
- Izvorne audit-tabele/generisani plan: **531 otvoren / 161 zatvoren**. Redovi globalnog registra: **541 otvoren / 151 zatvoren**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan.
- Nema PR-a, mergea ni deploymenta. Nije korištena ciljna baza niti pokrenuta migracija. Raniji Coolify redeploy blocker ostaje odvojen; tačan potreban migration ID nije potvrđen i ne smije se pogađati. Buduća redeploy uputa mora unaprijed navesti tačnu migraciju i redoslijed. Pošto Perf nije zelen, nema pull/merge/redeploy preporuke.
