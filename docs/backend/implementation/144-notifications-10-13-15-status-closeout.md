# W6.29 — BA-notifications-10/13/15 status closeout

**Datum:** 2026-11-07  
**Opseg:** statusno zatvaranje samo potvrđenih nalaza `BA-notifications-10`, `BA-notifications-13` i `BA-notifications-15`. Nema nove runtime izmjene u ovom paketu.

## Dokazi i odluke

### `BA-notifications-10` — delivery state i provider receipt

Nalaz se zatvara na postojećoj implementaciji. Delivery lifecycle čuva broj pokušaja, zakazani retry, sanitizovani razlog greške i terminalna `FAILED`/`DEAD`/`UNKNOWN` stanja; rezultat SMTP transporta, uključujući provider message ID/response receipt, persistira se umjesto da se prihvatanje zaključuje samo iz lokalnog poziva.

Unit regresije su u `deliver-notification-email.spec.ts` i `persist-notification-email-delivery.spec.ts`; `notification-email-delivery-recovery.integration.spec.ts` pokriva DB recovery i provider receipt zapis. Najnoviji CI [`42291432145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42291432145) na kodnom SHA-u `d93ca280205296478e989a7c79db284757d07290` prošao je backend build/full Jest i PostgreSQL+Redis integration.

### `BA-notifications-13` — test-email rate limit

Nalaz se zatvara na implementiranom Redis limiteru: najviše pet testnih emailova po actoru u deset minuta; nedostajući ili nedostupan Redis ne aktivira per-instance fallback nego fail-closed odgovor. Rate-limit breach ostaje `429`, a nemogućnost sigurnog rate-limitovanja mapira se na `503`. Redis integration suite je registrovan u isolated integration runneru.

Backend unit i Redis integration provjere prošle su u CI [`42286710936`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42286710936); najnoviji puni CI [`42291432145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42291432145) na `d93ca280` također je prošao backend build/Jest i PostgreSQL+Redis integration.

### `BA-notifications-15` — generated Prisma i DB-direct suites

Ovaj nalaz iz audita 17 zatvara se jer CI sada generiše Prisma client prije backend builda i testova. Na generated clientu su prošli `test:safety-net:compile`, kompletni backend Jest suite i PostgreSQL+Redis integration job; time su direktne notification suites koje su u početnom audit pokretanju bile compile-blocked provjerene u stvarnom CI testnom okruženju. `test:safety-net:compile` sam po sebi nije tvrdnja da je svih notification suiteova naveo po putanji; dokaz za njih je puni backend Jest/integration CI.

Zatvara se samo `BA-notifications-15`. To nije isto što i odvojeni globalni `BA-15` full critical-flow E2E acceptance, koji ostaje pending.

## Nalazi koji ostaju otvoreni i granice dokaza

- `BA-notifications-14` ostaje otvoren: traženi kritični recovery/scope/concurrency E2E dokaz nije dostupan. U CI [`42291432145`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42291432145) poslovi `E2E critical flows`, `E2E install wizard` i read-only inventory bili su `skipped`; nijedan nije označen kao passed i nije ručno dispatchan.
- Posljednji Perf [`42289613508`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42289613508) ostaje **failed** na nepromijenjenom globalnom query-budget gateu: prosjek `2.128` prema budžetu `2.1` kroz `50,597` zahtjeva; p95 `3`, maksimum `34`. `/services` latencija/payload/contract provjere prošle su, ali to ne poništava crveni query-budget gate. Nema dokaza koji ovaj rezultat pripisuje BA-10, BA-13 ili BA-15; prag nije mijenjan i Perf se ne prikazuje kao zelen.
- Nije korištena ciljna baza, nije pokretana migracija, nije otvoren PR, nije bilo mergea ni deploymenta.

## Statusni zbir nakon W6.29

Zatvorena su samo tri nalaza: `BA-notifications-10`, `BA-notifications-13` i `BA-notifications-15`. Notifications je **14/15**; `BA-notifications-14` ostaje otvoren. Val 6 je **33/109** zatvorenih i **76 otvorenih** (18 P1 / 41 P2 / 17 P3); `29 — status-page` ostaje 19/19. Izvorne audit-tabele/generisani plan prikazuju **528 otvorenih / 164 zatvorenih**; redovi globalnog registra **538 otvorenih / 154 zatvorenih**. Deset poznatih source/global statusnih razlika ostaje netaknuto. Baseline ocjena notifications **5,05/10** nije rescoraan i Val 6 nije završen.
