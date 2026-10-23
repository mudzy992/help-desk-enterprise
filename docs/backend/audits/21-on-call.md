# Backend audit 21 — `on-call`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,84/10**  
**Nalazi:** 3 P1, 8 P2, 3 P3

## 1. Executive summary

`on-call` pruža grupne rotacije, timezone/DST-aware smjene, overrideove, bilateralne swap zahtjeve, javni personalni iCal feed, reminder/gap sweep, SLA recipient i outside-hours auto-assignment integraciju. Temelj je dobar: centralizovan resolver, civil-date rotacija, DST-aware instanti, serializable override insert, transactional audit, kriptografski iCal token hash, dedupe notification ključevi i ograničeni range/članovi.

Baseline je **4,84/10**. Tri P1 nalaza pogađaju scope i integritet rasporeda. `onCallViewer` svodi permisiju na boolean i odbacuje assignment scope, pa scoped reader/manager može vidjeti i mijenjati sve grupe. Swap request ne dokazuje da interval pripada smjeni requestera; prihvaćeni zahtjev može zamijeniti stvarno dežurnu treću osobu. Concurrent schedule save nema lock/version precondition: paralelni upsert + delete/create članova može proizvesti header jednog zahtjeva i redoslijed ili praznu listu drugog.

Dodatni rizici su stale eligibility pri acceptu, foreign owner, iCal koji nadživljava permission revoke, best-effort reminder bez recoveryja, scheduler bez reconciliationa, silent retention failure, hard truncation i nedovoljna integracijska/concurrency pokrivenost. Nema P0. Popravke nisu implementirane.

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

`onCallViewerFromContext` provjerava samo postoji li assignment sa permission keyem. Ne prenosi organizational-unit/service scope niti group set. Overview čita sve grupe/schedule, detail čita arbitrary group ID, a manage save/delete/override radi nad arbitrary groupom. Scoped manager zato može enumerisati imena/dežurne osobe/razloge i mijenjati foreign raspored. Scope filter mora biti primijenjen prije listanja i ponovljen na svaki direct-ID write.

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

Međutim request swap samo potvrđuje da su requester i colleague članovi rotation liste. Ne potvrđuje da je requester on-call u cijelom ili bilo kojem dijelu intervala, niti da interval odgovara jednoj smjeni. Prihvatanjem se kreira override koji pobjeđuje rotaciju i može istisnuti treću osobu. Request mora biti presjek stvarnih requester segmenata i jasno definisati partial/full shift semantiku.

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

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/on-call -name '*.spec.ts' -print | sort)
```

Rezultat: **3/3 suitea i 11/11 testova prošlo**. Pokriveni su resolver, DST/rotation/override, sweep planning i iCal escaping/folding.

Direktni specovi ne pokrivaju controller/service/Prisma writes. E2E 44 provjerava schedule CRUD i UI bez prepisivanja postojećih rasporeda, ali ne pokriva scoped foreign read/write, concurrent save, invalid swap interval, stale accept, ex-member auto-assignment, token permission revoke, scheduler loss, missed notification ili truncation.

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

## 12. Registar nalaza

| ID            | Severity | Nalaz                                                                                     | Status   |
| ------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-on-call-01 | P1       | Scoped read/manage assignment daje globalni read i write nad svim grupama                 | otvoreno |
| BA-on-call-02 | P1       | Swap interval nije vezan za requesterovu smjenu i može istisnuti treću osobu              | otvoreno |
| BA-on-call-03 | P1       | Concurrent schedule save može korumpirati header/member kombinaciju                       | otvoreno |
| BA-on-call-04 | P2       | Bivši active član grupe ostaje resolver/auto-assignment/SLA/quiet-hours kandidat          | otvoreno |
| BA-on-call-05 | P2       | Swap accept ne revalidira colleague membership/availability ni schedule verziju           | otvoreno |
| BA-on-call-06 | P2       | Owner može biti foreign staff i primati gap informacije                                   | otvoreno |
| BA-on-call-07 | P2       | iCal feed ostaje aktivan nakon oncall.read/scope revokea                                  | otvoreno |
| BA-on-call-08 | P2       | Best-effort sweep notification nema durable recovery nakon prozora                        | otvoreno |
| BA-on-call-09 | P2       | Scheduler nema reconciliation nakon Redis gubitka                                         | otvoreno |
| BA-on-call-10 | P2       | Retention je unbounded, guta grešku i nema health signal                                  | otvoreno |
| BA-on-call-11 | P2       | Override/swap liste su hard-truncated bez pagination/hasMore                              | otvoreno |
| BA-on-call-12 | P3       | Token revoke audit nije atomaran sa deleteom                                               | otvoreno |
| BA-on-call-13 | P3       | Pending identični swap zahtjevi nemaju semantic dedupe/rate limit                          | otvoreno |
| BA-on-call-14 | P3       | Service/concurrency/revocation integracijska matrica nije pokrivena                        | otvoreno |

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

Scope-aware viewer/group query prije listanja i direct-ID writes; swap mora biti subset requester segmenta; schedule row lock/version/If-Match i atomic member replacement.

### Faza 2 — membership i swap lifecycle

Resolver provjerava aktuelno group membership; accept revalidira colleague i schedule version; owner mora biti scoped/eligible; pending semantic dedupe/rate limit.

### Faza 3 — token i privacy

iCal authorization-version/scope check, proxy query redaction, last-used metadata i transactional revoke audit.

### Faza 4 — async i scale

Scheduler reconciliation, durable missed-action recovery, batch retention sa health signalom i cursor pagination svih lista.

### Faza 5 — finalni gate

Sva 3 direktna speca, PostgreSQL concurrency/integration, tickets/SLA/notifications/privacy testovi i E2E 44 proširen negativnim scope/swap/revocation scenarijima na finalnom SHA-u.

## 15. Acceptance i konačna presuda

1. Scoped actor vidi/mijenja samo dozvoljene grupe.
2. Swap može pokriti samo stvarnu requesterovu smjenu i ne može istisnuti treću osobu.
3. Jedan concurrent save dobija conflict; finalni header i članovi pripadaju jednom zahtjevu.
4. Removed/deactivated user nije resolver ni auto-assignment kandidat.
5. Accept ponovo provjerava membership, availability i schedule version.
6. Owner je legitimno vezan za grupu/scope.
7. Permission/scope revoke odmah uklanja iCal sadržaj/pristup.
8. Reminder/start/gap ima eventualni recovery ili vidljiv failure.
9. Scheduler/retention su self-healing, bounded i observable.
10. Direktni, integracijski, concurrency i E2E testovi prolaze.

On-call ima kvalitetan temporalni resolver i dobru osnovu override/audit modela, ali globalizovan scope, nevalidan swap contract i concurrent schedule replacement ruše enterprise integritet. Iskren baseline je **4,84/10**.
