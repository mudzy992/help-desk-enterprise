# Backend audit 21 — `on-call`

**Status:** audit završen; `BA-on-call-01` (W6.41), `BA-on-call-02` (W6.42) i `BA-on-call-03` (W6.43) zatvoreni<br>
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,84/10**  
**Nalazi:** 3 P1, 8 P2, 3 P3

## 1. Executive summary

`on-call` pruža grupne rotacije, timezone/DST-aware smjene, overrideove, bilateralne swap zahtjeve, javni personalni iCal feed, reminder/gap sweep, SLA recipient i outside-hours auto-assignment integraciju. Temelj je dobar: centralizovan resolver, civil-date rotacija, DST-aware instanti, serializable override insert, transactional audit, kriptografski iCal token hash, dedupe notification ključevi i ograničeni range/članovi.

Baseline je **4,84/10**. U baselineu su tri P1 nalaza pogađala scope i integritet rasporeda. `onCallViewer` je svodio permisiju na boolean i odbacivao assignment scope, pa je scoped reader/manager mogao vidjeti i mijenjati sve grupe; ovaj P1 je zatvoren u W6.41 (vidi §16). Swap request više ne prihvata interval izvan requesterove stvarne rotation smjene: BA-on-call-02 je zatvoren u W6.42 (vidi §17). Concurrent schedule save je zatvoren u W6.43: `updatedAt` revision token i conditional CAS odbijaju stale writer, a header, member replacement i audit ostaju u istoj transakciji.

Dodatni otvoreni rizici su stale eligibility pri acceptu, foreign owner, iCal koji nadživljava permission revoke, best-effort reminder bez recoveryja, scheduler bez reconciliationa, silent retention failure, hard truncation i nedovoljna integracijska/concurrency pokrivenost. Nema P0. Izvorni 4,84/10 je baseline prije implementacija; `BA-on-call-02` zatvoren je u W6.42, `BA-on-call-03` u W6.43, a on-call P2/P3 ostaju otvoreni.

## 2. Scope i inventar

- 18 produkcijskih TypeScript fajlova;
- 3 direktna speca;
- 2.083 aktuelna produkcijska LOC;
- 2 controllera, 3 injectable servisa i 1 BullMQ processor;
- Prisma: `OnCallSchedule`, `OnCallRotationMember`, `OnCallOverride`, `OnCallSwapRequest`, `OnCallCalendarToken`;
- integracije: authorization/RBAC, groups/users, audit-log, notifications/preferences, SLA escalation, ticket auto-assignment, settings, privacy i BullMQ;
- primarni E2E dokaz: 44; reference 10 i 56.

Registarskih 2.101 LOC korigovano je na 2.083.

## 3. API i authorization

Autentifikovane rute zahtijevaju `oncall.read` ili `oncall.manage`; write rute imaju DTO whitelist i reason. Javni iCal koristi 256-bitni bearer token, hash u bazi, no-store i uniformni 404.

Baseline `onCallViewerFromContext` provjeravao je samo postoji li assignment sa permission keyem. Ne prenosio je organizational-unit/service scope niti group set. Overview je čitao sve grupe/schedule, detail arbitrary group ID, a manage save/delete/override radio nad arbitrary groupom. To je ispravljeno za BA-on-call-01: viewer sada nosi odvojene read/manage OU scopeove, kolekcije se filtriraju prije učitavanja schedule podataka, a direct-ID putanje ponovo provjeravaju grupni scope. Service-only grant ne mapira se na grupe jer `Group` nema service vezu. Preostale P1 scope granice su u §16.

Svi korisnici sa read pravom vide sve schedule članove, override razloge i pending swap razloge. I nakon scope popravke treba odlučiti jesu li reason i pending bilateralni zahtjevi manager-only ili participants-only podaci.

## 4. Schedule model, resolver i DST

Jedan schedule po grupi je DB unique; member i position imaju composite unique. Resolver računa DAY/WEEK smjene po civilnom datumu i lokalnom handoff vremenu. DST mijenja instant, ne wall clock. Neaktivna/anonymized osoba proizvodi gap umjesto tihog preskakanja, što je operativno sigurna odluka. Override ima prioritet.

Save validira IANA zonu, civil date, handoff quarter-hour, max 50 unique članova i eligibility novih članova. Stari član koji je napustio grupu smije ostati i postaje uncovered tek zato što availability provjera u data loaderu gleda samo active/anonymized, ne aktuelno group membership. Komentar obećava uncovered, ali implementacija ne učitava članstvo i takav active ex-member ostaje dežuran. Ovo je P2 authorization/assignment drift.

Outside-hours auto-assignment koristi aktivan SLA calendar i vraća resolver usera, ali ne provjerava da je user i dalje član target grupe. Isti drift može dodijeliti ticket bivšem članu. SLA recipient i quiet-hours bypass takođe nasljeđuju rezultat resolvera.

## 5. Concurrent schedule update

Save prije transakcije učitava previous/eligible, a u transakciji radi schedule upsert, briše sve rotation members i ponovo ih kreira. Nema `updatedAt/version` preconditiona, row locka ni serializable izolacije. Dva managera mogu:

- oba proći validaciju nad istim previous stanjem;
- zadnji upisati header;
- jedan obrisati članove koje je drugi upravo kreirao;
- dobiti unique konflikt ili finalni header/member skup koji ne odgovara jednom zahtjevu;
- oba ostaviti audit zapis koji tvrdi drugačiji after state.

Uvesti version/If-Match ili `FOR UPDATE`, atomarni replacement i conflict odgovor. Audit treba nastati iz stvarno zaključanog before/after stanja.

## 6. Override i swap lifecycle

Manual override provjerava managera, aktuelnog eligible group staff člana, range i overlap. Insert ide SERIALIZABLE, a swap accept i status CAS su u istoj transakciji sa overrideom. `swapRequestId` je unique. Ovo je snažna osnova.

Baseline BA-on-call-02 je potvrđivao samo da su requester i colleague članovi rotation liste; interval nije bio vezan za requesterovu stvarnu smjenu, pa je accept mogao istisnuti treću osobu. U W6.42 `requestSwap` učitava schedule context za traženi raspon i zahtijeva kontinuiranu pokrivenost requesterovim `source: "rotation"` segmentima. Handoff u smjenu drugog člana, uncovered vrijeme i bilo koji postojeći override u intervalu se odbijaju; partial i puna requesterova smjena su dozvoljene. Dokaz i granice su u §17. Accept-time membership/version revalidacija ostaje zaseban P2 (`BA-on-call-05`).

Accept koristi snapshot iz zahtjeva i ne provjerava ponovo da je colleague aktivan, neanonimizovan, član grupe/rotacije ili da schedule/member redoslijed nije promijenjen. Schedule edit može učiniti pending swap zastarjelim. Potreban schedule version i revalidation u istoj serializable transakciji.

Owner može biti bilo koji aktivni staff korisnik, bez group membershipa/scopea; dobija foreign group gap informacije. Owner treba biti scoped manager ili eligible member grupe.

## 7. iCal token i privatnost

Token ima 256 bitova, SHA-256 hash, rotate/revoke audit i uniformni not-found. Feed sadrži samo vlastite smjene, grupno ime i vremena; RFC 5545 escaping/folding je korektan.

Feed provjerava active/anonymized i bilo koju staff rolu, ali ne provjerava `oncall.read`. Nakon permission revoke URL ostaje aktivan. Token treba biti vezan za authorization version ili feed mora provjeriti aktuelno permission/scope stanje. Group scope promjena mora ukloniti foreign događaje čak i kada token ostaje isti.

Bearer u query URL-u je nužan za calendar klijente, ali može završiti u proxy/access logu. Runbook treba redigovati query string, zahtijevati HTTPS, podržati rotaciju i prikaz posljednjeg korištenja bez čuvanja tokena.

## 8. Sweep, notifications i retention

Quarter-hour sweep planira next-day reminder, shift-start i 24h gap. Dedupe key sprečava duplikat. Notification write je best-effort: svaka greška se guta i sweep nastavlja; sljedeći run može ponoviti unutar grace/windowa, ali nakon izlaska iz prozora nema recoveryja. Persistirani delivery task/outbox ili missed-action reconciliation je potreban.

Scheduler se registruje samo pri bootu; Redis restart/flush ne self-heala bez redeploya. Retention briše stare override/swap redove sa dva neograničena `deleteMany`, hvata grešku i ipak završava sweep uspješno. Nema health signala za missing scheduler, missed sweep, notification failure/gap backlog ili retention drift.

`detail` hard-truncira overrideove na 200 i pending swapove na 100 bez `hasMore`; `mySwaps` uzima 50 bez paginationa. Duži history može nestati iz UI ugovora.

## 9. Audit i podaci

Schedule, override i swap writes su auditirani u transakciji. Calendar rotate je transactional audit; revoke koristi helper nakon deletea, pa audit failure može ostaviti token opozvan bez zapisa. Notification je poslije commita i namjerno ne blokira poslovnu operaciju.

DB nema exclusion constraint za overlap; serializable aplikacijski insert štiti poznatu putanju, ali budući/direct write može prekršiti invariant. Pending swap nema unique semantic key pa requester može spamovati identične zahtjeve; notification dedupe je po swap ID-u i ne pomaže.

Retention fizički briše accepted swap i povezani override nezavisno po endsAt; audit ostaje, ali UI history nestaje prema settingu. To mora biti dokumentovano u privacy/operations policyju.

## 10. Testovi i E2E

Baseline prije W6.41/W6.42 izvršio je:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/on-call -name '*.spec.ts' -print | sort)
```

Tadašnji rezultat bio je **3/3 suitea i 11/11 testova** za resolver, DST/rotation/override, sweep planning i iCal escaping/folding. Nakon P1 popravki ciljani lokalni run je prošao **7/7 suitea i 37/37 testova** uz ts-jest dijagnostiku isključenu zbog nedostajućeg lokalnog generated Prisma clienta; CI generated-Prisma build i puni Jest rezultat su evidentirani u §17.

Dodani service-specovi sada pokrivaju scoped foreign read/write i interval-invalid swap request. Još nisu obuhvaćeni concurrent schedule save, stale accept, ex-member auto-assignment, token permission revoke, scheduler loss, missed notification ili truncation. E2E 44 provjerava schedule CRUD i UI bez prepisivanja postojećih rasporeda, ali ne dokazuje ove preostale negative/concurrency putanje.

## 11. Pozitivni nalazi

1. DTO whitelist i bounded članovi/range/reason.
2. IANA timezone i civil-date validacija.
3. DST-aware wall-clock handoff.
4. Jedan schedule po grupi i unique member/position.
5. Unavailable user ne preskače rotaciju tiho.
6. Manual override zahtijeva eligible group staff usera.
7. Override overlap insert je SERIALIZABLE.
8. Swap status CAS i override nastaju u jednoj transakciji.
9. `swapRequestId` je unique.
10. Write operacije imaju audit reason.
11. Notification dedupe ključevi su stabilni.
12. iCal token je random, hashovan, rotatable i revocable.
13. Feed je personalan, escaped, folded i no-store.
14. Outside-hours assignment poštuje SLA business calendar.
15. Pure resolver/sweep/iCal testovi su zeleni.
16. W6.42: swap request prihvata samo potpuno requester-rotation-pokriven interval bez overlap overridea.
17. W6.43: schedule update traži current `updatedAt` revision; concurrent loser dobija 409, a pobjednički header/member set/audit commitaju se zajedno.

## 12. Registar nalaza

| ID            | Severity | Nalaz                                                                                     | Status   |
| ------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-on-call-01 | P1       | Scoped read/manage assignment daje globalni read i write nad svim grupama                 | zatvoreno (W6.41) |
| BA-on-call-02 | P1       | Swap interval nije vezan za requesterovu smjenu i može istisnuti treću osobu              | zatvoreno (W6.42) |
| BA-on-call-03 | P1       | Concurrent schedule save može korumpirati header/member kombinaciju                       | zatvoreno (W6.43) |
| BA-on-call-04 | P2       | Bivši active član grupe ostaje resolver/auto-assignment/SLA/quiet-hours kandidat (loader provjerava članstvo, paket 186) | zatvoreno |
| BA-on-call-05 | P2       | Swap accept ne revalidira colleague membership/availability ni schedule verziju (accept-time revalidacija, paket 187) | zatvoreno |
| BA-on-call-06 | P2       | Owner može biti foreign staff i primati gap informacije (owner eligibilnost pri saveu i sweepu, paket 189) | zatvoreno |
| BA-on-call-07 | P2       | iCal feed ostaje aktivan nakon oncall.read/scope revokea (feed revalidira permisiju/scope, paket 190) | zatvoreno |
| BA-on-call-08 | P2       | Best-effort sweep notification nema durable recovery nakon prozora                        | otvoreno |
| BA-on-call-09 | P2       | Scheduler nema reconciliation nakon Redis gubitka                                         | otvoreno |
| BA-on-call-10 | P2       | Retention je unbounded, guta grešku i nema health signal                                  | otvoreno |
| BA-on-call-11 | P2       | Override/swap liste su hard-truncated bez pagination/hasMore                              | otvoreno |
| BA-on-call-12 | P3       | Token revoke audit nije atomaran sa deleteom                                               | otvoreno |
| BA-on-call-13 | P3       | Pending identični swap zahtjevi nemaju semantic dedupe/rate limit                          | otvoreno |
| BA-on-call-14 | P3       | Service/concurrency/revocation integracijska matrica nije pokrivena                        | otvoreno |
| BA-on-call-15 | P2       | Audit allowlist za oncall.override.created odbija overrideId/swapRequestId pa override creation uvijek pada (paket 188) | zatvoreno |

## 13. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,80 |
| B. API i ugovori             |    12% |   5,50 |
| C. Auth/authz/scope          |    15% |   3,70 |
| D. Poslovna pravila/stanje   |    13% |   4,60 |
| E. Podaci/Prisma/transakcije |    13% |   5,00 |
| F. Sigurnost/privatnost      |    12% |   4,70 |
| G. Async/integracije         |     8% |   4,50 |
| H. Testovi/dokazivost        |    10% |   5,20 |
| I. Operativnost/perf.        |     7% |   5,10 |
| **Ukupno**                   | **100%** | **4,84/10** |

Ponderisani zbir je 4,844. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 14. Fazni plan popravki

### Faza 0 — safety net

Scoped foreign read/write; parallel schedule save; requester-off-shift swap; stale colleague accept; removed member resolver/assignment/SLA/quiet; foreign owner; token permission revoke; Redis scheduler loss; notification/retention failure; >limits list.

### Faza 1 — P1 scope i integritet

`BA-on-call-01` je zatvoren u W6.41 uz scope-aware viewer/group query i direct-ID OU provjere; `BA-on-call-02` je zatvoren u W6.42 uz kontinuirani requester-rotation interval za swap; `BA-on-call-03` je zatvoren u W6.43 uz `updatedAt` revision CAS, stale-write conflict i atomarnu member replacement/audit transakciju.

### Faza 2 — membership i swap lifecycle

Resolver provjerava aktuelno group membership; accept revalidira colleague i schedule version; owner mora biti scoped/eligible; pending semantic dedupe/rate limit.

### Faza 3 — token i privacy

iCal authorization-version/scope check, proxy query redaction, last-used metadata i transactional revoke audit.

### Faza 4 — async i scale

Scheduler reconciliation, durable missed-action recovery, batch retention sa health signalom i cursor pagination svih lista.

### Faza 5 — finalni gate

Sva 3 direktna speca, PostgreSQL concurrency/integration, tickets/SLA/notifications/privacy testovi i E2E 44 proširen negativnim scope/swap/revocation scenarijima na finalnom SHA-u.

## 15. Acceptance i konačna presuda

1. Scoped actor vidi/mijenja samo dozvoljene grupe — `BA-on-call-01`, zatvoreno u W6.41.
2. Swap može pokriti samo stvarnu requesterovu smjenu i ne može istisnuti treću osobu — `BA-on-call-02`, zatvoreno u W6.42.
3. Jedan concurrent save dobija conflict; finalni header i članovi pripadaju jednom zahtjevu — `BA-on-call-03`, zatvoreno u W6.43.
4. Removed/deactivated user nije resolver ni auto-assignment kandidat.
5. Accept ponovo provjerava membership, availability i schedule version.
6. Owner je legitimno vezan za grupu/scope.
7. Permission/scope revoke odmah uklanja iCal sadržaj/pristup.
8. Reminder/start/gap ima eventualni recovery ili vidljiv failure.
9. Scheduler/retention su self-healing, bounded i observable.
10. Direktni, integracijski, concurrency i E2E testovi prolaze.

On-call ima kvalitetan temporalni resolver i dobru osnovu override/audit modela, ali globalizovan scope, nevalidan swap contract i concurrent schedule replacement ruše enterprise integritet. Iskren baseline je **4,84/10**.

## 16. W6.41 closeout — BA-on-call-01

`BA-on-call-01` je zatvoren na finding nivou nakon što su on-call čitanja i izmjene ograničeni na grupne OU scopeove.

- `OnCallViewer` izvodi odvojene read/manage scopeove iz `oncall.read` i `oncall.manage`; manage grant može čitati svoje manage-scope grupe, ali read grant ne autorizuje upise.
- `overview`, `me` i `mySwaps` ograničavaju podatke na čitljive grupe. Detail, schedule/override writes, deleteOverride i swap read/write putanje ponovo provjeravaju OU putanju konkretne grupe.
- Service-only grant ne daje group access jer `Group` nema service relaciju. `oncall.read/manage` prolaze generički `RoleGuard`, dok group-level OU provjera ostaje u `OnCallService`.
- Token-based `icalFeed` nije mijenjan; to je zaseban P2 (`BA-on-call-07`) i ostaje otvoren.

Testovi pokrivaju OU boundary, global/SuperAdmin i service-only scope, filtriranje kolekcija i zabrane direct-ID read/write/swap prije pristupa rasporedu. Prije strict CI-ja lokalno su prošli ciljano 7 suitea/39 testova, dodatni diagnostics-enabled 2 suitea/13 testova i ESLint; nakon strict-TypeScript harness korekcije targeted service-scope suite je prošao 12/12, uz ESLint.

Finalni SHA [`bd05e0e`](https://github.com/mudzy992/help-desk-enterprise/commit/bd05e0ece040685ba1070971cb00fc7b03ef7341) prošao je CI [`42515632097`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42515632097): backend build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate su passed. Read-only inventory, E2E install/critical i conditional high/critical image-enforcement korak bili su `skipped`, ne passed.

Nije korištena target baza, nije dodana ni pokrenuta migracija, niti je otvoren PR, izvršen merge ili deployment. `BA-on-call-02` (swap interval/requester smjena) i `BA-on-call-03` (concurrent schedule save) ostaju otvoreni P1; P2/P3 i BA-15 acceptance nisu dio ovog closeouta.

## 17. W6.42 closeout — BA-on-call-02

`BA-on-call-02` zatvoren je na finding nivou nakon što `requestSwap` veže cijeli traženi interval za requesterovu stvarnu rotation smjenu.

- Partial i full interval su dozvoljeni samo kada se `[startsAt, endsAt)` bez rupe poklapa sa segmentima koje `listContextSegments` vraća kao `source: "rotation"` i `userId === requesterId`.
- Zahtjev se odbija ako raspored ne postoji, requester nije član/raspoloživ, interval zahvata drugog rotacijskog člana ili uncovered vrijeme, ili bilo koji dio preklapa postojeći override. Override query koristi isti half-open `[from, to)` prozor prije kreiranja swap zahtjeva.
- UI sada objašnjava da se može tražiti dio ili cijela vlastita smjena, bez tuđeg dežurstva; bs/en `swapNotAllowed` poruke su usklađene.
- Dodani service-specovi prihvataju partial/full shift i odbijaju tuđi segment, prelaz preko handoffa, vrijeme prije rotation starta, neaktivan raspored ili nedostupan requester i overlap s treće-osobnim overrideom. Override test provjerava i tačne DB query granice.

Lokalno je prošao ciljani on-call run **7/7 suitea, 37/37 testova** uz ts-jest diagnostics disabled zbog nedostajućeg lokalnog generated Prisma clienta, backend ESLint i targeted frontend Vitest **2/2**, frontend ESLint i i18n check. Finalni commit [`31cd058`](https://github.com/mudzy992/help-desk-enterprise/commit/31cd0582469ce2c904864bfcde42da7c031cbf90) prošao je push-triggered CI [`42518032045`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42518032045) (**success**): generated-Prisma backend build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate. Read-only inventory, E2E install/critical i conditional image-vulnerability enforcement bili su `skipped`; nisu pokretani ručno.

Val 6 nakon W6.42 je **46/109 zatvorenih, 63 otvorena (5 P1 / 41 P2 / 17 P3)**; izvorni audit/generisani plan **515/177**, globalni registar **525/167**. Deset ranijih statusnih razlika ostaje netaknuto. `BA-on-call-03` ostaje P1; `BA-on-call-05` i svi ostali P2/P3, kao i BA-15 full critical-flow acceptance, nisu dio ovog closeouta. Nije dodana migracija, korištena ciljna baza, otvoren PR, izvršen merge ili deployment.

## 18. W6.43 closeout — BA-on-call-03

`BA-on-call-03` zatvoren je na finding nivou nakon što schedule save zahtijeva revision rasporeda i atomski veže scalar header, rotation member replacement i audit zapis.

- Detail vraća postojeći `updatedAt`; editor šalje ga nazad kao `expectedUpdatedAt`. Update odbija missing/stale revision stabilnim `ON_CALL_SCHEDULE_CONFLICT` / HTTP 409. Za dva paralelna updatea samo jedan conditional `updateMany({ where: { groupId, updatedAt } })` može dobiti CAS; revision se pomjera monotono.
- Header CAS, brisanje/ponovni upis članova i audit ostaju u jednoj transakciji. Writer koji izgubi CAS ne mijenja članove i ne stvara audit. Prva-kreacija koristi unique `groupId`; P2002 race se vraća kao isti 409.
- Nije uvedena Prisma schema promjena ni migracija. `updatedAt` već je postojao.

Lokalno: targeted on-call suite **8/8, 40/40** uz ts-jest diagnostics disabled zbog nedostajućeg lokalnog generated Prisma clienta; backend ESLint, frontend TypeScript check/ESLint/Prettier, targeted Vitest **22/22** i i18n check prošli. Prvi CI [`42522111519`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42522111519) pao je na frontend Prettier provjeri; format je ispravljen u [`49f2b91`](https://github.com/mudzy992/help-desk-enterprise/commit/49f2b91e0f910cd070835e635388be649b064a5c). Finalni SHA `49f2b91` prošao je push-triggered CI [`42522885254`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42522885254) (**success**) za generated-Prisma backend build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain job i CI gate. Read-only inventory, E2E install/critical i conditional high/critical image enforcement bili su `skipped`, ne `passed`.

Val 6 nakon W6.43 je **47/109 zatvorenih, 62 otvorena (4 P1 / 41 P2 / 17 P3)**; izvorni audit/generisani plan **514/178**, globalni registar **524/168**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 su `BA-announcements-01/02/03/04`; `BA-on-call-04`–`14` (P2/P3) i BA-15 full critical-flow acceptance ostaju otvoreni/pending i izvan ovog closeouta. CI nije koristio ciljnu bazu; nije otvoren PR, izvršen merge ili deployment.
