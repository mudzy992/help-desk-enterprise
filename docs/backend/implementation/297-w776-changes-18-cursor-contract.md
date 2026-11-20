# W7.76 — `BA-changes-18`: cursor ugovor za događaje, glasove, šablone, opcije i konflikte

**Paket:** Val 7, `changes`, **P3**<br>
**Nalaz:** „Events/approvals/templates/options/conflicts liste se hard-trunciraju bez potpunog cursor ugovora”<br>
**Kod:** `backend/src/modules/changes/{change-pagination.ts, changes.service.ts, change-approvals.service.ts, change-templates.service.ts, change-schedule.service.ts, change-conflicts.ts, change-conflict-snapshot.ts, changes.controller.ts, changes.constants.ts}` + frontend paneli<br>
**DB migracija:** nema (nijedno polje nije dodato; svi upiti koriste postojeće kolone i indekse)

## Nalaz

Register promjena je imao pošten ugovor (`limit`, `cursor`, `total`, `nextCursor`). Sve ostale kolekcije nisu:

| Kolekcija | Prije | Šta je korisnik dobijao |
| --- | --- | --- |
| `GET /changes/:id/events` | `take: 200` | najnovijih 200 događaja, bez `hasMore`, bez cursora |
| `GET /changes/:id/approvals` | `take: 500` **svih rundi** | 500 glasova svih rundi u jednom nizu; starije runde su tiho nestajale, a trenutna runda se takmičila sa historijom za istih 500 redova |
| `GET /changes/templates` | `take: 500` | katalog se završavao na 500. šablonu |
| `GET /changes/options` | `2000/2000/200/500` | forma je dobijala skraćenu listu jedinica/servisa/CAB grupa/šablona koja izgleda kao potpuna |
| `GET /changes/:id/conflicts` | `take: 200` + `take: 200` | odsječena lista konflikata koja se **čita kao čist prozor**; `hasWarnings` je bio `false` iako je skan stao na 200. redu, a W7.68 digest je pokrivao nepotpun set kao da je potpun |
| `GET /changes/calendar` | `take: 500` | `truncated` je postojao, ali se izvodio iz `length >= 500` — period sa **tačno** 500 stavki je lažno prijavljivao skraćenje |

Posljedica nije bila u tome što granica postoji (svaka lista treba granicu), nego u tome što **klijent nije
mogao znati da je granica dostignuta** i što za većinu njih nije postojao način da se traži dalje. Kod
arity/audit zapisa to je najgore mjesto za tiho odsijecanje: historija promjene je dokaz.

## Rješenje

**1. Jedan ugovor, jedno mjesto** — `change-pagination.ts`:

```ts
changeListLimits   // events {50, 200} · templates {50, 500} · approvals {50, 500}
changeListLimit(raw, limits)      // broj ili string; neispravno → default, inače 1..max
changeListCursor(raw)             // id; prazno ili > 64 znaka nije cursor
changeOverFetch(limit)            // limit + 1
changePage(rows, limit)           // { items, hasMore, nextCursor }
changePageQuery({ limit, cursor }, limits)
```

`hasMore` se **nikad ne izvodi iz dužine strane** — Prisma čita jedan red više, pa je „ima još” činjenica iz
baze, a ne nagađanje. `nextCursor` je `null` tačno kad `hasMore` nije `true`.

**2. Tri liste su sada stranice** (stranica nosi `items`, `hasMore`, `nextCursor`):

- **događaji** — `orderBy [{createdAt desc}, {id desc}]`, cursor je id posljednjeg prikazanog događaja; timeline
  stare promjene više ne nestaje nakon 200. reda;
- **šabloni** — `orderBy [{isActive desc}, {name asc}, {id asc}]`; `id` je dodan da granica stranice ne može
  ponoviti ni preskočiti šablon koji dijeli ime sa susjedom;
- **glasovi ranijih rundi** — `orderBy [{round desc}, {decidedAt asc}, {id asc}]`.

**3. Trenutna runda se nikad ne straniči.** Kvorum, „ko još treba da glasa” i obavještenje o redakciji opisuju
**ovu** rundu, pa je ovaj dio odgovora uvijek potpun — runda ima najviše jedan glas po članu, a sastav je
ograničen `cabVotersMax = 500`. `history` je zato zasebna stranica starijih rundi; ranije su trenutna runda i
historija dijelile istih 500 redova. Uz to:

- `approvals` (broj odobrenja) se računa iz **cijele** trenutne runde, ne iz prikazane stranice;
- `votedIds` i `canVote` iz iste, potpune runde;
- `commentsRedacted` je sada `count(comment != null)` u SQL-u — sa stranicama se „ima li ijedan komentar” više ne
  može pročitati sa stranice na kojoj se čitalac zatekao;
- `votesTruncated` je `true` samo ako CAB prelazi 500 glasova u rundi (konfiguracijska greška, ne tiho rezanje).

**4. Forma ne može da straniči — pa se skraćenje imenuje.** `GET /changes/options` čita svaki picker jedan red
preko granice i vraća `truncated: { units, services, cabGroups, templates }`. Forma prikazuje hint kad je ijedan
`true`; bez toga bi korisnik tražio stavku koja „ne postoji” iako postoji.

**5. Konflikti: odsječen skan je upozorenje, ne čist prozor.** `ChangeConflicts.truncated` nosi
`{ changes, downtime }`, `hasWarnings` ga uključuje, `changeConflictSnapshot` ga stavlja **u digest** (`t`) i u
izlaz. Time preview snimljen dok je skan bio ograničen ne može biti potvrđen kao da je pregledan cijeli set —
i obrnuto: kad se granica podigne, digest se promijeni, pa zastarjela potvrda pada na W7.68 provjeri.

**6. Kalendar: `truncated` je sada tačan.** Oba upita čitaju `calendarMaxItems + 1`, stranica se siječe na
`calendarMaxItems`, a `truncated` je `rows > page` — period sa tačno 500 stavki više nije „skraćen”.

**7. Frontend koristi ugovor, ne pretpostavku:**

- `ChangeHistoryPanel` — `useInfiniteQuery` + „Učitaj starije zapise” dok `hasNextPage`;
- `ChangeTemplatesPanel` — isto za katalog („Učitaj još šablona”);
- `ChangeApprovalsPanel` — trenutna runda iz `votes`, ranije runde iz `history.items` uz „Učitaj starije glasove”;
  fallback na stari server (bez `history`) čita ranije runde iz `votes`, pa stariji backend ne gubi glasove;
- `ChangeConflictsList` — žuto upozorenje kad je skan odsječen i **nema** „Nema konflikata” u tom slučaju;
- `ChangeFormSheet` — hint kad je neki picker skraćen;
- `ChangeCalendar` — postojeći `truncated` sada znači tačno ono što piše.

Svi novi tekstovi su u bs/en. Granice se ne izgovaraju u UI-u kao brojevi (200/500) — UI kaže „ima još”, a ne
„stranica ima 50”.

## Dokazi

Backend (`npm run test` na `changes`, bez integracija):

- `change-pagination.spec.ts` — **8** (default, clamp, `0`, `-4`, `5000`, string i broj, cursor, over-fetch,
  granica tačno pune strane, `pageQuery`);
- `changes-events-pagination.spec.ts` — **4** (take 51, cursor → `skip: 1`, zadnja strana bez cursora, clamp na
  200, `change.read`);
- `change-templates-pagination.spec.ts` — **4** (take 51, `orderBy` sa `id`, cursor, neaktivni iza
  `change.manage`, tačno puna strana nije „ima još”);
- `change-approvals-pagination.spec.ts` — **4** (trenutna runda cijela, historija 50/51 + cursor, `votesTruncated`
  na 501, `commentsRedacted` iz `count`);
- `change-truncation-signals.spec.ts` — **5** (skan konflikata 201 → `truncated.changes`, `hasWarnings`,
  digest se mijenja sa skraćenjem, kalendar 501/500);
- `changes-options-truncation.spec.ts` — **3** (imenovan skraćeni picker, sve kompletno, `change.read`).

Cijeli modul: `modules/changes` **38 suite / 232 testa** zeleno (uz ažurirana dva postojeća speca: `count` za
komentare i razdvojeni upiti rundi).

Frontend (`vitest`, `tsc --noEmit`, `eslint`, `i18n:check`):

- `change-history-panel.spec.tsx` — **3**; `change-approvals-panel-paging.spec.tsx` — **4** (uključujući
  fallback na stariji server); `change-templates-panel-paging.spec.tsx` — **2**; `change-form-submit.spec.ts` —
  **7** (`canSubmitChangeForm` i dvije label funkcije izdvojene iz forme); `change-conflicts-list.spec.tsx` —
  **6** (+2: upozorenje, i „nema konflikata” samo kad skan nije odsječen); `change-form-cab-routing.spec.tsx` —
  **5** (+2 za hint);
- `components/changes` + `lib/changes` + `i18n` — **23 fajla / 113 testova**;
- `npm run i18n:check` — 9.274 ključa, bs/en paritet, 4.724 statička ključa razriješena.

## Usput: forma je ostala ispod granice od 500 linija

`change-form-sheet.tsx` je bio tačno na granici (500). Dodavanje hinta za skraćene pickere i pravila za
`canSubmit` gurnulo bi ga preko, a podizanje granice nije opcija. Zato je izdvojeno ono što i pripada drugdje:

- `components/changes/change-form-options-hint.tsx` — hint o skraćenim pickerima;
- `lib/changes/change-form-labels.ts` — ključevi opisa i natpisa dugmeta po režimu (umjesto dva ugniježđena
  ternara u JSX-u);
- `lib/changes/use-change-conflicts-preview.ts` — 400 ms debounce + preview upit (hook, kao
  `use-change-cab-group`/`use-change-owner-search`);
- `canSubmitChangeForm` u `lib/changes/change-form-body.ts` — pravilo „može li se poslati” kao čista funkcija.

Forma je sada **483** linije, `module-size.spec.ts` prolazi bez diranja baseline-a, a pravilo i natpisi su prvi
put testirani direktno (7 testova) umjesto kroz DOM.

## Šta nije u ovom paketu

- **`GET /changes/owners` i `link-search/*`** ostaju kratke pretrage (60→20, 10 rezultata) — to su pickeri sa
  dokumentovanim „najviše N”, ne liste koje korisnik čita; straničenje bi ih učinilo gorim. Nalaz ih ne pominje.
- **`voterSnapshot`** (`take: 12` status događaja) nije korisnička lista: traži posljednji `status` događaj
  otvorene runde, a pad na živu membership pravilo je već pokriveno W7.70.
- Granice (`events` 200, `templates` 500, `approvals` 500) **nisu podignute** — poenta je da klijent dobije
  cursor, ne da server čita više.
- `BA-changes-19` (clamp konfiguracijskih integera) i `BA-changes-20` (compile-blocked suite + E2E matrica)
  ostaju otvoreni.

## Rizik i rollback

- **Kompatibilnost:** svi dodaci su aditivni (`hasMore`, `nextCursor`, `history`, `truncated`) — stariji
  klijent i dalje dobija `items`; stariji backend ne šalje `history`, a novi klijent tada čita glasove iz
  `votes` (pokriveno testom).
- **Promjena ponašanja:** potvrda konflikata sada traži potvrdu i kad je skan odsječen (`hasWarnings`), a digest
  se mijenja sa skraćenjem. To je namjerno: potvrda ne smije pokrivati set koji niko nije vidio.
- **Učinak:** događaji/šabloni po jedan red više po stranici (zanemarivo); pregled odobrenja sada radi **tri**
  upita umjesto jednog (runda, historija, `count` komentara) — svi po indeksu `changeId` i svi ograničeni.
- **Rollback:** vraćanje jednog fajla (`changes.controller.ts`) vraća stare odgovore; klijent radi i sa starim
  oblikom (`items` bez `hasMore` → `hasNextPage` je `false`).
