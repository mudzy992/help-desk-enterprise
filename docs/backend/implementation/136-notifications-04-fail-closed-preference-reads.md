# W6.21 — BA-notifications-04: preference/policy readovi fail-closed

**Status:** zatvoreno na nivou nalaza; Val 6 kao cjelina ostaje otvoren.  
**BA ID:** `BA-notifications-04` (P2).  
**Branch:** `arena/864951a6-help-desk-enterprise`.  
**Finalni kodni/testani SHA:** [`42e3d7f`](https://github.com/mudzy992/help-desk-enterprise/commit/42e3d7f29cfe4296313082444daf0b9495abc032).

## Problem i acceptance

Preference i schedule query kvarovi ranije su se tretirali kao da korisnik nema opt-out; grupni in-app exclusion read kvar mogao je vratiti praznu listu. Settings-policy readovi su pojedinačno padali na ugrađene vrijednosti, pa je djelimično ili zastarjelo čitanje moglo promijeniti preferences, digest, quiet-hours, lock ili bypass ponašanje.

Audit 17 §§6 i 14 traži kompletan last-known-good preference/policy snapshot, fail-closed dobrovoljnu isporuku i eksplicitno izdvojene mandatory kategorije. Kvar ne smije ignorisati user OFF niti administratorski lock; grupna isporuka ne smije ukloniti exclusions zbog neuspjelog čitanja.

## Implementacija

- Policy settings se čitaju kao jedan atomarni snapshot. Defaults se koriste samo za nedostajuće (`undefined`) vrijednosti; invalidna vrijednost ili read exception ne pravi djelimičnu kombinaciju settingsa i defaulta.
- Potpuno validan snapshot se čuva kao last-known-good najviše 5 sekundi po `SettingsService` instanci, sa monotonic age izračunom. Read kvar ne produžava TTL; bez svježeg snapshot-a dobrovoljni delivery fail-closed.
- Bez policyja su dozvoljene samo notification kategorije koje katalog eksplicitno označava `alwaysOn`; nepoznat tip se odbija. Preference, quiet-hours schedule i group in-app exclusion missing delegate/query failure bacaju stabilnu sanitizovanu grešku, nikad ne vraćaju default `inApp=true`, `IMMEDIATE` ili praznu exclusion listu.
- Preference error logovi su throttled i ne sadrže user ID, ticket ID, stack ni raw database error. Fan-out catchovi ne prosljeđuju osjetljive detalje za ove greške.
- Recipient policy odluke za announcement batch se izračunaju prije per-user persistinga; primalac sa `inApp === false` se preskače.
- CSV parser normalizuje tekst u lowercase, dok notification category ID-evi mogu imati miješano velika slova. Loader sada normalizovane ključeve mapira nazad na kanonski ID (`report.weeklyTickets`, `ticket.timeAutoStopped`), kako validan default/override ne bi oborio cijeli policy snapshot.
- Nema schema promjene ni nove migracije.

## Regresijski acceptance

- Policy testovi pokrivaju dokumentovane defaults, mixed-case category canonicalization, nevažeće vrijednosti, sve-or-nothing failure, 5-sekundni LKG rok i izolaciju cachea po `SettingsService` instanci.
- Resolver testovi pokrivaju preference/schedule read kvarove, missing delegate, mandatory kategorije i grupni in-app opt-out/read failure; group failure potvrđuje da se ne pozovu `create`/`createMany`.
- Dodatni testovi pokrivaju persist guard, on-call, email preference failure i announcement fan-out. Announcement delivery test double sada eksplicitno pruža uspješne preference/schedule read delegate-e umjesto da ih izostanak pogrešno predstavlja kao validan prazni rezultat.
- Automatski real PostgreSQL+Redis integration suite, uključujući status-page notification delivery tokove, prošao je finalnom CI provjerom.

## Provjere i granice

- Prvi automatski CI [`42104810227`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42104810227) otkrio je mixed-case category normalization bug; korekcija je u [`2cb3d6f`](https://github.com/mudzy992/help-desk-enterprise/commit/2cb3d6f4347c39c070ab00139cd8854719a10aa8). Sljedeći CI [`42106734046`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42106734046) prošao je PostgreSQL/Redis integration, ali Jest je pokazao nedostajuće preference/schedule delegate-e u announcement test double-u; samo je taj fixture dopunjen u [`42e3d7f`](https://github.com/mudzy992/help-desk-enterprise/commit/42e3d7f29cfe4296313082444daf0b9495abc032).
- Automatski CI [`42108808170`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42108808170) na finalnom SHA `42e3d7f` je **success**: backend build/lint/full Jest, real PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate.
- E2E critical flows, install wizard i read-only service-form inventory bili su `skipped`; nisu predstavljeni kao passed.
- Perf smoke nije pokrenut na ovom SHA-u jer BA-04 notification putanje nisu uključene u workflow push path filter. Nije ručno dispatchan; Perf pragovi nisu mijenjani.
- Nije korištena ciljna baza, nije pokretana migracija, nije otvoren PR, nije bilo mergea ni deploymenta.

## Odluka i preostali scope

Acceptance za `BA-notifications-04` je zadovoljen i zatvoren je samo ovaj nalaz. Notifications sada ima **4/15** zatvorenih nalaza; `BA-notifications-05`–`15` ostaju otvoreni. Val 6 je **23/109** zatvorenih i **86 otvorenih** (18 P1 / 48 P2 / 20 P3), pa se ne označava završenim. Source audit/generisani plan prikazuju **538 otvoren / 154 zatvoren**, a redovi globalnog registra **548 otvoren / 144 zatvoren**; deset poznatih statusnih razlika ostaje netaknuto. Status-page 29 ostaje 19/19. Baseline audit score 5,05/10 i zasebni BA-15 full critical-flow pending status ostaju nepromijenjeni.
