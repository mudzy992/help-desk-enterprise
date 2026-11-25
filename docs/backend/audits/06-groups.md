# Backend audit 06 — groups

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/groups`  
**Baseline ocjena:** **6,73/10**  
**Nalazi:** 3 P1, 5 P2, 2 P3, 9 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

Za razliku od users i organizational-units modula, `groups` ima stvarno implementiranu OU authorization granicu. Mutacije traže `group.manage`, resource-aware OU scope, a kolekcija se dodatno filtrira kroz authorization evaluator. E2E 38 direktno dokazuje da scoped ADMIN iz OU A ne može čitati, mijenjati, brisati niti administrirati članove grupe u OU B. Audit zapis je u istoj transakciji sa create/update/delete/membership mutacijama, membership par ima DB unique ograničenje, a delete blokira aktivne tikete i posljednju fallback grupu.

Ipak, pronađena su tri P1 lifecycle problema. Brisanje grupe provjerava samo fallback i aktivne tikete, dok schema bez upozorenja cascade briše on-call raspored sa rotacijama, overrideima i swap zahtjevima, Teams channel vezu, response-template scopeove, group notifications i druge zavisnosti; routing rule `Restrict` umjesto domenske greške može proizvesti sirovi DB failure. Membership revoke nije trenutan u distribuiranom sistemu: druge HTTP instance mogu do 30 sekundi koristiti stari in-memory membership katalog, a već spojeni WebSocket ostaje u group roomu do periodične revalidacije, default pet minuta, i može nastaviti primati group događaje. Fallback invariant također nije stvarno zatvoren: PATCH može ugasiti jedinu fallback grupu, dok konkurentna create/update operacija može ostaviti više fallback grupa jer nema DB constrainta ni locka.

Ostali rizici obuhvataju dodavanje inactive korisnika, nevalidirane promjene CAB/problem oznaka, race-prone key/membership precheckove koji mogu procuriti kao Prisma 500, active-ticket delete TOCTOU i neograničene collection/member readove. Baseline je zato niži nego što bi sama kvalitetna OU guard matrica sugerisala.

## 2. Scope i inventar

| Metrika                    |                                                                          Vrijednost |
| -------------------------- | ----------------------------------------------------------------------------------: |
| TypeScript fajlovi         |                                                                                  33 |
| Produkcijski fajlovi       |                                                                                  27 |
| Spec fajlovi               |                                                                                   6 |
| Produkcijske linije        |                                                                               1.282 |
| Kontroleri                 |                                                                                   2 |
| Servisi                    |                                                                                   1 |
| Direktne module zavisnosti | `audit-log`, `authentication`, `authorization`, `change-log`, `settings`, `tickets` |

Pregledane povezane površine:

- Prisma `Group`, `GroupMember` i sve direktne group relacije;
- authorization role/permission/scope dekoratori i evaluator;
- actor-group in-process cache i principal-context invalidator;
- ticket visibility, inbox, confidential access i assignment članstvo;
- WebSocket group room join i petominutna revalidacija;
- routing fallback, on-call, Teams, notifications, problems, changes i templates veze;
- E2E 10, 38, 41 i 44 te svih šest direktnih spec fajlova.

## 3. Arhitektura i lifecycle tokovi

### 3.1. Create/update

- ime se trimuje i ograničava na 120 znakova;
- create provjerava postojanje OU-a i generiše globalno unique slug key;
- ako nova ili izmijenjena grupa postaje fallback, postojeće fallback zastavice istog OU-a se brišu — od W2.13 unutar
  per-OU advisory locka (`withGroupFallbackLock`), a gašenje posljednje fallback oznake odbija se sa 409
  `LAST_FALLBACK_GROUP`;
- create/update i svi pripadajući audit zapisi commitaju u jednoj transakciji;
- update ne dozvoljava promjenu OU-a ili keya;
- `isProblemGroup` i `isCabGroup` su obični boolean flagovi bez dependency preflighta.

### 3.2. Membership

- group i user moraju postojati;
- `(groupId,userId)` je schema unique;
- membership i audit su atomski;
- nakon commita lokalni actor-group cache se resetuje i poziva se optional principal invalidator;
- ne provjeravaju se `isActive`, identity lifecycle, target-user scope ni minimalna grupa/owner pravila;
- nema distribuiranog membership-revocation događaja prema drugim HTTP ili WebSocket instancama.

### 3.3. Delete

- delete učitava grupu i članove unutar transakcije;
- inventory preko **svih 17** relacija na `Group` (W2.12): blocker za živu konfiguraciju i `Restrict`, prijava za
  `SetNull` i tranzijentni `Cascade` (vidi [343](../implementation/343-w212-group-delete-dependencies.md));
- blocker više nije samo „jedina fallback grupa” i „aktivni tiketi” — 409 nosi `blockers: [{kind, count}]` za sve
  pronađene zavisnosti odjednom;
- audit (`groupDeleted`) dobija `dependencies.detached/cascaded` prije deletea, u istoj transakciji;
- servis poslije commita best-effort invalidira pogođene principale.

### 3.4. Read modeli

- `GET /groups` učita sve grupe ili cijeli izabrani OU pa ih u memoriji filtrira prema actor scopeu;
- `GET /groups/:id` vraća sve članove sa display nameom i e-mailom;
- `GET /groups/mine` običnom korisniku vraća vlastita članstva, dok SuperAdminu namjerno vraća sve grupe;
- nijedna kolekcija nema paginaciju niti response-size limit.

## 4. API/guard/scope matrica

| Ruta                                      | Role/permission              | OU scope                    | Napomena                                        |
| ----------------------------------------- | ---------------------------- | --------------------------- | ----------------------------------------------- |
| `GET /groups`                             | ADMIN + audit `group.manage` | per-record service filter   | scoped kolekcija; ne koristi DB scope predicate |
| `POST /groups`                            | ADMIN + `group.manage`       | body `organizationalUnitId` | korektna destination kontrola                   |
| `GET /groups/:groupId`                    | ADMIN + `group.manage`       | group resource resolver     | vraća member e-mailove                          |
| `PATCH /groups/:groupId`                  | ADMIN + `group.manage`       | group resource resolver     | OU/key se ne mijenjaju                          |
| `GET /groups/:groupId/delete-impact`      | ADMIN + `group.manage`       | group resource resolver     | W2.12: block/detach/cascade inventory, read-only |
| `DELETE /groups/:groupId`                 | ADMIN + `group.manage`       | group resource resolver     | W2.12: 409 sa `blockers[]`                      |
| `POST /groups/:groupId/members/:userId`   | ADMIN + `group.manage`       | samo group OU               | target user active/scope se ne provjerava       |
| `DELETE /groups/:groupId/members/:userId` | ADMIN + `group.manage`       | samo group OU               | revoke propagacija kasni                        |
| `GET /groups/mine`                        | USER/AGENT/ADMIN/SA          | vlastito članstvo; SA sve   | read-only self-service ruta                     |

Pozitivno, guardovi ne zavise samo od ADMIN role keya: detalj i mutacije eksplicitno traže permission i resource OU scope. SuperAdmin bypass ulazi u centralni authorization audit mehanizam.

## 5. Prisma, transakcije i concurrency

- `Group.key` je unique.
- `GroupMember(groupId,userId)` je composite primary/unique identitet.
- **W2.13:** postoji parcijalni unique index `Group_fallback_per_organizational_unit_key`
  (`ON "Group"("organizationalUnitId") WHERE "isFallback"`, migracija `20271202130000_group_fallback_cardinality`) —
  najviše jedna fallback grupa po OU-u je DB činjenica.
- DB i dalje **ne** zahtijeva da OU ima najmanje jednu fallback grupu (svježa instalacija je legitimno bez nje); server
  odbija write koji bi OU odveo iz jedne u nula (`LAST_FALLBACK_GROUP`, 409).
- Slug candidate se traži prije create transakcije; konkurentni create istog imena mogu izabrati isti key.
- Membership existence precheck je izvan transakcije; concurrent add/remove se oslanja na DB konflikt, ali Prisma unique/not-found greška nije mapirana u stabilan domenski kod.
- ~~Fallback `clear + create/update` nema OU-scoped advisory lock ni serializable/CAS protokol.~~ **W2.13:** `clear +
  create/update` i delete inventar idu pod `pg_advisory_xact_lock(hashtext('group-fallback:<ouId>'))`, a index hvata
  svakog pisca koji zaobiđe modul.
- Delete active-ticket count ne zaključava budući assignment; `Ticket.assignedGroup` je `SetNull` na group delete.
- Audit i primarna mutacija su atomski, ali invalidacija/realtime revoke nisu dio durable commita.

## 6. Cross-module lifecycle i integracije

Brisanje `Group` reda može:

- cascade obrisati `GroupMember` redove;
- cascade obrisati kompletan `OnCallSchedule`, rotation members, overrides i swap requests;
- cascade obrisati Teams channel mapping;
- cascade obrisati response-template group scope veze;
- cascade obrisati group notifications i receipts;
- postaviti ticket assignment, CAB/problem/report/SLA/knowledge reference na null;
- pasti na routing rule `Restrict` relaciji;
- uticati na druge cascade/set-null relacije koje će se širiti kako schema raste.

Groups modul je unaprijed provjeravao samo active ticket i sole-fallback slučaj. Audit bilježi članove, ali ne inventarizira ostale uklonjene/odvezane resurse. **W2.12** to mijenja: vidi „Implementacijski dodatak — W2.12” i [343](../implementation/343-w212-group-delete-dependencies.md).

Membership se koristi za ticket inbox, ticket visibility, confidential access, notification group recipients i WebSocket group rooms. Zbog toga revoke nije samo UI promjena nego direktna authorization/confidentiality operacija.

## 7. Privilege-escalation pregled

### Horizontalna eskalacija

Glavne group resource rute korektno blokiraju cross-OU ADMIN pristup, što potvrđuje E2E 38. Nije pronađen direktan način da scoped ADMIN upravlja grupom izvan svog OU subtreea.

Preostala granica je target član: administrator koji smije upravljati grupom može dodati bilo kojeg postojećeg user ID-a, uključujući inactive ili korisnika iz drugog OU-a. Cross-OU članstvo može biti legitiman poslovni slučaj i koristi se u postojećim tokovima, pa nije samo po sebi nalaz; nedostaje eksplicitna target eligibility politika i auditirana odluka.

### Vertikalna eskalacija i stale revoke

Group membership može dati pristup inboxu, povjerljivom tiketu i realtime group roomu. Nakon removal commita druga instanca može nastaviti koristiti cached članstvo, a postojeći socket ostaje u sobi do pet minuta. To predstavlja vremenski ograničeno zadržavanje opozvanih prava, ne novi permanentni grant.

### Implementacijski dodatak — W2.12, 2026-11-25

`BA-groups-01` je zatvoren u [`343-w212-group-delete-dependencies.md`](../implementation/343-w212-group-delete-dependencies.md).
Delete grupe više ne prepušta posljedicu bazi: nova `collectGroupDeleteDependencies` u **jednoj transakciji** broji svih
16 relacija koje pokazuju na `Group` (plus članstvo, koje je predmet operacije) i razvrstava ih po pravilu koje šema već
nosi — `Restrict` i živa `Cascade` konfiguracija su **blocker**, tranzijentni `Cascade` (`Notification`) je prijavljeni
cascade, a `SetNull` je prijavljeni detach. Odbijen delete vraća **409** sa `blockers: [{kind, count}]` za sve
pronađene zavisnosti odjednom, pa `routingRules` i `problemHandoffs` više nisu generički 500. Dozvoljen delete u audit
upisuje `dependencies.detached/cascaded` prije `group.delete`.

Ista funkcija napaja novu read-only rutu `GET /groups/:groupId/delete-impact` (ADMIN + `group.manage` + group resource
OU scope), pa UI dijalog pokazuje impact **prije** potvrde i onemogućava potvrdu kad blokera ima. Time je acceptance
„operator ima impact preview i warning” ispunjen na istom izvoru istine kao i guard — dijalog i 409 se ne mogu razići.
Fail-closed: neuspio count prekida transakciju, delete se ne izvršava; preview tada ne tvrdi da je grupa nekorištena.

Politika „arhiviraj umjesto blokiraj” nije uvedena (nema `archivedAt` na `Group`; uvođenje dira svaki read u modulu) —
odabrano je blokiranje sa akcionim 409, što je druga dozvoljena opcija iz korekcije nalaza.

Granica: **`-07`** (TOCTOU prema `SetNull`) ostaje otvoren — inventar se čita u istoj transakciji, ali bez locka nad
grupom; **`-03`** (fallback cardinality) i **`-05`** (CAB/problem flagovi) takođe ostaju.

### Implementacijski dodatak — W2.13, 2026-11-25

`BA-groups-03` je zatvoren u [`344-w213-group-fallback-cardinality.md`](../implementation/344-w213-group-fallback-cardinality.md).
`Group.isFallback` je bio oznaka bez invarijante: `create`/`update` su radili „pročitaj → obriši → postavi" bez
serijalizacije (dvije transakcije su mogle ostaviti dvije fallback grupe), `PATCH isFallback=false` nije bio zaštićen
(OU je mogao ostati bez fallbacka), a šema nije imala nikakav constraint. Sada:

- **baza** nosi „najviše jednu" — parcijalni unique index `Group_fallback_per_organizational_unit_key`, uz
  nedestruktivnu migraciju koja prvo deterministički dedupira postojeće podatke (ostaje najstarija fallback grupa OU-a);
- **servis** nosi „nikad tiho nula" — `LAST_FALLBACK_GROUP` (409, sa `organizationalUnitId`) kad bi gašenje oznake ili
  brisanje ostavilo OU bez fallbacka;
- **zamjena** je jedan atomski potez pod `pg_advisory_xact_lock` ključem `group-fallback:<ouId>`: `PATCH
  isFallback=true` preuzima oznaku i auditira `fallback_reassigned` na oslobođenoj grupi. Lock uzimaju i `delete`
  (inventar iz W2.12 broji fallbacke) i install seed (koji fallback grupu može i premjestiti u drugi OU).

Politika nije „svaki OU uvijek ima fallback" (svježa instalacija ga legitimno nema), nego „write ne smije odvesti OU iz
jednog u nula". Rename i CAB/problem flagovi ne plaćaju lock — `-05` ostaje otvoren za te oznake.

## 8. Testovi i izvršeni gateovi

### 8.1. Postojeći dokazi

Šest spec fajlova pokriva:

- controller guard/permission/scope metadata;
- `/groups/mine` role i registration ordering;
- scoped collection filter;
- create/update/delete i membership happy/error tokove;
- audit rollback i principal invalidator pozive;
- effective auto-assign prikaz za vlastite grupe.

E2E 38 je posebno vrijedan: kreira OU A/B, daje ADMIN-u OU A scope i potvrđuje dozvoljen create/read/update u A te 403 za create/read/update/member add/member remove/delete u B. E2E 10 pokriva cross-OU ticket forwarding i membership promjenu; E2E 44 koristi group membership uz on-call lifecycle. Nema testa za hidden delete cascade, concurrent fallback, zero-fallback PATCH, multi-instance revoke ili socket room removal poslije membership revokea.

### 8.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/groups
```

Rezultat:

- **6 suiteova otkriveno**;
- **0 suiteova kompajlirano/prošlo**;
- **0 testova izvršeno**;
- svih **6 suiteova compile-blocked** zbog nedostajućeg generated Prisma klijenta/enuma i posljedičnih `PrismaService` type grešaka.

**W2.13 (2026-11-25), isti lokalni uslovi:** `src/modules/groups` + `src/common/database` **14 suite / 85 testova**
(1 skipped: real-DB shard bez `PRIVACY_IT_DATABASE_URL`), `src/modules/install` **54 suite / 277 testova**,
`check-migration-policy` ✓ 127 migracija, `wiring:check` ✓ 633 rute, harness 23/23. Novi real-DB shard
`fallback-cardinality.integration.spec.ts` (6) **nije izvršen lokalno** — skipped nije passed.

**W2.12 (2026-11-25), ponovljeno sa lokalnim stubom klijenta i isključenom TS dijagnostikom:** **8 suiteova, 49 testova
prolazi** (`group-delete-dependencies.spec.ts` 21, `groups.service.spec.ts`, `delete-group-scope.spec.ts`,
`groups.controller.guard.spec.ts`, `groups-mine.controller.guard.spec.ts`, `groups.service.list-accessible.spec.ts`,
`list-my-groups.spec.ts`, `groups-module-order.spec.ts`). To je runtime dokaz; type-check protiv pravog generisanog
klijenta daje CI (`nest build`).

Nijedan test nije proglašen prolaznim. Ovo je isti checkout reproducibility problem evidentiran u modulima 01–05.

## 9. Pozitivni nalazi

1. Group mutacije traže i `group.manage` permission i resource-aware OU scope.
2. Kolekcija se filtrira po efektivnom assignment scopeu, uključujući odbijanje service-only granta.
3. E2E 38 direktno potvrđuje ključne cross-OU zabrane.
4. Create/update/delete/membership mutacija i audit zapis commitaju zajedno.
5. DB garantuje jedinstveno `(groupId,userId)` članstvo.
6. Update ne dozvoljava premještanje grupe u drugi OU niti promjenu stabilnog keya.
7. Active-ticket i sole-fallback delete imaju eksplicitne konflikt kodove.
8. `/groups/mine` je odvojen od admin controller route orderinga i ograničen na autentifikovanog aktera.
9. Membership promjena pokušava invalidirati i actor-group katalog i principal context.

## 10. Registar nalaza

| ID           | Severity | Naslov                                                                            | Status   | Veličina |
| ------------ | -------- | --------------------------------------------------------------------------------- | -------- | -------- |
| BA-groups-01 | P1       | Group delete može tiho cascade obrisati/odvezati kritične cross-module resurse    | zatvoreno (W2.12, [343](../implementation/343-w212-group-delete-dependencies.md)) | L        |
| BA-groups-02 | P1       | Membership revoke kasni do 30 s za HTTP i do 5 min za WebSocket group room        | otvoreno | L        |
| BA-groups-03 | P1       | Fallback invariant dopušta nula ili više fallback grupa u istom OU-u              | zatvoreno (W2.13, [344](../implementation/344-w213-group-fallback-cardinality.md)) | L        |
| BA-groups-04 | P2       | Inactive/directory-deactivated korisnik može dobiti latentno group članstvo       | otvoreno | M        |
| BA-groups-05 | P2       | CAB/problem flagovi se gase bez dependency/lifecycle provjere                     | otvoreno | M        |
| BA-groups-06 | P2       | Concurrent key/member operacije mogu procuriti kao neobrađen Prisma konflikt      | otvoreno | M        |
| BA-groups-07 | P2       | Active-ticket delete provjera ima TOCTOU prozor prema `SetNull` cascadeu          | otvoreno | M        |
| BA-groups-08 | P2       | Post-commit invalidacija je optional/best-effort i nema durable revoke intent     | otvoreno | M        |
| BA-groups-09 | P3       | Collection/detail membership readovi nemaju paginaciju ni DB-level scope pushdown | otvoreno | M        |
| BA-groups-10 | P3       | No-op PATCH i dalje izvršava write i response reload                              | otvoreno | S        |

## 11. Detaljni nalazi

### BA-groups-01 — Skriveni destruktivni cascade pri deleteu

- **Dokaz:** `assertGroupDeletable` provjerava samo sole fallback i active tickets. Prisma relacije cascade brišu on-call raspored i cijelo njegovo podstablo, Teams mapping, notifications i template scopeove; druge relacije se set-null, a routing rule je Restrict. Audit sadrži samo group i member snapshot.
- **Uticaj:** jedna group delete operacija može nepovratno ukloniti rasporede, overridee/swap historiju, notification redove i integracijske veze ili vratiti generički DB 500. Operator nema impact preview ni warning.
- **Korekcija:** centralni dependency inventory/preview sa eksplicitnim block/cascade/detach pravilom za svaku relaciju; kritične historijske konfiguracije blokirati ili arhivirati, ne implicitno cascade brisati.
- **Acceptance:** fixture za svaku direktnu relaciju daje dokumentovan blocker/impact; on-call/Teams/notification/template podaci ne nestaju bez eksplicitne potvrde i audita.
- **Owner:** groups + on-call/teams/notifications/routing/data owner.
- **Status (W2.12, 2026-11-25):** zatvoreno. `collectGroupDeleteDependencies` broji svih 16 zavisnih relacija (+ članstvo)
  u jednoj transakciji i dijeli ih na **block / detach / cascade**; delete odbija sa 409 i punom listom `{kind, count}`
  (uključujući `routingRules` i `problemHandoffs`, koji su dosad davali generički 500), a dozvoljeni delete u audit
  upisuje šta je odvezano i šta je cascade-obrisano. Ista funkcija napaja novu read-only rutu
  `GET /groups/:groupId/delete-impact`, pa dijalog u UI pokazuje impact **prije** potvrde i onemogućava potvrdu kad
  blokera ima. Fail-closed: neuspio count prekida transakciju, delete se ne izvršava. Detalji:
  [343](../implementation/343-w212-group-delete-dependencies.md). TOCTOU iz `-07` ostaje (vidi „Granica paketa”).

### BA-groups-02 — Opozvano članstvo ostaje efektivno

- **Dokaz:** `invalidateActorGroupsCache` resetuje samo process-local `WeakMap`; druge instance koriste entry do default 30 s. WebSocket group rooms se revalidiraju periodično svakih `5 * 60_000` ms i groups mutation ne šalje ciljani leave/revalidation event.
- **Uticaj:** uklonjeni član može kratko nastaviti čitati group inbox/confidential ticket kroz cached authorization i do pet minuta primati group-room realtime događaje/notifications.
- **Korekcija:** membership revision ili durable distributed revoke event; HTTP odluka mora provjeravati revision, a sve socket instance odmah izbaciti subject iz group rooma nakon commita. Periodični sweep ostaje safety net.
- **Acceptance:** dvije HTTP i dvije socket instance sa zagrijanim stanjem; prvi zahtjev i prvi event poslije remove commita ne dolaze uklonjenom članu, uključujući retry/fault scenario.
- **Owner:** groups + tickets/websocket/platform owner.

### BA-groups-03 — Fallback cardinality nije invariant

- **Dokaz:** PATCH jedine fallback grupe sa `isFallback=false` nema guard. Concurrent create/update radi `clearFallback` pa create/update bez OU locka; schema nema partial unique constraint.
- **Uticaj:** OU može ostati bez fallback destinacije ili sa više njih. Routing ponašanje tada postaje nedeterminističko ili tiketi ostaju `UNROUTED`.
- **Korekcija:** definisati tačnu cardinality politiku; DB partial unique za najviše jednu, transaction/advisory lock za zamjenu i domenska provjera za najmanje jednu kada je obavezna. Preferirati eksplicitni `replace fallback` command.
- **Acceptance:** false PATCH posljednje fallback grupe pada; 20 concurrent create/update pokušaja ostavlja tačno jednu; routing fixture bira deterministički rezultat.
- **Owner:** groups + routing owner.
- **Status (W2.13, 2026-11-25):** zatvoreno. „Najviše jedna" je sada **DB invarijanta**: parcijalni unique index
  `Group_fallback_per_organizational_unit_key` (migracija `20271202130000_group_fallback_cardinality` popravlja i
  postojeće duplikate, zadržavajući najstariju fallback grupu po OU-u). „Nikad tiho nula" je domenska provjera:
  `PATCH isFallback=false` na jedinoj fallback grupi vraća **409** `LAST_FALLBACK_GROUP` sa `organizationalUnitId`, a
  brisanje takve grupe je već blokirano inventoryjem iz W2.12 — sada pod istim lockom. Zamjena je jedan potez:
  `isFallback=true` na drugoj grupi preuzima oznaku atomarno (`pg_advisory_xact_lock` po OU-u) i auditira
  `fallback_reassigned`. Install seed koristi isti lock i oslobađa fallback ciljnog OU-a, pa više ne može pasti na index
  niti ostaviti dvije. Dokaz: unit fixture **8** (uključujući 20 paralelnih zamjena) i real-DB shard **6** (index, `P2002`,
  20 paralelnih zamjena, delete-vs-replace trka). Detalji: [344](../implementation/344-w213-group-fallback-cardinality.md).

### BA-groups-04 — Latentno članstvo inactive računa

- **Dokaz:** add-member učitava samo `user.id`; ne provjerava `isActive` niti `directoryDeactivatedAt`/anonymized lifecycle.
- **Uticaj:** deaktiviranom korisniku se unaprijed mogu dodijeliti group-based prava koja automatski postaju efektivna nakon reaktivacije, bez nove membership odluke u tom trenutku.
- **Korekcija:** eksplicitna eligibility politika: odbiti inactive/anonymized korisnika ili članstvo držati suspended sa auditom i zahtijevati reaktivacijsku potvrdu.
- **Acceptance:** inactive/directory-deactivated/anonymized fixturei ne dobijaju aktivno članstvo; reaktivacija sama ne aktivira ranije odbijen grant.
- **Owner:** groups + users/directory owner.

### BA-groups-05 — CAB/problem oznake bez lifecycle provjere

- **Dokaz:** update slobodno mijenja `isCabGroup` i `isProblemGroup`; changes/problems servisi koriste flag za eligibility i access režim, ali groups update ne provjerava postojeće CAB/problem reference ni posljednju operativnu grupu.
- **Uticaj:** aktivni proces može ostati vezan za grupu koja više nije eligible, ili instalacija može izgubiti posljednju CAB/problem grupu i promijeniti access fallback semantiku.
- **Korekcija:** dependency preflight, minimal-count pravila i eksplicitni migration/reassignment workflow prije gašenja oznake.
- **Acceptance:** flag-off uz aktivne reference ili posljednju potrebnu grupu vraća stabilan conflict sa impact countom.
- **Owner:** groups + changes/problems owner.

### BA-groups-06 — Race konflikt nije domenski mapiran

- **Dokaz:** key generator i membership existence provjere rade read-before-write. DB unique štiti finalno stanje, ali `mapGroupsError` propušta nepoznate Prisma greške.
- **Uticaj:** concurrent same-name create ili duplicate add može završiti 500 umjesto idempotentnog/stabilnog 409; klijent ne zna da li retry treba napraviti novi key ili tretirati operaciju kao završenu.
- **Korekcija:** transakcijski retry/upsert i mapiranje konkretnog unique constrainta na `DUPLICATE_KEY`/`MEMBER_ALREADY_EXISTS`; ne mapirati sve P2002 generički.
- **Acceptance:** konkurentna matrica vraća determinističke 2xx/409 rezultate bez 500 i bez duplog audita.
- **Owner:** groups/data owner.

### BA-groups-07 — Active-ticket delete TOCTOU

- **Dokaz:** ticket count i group delete su u transakciji, ali count ne zaključava buduće ticket assignmente; ticket FK koristi `onDelete:SetNull`.
- **Scenarij:** delete vidi nula aktivnih tiketa, paralelna transakcija dodijeli tiket grupi, zatim delete set-nulluje assignment.
- **Uticaj:** aktivni tiket može neočekivano postati neassignovan uprkos zaštitnom pravilu.
- **Korekcija:** group lifecycle state (`DELETING`) provjeravana u assignment transakciji ili odgovarajući lock/revision protokol; finalni blocker check neposredno uz delete.
- **Acceptance:** parallel assign/delete završava ili validnim assignmentom i odbijenim deleteom ili deleteom i odbijenim assignmentom, nikad tihim set-nullom.
- **Owner:** groups + tickets owner.

### BA-groups-08 — Invalidation nije durable

- **Dokaz:** principal invalidator je `@Optional`; shared invalidator guta DB/Redis greške. Delete dodatno hvata batch grešku. Membership write je već commitovan kada invalidacija počne.
- **Uticaj:** stale grant/revoke može trajati duže od očekivanog bez durable retry evidencije; API ne može dokazati da je sigurnosni side effect propagiran.
- **Korekcija:** obavezan provider, membership revision i outbox/retry/metric; `BA-groups-02` distributed revoke koristi isti durable događaj.
- **Acceptance:** Redis/invalidator/event-bus fault ne ostavlja prethodno članstvo efektivnim i proizvodi vidljiv retry/dead-letter signal.
- **Owner:** groups + authorization/platform owner.
- **Veza:** specijalizacija `BA-authorization-01`.

### BA-groups-09 — Neograničeni read i post-filter

- **Dokaz:** list učitava sve grupe pa filtrira u memoriji; detail učitava sve članove sa e-mailom; `/mine` za SuperAdmin učitava sve grupe. Nema `take/skip`, member page ni hard limit.
- **Uticaj:** rast organizacije povećava DB, memory i response trošak; unauthorized redovi se nepotrebno učitavaju u proces prije odbacivanja.
- **Korekcija:** scope predicate pushdown, stabilna paginacija/total i zaseban paginirani members endpoint; `/mine` SuperAdmin semantiku učiniti eksplicitnom.
- **Acceptance:** veliki fixture ima bounded query/response, stabilne stranice i nikad ne materijalizuje nedostupne grupe u aplikacijskom rezultatu.
- **Owner:** groups owner.

### BA-groups-10 — No-op update izvršava write

- **Dokaz:** `changedFields` kontroliše samo audit, ali transaction uvijek radi `group.update`, pa se `updatedAt` mijenja i detalj ponovo učitava.
- **Uticaj:** lažna modifikacija, nepotrebni realtime/admin-config signali i write load bez audit objašnjenja.
- **Korekcija:** short-circuit prije transakcije kada nema promijenjenih polja.
- **Acceptance:** identičan PATCH ne mijenja `updatedAt`, ne piše audit i ne emituje config-change događaj.
- **Owner:** groups owner.

## 12. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                                         |
| ------------------------ | -------: | -----: | ----------: | ------------------------------------------------------------------------------------ |
| Arhitektura              |      10% |   7,70 |        0,77 | mali, čitljiv modul; cross-module delete/revoke lifecycle fragmentiran               |
| API i ugovori            |      12% |   8,00 |        0,96 | jaka guard matrica i DTO; delete impact/paging ugovor nedostaje                      |
| AuthN/AuthZ/scope        |      15% |   8,50 |        1,28 | stvarni OU enforcement i E2E; stale revoke ostaje ozbiljan                           |
| Poslovna pravila         |      13% |   5,60 |        0,73 | fallback i designation invariant nisu zatvoreni                                      |
| Podaci i transakcije     |      13% |   6,00 |        0,78 | atomic audit i unique membership; cascade/race/TOCTOU rizici                         |
| Sigurnost i privatnost   |      12% |   5,80 |        0,70 | revoke prozor može zadržati confidential/realtime pristup                            |
| Async/integracije        |       8% |   5,50 |        0,44 | nema durable cross-instance/socket revokea                                           |
| Testovi                  |      10% |   6,50 |        0,65 | jak E2E scope dokaz; ključni lifecycle/race scenariji nedostaju, lokalno 0 izvršenih |
| Operativnost/performance |       7% |   6,20 |        0,43 | audit dobar; hidden cascade i neograničeni reads slabi                               |
| **Ukupno**               | **100%** |        | **6,73/10** | tri P1 nalaza ograničavaju baseline                                                  |

Ocjena je direktni ponderisani rezultat bez ručne korekcije. Kvalitetna OU authorization implementacija podiže AuthZ presjek, ali ne kompenzuje destruktivni delete, revoke confidentiality prozor i fallback routing invariant.

## 13. Fazni plan popravki

### Faza 0 — safety net

- fixture za svaku Group FK relaciju i delete impact;
- two-instance HTTP + socket membership revoke test;
- zero/multi fallback i 20-way concurrency test;
- inactive member, CAB/problem dependency, key/member race i ticket assign/delete test;
- large-list/member i no-op PATCH test.

### Faza 1 — siguran delete lifecycle

- kanonski dependency preview sa block/detach/archive/cascade klasifikacijom;
- zabraniti implicitno brisanje on-call/integracijskih/historijskih resursa;
- stabilni conflict kodovi umjesto Prisma 500;
- auditirati tačan impact i eksplicitnu potvrdu.

### Faza 2 — trenutan membership revoke

- membership revision u DB izvoru istine;
- durable outbox/event nakon membership commita;
- cross-instance cache invalidacija/revision check;
- ciljani socket leave/revalidation na svim instancama;
- periodični sweep zadržati kao fallback.

### Faza 3 — fallback i concurrency invariant

- OU-scoped lock/serializable command za fallback replace;
- partial unique index za najviše jednu fallback grupu;
- pravilo za najmanje jednu i blokada false PATCH-a;
- assignment/delete lifecycle state ili lock.

### Faza 4 — membership i designation pravila

- active/anonymized/directory eligibility;
- dokumentovana cross-OU target politika;
- CAB/problem dependency preview i reassignment workflow;
- stabilni concurrent membership/key error kodovi.

### Faza 5 — invalidacija i skaliranje

- obavezan invalidator sa retry/metricom;
- DB-level scope pushdown;
- paginacija group/member kolekcija;
- no-op short circuit;
- observability za revoke lag, cascade preview i fallback cardinality.

### Faza 6 — završna verifikacija

- svih 6 direktnih suiteova zeleno sa generated Prisma klijentom;
- ciljani E2E 10, 38, 41 i 44 plus novi lifecycle scenariji;
- stvarni PostgreSQL concurrency testovi;
- dvije HTTP/socket instance i Redis fault matrica;
- delete rollback i restore rehearsal.

## 14. Rizik, rollback i acceptance

### Rizik implementacije

Promjena delete semantike može otkriti postojeće implicitne cascade zavisnosti na koje se operatori oslanjaju. Partial unique fallback migracija mora prvo pronaći OU-ove sa nula/više fallback grupa i zahtijevati determinističku odluku. Trenutan socket revoke mora raditi kroz Redis adapter/multi-instance topologiju bez prekida nepovezanih soba.

### Rollback

- novi delete workflow uvoditi kao preview+confirm uz zadržavanje read-only legacy impact pregleda, ne vraćati slijepi cascade;
- membership revision/event dual-write prije enforce-read faze;
- fallback unique index tek nakon report/backfilla; rollback aplikacije ne uklanja već validirani index bez eksplicitne odluke;
- socket event ima periodic-revalidation fallback;
- rollback ne smije reaktivirati opozvano članstvo.

### Globalni acceptance

1. Group delete ne uklanja ili odvaja cross-module resurs bez eksplicitnog, auditiranog ugovora.
2. Uklonjeni član nema HTTP, confidential, notification ni WebSocket pristup nakon commita.
3. Svaki relevantni OU ima tačno jednu fallback grupu prema definisanoj politici i pod konkurencijom.
4. Inactive/anonymized račun ne dobija latentni grant.
5. CAB/problem flag promjena ne ostavlja aktivan proces u nevažećem stanju.
6. Concurrent key/member operacije nemaju 500 niti dupli audit.
7. Ticket assign/delete race ne može tiho set-nullovati aktivni assignment.
8. Liste i članovi imaju bounded, scope-pushdown paginaciju.

## 15. Traceability

| Nalaz        | Kod/dokaz                                 | Test                           | Faza  |
| ------------ | ----------------------------------------- | ------------------------------ | ----- |
| BA-groups-01 | `collect-group-delete-dependencies` + `delete-impact` ruta + audit `dependencies` | 21 fixture testa po relaciji + 4 hook testa | 0–2 |
| BA-groups-02 | actor-group cache + socket revalidation   | two-instance revoke            | 0–2   |
| BA-groups-03 | partial unique index + per-OU advisory lock + `LAST_FALLBACK_GROUP` | 8 unit (incl. 20 parallel) + 6 real-DB | 0–3 |
| BA-groups-04 | add-member user select                    | inactive lifecycle fixtures    | 0–4   |
| BA-groups-05 | update flags + changes/problems consumers | designation dependency test    | 0–4   |
| BA-groups-06 | key/member precheck + error mapper        | concurrent create/add          | 0–4   |
| BA-groups-07 | delete ticket count + SetNull FK          | parallel assign/delete         | 0–3   |
| BA-groups-08 | optional invalidator                      | Redis/event fault              | 0–2/5 |
| BA-groups-09 | list/load record/mine queries             | scale + query assertion        | 0–5   |
| BA-groups-10 | unconditional update                      | no-op PATCH                    | 0–5   |

## 16. Otvorene pretpostavke

- Cross-OU group membership je postojeći podržani poslovni slučaj; audit zato ne proglašava svako takvo članstvo eskalacijom, nego traži eksplicitnu eligibility politiku.
- Tačna obaveznost jedne fallback grupe po OU-u mora se usaglasiti s routing pravilima; postojeći `SOLE_FALLBACK_GROUP` dokaz je da kod pokušava održati najmanje jednu kada postoji.
- Detaljna semantika CAB/problem/on-call/routing zavisnosti biće dodatno provjerena u njihovim modulskim auditima.
- Korisnik je potvrdio kompletan CI/Playwright prolaz, ali postojeća kolekcija nema negativne multi-instance revoke, hidden-cascade i fallback concurrency scenarije.
