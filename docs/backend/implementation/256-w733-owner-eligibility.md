# Package closeout — W7.33

**Paket:** W7.33 — vlasnik problema vezan za jedinicu problema i revoke drift<br>
**Nalaz:** `BA-problems-15` (P2) — zatvoren<br>
**Kodni commit:** `3e28247` (kod), `daf5030` (frontend refaktor pod size ceiling), `ea16a1e` (tipovi test dubla)<br>
**Finalni testani SHA:** `ea16a1e`<br>
**CI:** [`44267814464`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44267814464) — zelen<br>
**DB migracije:** nema (nema schema promjene)

## Nalaz i acceptance

Audit (§10, `23-problems.md`) opisuje dvije stvari pod jednim ID-om:

1. **Eligibility.** Pravilo vlasnika bilo je „aktivan, nije anonimiziran, član grupe i ima
   `problem.manage` **negdje**“. Grant koji pokriva drugu organizacijsku jedinicu prolazio je isto kao
   grant za jedinicu problema, pa je menadžer druge jedinice mogao postati — i ostati — vlasnik
   problema koji po pravilima modula ne smije voditi.
2. **Revoke drift.** Kad se grant oduzme poslije dodjele (promjena role, premještaj, izlazak iz grupe,
   deaktivacija), ništa to nije primjećivalo: problem je zadržao vlasnika bez ovlasti, a korisnik je i
   dalje dobijao obavještenja o problemu koji više ne vodi. Provjera je postojala samo pri dodjeli.

Acceptance: (a) vlasnik mora imati `problem.manage` grant koji pokriva **organizacijsku jedinicu
problema** i biti član grupe problema; (b) oduzimanje granta mora biti **detektovano i
reconciliovano**, ne samo provjereno pri dodjeli; (c) zapis o tome ko je radio problem se ne
prepisuje — drift se rješava čitanjem; (d) nema nove migracije.

**Odluka o cross-unit dodjelama.** Rola `ADMIN`/`SUPER_ADMIN`/`PROBLEM_MANAGER` dodijeljena **bez
jedinice** je po definiciji cross-unit i pokriva svaku jedinicu; dodjela bez jedinice koja nije jedna
od te tri role pada na **matičnu** jedinicu korisnika (isto pravilo koje `resolveAssetScope` već
primjenjuje za imovinu). Time se ne uvodi novo pravilo, nego se koristi kanonski resolver.

**Odluka o `null` jedinici.** Problem bez jedinice ne smije se „popraviti“ širokim grantom: kad
putanja jedinice nije poznata, prolaze samo cross-unit dodjele. Legacy problem bez vlastite jedinice
čita se kroz jedinicu svoje grupe (alarm), odnosno kroz jedinicu koju servis dobije iz grupe (birač).

## Implementacija

**Pravilo (`problems/problem-owner-eligibility.ts`, novo)**

- `evaluateProblemOwnerEligibility` — tačna provjera: aktivan i ne anonimiziran račun → `problem.manage`
  kroz `viewerHasPermission` → članstvo u grupi → `resolveAssetScope` + `isPathInScope` za jedinicu
  problema. Razlozi: `inactive`, `not_manager`, `not_member`, `out_of_scope`. Koristi iste helpere kao
  svaki read/write put, pa zapisani vlasnik ne može proći ovdje a pasti tamo.
- `eligibleProblemOwnerWhere` — isto pravilo kao jedan Prisma filter za ograničene upite: tri grane
  (`userRoles.some.OR`) — cross-unit rola bez jedinice, dodjela s jedinicom iz ancestors lanca
  (`ouPath in [...preci]`), dodjela bez jedinice uz matičnu jedinicu korisnika u tom lancu — uz
  `isActive`, `anonymizedAt: null` i članstvo u grupi.
- `problemOwnerEligibility(prisma, …)` — svjež principal + zapis korisnika; jedina tačka koju zovu i
  write put i notifier i detalj.
- `problemUnitAncestors(path)` — `sales/emea/sarajevo` → `sales`, `sales/emea`, `sales/emea/sarajevo`.

**Servis (`problems.service.ts`)**

- Create: `requireUnitInScope` vraća jedinicu, pa se vlasnik provjerava za `unit.ouPath`.
- Update: provjera ide za `current.organizationalUnit.ouPath` (promjena grupe je handoff, koji vlasnika
  rješava za ciljnu jedinicu). Uklonjena je mrtva grana koja je pri promjeni grupe tiho ispuštala
  vlasnika — do promjene grupe tim putem ionako nije moglo doći (`handoffRequired`).
- `searchOwners`: scope filter i tekstualni filter su sada **oba** u `AND`; ranije je tekstualni `OR`
  mogao pregaziti scope ključ. Jedinica se čita iz grupe (`groupUnitPath`).
- `toDetail` vraća `ownerEligibility: { eligible, reason } | null` (`null` kad problem nema vlasnika).

**Notifier (`problem-notifier.ts`)**

- `effectiveOwner(facts)`: vlasnik koji više nije podoban ne dobija obavještenja; loguje se
  `problem_notice_owner_ineligible problem=<id> reason=<reason>` i primaoci se svode na voditelje grupe.
  Koristi se u `recurrence` i `targetDueDetailed`.
- `groupManagers`: voditelji se traže `eligibleProblemOwnerWhere` po jedinici **grupe** (ne bilo koje
  jedinice); ako grupa ne postoji, lista je prazna.

**Predaja (`problem-handoff.service.ts`)**

- `resolveOwner` čita jedinicu ciljne grupe kroz transakcijski klijent i koristi isti filter; nestala
  grupa je `groupNotFound` umjesto tihog `null`.

**Ops-health (`ops-health`, `problems/sweep`)**

- `sweep/problem-owner-drift.ts`: ograničen pregled (500) otvorenih problema s vlasnikom, pa **jedan**
  upit za vlasnike (isti `principalContextInclude` kao svaka autorizacijska odluka) i **jedan** za grupe;
  vraća `scannedProblems`, `ineligibleOwners`, `capped` i broj po razlogu. Nikad upit po problemu.
- Novi alarm `problems.owner.ineligible` (UPOZORENJE, 2/2), signal `problemOwnerDrift` u `OpsSignals`,
  probe timeout `problemOwnerDriftMs: 3_000`; neuspjeli probe je `null` (alarm neaktivan), jer je drift
  integritet podataka, a ne ispad.
- Detalji alarma: `ineligibleOwners`, `scannedProblems`, `capped` (limit pregleda dostignut ⇒ broj je
  minimum) i `reasons` samo za razloge koji su se pojavili. Bez ID-a problema i bez identiteta korisnika.

**Frontend**

- `ProblemDetail.ownerEligibility` + `problemOwnerIneligibleKey` (nepoznat razlog ima generičku uputu);
  detalj ispod imena vlasnika ispisuje naslov, razlog i uputu na `Uredi` (bs/en).
- `problems.errors.ownerNotInGroup` sada imenuje i jedinicu, ne samo grupu.
- Alarm: `problems_owner_ineligible` slug, ikona `UserX`, bs/en naslov i akcija, labele detalja
  (`ineligibleOwners`, `scannedProblems`, `capped`, `reasons`).
- Runbook: `ops/runbook/ALERTS.md#problem-owner-eligibility` + red u tabeli.

**Nije obuhvaćeno (svjesno):** nema automatske dodjele novog vlasnika (to je odluka čovjeka — alarm i
UI kažu *šta* i *kome*), nema prepisivanja zapisa o vlasniku, nema migracije.

## Direktni testni dokaz

- `problem-owner-eligibility.spec.ts` (10) — preci putanje; tačna i parent dodjela prolaze; sestra i
  dijete ne prolaze; globalni `ADMIN`/`PROBLEM_MANAGER` prolaze, jedinicom vezan menadžer ne; matična
  jedinica kao fallback (i uz service-scoped dodjelu); `inactive`/`not_manager`/`not_member` drift
  razlozi; `null` jedinica nikad ne širi (scoped `ADMIN` → `out_of_scope`, globalni prolazi); oblik
  filtera (članstvo + `isActive` + `anonymizedAt: null` + tri grane, jedna grana za `null`).
- `problem-owner-scope.spec.ts` (8) — provjera dobija tačno grupu i jedinicu problema; odbijanje po
  svakom razlogu bez ijednog write-a; update drugog polja ne dira vlasnika; birač vlasnika drži scope i
  tekstualni filter razdvojeno; bez grupe vraća praznu listu; detalj prijavljuje podobnog i nepodobnog
  vlasnika sa razlogom.
- `problem-notifier-owner-drift.spec.ts` (4) — vlasnik prima dok ima grant; otkazani vlasnik prepušta
  obavještenje voditeljima; `NO_RECIPIENT` kad nema ni voditelja; upit za voditelje vezan za jedinicu
  grupe.
- `sweep/problem-owner-drift.spec.ts` (7) — nula drifta; brojanje po razlogima; jedinica problema ima
  prednost, legacy red pada na jedinicu grupe; `capped` pri dostignutom limitu; filter (otvoreni statusi,
  `ownerUserId not null`, `updatedAt desc`, `take`) i po jedan upit za vlasnike/grupe; prazan pregled ne
  čita dalje; anonimiziran vlasnik je `inactive`.
- `evaluate-ops-signals.spec.ts` — alarm aktivan sa brojem, razlozima i `capped`; `null` probe ne
  otvara alarm; nula drifta drži alarm tihim.
- Ažurirani postojeći dublovi: `problem-handoff.service.spec.ts`, `problem-handoff-guards.spec.ts`,
  `problem-notifier-visibility.spec.ts` (novi čitajući upiti kroz filter i principal).
- Frontend: `problem-owner-ineligible-hint.spec.tsx` (razlog → ključ, nepoznat razlog → generička
  uputa, tiha uputa za podobnog vlasnika i za `null` verdikt) i coverage guardovi za slugove, ikone,
  labele i bs/en prevode alarma.

## CI i testni dokaz

CI run [`44267814464`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44267814464) na
`ea16a1e`:

- **Backend:** generisani Prisma (`Validate`/`Generate`/`Verify artifacts`), backend build sa anotiranim
  dijagnostikama, `npm run lint`, suite ranije blokirane nedostajućim tipovima, API/worker/scheduler/
  shutdown wiring i SLA failure/concurrency/scope/DST matrica — svi prolaze; pun `npm test -- --ci
  --coverage=false` prolazi.
- **PostgreSQL/Redis integracija:** prolazi (paket ne dodaje migraciju, pa je ovo dokaz da drift čitanje
  ne mijenja postojeću šemu ni harness).
- **Frontend:** lint, format (Prettier), `npm test` (1.792 testa), build i bundle/cold-route budgeti —
  prolaze.
- **Docs/CI gate/container:** docs guard, container + supply chain (audit i SBOM) i `CI gate` prolaze.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E install wizard` i `E2E critical flows`
  — workflow ih preskače na ovom tipu promjene (`skipped`, ne passed).
- **Neuspjeli pokušaji:** `44262744211` na `3e28247` — frontend `Format check (Prettier)` pao je na
  mom novom tipu u `problems-api.ts` (unija je ostala na više redova); popravljeno u `11bfe2d`.
  `44263246219` na `11bfe2d` — frontend `npm test` pao je na `src/lib/module-size.spec.ts`: detalj
  problema (500), `lib/modules` ceiling (320) i legacy hotspot `services/problems-api.ts` (578) su
  prekoračeni; riješeno vađenjem upute u `components/problems/problem-owner-ineligible-hint.tsx` i
  mapiranja razloga u `lib/problems/problem-owner-eligibility.ts` (`daf5030`), bez podizanja baselinea.
  `44266623028` na `daf5030` — backend `npm test` pao je na tipovima u novom test dublu
  (`TS2345` u `problem-owner-drift.spec.ts`: `mockImplementation` sa parametrom nad dublom koje vraća
  `Promise<Problem[]>`); popravljeno čitanjem `take` iz `mock.calls` (`ea16a1e`). Nema preegzistentnih
  padova u finalnom runu.

Dodatne lokalne provjere i ograničenja: `npx jest` nad `src/modules/problems` i
`src/modules/ops-health` — 400 prošlo, 25 skipped (DB suiteovi bez baze u sandboxu); pun frontend
`npx vitest run` — 1.792 testa u 456 fajlova, svi prolaze; frontend `npm run build` i
`node scripts/check-frontend-bundle-budget.mjs` prolaze;
`eslint` čist na svim izmijenjenim backend i frontend fajlovima; frontend `tsc --noEmit -p
tsconfig.app.json` čist; `prettier --check` čist na oba locale fajla; findings guard
(`696/696`, `P1=174 P2=371 P3=151`) i docs guard (32 stranice) zeleni. Backend `tsc --noEmit` u
sandboxu nije mjerodavan (Prisma klijent je stub, ~4.300 očekivanih grešaka tipa `Property … does not
exist on type 'PrismaService'`); filtrirano na izmijenjene fajlove, nijedna greška ne imenuje novo
ponašanje. Tipove spec fajlova provjerava CI i tu je uhvaćen `TS2345` opisan gore.

## Registar nalaza

- Zatvoreni: `BA-problems-15` (uz gornji acceptance dokaz i zeleni CI).
- Ostaju otvoreni u ovom auditu: `BA-problems-16`, `17`, `18`, `19`, `20`, `21`.
- Kontrolni zbir: source/plan **440** otvorenih / **256** zatvorenih / **696** ukupno
  (P1 174 / P2 370 / P3 151); ovaj registar **450** / **246**; Val 7 **35/111** (76 otvorenih:
  13 P1 / 43 P2 / 20 P3); `problems` **15/21** (6 otvorenih: 0 P1 / 2 P2 / 4 P3) — stanje poslije
  ovog paketa.

## Migracija, rollout i rollback

**Nema migracije** i nema schema promjene: drift se rješava čitanjem, zapis o vlasniku se ne
prepisuje. Rollout je običan deploy backend + frontend bundlea; stari frontend ne poznaje
`ownerEligibility` i ignoriše ga (aditivno polje), a novi frontend uz stari backend nema polje i ne
prikazuje upozorenje. Rollback je vraćanje prethodne slike; podaci nisu dirani, pa nema
nepovratnih koraka. Jedina operativna posljedica: alarm `problems.owner.ineligible` može otvoriti
odmah nakon deploya ako u bazi već postoji drift — to je namjera, a runbook ima postupak.

## Sljedeći paket

**W7.34 — `BA-problems-16` (P2):** privacy/retention ne pokrivaju sva imenovanja, notifier/KB replike
i closed-record lifecycle. Nije započet prije zelenog gatea za ovaj paket.
