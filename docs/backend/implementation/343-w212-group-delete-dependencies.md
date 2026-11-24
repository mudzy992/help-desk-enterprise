# W2.12 — `BA-groups-01`: inventar zavisnosti prije brisanja grupe (block / detach / cascade)

**Paket:** Val 2, P1 (destruktivna operacija), **size L**<br>
**Nalaz:** „Group delete može tiho cascade obrisati/odvezati kritične cross-module resurse”<br>
**Kod:** `modules/groups/{group-delete.types.ts (novo),collect-group-delete-dependencies.ts (novo),assert-group-deletable.ts,delete-group.ts,groups.service.ts,groups.controller.ts,groups.error.ts,map-groups-error.ts}`<br>
**Frontend:** `services/groups-api.ts`, `lib/groups/use-groups-panel-actions.ts`, `components/groups/groups-panel.tsx`, `lib/groups/map-groups-error.ts`, `i18n/locales/{bs,en}/common.json`<br>
**Šema:** bez izmjena, bez migracije · **Rute:** +1 (`GET /groups/:groupId/delete-impact`) · **Env:** nema novih varijabli<br>
**Specovi:** `groups/group-delete-dependencies.spec.ts` (**novo, 21**), `groups/groups.service.spec.ts` (+1, fake sa 14 novih delegata),
`groups/delete-group-scope.spec.ts` (ugovor outcome-a), `lib/groups/use-groups-panel-actions.spec.tsx` (**novo, 4**, frontend)

## Nalaz

`assertGroupDeletable` je pitao dvije stvari — je li grupa jedina fallback u OU-u i ima li aktivnih tiketa — a sve ostalo je
rješavao PostgreSQL. Na `Group` pokazuje **17 stranih ključeva** i oni se ponašaju na tri različita načina:

| Ponašanje (`onDelete`) | Šta nestaje iz vida operatora |
| --- | --- |
| `Cascade` | `GroupMember`, `OnCallSchedule` (cijelo podstablo rasporeda: slojevi, override-i, zamjene), `TeamsGroupChannel`, `ResponseTemplateGroup`, `TicketConfidentialGrant`, `Notification` |
| `SetNull` | `Ticket.assignedGroup` (zatvoreni tiketi), `TicketParticipant.group`, `KnowledgeArticle.ownerGroup`, `SlaEscalationRule.targetGroup`, `ReportSchedule.group`, `AssetType.routingGroup`, `Problem.group`, `ProblemHandoff.fromGroup`, `ChangeRequest.cabGroup` |
| `Restrict` | `RoutingRule.group`, `ProblemHandoff.toGroup` — baza **odbija** brisanje, a API je to vraćao kao generički 500 |

Tri posljedice, po težini:

1. **Gubitak operativne konfiguracije.** Raspored dežurstva je izvor za SLA eskalaciju („obavijesti dežurnog u
   `targetGroupId`”). Brisanje grupe je brisalo raspored i njegovu historiju — tiho, u jednoj transakciji, bez ijednog
   reda u auditu koji to imenuje.
2. **Nehotično proširenje pristupa.** `ResponseTemplateGroup` je `Cascade`: brisanjem grupe šabloni odgovora ostaju bez
   scope reda, tj. prestaju biti ograničeni na grupu. Isto važi za povjerljive tikete (`TicketConfidentialGrant`).
   „Obriši neiskorištenu grupu” je tako moglo **ukloniti ograničenje**.
3. **Neprozirna greška.** `Restrict` relacije nisu bile ni spomenute, pa je delete sa routing pravilom završavao kao
   `PrismaClientKnownRequestError` → 500, bez informacije šta smeta.

## Odluka

**Jedan inventar, jedna istina.** `collectGroupDeleteDependencies(prisma, { groupId, organizationalUnitId, isFallback })`
vraća tri liste — `blockers`, `detached`, `cascaded` — i to je **jedini** izvor i za 409 i za preview. Guard i preview
zovu **istu funkciju**, pa se dijalog i greška ne mogu razići.

Pravilo po relaciji (i zašto baš tako):

| Relacija | `onDelete` | Odluka | Razlog |
| --- | --- | --- | --- |
| `GroupMember` | Cascade | (nije u inventaru) | To *je* grupa; članstvo je predmet operacije i ide u `before` audit snapshot. |
| `Group` (fallback) | — | **block** `fallbackGroups` | Postojeća invarijanta: ne briši jedinu fallback grupu OU-a. Preuzeta kroz inventar, ponašanje nepromijenjeno. |
| `Ticket.assignedGroup` (otvoreni) | SetNull | **block** `activeTickets` | Postojeća invarijanta (`status NOT IN (CLOSED, ARCHIVED)`), sada sa countom. |
| `OnCallSchedule` | Cascade | **block** `onCallSchedule` | Živa konfiguracija koju drugi modul izvršava (SLA → dežurni). Ne briše se implicitno; operator prvo ukloni/premjesti raspored. |
| `TeamsGroupChannel` | Cascade | **block** `teamsChannel` | Integracijska veza; brisanje tiho gasi Teams obavještavanje. |
| `ResponseTemplateGroup` | Cascade | **block** `responseTemplates` | Brisanje **proširuje** vidljivost šablona (scope red nestaje). Sigurnosno relevantno, ne „čišćenje”. |
| `TicketConfidentialGrant` | Cascade | **block** `confidentialGrants` | Isto: tiho uklanjanje access pravila za povjerljive tikete. |
| `RoutingRule.group` | Restrict | **block** `routingRules` | Baza bi odbila; sada 409 sa countom umjesto 500. |
| `ProblemHandoff.toGroup` | Restrict | **block** `problemHandoffs` | Isto, na problem handoffovima. |
| `Problem.group` (otvoreni) | SetNull | **block** `openProblems` | Radni problem bez vlasničke grupe mijenja operational ownership. |
| `ChangeRequest.cabGroup` (otvoreni) | SetNull | **block** `openChanges` | CAB bez grupe = promjena bez savjetodavnog tijela. |
| `Notification.groupId` | Cascade | **cascade** (dozvoljeno, prijavljeno) | Tranzijentni delivery redovi; blokiranje bi blokiralo brisanje zauvijek na svakoj starijoj grupi. |
| `Ticket.assignedGroup` (zatvoreni), `TicketParticipant.group`, `KnowledgeArticle.ownerGroup`, `SlaEscalationRule.targetGroup`, `ReportSchedule.group`, `AssetType.routingGroup`, `Problem.group` (zatvoreni), `ChangeRequest.cabGroup` (zatvoreni) | SetNull | **detach** (dozvoljeno, prijavljeno) | Historija/konfiguracija ostaje kao red, gubi referencu; operator to vidi u dijalogu **i** u auditu. |

**Terminalni statusi** su eksplicitni: problem `RESOLVED | CLOSED | CANCELLED`, promjena `CLOSED | REJECTED | CANCELLED`.
Za tikete se koristi **postojeća** konstanta modula `closedGroupTicketStatuses = (CLOSED, ARCHIVED)` — `RESOLVED` tiket se
i dalje računa kao aktivan, jer to je današnje ponašanje i nije predmet ovog nalaza (vidi „Granica paketa”).

**Fail-closed.** Ako se bilo koji count ne može izvršiti, `PrismaService` baci grešku → transakcija se prekida → delete je
**odbijen**. Nema `catch`-a koji nepoznato stanje prevodi u nulu: preview i guard dijele istu funkciju, pa i preview
pada (frontend tada ne tvrdi ništa o zavisnostima, vidi dolje).

**Audit nosi inventar.** `groupDeleted` metadata dobija `dependencies: { blocked: [], detached: [...], cascaded: [...] }`
pored postojećeg `before` snapshota. Time audit odgovara na „šta je otišlo sa grupom” bez arheologije nad bazom — i ta
lista je izračunata **prije** `group.delete`, u istoj transakciji.

## Implementacija

### 1. Tipovi (`group-delete.types.ts`)

`GroupDeleteBlockerKind` (10), `GroupDeleteDetachedKind` (9), `GroupDeleteCascadedKind` (1) i `GroupDeleteImpact`
(`blockers | detached | cascaded`). Count se uvijek šalje kao broj; nula-count stavke se **ne** šalju u detach/cascade
listama (frontend ne mora filtrirati), a blocker se šalje čim je > 0.

### 2. Inventar (`collect-group-delete-dependencies.ts`)

19 `count` upita u jednom `Promise.all` (po jedan za „otvorene/zatvorene” tikete, problemе i promjene). Svaki `where` je
vezan na `groupId` **ili** na specifično polje relacije (`toGroupId`, `ownerGroupId`, `targetGroupId`, `routingGroupId`,
`cabGroupId`, `assignedGroupId`). Fallback count se izvršava **samo** kad je grupa fallback — obična grupa ne plaća taj upit.

### 3. Guard (`assert-group-deletable.ts`)

Umjesto dvije provjere: `collect` → ako `blockers.length > 0` → `GroupsError('HAS_DEPENDENCIES', …, blockers)`;
inače vraća `impact` (da `deleteGroup` može da ga audituje). Potpis je promijenjen sa `Promise<void>` na
`Promise<GroupDeleteImpact>` — jedini pozivalac je `deleteGroup`.

### 4. Error contract (`groups.error.ts`, `map-groups-error.ts`)

`GroupsError` dobija treći parametar `blockers` (default `[]`). `HAS_DEPENDENCIES` je 409 i tijelo je
`{ code, message, blockers: [{ kind, count }] }`. `SOLE_FALLBACK_GROUP` i `HAS_ACTIVE_TICKETS` **nestaju** — njihove
situacije su sada `fallbackGroups`/`activeTickets` u istoj listi, pa klijent ima jedan ugovor umjesto tri.

### 5. Ruta `GET /groups/:groupId/delete-impact`

ADMIN + `group.manage` + `RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })`. Vraća isti
`GroupDeleteImpact`. Servis: `GroupsService.deleteImpact` (učitava zapis kao i delete, pa nestala grupa daje isti 404 kao
delete). Ništa ne piše: bez transakcije, bez audita, bez invalidacije keša.

### 6. Frontend: preview u dijalogu

`useGroupsPanelActions` dobija `deleteImpact: {status: 'loading' | 'ready' | 'unavailable'}` i `useRef` guard da odgovor
za drugu grupu ne prepiše otvoreni dijalog. `groups-panel.tsx` prikazuje (u `ConfirmDialog` children): blokere
(`role`-neutralna lista sa countom po relaciji), zatim odvezane, zatim trajno obrisane redove, i potvrdu **onemogućava**
kad blokera ima. Kad preview padne, dijalog ostaje upotrebljiv i **ne tvrdi** da je grupa nekorištena; server i tada
odbija delete. `map-groups-error.ts` mapira `HAS_DEPENDENCIES` i generički 409 na `groups.errorDependencies`
(do juče je svaki 409 tvrdio „sole fallback”, što više nije istina). 19 kindova + `unknown` fallback su prevedeni u `bs` i `en`.

## Vizuelna provjera (ručni koraci)

Potrebno: jedna instanca za korake 1–8; **druga instanca** (isti image, isti `DATABASE_URL`) za korak 9. Testni podaci:
seedovani manualni katalog `/Users`, `/Users/IT`, `/Groups` (`npm run db:seed` u `backend`) i tri grupe u `/Users/IT`
(npr. `IT Support`, `OnCall-Lab`, `Sablon-Lab`).

1. **Pripremi blokere.** U bazi ili kroz UI napravi tiket sa `assignedGroupId` = `IT Support` koji nije `CLOSED`/`ARCHIVED`.
   Kao ADMIN otvori **Administracija → Grupe** i na kartici `IT Support` klikni **Obriši**.
2. **Preview prije potvrde.** U dijalogu se (unutar ~1 s) pojavi „Provjeravam zavisnosti…” pa
   **„Brisanje je blokirano”** sa stavkom „*n* tiketa je još u obradi”. Dugme **Obriši** je **disablirano** — ne može se
   ni kliknuti. Zatvori dijalog (Otkaži).
3. **On-call blokada.** Napravi raspored dežurstva za `OnCall-Lab` (On-call → novi raspored, grupa `OnCall-Lab`) i
   pokušaj brisanje te grupe. Očekivano: blocker „*1* raspored dežurstva (sa izmjenama i zamjenama)”.
4. **Teams blokada.** Veži `OnCall-Lab` na Teams kanal (Administracija → Teams) i ponovi. Očekivano: dodatni blocker
   „Teams kanal vezan za grupu”. (Ako integracija nije konfigurisana, korak preskoči i zabilježi kao „nije izvedeno”.)
5. **Šabloni = proširenje pristupa.** Ograniči jedan šablon odgovora na `Sablon-Lab` (Administracija → Šabloni odgovora
   → grupe). Pokušaj brisanje `Sablon-Lab`. Očekivano: blocker „šablon odgovora ograničen na grupu”. Uvjeri se da
   šablon **nije** obrisan ni „odvezan” (otvori ga — scope je nepromijenjen).
6. **Historija se samo odvezuje.** Tiket sa `assignedGroupId` = `Sablon-Lab` postavi na `CLOSED`. Ponovi brisanje:
   blokera nema, ali dijalog prikazuje **„Ovi zapisi se odvezuju, ne brišu: *1* zatvoren tiket ostaje bez dodijeljene
   grupe”**. Potvrdi brisanje → grupa nestaje, tiket i dalje postoji sa praznom grupom.
7. **Audit imenuje inventar.** Administracija → **Audit log** filtriraj `group.deleted` za tu grupu. Metadata sadrži
   `dependencies.detached` (isti kind/count kao u dijalogu). Ranije je bio samo `before` snapshot grupe i članova.
8. **Restrict više nije 500.** Napravi routing pravilo na `IT Support` (Administracija → Rutiranje) i pokušaj brisanje:
   odgovor je **409** sa `blockers: [{ kind: "routingRules", count: 1 }]`, a u dijalogu piše „pravilo rutiranja (baza
   odbija brisanje)”. U Network tabu nema 500.
9. **Druga instanca, bez keša (kontrola).** Dijalog uvijek čita bazu; nema procesnog keša. Provjera: na instanci **1**
   otvori dijalog brisanja za `Sablon-Lab` (preview pokaže 0 blokera), **ne** zatvaraj ga; na instanci **2** dodaj
   aktivan tiket na tu grupu; na instanci 1 zatvori i ponovo otvori dijalog → sada **ima** blokera. Ako instanca 1 i
   dalje tvrdi „nema blokera”, preview je keširan — prijavi kao bug.
10. **Regresija.** Grupa bez ijedne zavisnosti: dijalog prikazuje „Nema blokirajućih zavisnosti.” + napomenu o auditu;
    potvrda briše grupu, lista se osvježi, keš aktera se invalidira (nema 403 na tuđim stranicama). Konzola bez grešaka
    i bez `groups.errorGeneric` teksta.

## AD konektor sa testnim OU

Paket ne dira directory konektor; dovoljan je **manualni katalog** (`npm run db:seed`) sa `/Users`, `/Users/IT` i
`/Groups`. Ako želiš realan AD/LDAPS tok (preporuka za korak 2: scope se provjerava i na novoj ruti), koristi setup iz
`341-w210-users-control-plane-scope.md`, sekcija „AD konektor sa testnim OU” — dijelovi A (LDAPS konektor + OU
mapiranje) i B (scoped ADMIN u `/Users/IT`). Bitno za ovaj paket: scoped ADMIN u `/Users/IT` mora moći otvoriti
`delete-impact` za grupu **u svom** podstablu i dobiti **403** za grupu u `/Groups` — to je isti `resource: 'group'`
resolver koji koristi `DELETE`, pa se scope ne može zaobići preko preview rute.

## Direktni testni dokaz

`groups/group-delete-dependencies.spec.ts` (21) — fixture **po relaciji** (`createDependencyPrisma` daje po jedan `count`
delegat za svaku od 16 relacija, sa mogućnošću da count zavisi od `where`):

- prazna grupa → `{ blockers: [], detached: [], cascaded: [] }`;
- svaka relacija se pita **tačno jednom**, sa tačnim `where` (`groupId` / `toGroupId` / `ownerGroupId` / `targetGroupId` /
  `routingGroupId` / `assignedGroupId`), tiketi/problemi/promjene po **dva** counta (otvoreno/zatvoreno);
- devet `it.each` slučajeva: `activeTickets`, `onCallSchedule`, `teamsChannel`, `responseTemplates`, `routingRules`,
  `problemHandoffs`, `openProblems`, `openChanges`, `confidentialGrants` → svaki pojedinačno daje 409 blocker;
- fallback: `isFallback && count <= 1` → blocker; `count = 2` → nema blokera;
- historija (`closedTickets`, `ticketParticipants`, `knowledgeArticles`, `slaEscalationRules`, `reportSchedules`,
  `assetTypes`) → nije blocker, ali je u `detached`;
- `notifications` → `cascaded`, dozvoljeno;
- status split: `notIn: [CLOSED, ARCHIVED]` za tikete, `notIn: [RESOLVED, CLOSED, CANCELLED]` za problemе,
  `notIn: [CLOSED, REJECTED, CANCELLED]` za promjene;
- guard vraća **sve** blokere odjednom (ne samo prvi) i `impact` kad je delete dozvoljen;
- `deleteGroup`: kad blocker postoji **ne** poziva `recordGroupChange` ni `group.delete`; kad je dozvoljeno, audit dobija
  `dependencies.detached/cascaded`, a outcome nosi `impact`.

`groups/groups.service.spec.ts` (+1): `deleteImpact` vraća inventory i **ne** piše ništa (bez `delete`, bez audita);
fake klijent dobio 14 delegata sa countom 0, pa postojeći delete testovi i dalje dokazuju `publish`/invalidate tok.
`delete-group-scope.spec.ts`: ugovor outcome-a proširen `impact`-om (mocked guard vraća prazan inventar).
Frontend `lib/groups/use-groups-panel-actions.spec.tsx` (4): preview se učita pri otvaranju dijaloga; pad preview-a
ostavlja dijalog upotrebljivim (`unavailable`); odgovor koji stigne poslije zatvaranja se ignoriše; poslije uspješnog
deletea stanje se resetuje.

## Lokalna verifikacija i njeno ograničenje

- backend `src/modules/groups`: **8 suite / 49 testova prolazi**;
- backend eslint na svim diranim fajlovima ✓; frontend `tsc -b` ✓, `eslint` ✓, `prettier --check` ✓ za dirane fajlove,
  `vitest` za `src/i18n`, `src/components/groups`, `src/lib/groups` **51 prolazi** (uključujući parity/identical
  provjere prijevoda);
- **nije izvedeno lokalno:** `prisma generate` (traži `binaries.prisma.sh`, sandbox ga ne dobija) → klijent je lokalni
  stub bez delegata, pa je lokalni Jest pokrenut sa **isključenom TS dijagnostikom**; type-check protiv **pravog**
  generisanog klijenta daje CI (`nest build` + *Validate the complete Prisma schema*). To znači da lokalni prolaz
  dokazuje **runtime** ponašanje, ne tipove — npr. pogrešno ime delegata bi lokalno prošlo, a u CI palo;
- **nije izvedeno lokalno:** E2E/browser provjera (koraci iz „Vizuelna provjera” su za okruženje sa bazom).

## Granica paketa

- **`BA-groups-07`** (TOCTOU: provjera pa `SetNull` u drugom aktu) **ostaje otvoren.** Inventar se čita u **istoj**
  transakciji kao delete, ali bez `FOR UPDATE`/advisory locka nad grupom, pa konkurentni `assignedGroupId` write između
  counta i delete-a i dalje može proći. Ovaj paket uklanja *nevidljivost* posljedice, ne trku.
- **`BA-groups-03`** (fallback cardinality) **ostaje otvoren**: delete sada poštuje postojeću invarijantu „ne briši
  jedinu fallback grupu”, ali `PATCH isFallback=false` i dalje može ostaviti OU bez fallbacka.
- **`BA-groups-05`** (CAB/problem flagovi bez lifecycle provjere) **ostaje otvoren**; ovdje je pokriveno samo brisanje,
  ne gašenje oznake na živoj grupi.
- **`BA-groups-02`** (actor-group keš) i **`-08`** (best-effort invalidacija) nisu dirani.
- **Politika „arhiviraj umjesto blokiraj”** iz korekcije nalaza nije uvedena: nema `archivedAt` na `Group`, a uvođenje
  bi bilo šema-promjena sa uticajem na svaki read u modulu (routing, ticketing, on-call). Odabrano je **fail-closed
  blokiranje** uz eksplicitan, akcioni 409 — dozvoljena alternativa iz iste korekcije. Ako se arhiviranje ipak želi,
  to je novi paket sa migracijom i read-filterima, ne „još jedan blocker”.
- **Notifikacije se i dalje brišu** (`Cascade`): to su delivery redovi, ne historija odluka; blokiranje bi značilo da
  nijedna starija grupa nikad nije brisiva. Prijavljuju se u dijalogu i u auditu.

## CI

Run [`45509708483`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45509708483) na `354d391` — **success,
prvi pokušaj**:

- **Backend build + test** ✓ (schema + generisani klijent, `nest build`, full Jest uključujući novi
  `group-delete-dependencies.spec.ts`, eslint, wiring check sa **633** rute);
- **Backend PostgreSQL + Redis integration** ✓ (nema nove migracije, ali connection-budget `npm run build` prolazi sa
  novim delegatima);
- **Frontend build + test** ✓ (tsc, eslint, prettier, `npm test` sa novim hook testom i i18n parity/identical čuvarima,
  bundle budget);
- **Docs guard** ✓ (uključuje `audit:traceability` i `check-docs-content`);
- **Backend container + supply chain** ✓;
- **Skipped:** *Read-only service-form pattern inventory*, *E2E install wizard*, *E2E critical flows* — konfiguracija
  workflowa (`skipped` nije `passed`; browser E2E iz „Vizuelna provjera” nije izveden).

Nije bilo crvenih pokušaja: jedina lokalna poteškoća (stub generisanog klijenta bez delegata) nije stigla do CI-ja jer
je stub gitignored i CI generiše pravi klijent.

## Registar nalaza

- Zatvoreno: `BA-groups-01`.
- Ostaje otvoreno iz istog modula: `-02`, `-03`, `-04`, `-05`, `-06`, `-07`, `-08`, `-09`, `-10`.
