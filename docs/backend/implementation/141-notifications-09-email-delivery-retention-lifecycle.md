# W6.26 — BA-notifications-09: lifecycle zadržavanja email delivery zapisa

**Audit nalaz:** `BA-notifications-09` (P2), [audit 17 — notifications, §27](../audits/17-notifications.md#27-statusna-dopuna--ba-notifications-09-closeout-2026-11-06)<br>
**Status:** zatvoren samo ovaj bounded nalaz; Val 6 i BA-15 nisu zatvoreni<br>
**Kodni i testani SHA:** [`1b578cb`](https://github.com/mudzy992/help-desk-enterprise/commit/1b578cbf2f636788fa7ec67875470700dfe195f5)<br>
**CI:** [`42254318025`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42254318025) — success<br>
**Perf:** nije pokrenut; privacy-retention putanje nisu u push path filteru. Posljednji automatski Perf [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) ostaje failure na globalnom query budgetu `2.125 > 2.1`; prag nije mijenjan, a uzročnost nije pripisana BA-09.<br>
**Schema/migracija:** nema promjene; nova migracija nije potrebna.

## Nalaz i odluka o obuhvatu

Audit je prijavio da `NotificationEmailDelivery.toAddress` i delivery status nemaju retention/redaction lifecycle, iako zapis sadrži adresu, user ID, dedupe ključ i status. Pregled koda je pokazao da lifecycle već postoji u zajedničkom privacy-retention mehanizmu; nedostajao je direktan notification-delivery regresijski dokaz u real PostgreSQL suiteu. Zato ovaj paket ne dodaje paralelni notification scheduler niti mijenja postojeće privacy pravilo — dodaje ciljane testove i evidentira pokriće.

Postojeća postavka je `private.privacy.retention.emailDeliveryDays`: default/fallback je **180 dana**, DPO/administrator može je podesiti, podržani minimum je **30 dana**, maksimum **36.500 dana**, a `0` eksplicitno isključuje brisanje. To je postojeća aplikacijska politika, ne nova pravna procjena. Vrijednost na ciljnoj instalaciji nije provjeravana; ne tvrdimo da je produkcijski override 180 dana.

## Postojeći lifecycle koji zatvara BA-09

- `PrivacyConfigurationLoader` učitava email-delivery period i koristi 180 dana kao siguran fallback. Privacy settings ga izlažu kao zasebnu retention kategoriju.
- `RetentionService` uključuje `emailDeliveries` u nightly sweep. Vrijeme je podesivo; zadano je 02:30 u `Europe/Sarajevo`.
- Executor bira redove sa `createdAt < cutoff`, u redoslijedu `createdAt ASC`, i briše ih u bounded batchovima od najviše 500. Brisanje cijelog reda uklanja zajedno recipient adresu, delivery status, user ID i dedupe podatke. Aktuelni `createdAt` indeks podržava cutoff upit.
- Redovi mlađi od cutoffa ostaju netaknuti. Privacy anonymization dodatno uklanja delivery redove korisnika koji se anonimizira.
- Retention evidencija čuva agregat: kategoriju, period, broj obrađenih redova i vremenski raspon. Email-delivery executor ne stavlja delivery ID-jeve u `refs`; audit metadata bilježi kategoriju/mode/status izvršenja/dane/broj, bez recipient adrese ili delivery-status detalja.

## Dodani regresijski dokaz

- `privacy-configuration.loader.spec.ts` zaključava 180-dnevni default, prihvatanje konfigurisanog perioda, zaštitu ispod 30 dana i eksplicitni `0=disabled`.
- `retention.integration.spec.ts` (registrovan u isolated PostgreSQL integration runneru) kreira stare `SENT`, `UNKNOWN` i `CLAIMED` delivery redove te jedan noviji red. Test radi dry-run i izvršenje sa 180 dana, potvrđuje brisanje svih due redova bez obzira na status, očuvanje novijeg reda i agregatni `RetentionRun`/audit dokaz bez recipient adresa.
- Test namjerno ne mijenja delivery state-machine ugovor iz BA-07/BA-10 i ne mijenja notification inbox/status-page historiju.

## CI i lokalna ograničenja

CI [`42254318025`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42254318025) na SHA `1b578cbf2f636788fa7ec67875470700dfe195f5` je **success** za backend generated-Prisma build/lint/full Jest, PostgreSQL/Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. Backend build/test i disposable PostgreSQL/Redis integration poslovi su passed; integration runner uključuje privacy retention suite. E2E critical flows, install wizard, read-only service-form inventory i uslovni image-enforcement korak bili su `skipped`, ne passed. Zaseban broj testova za BA-09 nije izvučen iz CI loga; integration posao i korak za real PostgreSQL integration suites prošli su.

Perf nije pokrenut na ovom SHA-u zbog path filtera. Posljednji Perf [`42233259566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42233259566) je failure samo na globalnom prosjeku `2.125` DB queries/request prema nepromijenjenom `2.1` budgetu; ne utvrđuje BA-09 kao uzrok. Pragovi nisu mijenjani. Lokalno nije pokretan puni CI/E2E, nije korištena ciljna baza i nije pokretana migracija; lokalni `backend/node_modules` i generated Prisma artefakti nisu prisutni.

## Registar i preostali scope

- Zatvoren je samo `BA-notifications-09`. Notifications sada ima **9/15** zatvorenih; `BA-notifications-10`–`15` ostaju otvoreni.
- Val 6 ima **28/109** zatvorenih i **81 otvoren** nalaz (18 P1 / 43 P2 / 20 P3). Status-page 29 ostaje **19/19**; BA-15 full critical-flow acceptance je pending; Val 6 nije završen.
- Izvorni audit/generisani plan: **533 otvorena / 159 zatvorenih**. Redovi globalnog registra: **543 otvorena / 149 zatvorenih**. Deset poznatih source/global statusnih razlika ostaje netaknuto; baseline **5,05/10** nije rescoraan.
- Nema PR-a, mergea ni deploymenta. Perf nije zelen, pa nema pull/merge/redeploy preporuke. Raniji Coolify handoff propustio je navesti migraciju; tačan migration ID ostaje neutvrđen i ne smije se pogađati. Svaka buduća redeploy uputa mora prvo navesti tačnu migraciju i redoslijed.
- Sljedeći mogući bounded kandidat je `BA-notifications-10` (P2), ali nije započet i traži zasebnu autorizaciju. Ovaj closeout ne odobrava preostali Val 6 ni BA-15.
