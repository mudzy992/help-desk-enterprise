# W7.78 — `BA-changes-20`: dokazi za glasovanje, concurrency i pad nakon commita

**Paket:** Val 7, `changes`, **P3**<br>
**Nalaz:** „Jedan suite je compile-blocked; nema service/concurrency/failure E2E matrice”<br>
**Kod:** `backend/src/modules/changes/change-approvals.service.spec.ts` (novo),
`backend/src/modules/changes/change-approvals-concurrency.integration.spec.ts` (novo, real PostgreSQL),
`backend/package.json` (`test:safety-net:compile`), `backend/scripts/run-isolated-integration{,.test}.mjs`<br>
**DB migracija:** nema<br>
**CI:** [`44921661172`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44921661172) **success** (uključujući PostgreSQL/Redis integraciju sa novim CAB shard-om; E2E poslovi `skipped`)

## Nalaz

§13 je ostavio dvije stvari otvorene:

1. **Compile-blocked suite.** U baselineu je `change-access.service.spec.ts` padao na kompilaciji jer generisani
   Prisma client nije imao `group`, `groupMember` i `organizationalUnit`. Suite je u međuvremenu zelen, ali nikad
   nije bio **imenovan** u zaštiti za taj scenario — `test:safety-net:compile` je lista „suiteova koje je generisani
   client nekad blokirao” i modul promjena u njoj nije bio. Regresija bi ponovo prošla tiho.
2. **Nema service/Prisma/concurrency testova.** Sve što je nosilo odluku kvoruma bilo je pokriveno samo kroz E2E
   (koji se ne pokreće na svaki push) i kroz čiste funkcije (`evaluateChangeVotes`, snapshot, pravila). Nijedan
   test nije tvrdio: da jedna runda ima jedan glas po glasaču, da dva glasača sa istom verzijom pomjeraju rundu
   **jednom**, da član koji se pridružio kasnije ne može glasati u zamrznutoj rundi, ni da pad notifikacije nakon
   commita ne poništava odluku.

Uz to je puni E2E run [`44882525653`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44882525653)
pao na jednom testu (`31-change-lifecycle`, `CHANGE_CAB_GROUP_REQUIRED`) jer je spec bio stariji od W7.73 — vidi
§„E2E drift” ispod.

## Rješenje

**1. Compile-blocked suite je sada imenovana zaštita.** `test:safety-net:compile` uključuje
`change-access.service.spec.ts` i `change-approvals.service.spec.ts`, pa CI korak „Run suites previously blocked by
missing generated Prisma types” eksplicitno ispiše da modul promjena kompajlira uz stvarni generisani client.

**2. Ugovor glasovanja bez baze** — `change-approvals.service.spec.ts` (**14 testova**): requester ne glasa;
ne-član ne glasa; **član koji se pridružio nakon otvaranja runde ne glasa** (snapshot, ne živa članstva); van
`AUTHORIZATION` nema glasanja; zastarjela verzija se odbija; odbijanje traži razlog; `P2002` na jedinstvenom
`(change, round, approver)` postaje `CHANGE_ALREADY_VOTED`; izgubljena trka (`updateMany` = 0) postaje
`CHANGE_VERSION_CONFLICT` **bez** brojanja glasa; dostignut kvorum prelazi u `SCHEDULED` i u **istoj transakciji**
ostavlja downtime intent; **pad notifikacije nakon commita ne poništava odluku** (`notifier.run` guta grešku, glas
je već zapisan); pending runda ne najavljuje ništa; prvo odbijanje ruši rundu; glas van zamrznutog seta se ne broji
iako red postoji; scoped manager van opsega staje prije upisa.

**3. Supstrat pod stvarnim PostgreSQL-om** — `change-approvals-concurrency.integration.spec.ts` (**5 testova**,
registrovan u `scripts/run-isolated-integration.mjs`, pa ga izvršava CI job „Backend PostgreSQL + Redis
integration” na svježoj bazi):
- dva **istovremena** glasa istog glasača u istoj rundi ⇒ tačno jedan prolazi, drugi dobija `P2002`, u tabeli je
  jedan red;
- isti glasač **smije** glasati u sljedećoj rundi (jedinstvenost uključuje `round`);
- dva glasača sa istom verzijom ⇒ `updateMany` guard vraća `[1, 0]`, stanje je `SCHEDULED` i `version = 2` — nema
  izgubljenog upisa;
- snapshot iz `status` događaja preživi JSON round trip, a glas „late membera” ne može zadovoljiti kvorum te runde;
- brisanje promjene odnosi i glasove i događaje (kaskada).

**4. Zaštita registracije** — `scripts/run-isolated-integration.test.mjs` sada tvrdi da **svaki**
`src/modules/changes/*.integration.spec.ts` mora biti u runner listi (isti obrazac kao za `templates` i
`service-catalog`), pa novi DB spec ne može ostati neizvršen.

## E2E drift (isti paket, commit `967747e`)

Puni E2E run `44882525653` (na `9e464b5`) pao je na
`31-change-lifecycle.spec.ts › request → assess → CAB → …` sa `CHANGE_CAB_GROUP_REQUIRED {message: "cabGroupId"}`.
Uzrok nije bio u proizvodu: spec je kreiran prije W7.73 (`BA-changes-16`), kada je backend birao „prvi CAB group
po abecedi”, i kreirao promjenu **bez** `cabGroupId`. W7.73 je to zamijenio rutiranjem po OU/service lancu koje
**ne pogađa**: dvosmislen slučaj završava sa `CHANGE_CAB_GROUP_REQUIRED`, a forma od tada traži izbor
(`canSubmitChangeForm` zahtijeva neprazan `cabGroupId` za svaku ne-STANDARD promjenu). API ugovor je bio tačan;
test je bio zastario, i to se vidjelo samo zato što se E2E pokreće na schedule/dispatch.

Spec sada šalje CAB grupu fixturea, kao što forma radi, **i** dokazuje pravilo o kojem je ovisio: privremeno doda
drugu CAB grupu u istu OU, potvrdi da isti body bez `cabGroupId` završava sa `CHANGE_CAB_GROUP_REQUIRED`, i obriše
je — tvrdnja ne zavisi od toga koje CAB grupe stack trenutno nosi, a „korisni” default više ne bi prošao neopaženo.

## Dokazi

- `modules/changes` + `modules/ops-health`: **56 suite / 436 testa** zeleno lokalno (uz 3 skipped — DB specovi bez
  `PRIVACY_IT_DATABASE_URL`), `eslint` čist.
- `node --test scripts/run-isolated-integration.test.mjs` — **22/22** (uključujući novi changes guard).
- `npx tsc --noEmit -p tsconfig.json` i `npx playwright test -c unit/playwright.config.ts` (6 testova) u `e2e/` za
  drift ispravku.
- Prvi run ovog paketa [`44920755191`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44920755191) pao je
  na jednom testu novog DB speca: „late member” glas je pokazivao na nepostojeći korisnik i pao je na
  `ChangeApproval_approverUserId_fkey` prije nego što je pravilo snapshota uopšte provjereno. Ispravljeno u
  `24f539d` (treći korisnik koji **jeste** stvaran, ali **nije** u zamrznutom setu) — zeleno u `44921661172`.
- Raniji dokaz da compile-blocked suite više nije blokiran: `Backend build + test` (uključuje pun `npm test`) je
  zelen u runovima `44835370943` i `44828863763`.

## Šta ostaje E2E-only (i zašto)

§13 traži i E2E matricu (scoped manager, tuđi asset/problem link, preview/calendar leak, dinamičko CAB članstvo,
konkurentni glasovi, reminder failure/Redis gubitak, owner OU eligibility, privacy retention). U ovom paketu su ti
scenariji pokriveni na **servisnom i DB nivou** (gore), a ne u browseru: scoped manager i „član koji se pridružio
kasnije” traže **drugu identitetu sa `change.approve`**, a E2E stack ima tri fiksna aktera (superadmin, agent,
user). Provisioniranje četvrtog aktera je promjena E2E infrastrukture (seed + MFA), ne testa; ostaje kao
dokumentovan preostali rizik u §13, uz napomenu da su iste invarijante sada deterministički provjerene ispod UI-ja.

## Rizik i rollback

- **Rizik:** integracijski specovi traže bazu; ako `PRIVACY_IT_DATABASE_URL` nije postavljen, `describe.skip` ih
  preskače (namjerno) — u CI-ju ih pokreće dedicated job, a guard u harness testu sprječava da ispadnu iz liste.
- **Rollback:** uklanjanje tri nova/nova-izmijenjena test fajla i dvije linije u `package.json`/runner listi; nema
  produkcijskog koda ni podataka za vraćanje.
