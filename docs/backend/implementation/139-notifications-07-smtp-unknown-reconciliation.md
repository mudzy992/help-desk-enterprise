# W6.24 — BA-notifications-07: bez slijepog takeovera za SMTP isporuke

**Audit nalaz:** `BA-notifications-07` (P2), [audit 17 — notifications](../audits/17-notifications.md#25-statusna-dopuna--ba-notifications-07-closeout-2026-11-06)<br>
**Status:** zatvoren samo ovaj bounded nalaz; Val 6 nije završen<br>
**Kodni SHA:** [`d69aec1`](https://github.com/mudzy992/help-desk-enterprise/commit/d69aec157c473de51f1bd4431f1fb481e1f1b402)<br>
**Finalni testani SHA:** [`8e68aaf`](https://github.com/mudzy992/help-desk-enterprise/commit/8e68aafd1b7a9fa235299a59b0adeff2cbba22ff)<br>
**CI:** [`42185320693`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42185320693) — success<br>
**Perf:** [`42183267509`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42183267509) — failure na globalnom query budgetu; nije zelen

## Nalaz i prihvatni uslov

Ako SMTP prihvati poruku, a proces se sruši prije nego što delivery red dobije `SENT`, persisted `CLAIMED` red ostane iza sebe. Stari 10-minutni takeover ga je ponovo slao bez mogućnosti da utvrdi je li prva poruka već prihvaćena.

Prihvatni uslov za BA-07: stale crash-recovery ne šalje ponovo automatski; stanje ostaje operatoru vidljivo za SMTP/MTA reconciliation. Exactly-once delivery se ne obećava. Implementacija ostaje u zajedničkom email delivery helperu i ops signalu, bez nepovezanih izmjena callera.

## Promjena

- Claim stariji od 10 minuta atomarno se mijenja iz `CLAIMED` u `UNKNOWN` pri narednom pokušaju. Taj pokušaj odmah završava bez poziva SMTP transportu. Kasniji pokušaj vidi postojeći unique key `[userId,dedupeKey]` i također ne šalje.
- `SENT`, postojeći `UNKNOWN` i svježi `CLAIMED` redovi nastavljaju sprečavati dupli send. Novi delivery claim radi kao i ranije.
- Callerov `Message-ID` se zadržava. Ako ga caller nije dao, shared helper deterministički izvodi fallback iz user ID-a i dedupe key-a, uz domen iz SMTP `From` adrese ili `.invalid` fallback. To je samo korelacijski identifikator; generički SMTP ugovor ne daje provider idempotency key i Message-ID ne garantuje deduplikaciju.
- Ops Health vraća agregat `unknownDeliveries`; administratorski UI prikazuje upozorenje uz stale-claim indikator. Upozorenje u aplikacijskom logu koristi kratki hash fingerprint i template key, bez primaoca, user ID-a, sadržaja, subjecta ili sirovog dedupe key-a.
- [Upute za poštu](../../user-guide/posta.md) opisuju MTA provjeru i eskalaciju. Ako operator ne može pouzdano utvrditi ishod, red ostaje `UNKNOWN`; nema slijepog replaya. Aplikacija ne izlaže automatski UNKNOWN-reset/replay niti exactly-once obećanje.
- Prisma status je postojeći `String`; schema i migracije nisu mijenjane.

## Testovi i dokaz

- Unit regresije pokrivaju stale-versus-fresh claim, no-send nakon `UNKNOWN`, idempotentni kasniji retry, stabilni fallback `Message-ID`, sanitizovani log fingerprint i Ops Health broj.
- Nova `notification-email-delivery-recovery.integration.spec.ts` koristi disposable PostgreSQL: kreira zastarjeli claim, poziva stvarni shared helper i provjerava `UNKNOWN`, pomaknuti `updatedAt`, nula SMTP poziva, nula stale-claim counta i no-op na narednom retryju. Suite je registrovan u isolated integration runneru i njegovom guard testu.
- CI [`42185320693`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42185320693) na finalnom SHA-u passed: Prisma client generation i backend build/lint/full Jest, stvarni PostgreSQL/Redis integration (uključujući BA-07 suite), frontend full test/build, Docs guard, container/supply-chain i CI gate. E2E critical flows, install wizard i read-only inventory bili su `skipped`; oni nisu prikazani kao passed.
- Prvi push CI [`42183267613`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42183267613) našao je Prettier format i neprecizan `report-schedules.spec.ts` database fake koji je svako `updateMany` pogrešno prikazivao kao stale-claim match. Test fake i format su ispravljeni u test-only follow-up SHA `8e68aaf`; finalni CI je zatim prošao full suite. PostgreSQL/Redis integration je već prošao u prvom runu.
- Lokalni backend generated Prisma client nije dostupan; targetirani unit testovi su lokalno izvršeni s `ts-jest` diagnostics isključenom, a report-schedules suite je ostao compile-blocked zbog nedostajućeg `generated/prisma/enums`. To nije CI typecheck zamjena: finalni CI je generisao client i prošao anotirani build/full Jest.

## Perf, scope i status

Automatski Perf smoke [`42183267509`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42183267509), pokrenut na kodnom SHA-u `d69aec1`, završio je s `avg db_queries_per_request=2.125` prema nepromijenjenom pragu `2.1`; K6 opće latency/payload gates su prošli. Route summary prikazuje `/notifications/unread-count=2.099` i `/services=10.000`, ali Perf run ne izdvaja BA-07 kao uzrok. Pragovi nisu promijenjeni. Test-only follow-up SHA `8e68aaf` nije imao dodatni Perf run zbog workflow path filtera; zato Perf status ostaje neuspješan/nepotvrđen kao zelen.

Zatvoren je samo `BA-notifications-07`. Notifications sada ima **7/15** zatvorenih; `BA-notifications-08`–`15` ostaju otvoreni. Val 6 je **26/109** zatvorenih, **83 otvorenih** (18 P1 / 45 P2 / 20 P3); status-page ostaje 19/19. Source audit/generisani plan su **535 otvorenih / 157 zatvorenih**; redovi globalnog registra su **545/147**. Deset poznatih statusnih razlika je netaknuto; baseline 5,05/10 nije rescoraan. `BA-notifications-08`, BA-15 i ostatak Val 6 scopea nisu započeti/zatvoreni ovim paketom.

Nije korištena target baza niti je lokalno pokrenuta migracija; CI je koristio disposable baze. Nije otvoren PR, izvršen merge niti deploy. Pošto Perf nije zelen, nema pull/merge/redeploy preporuke.
