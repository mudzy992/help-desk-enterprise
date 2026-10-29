# W7.7 — kompatibilnost OU/opsega za korisničke licence

**Paket:** W7.7 — `BA-assets-07` — per-user license assignment OU/scope kompatibilnost<br>
**Nalaz:** `BA-assets-07` (P2) — zatvoren<br>
**Implementacijski commit:** `bc7906795e83e4eb9dd25319234e33ddf4bb441d`<br>
**Acceptance/wiring korekcija:** `55fb782d02a4ccfecf4553c8d7fbfa9a6a41016b`<br>
**Finalni testani SHA:** `55fb782d02a4ccfecf4553c8d7fbfa9a6a41016b`<br>
**CI:** [`40956304026`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40956304026) — zelen<br>
**DB migracije:** nema

## Nalaz i precizna OU semantika

Prije W7.7, `AssetLicensesService.assign()` prihvatao je svaki aktivan i neanonimizovan `User` samo na osnovu ID-a. Cilj se nije provjeravao prema callerovom `asset.read` opsegu niti prema OU licence. Detalj licence bezuvjetno je vraćao korisnikovo ime i e-mail, a korisnički picker licence koristio je opću user-pretragu koja nije imala granicu za konkretnu licencu.

Semantika kompatibilnosti je namjerno preuzeta iz postojećeg OU modela (`ouPath`, `isPathInScope` i `unitScopeWhere`), a ne uvedena kao novo pravilo „isti OU ID“:

- korisnik pripada OU licence ako je njegov canonical `ouPath` jednak putanji licence ili je njen slash-delimited potomak;
- korisnik u roditeljskoj, susjednoj ili samo string-prefix jedinici nije kompatibilan; korisnik bez OU putanje također nije kompatibilan;
- osim kompatibilnosti sa OU licence, korisnik mora biti unutar callerovog `asset.read` subtree/global opsega;
- ID korisnika izvan `asset.read` opsega vraća postojeći `ASSET_USER_NOT_FOUND`/HTTP 404, da provjera ne postane user-existence oracle; cilj koji je vidljiv čitaocu, ali izvan OU licence, odbija se kao `ASSET_LICENSE_ASSIGNMENT_INVALID`/HTTP 400.

Ovaj kriterij zatvara samo **per-user** stranu `BA-assets-07`. Pravilo za cross-OU dodjelu licence na asset ostaje nepromijenjeno i njegova audit napomena nije ovim paketom definisana niti zatvorena.

## Implementacija

- `AssetLicensesService.assign()` sada traži aktivnog/neanonimizovanog korisnika, učitava njegov OU path, provjerava `asset.read` opseg i OU subtree licence prije bilo kakvog insert-a. Neuspjela provjera ne kreira `LicenseAssignment`, event ni audit zapis.
- Dodan je licence-specifični `GET /assets/licenses/:licenseId/users` picker. Vraća samo aktivne/neanonimizovane korisnike čiji OU zadovoljava i OU licence i callerov `asset.read` opseg. Opći `/assets/users` endpoint za postojeće asset-assignment/signatory tokove nije mijenjan.
- `detail()` koristi iste OU/read-scope granice prije vraćanja korisničkog cilja. Historijska dodjela ili dodjela čiji korisnik kasnije promijeni OU ne izlaže ID, ime ni e-mail; odgovor daje samo `hiddenAssignmentsCount`, a seat `used` broj ostaje ukupan broj evidentiranih dodjela. Frontend prikazuje agregatnu poruku i ne prikazuje „nema dodjela“ ako su neke skrivene.
- Promjena OU licence odbija se ako bi postojeća per-user dodjela ostala izvan nove OU subtree granice. Promjena OU korisnika izvan ovog servisa ne briše automatski dodjelu: detalj je rediguje dok se stanje ne uskladi. Nije uveden backfill niti automatsko oslobađanje licenci.
- Frontend koristi novi licence-specific picker, query key uključuje ID licence da se rezultati ne dijele između različitih scopeova, a tip detalja nosi `hiddenAssignmentsCount`. Poruke su prevedene na bosanski i engleski.

## Direktni testni dokaz

`backend/src/modules/assets/asset-licenses.spec.ts` pokriva canonical OU subtree semantiku: isti OU i potomak prolaze; parent, prefix-sibling i null putanja padaju; čitanje traži i caller scope i kompatibilnost sa OU licence.

`backend/src/modules/assets/asset-license-assignment-scope.integration.spec.ts` je registrovan u izolovanom PostgreSQL runneru i pokriva sedam real-DB scenarija:

1. picker vraća samo korisnika u read scopeu i OU subtree licence;
2. kompatibilan korisnik iz podređene OU može biti dodijeljen i prikazan;
3. korisnik iz susjedne OU, iako čitljiv calleru, odbija se kao nekompatibilan sa OU licence i ne ostaje red dodjele;
4. korisnik izvan callerovog read scopea vraća 404 i ne kreira dodjelu;
5. legacy cross-OU red ne vraća user ID, ime ili e-mail u detalju, a skriveni broj i seat count ostaju konzistentni;
6. promjena OU licence koja bi ostavila dodijeljenog korisnika izvan nove subtree granice odbija se bez promjene licence ili assignment reda;
7. nakon OU premještanja korisnika detalj rediguje njegovu identifikaciju i prijavljuje skriveni assignment.

`backend/scripts/run-isolated-integration.test.mjs` potvrđuje registraciju suitea i jedinstvenost izolovanih imena baza. `docs/backend/backend-wiring-manifest.json` osvježen je za novi autentifikovani route.

## CI i testni dokaz

Finalni CI [`40956304026`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40956304026) izvršen je na SHA `55fb782d02a4ccfecf4553c8d7fbfa9a6a41016b`:

- **Backend:** Prisma validate/generate, generated-artifact guard, route/wiring snapshot, build, lint, safety-net i kompletni Jest suiteovi su prošli.
- **PostgreSQL/Redis:** migration policy, replay svih migracija, runtime DB privilege/backup/restore i real integration suites su prošli; dodani license OU/scope suite je uključen u runner.
- **Frontend:** lint, format, testovi, TypeScript/Vite build i bundle-budget provjere su prošli.
- **Docs/CI/container:** docs guard, CI gate, container hardening, production dependency audit i image supply-chain koraci su prošli.
- **Skipped:** E2E install wizard i E2E critical flows nisu pokretani na push triggeru; zero-high/critical image enforcement korak je `skipped` nakon vulnerability scan koraka.
- **Neuspjeli pokušaj:** CI `40955264212` pao je prije backend builda zbog neispravnog TypeScript inferencea za testni `manageScope.unitPath` (`null` naspram `string`) i zato što je novi route nedostajao u wiring snapshotu. Tip parametra je eksplicitno ispravljen, manifest regenerisan, a finalni CI `40956304026` je zelen. Ovo su bile greške ovog paketa, ne preegzistentni/env kvarovi.

Dodatne lokalne provjere: frontend `npm run lint` i `npm run build` su prošli; Prettier i `i18n:check` su prošli; `npm run test:integration-harness` 3/3, `npm run wiring:check` i `npm run wiring:test` 6/6 te migration policy check za 97 migracija i testovi 2/2 su prošli. Backend `npm run lint` nema grešaka, ali prijavljuje tri postojeća `no-explicit-any` upozorenja u nepovezanom `sla-scan-failure-quarantine.spec.ts`. Lokalni ciljani Jest nije mogao tipizirati Prisma delegate jer sandbox nema generisani Prisma client; CI ga je generisao i pokrenuo puni backend suite. Lokalni Prisma engine download nije ponavljan.

## Registar nalaza

- Zatvoren je samo `BA-assets-07` (P2).
- `BA-assets-08`–`BA-assets-19` ostaju otvoreni; posebno, primary ticket-link invariant i cross-OU asset-target kompatibilnost licence nisu obuhvaćeni ovim paketom.
- Deklarisani agregat nakon W7.7: **582 otvorena / 110 zatvorenih / 692 ukupno**; početnih 19 P1 nalaza u Valu 7 i dalje je otvoreno.
- Machine-readable status redovi sada daju **585 otvorenih / 96 zatvorenih / 11 historijskih statusa**. Ranije dokumentovana razlika prema deklarisanom agregatu ostaje reconciliation obaveza; W7.7 nije pokušao uskladiti je.

## Migracija, rollout i rollback

Nema Prisma schema promjene, migration SQL-a, backfill-a ni historijskog cleanup-a; migracijski redoslijed ostaje nepromijenjen. PostgreSQL CI je potvrdio replay i historiju postojećih 97 migracija.

Rollout je application-only. Novi response field `hiddenAssignmentsCount` je aditivan; postojeći klijenti mogu ignorisati polje, a ažurirani frontend ga koristi za objašnjenje skrivenih redova. License picker koristi novi endpoint i više ne šalje upit na opću user-pretragu.

Rollback ne zahtijeva DB operaciju. Ipak, vraćanje starog application builda vraća i ranije ponašanje koje je dozvoljavalo cross-OU assignment i PII prikaz; ako se rollback pokaže nužnim, privremeno onemogućiti user-license assignment/read tok za scoped korisnike ili vratiti hotfix, umjesto smatrati da je promjena bezbjednosno neutralna. Postojeći assignment redovi ostaju sačuvani, a patched detail ih nastavlja redigovati prema aktuelnom OU stanju.

## Sljedeći paket

**W7.8 — `BA-assets-08` (P2):** DB/concurrency invariant za ticket primary link. Nije započet; radi se tek nakon zelenog W7.7 CI-ja i ovog dokumentacijskog closeouta.
