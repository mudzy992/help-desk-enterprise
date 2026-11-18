# Package closeout — W7.47

**Paket:** W7.47 — CAB runda ima zamrznut skup glasača i kvorum<br>
**Nalaz:** `BA-changes-06` (P1) — **zatvoren**<br>
**Kodni commit:** `8e1e8e3`<br>
**Finalni testani SHA:** `8e1e8e3`<br>
**CI:** [`44410001059`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44410001059) — zelen (17m06s)<br>
**DB migracije:** nema (snapshot živi u postojećem `ChangeEvent.detail` JSON-u)

## Nalaz i acceptance

Audit `24-changes.md` §7 i §19 točka 4: `eligibleVoters` se računao **uživo** na svakom čitanju i glasanju
(CAB grupa + `change.approve` + aktivan + nije podnosilac), a `evaluateChangeVotes` je brojao **sve** redove
`ChangeApproval` u rundi. Posljedica: član koji je u CAB ušao poslije otvaranja runde mogao je glasati u njoj;
kvorum se mijenjao kad neko napusti grupu (retroaktivno); nije postojao dokaz koji je skup glasača bio na
otvaranju runde.

Acceptance: (1) runda ima **dokaziv** voter/quorum skup, (2) membership drift **ne mijenja** odluku
retroaktivno, (3) glas van tog skupa ne odlučuje rundu, (4) runda koja je već u toku u trenutku deploya nije
blokirana, (5) zelen CI gate.

## Implementacija

- **`change-voter-snapshot.ts` (novo)** — tip `ChangeVoterSnapshot { round, voters, quorum }`, fail-closed
  parser `changeVoterSnapshotOf(detail)` (odbija ne-Cijele brojeve, `round < 1`, negativan kvorum,
  `quorum > voters.length`, ne-stringove, duplikate svodi, > 100 glasača odbija) i `countSnapshotVotes()`
  koji filtrira glasove van skupa (i `approverUserId === null`).
- **`ChangesService.act()`** — pri prelasku u `AUTHORIZATION` (jedini put je `submit`, NORMAL iz `ASSESSMENT`
  i EMERGENCY iz `DRAFT`) računa `voters` (CAB glasači bez podnosioca) i `quorum`
  (`computeChangeQuorum(type, configuration, voters.length)`) **jednom** i upisuje ih u `status` event koji
  otvara rundu: `{ from, to, action, reason, outcome, round, voterSnapshot }`. Postojeći `noApprovers` guard
  sada koristi istu, već učitану listu — nema dvostrukog upita. Bez nove tabele, bez kolone, **bez migracije**.
- **`ChangeApprovalsService.voterSnapshot(change, configuration)`** — traži najnovije `status` evente
  (`take: changeLimits.voterSnapshotEvents = 12`, `orderBy createdAt desc`) i vraća prvi snapshot čiji
  `round === change.approvalRound`; ako ga nema (runda otvorena prije W7.47 ili event starije replike),
  vraća **live** izračun sa `frozen: false`. Fail-closed parser гарантује да oštećen JSON ne može proizvesti
  prazan skup koji bi blokirao rundu.
- **`vote()`** — glasač mora biti u zamrznutom skupu (`notApprover` inače) uz zadržanu živu provjeru CAB
  članstva; kvorum je `snapshot.quorum`; rezultat se računa nad `countSnapshotVotes(recorded, snapshot)`, pa
  glas van skupa ne odlučuje. Glas koji je član dao prije izlaska iz grupe ostaje važeći — to je upravo
  „drift ne mijenja odluku retroaktivno“.
- **`overview()`** — panel prikazuje zamrznuti skup i kvorum (`frozen: true`), `approvals` broji samo važeće
  glasove, `canVote` traži članstvo u zamrznutom skupu (novi član CAB-a vidi listu, ali ne i dugme), a za
  zamrznutu rundu **nema** dodatnog upita za živi roster.
- **Frontend:** `ChangeApprovals` dobija opcionalno `frozen`, a panel prikazuje kratko objašnjenje
  (`changes.approvals.frozen`, bs/en) kad je runda zamrznuta — bez novog ekrana ili rute.
- **Nije promijenjeno:** `computeChangeQuorum`/`evaluateChangeVotes` (`change-cab.ts`) kao čiste funkcije,
  `loadCabVoterIds` (hard limit 100 ostaje `BA-changes-14`, P2), notifikacije glasačima i historija changea
  (snapshot je u postojećem `status` eventu, pa ga frontend history ne mora poznavati).

## Direktni testni dokaz

- `change-voter-snapshot.spec.ts` (3 testa) — parser prihvata ispravan snapshot i svodi duplikate; odbija 11
  malformiranih oblika (uključujući `quorum > voters`, 101 glasača, ne-stringove); `countSnapshotVotes`
  izbacuje tuđi glas i `null` glasača.
- `change-approvals-snapshot.spec.ts` (5 testova) — `voterSnapshot` čita event tekuće runde (`action: 'status'`,
  `take > 0`) i ignoriše snapshot druge runde uz live fallback (`frozen: false`, kvorum iz živog broja);
  glas van zamrznutog skupa ⇒ `CHANGE_NOT_APPROVER` **bez** transakcije; dva odobrenja iz zamrznutog skupa uz
  tuđi `REJECTED` glas ⇒ `SCHEDULED` (kvorum 2, ne „živih 5“); `overview` vraća `frozen: true`, kvorum 2,
  `approvals: 1`, samo zamrznute glasače i `canVote: false` za viewera van skupa.
- Frontend: `vitest src/i18n src/lib/changes src/components/changes` (13 fajlova / 68 testova) prolazi;
  `prettier --check` i `eslint` čisti.

## CI i testni dokaz

CI run [`44410001059`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44410001059) na `8e1e8e3`:

- **Backend:** generisani Prisma, wiring manifest, build, lint, safety-net i pun Jest (uključujući dva nova
  speca) — uspješno.
- **PostgreSQL/Redis integration:** postojeći `changes` suiteovi — uspješno.
- **Frontend:** lint, format (Prettier), testovi, build i bundle budget — uspješno.
- **Docs guard / container / CI gate:** uspješno.
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.

**Neuspjeli pokušaji:** nema — prvi run je zelen. Lokalno su prije commita ispravljena dva propusta u novim
specovima (fixture sa 101 identičnim ID-em se dedupira; `overview` je trošio mock za živi roster) i jedan
neiskorišten uvoz, pa CI nije vidio te iteracije.

Dodatne lokalne provjere i ograničenja: `changes` + `problems` **51 suite / 373 testa** prolazi; `npx eslint`
na `src/modules/changes/*.ts` čist; cijeli backend unit run na poznatom sandbox baselineu (Prisma stub).

## Registar nalaza

- Zatvoreni: `BA-changes-06` (P1).
- Ostaju otvoreni u `24-changes.md`: 14 nalaza (P1: `07`).
- Kontrolni zbir: plan **429 otvoreno / 267 zatvoreno / 696**; Val 7 **65 otvoreno / 46 zatvoreno / 111**
  (P1 8 / P2 40 / P3 17); registar `BACKEND-FINDINGS-REGISTER.md` **439 / 257 / 696**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene — snapshot je JSON u postojećem `ChangeEvent.detail`. Runda otvorena
prije deploya nastavlja po starom (živom) pravilu dok se ne zatvori; svaka nova runda je zamrznuta. Nema
promjene API ruta; odgovor `GET /changes/:id/approvals` dobija opcionalno `frozen` polje. Rollback: revert
`8e1e8e3` (eventi sa snapshotom ostaju u historiji kao bezopasan JSON; ponašanje se vraća na živo računanje).

## Sljedeći paket

**W7.48 — `BA-changes-07` (P1):** reminder/overdue marker se postavlja prije primaoca i potvrđene
(persistirane) isporuke — marker samo uz retryable persisted delivery outcome. Nije započet prije zelenog
gatea za ovaj paket.
