# EP-HelpDesk — Fazni plan implementacije: Grupni inbox, Svi tiketi, Detalji tiketa, Novi tiket

**Datum:** 20.09.2026.
**Izvor nalaza:** `03-GAP-ANALIZA-TIKETI-UI.md` (ID-jevi `INB-*`, `LST-*`, `DET-*`, `NEW-*`, `DAT-*`, `DSG-*`, `I18-*`, `TST-*`, `HYG-*`, `QA-*`, odluke `D1–D10`).
**Cilj:** ova četiri ekrana vizuelno identična `referenca-dizajn/`, funkcionalno usklađena s RAW-om, i18n (BS default + EN), i na kraju jedinstven Toast sistem.
**Ovaj dokument zamjenjuje** `02-FAZNI-PLAN-IMPLEMENTACIJE-TIKETI.md` za navedene ekrane.

---

## 0) Pravila rada (važe za svaku fazu)

1. Jedna faza = jedan novi chat/agent session. Prvi prompt: „Radimo fazu Fx iz `04-FAZNI-PLAN-TIKETI-UI.md`. Pročitaj GAP ID-jeve navedene u fazi i predloži kratak plan prije koda.“
2. **Plan-first:** kratak plan (bullet lista) prije koda, potvrda, tek onda implementacija (`.cursor/rules/plan-first.mdc`). Plan ima više od 3 faze, pa treba `.cursor/plans/tickets-ui-alignment/` (`00_overview.md`, `0x_phase-*.md`, `CHECKLIST.md`, `CHANGELOG.md`, `HANDOFF.md`).
3. **TASKS.md:** dodati „Faza 10 — Tiketi UI alignment“ s podstavkama F0–F8 (ručno, kao i do sada). Pravilo „samo trenutna stavka“ ostaje na snazi.
4. **Definition of Done (svaka faza):**
   - Svaki novi UI tekst u `bs` i `en` (`common.json`) u istom commitu; nema hardkodiranog teksta ni sirovih enuma/ID-jeva u UI-u.
   - Fajlovi koje dotičeš ≤ 150 linija (izdvoji helper/hook; vidi `HYG-01`).
   - Pravilo bez UUID-a: nazivi, ne ID-jevi (grep obrazac u `scripts/` iz F8).
   - Matrice i `CHANGELOG.md` u `.cursor/docs/matrices/…` ažurirani za svaku promjenu logike.
   - Backend: jedinični testovi za novu logiku; frontend: `vitest` za helpere; `npm run build` (`tsc -b`) prolazi.
   - Nema direktnog Prisma pristupa iz kontrolera; nema hardkodirane OU/routing logike.
5. **Predlog commit poruke** na kraju svakog koraka (agent predlaže, vi commitujete i označavate u `TASKS.md`).
6. **Feedback seam (uvodi se u F2):** tanak sloj `useActionFeedback()` (`frontend/src/lib/feedback/`) s metodama `success(key, params)`, `warning(...)`, `error(err, context)`. Do F7 ispisuje u diskretnu `aria-live` regiju i postojeći inline prikaz; u F7 se veže na Toast. Time F7 postaje zamjena implementacije, a ne prepravka svih ekrana.

### Redoslijed i zavisnosti

```
F0 odluke + baseline
 └─ F1 backend ugovor ──┬─ F2 grupni inbox ──┐
                        ├─ F3 lista ─────────┤
                        ├─ F4 detalji (F4b, F4c po odluci) ─┤
                        └─ F5 novi tiket ────┤
                                             └─ F6 vizuelni paritet ─ F7 Toast ─ F8 testovi / matrice / CI
```

F2–F5 su nakon F1 međusobno nezavisne i mogu ići u proizvoljnom redoslijedu; preporuka je F2 → F3 → F4 → F5 jer inbox i lista imaju najviše korisničkih problema. Toast je namjerno zadnji (F7), kako je traženo.

Veličine (procjena, ne obećanje): **S** ≤ 1 dan · **M** 2–3 dana · **L** 4–6 dana.

---

## F0 — Odluke, baseline i priprema · S

**Cilj:** zatvoriti otvorena pitanja i dobiti mjerljivu referentnu tačku za „identičan izgled“.

**Zadaci**
1. Odluke **D1–D10** (`03-GAP…` §9). Posebno D1 (toast politika), D2 (auto-assign po grupi), D3/D4 (forwarding, templates), D7 (anti-abuse tajmera).
2. Ako D1 odstupa od Constitution §31/§32: izmijeniti Constitution i `.cursor/rules/frontend-ui-ux.mdc` (jedna rečenica pravila).
3. **Baseline snimci:** pokrenuti `referenca-dizajn` (`npm run dev`) i `frontend`; Playwright screenshoti 4 ekrana × 2 viewporta (1440×900, 390×844) u `e2e/visual/` (referenca vs implementacija, po jedan par po ekranu). Potvrditi ili odbaciti sve stavke „provjeriti vizuelno“ (`DSG-01`, `DSG-02`, izgled `INB-*`/`LST-*`).
4. Zatvoriti „Šta nije provjereno“ (`03-GAP…` §10) za backend `create-ticket.ts` i vidljivost UNROUTED reda.
5. Napraviti `.cursor/plans/tickets-ui-alignment/` i unijeti fazu u `TASKS.md`.

**Prihvatanje:** odluke zapisane u `00_overview.md`; baseline snimci u repou; lista vizuelnih razlika potvrđena (ili stavke izbačene iz GAP-a).

---

## F1 — Backend ugovor: podaci, performanse, atomičnost · L

**Cilj:** frontend dobija sve što mu treba u jednom odgovoru; nestaje „direktorij“ s desetinama zahtjeva.
**GAP:** `DAT-01`, `DAT-02`, `INB-07`, `INB-08`, `INB-09`, `LST-03` (izvor), `LST-05`, `LST-06` (izvor), `DET-02` (izvor), `NEW-04`, `NEW-05` (endpoint).

**Zadaci**
1. **Nazivi u odgovoru:** `TicketResponse` dobija `originUnitName`, `originUnitPath`, `serviceName` (+ `formVersionNumber` već postoji). Proširiti `load-ticket-display-labels.ts` (batch upiti) i `to-ticket-client-responses.ts`.
2. **`GET /tickets/counts`** (isti scoping kao lista): `{ open, unrouted, inbox, overdue, atRisk, byStatus }`. Jedan upit; realtime događaj invalidira.
3. **`GET /groups/mine`** (role USER/AGENT/ADMIN/SUPER_ADMIN, vraća samo grupe u kojima je korisnik član; SUPER_ADMIN sve): `id, name, organizationalUnit {id,name,path}, memberCount, effectiveAutoAssign, isFallback`. Efektivni auto-assign prema odluci D2 (ako D2 = grupa: migracija `Group.autoAssignStrategy`, prioritet grupa > servis > globalno; matrica `ticket-group-inbox` + CHANGELOG).
4. **Zajednički upit-DTO** `TicketListQueryDto`: `status[]`, `priority`, `serviceId`, `originUnitId`, `assignedUserId`, `requesterId`, `groupId`, `unassigned`, `overdue`, `atRisk`, `createdFrom/To`, `q` (broj, naslov; opis samo ako se odluči), `sort` (`updatedAt|createdAt|priority|status|slaDueAt`), `dir`, `page`, `pageSize` (max 100), `includeArchived`. Isti DTO za `list`, `export` i `saved views` (jedna funkcija `buildTicketListWhere`).
5. **Odgovor liste:** `{ items, total, page, pageSize }`. Migrirati potrošače u istoj fazi: `use-ticket-list.ts`, `use-sidebar-ticket-counts.ts`, `header-search-match.tsx`, `use-dashboard-summary.ts`, `use-sla-page-data.ts`, `edge-extension/src/lib/fetch-extension-inbox.ts` (i `edge-extension2`), `e2e/helpers/create-ticket.ts`, `e2e/tests/02, 05, 07`. Ako se želi izbjeći lom: zadržati niz kad `page` nije poslan (odluka u planu).
6. **Vidljivost kao SQL predikat:** scope po OU/servisu, requester, confidential ACL (bez break-glass) izražen u `where`; ukloniti petlju s `await` po tiketu iz `list-tickets.ts` i `list-group-inbox-tickets.ts`. Confidential pravila i dalje potpuno primijenjena (RAW: ne smije procuriti ni naslov).
7. **Inbox:** limit/paginacija (`page`, `pageSize`, `groupId`), sort po najbližem SLA roku.
8. **Atomično preuzimanje:** `updateMany({ where: { id, assignedUserId: null, status: { in: ['PENDING'] } } })`; `count === 0` → `TICKET_NOT_CLAIMABLE` (HTTP 409) uz naziv ko je preuzeo. Preuzimanje tuđeg tiketa samo kroz postojeće „Dodijeli“ (s permission provjerom i auditom). Odluka o statusima ASSIGNED/IN_PROGRESS zapisana u matrici.
9. **Requester-safe routing preview** `POST /tickets/routing-preview` `{ originUnitId, serviceId }` → `{ outcome, groupName?, fallbackDepth, autoAssign, approvalSteps, slaProfileName }` bez internih ID-jeva pravila. Isti servis koji koristi kreiranje (jedan izvor istine).
10. **Servis:** `approvalSteps` (broj koraka) u `ServiceResponse` (`NEW-04`); `availability` uključuje `DOWN` u API tipu.
11. Realtime: `ticket.created` i `ticket.updated` nose dovoljno podataka da klijent odluči „novi u mojoj grupi“ bez punog reload-a (`groupId`, `priority`).

**Fajlovi (okvirno):** `tickets/list-tickets.ts`, `tickets/dto/list-tickets-query.dto.ts`, `tickets/export/*`, `tickets/load-ticket-display-labels.ts`, `tickets/to-ticket-response.ts`, `tickets/assignment/*`, novi `tickets/counts/*`, `tickets/routing-preview/*`, `groups/groups.controller.ts` + `list-my-groups.ts`, `service-catalog/*` (approvalSteps), `prisma/schema/identity.prisma` (samo ako D2 = grupa).

**Prihvatanje**
- `GET /tickets?page=1&pageSize=25&sort=slaDueAt` vraća stranicu + `total`; brojevi se poklapaju s `counts`.
- USER/AGENT dobija `originUnitName` i `serviceName` u svakom odgovoru bez poziva na `/organizational-units/:id/users`.
- Dva istovremena `POST /tickets/:id/claim` → jedan 200, jedan 409.
- Confidential tiket nije vidljiv u listi/inboxu/countsu neovlaštenom korisniku.
- Odgovor liste od 1000 tiketa u scope-u < 300 ms na dev bazi (RAW NFR), bez N+1 upita.

**Testovi:** jedinični za `buildTicketListWhere` i preuzimanje (konkurentnost); `tickets.group-inbox.spec.ts` dopuna; RBAC scenariji (USER/AGENT/ADMIN/SUPER_ADMIN, confidential, bez članstva u grupi); ažurirati e2e helpere.
**Rizici:** promjena oblika odgovora liste (potrošači: edge ekstenzije, e2e); migracija ako D2 = grupa. Mitigacija: potrošači migrirani u istom PR-u, opcionalni prelazni režim bez `page`.

---

## F2 — Grupni inbox · M

**Cilj:** inbox identičan `Inbox.tsx`, s ispravnim tokom preuzimanja.
**GAP:** `INB-01`, `INB-02`, `INB-03`, `INB-04`, `INB-05`, `INB-06`, `INB-09` (FE dio), `INB-10`, `HYG-01` (inbox fajlovi).

**Zadaci**
1. **Feedback seam** (`useActionFeedback`, pravilo 6).
2. **Tabovi iz članstva:** `useMyGroups()` (`GET /groups/mine`) → tabovi: „Neusmjereni red“ (uz permission/vlasnika), „Moja grupa“ (grupe u kojima sam član; ako je jedna, njen naziv u zagradi kao u referenci), ostale grupe za ADMIN/SUPER_ADMIN; brojači iz `counts`/inbox odgovora; nulti brojači vidljivi; sortiranje po nazivu.
3. **Info traka aktivne grupe:** naziv, OJ (opseg), broj članova, auto-assign (Least Busy / Round Robin / isključen), avatari (do 3 + „+N“); izgled iz `Inbox.tsx`.
4. **Red inboxa:** podnosilac iz `ticket.requesterName` (`ticketRequesterName`), SLA čip s hourglass iz `ticket.sla` (crveno kad kasni, `tnum`), „Preuzmi“ primary samo za CRITICAL, ikone u dugmadima prema reviziji `DSG-01`.
5. **Tok preuzimanja:** lokalno stanje reda (`claimingId`), optimističko uklanjanje iz liste, tiha revalidacija (bez skeletona), 409 → red se uklanja + poruka „Tiket je već preuzeo {naziv}“; greška nikad ne zamjenjuje listu. Nakon uspjeha poruka s akcijom „Otvori“ (feedback seam).
6. **Realtime:** indikator „uživo“ (zelena tačka `dot-pulse` u dugmetu osvježavanja, „Osvježi · realtime aktivan“), pilula „N novih tiketa“ umjesto automatskog reload-a kad je korisnik skrolovao; sidebar brojači iz `counts` uz realtime invalidaciju.
7. **Paginacija** (učitaj još / stranice) za velike grupe.
8. Refaktor: `use-ticket-list.ts` razdvojiti u `use-inbox.ts` i `use-ticket-list.ts` (≤ 150 linija).

**Prihvatanje**
- Agent u dvije grupe vidi oba taba, i kad su prazni; admin/SuperAdmin vidi sve grupe.
- Info traka prikazuje ispravne podatke; auto-assign se poklapa s `GET /groups/mine`.
- Preuzimanje: uspjeh → red nestaje bez treperenja; konflikt → red nestaje + poruka; mrežna greška → red ostaje, lista ostaje.
- Agent (ne-admin) vidi ime podnosioca u svakom redu.
- Vizuelno poređenje s baseline snimkom: 0 neobrazloženih razlika.

**Testovi:** `inbox-view-tabs.spec.ts`, novi `use-inbox` test (optimistički tok, 409), E2E: agent A i B istovremeno preuzimaju isti tiket; RBAC: agent bez članstva vidi poruku, ne prazan ekran.

---

## F3 — Svi tiketi (lista) · L

**Cilj:** lista identična `Tickets.tsx`, ispravni brojači, server-side filtriranje, upotrebljiv bulk.
**GAP:** `LST-01` … `LST-10`, `HYG-01` (lista).

**Zadaci**
1. **Bug LST-01:** proslijediti `originNames` (nakon F1: `ticket.originUnitName`) u `TicketListTable`; ukloniti `useDirectory()` iz liste.
2. **Server-side stanje liste** (URL kao izvor istine: `?status=&priority=&service=&q=&sort=&page=`), `useTicketList` prebaciti na `GET /tickets` iz F1; brojači tabova iz `counts` (ne iz učitane stranice) — rješava `LST-03`; tab „SLA rizik“ = `overdue + atRisk` (`LST-04`).
3. **Tabela:** kolone Tiket · Usluga (+ „forma vN“) · Jedinica · Status · Prioritet · Grupa/Agent · **SLA resolution** (rok/countdown, „pauziran“); sortabilna zaglavlja (`updatedAt`, `priority`, `status`, `slaDueAt`); izbor kolona (popover, sačuvan u saved view).
4. **Filter traka:** pretraga (debounce), čipovi prioriteta, usluga, asignee, datumski opseg (popover), indikator sortiranja „ažurirano ↓“.
5. **Saved views:** izgled iz reference (naziv + brojač + sažetak upita; jedno „Sačuvaj trenutni filter“ koje otvara mali popover za naziv/default); preimenovanje; brisanje kroz `ConfirmDialog`; sort i kolone se stvarno čuvaju i primjenjuju (RAW).
6. **Bulk traka:** vidljiva samo uz permission (`ticket.bulk.*` / staff); pickeri umjesto ručnog ID-a (grupa, agent, prioritet, status bez close); **structured broadcast** dijalog s poljima „šta se dešava“, „koga pogađa“, „ETA“, „workaround“ (opciono) i prikazom broja primalaca + potvrda iznad praga; **merge** s eksplicitnim izborom parenta; obavezno obrazloženje gdje RAW traži.
7. **Greške akcija** (izvoz, saved views, bulk) više ne idu u `errorKey` stranice; preko feedback seam-a.
8. **Ukloniti** red od 5 workspace tabova (D10) i prevesti „Dodijeljeni/Nedodijeljeni/Zatraženi“ u saved views + sidebar prečice.
9. Refaktor: `ticket-list-page.tsx`, `ticket-list-table.tsx` ≤ 150 linija.

**Prihvatanje**
- Kolona „Jedinica“ prikazuje naziv OJ za sve uloge.
- Brojači tabova su stabilni pri promjeni taba; „SLA rizik“ uključuje at-risk.
- Sa 5.000 tiketa u scope-u lista se učitava paginirano; CSV izvoz daje iste rezultate kao ekran za isti filter.
- Saved view sa sortom, kolonama i assigneeom se vraća identično.
- USER ne vidi checkboxove ni bulk traku.
- Broadcast ne može poći bez sva tri obavezna polja; preview prikazuje broj primalaca.

**Testovi:** `filter-tickets`/DTO spec, saved-view spec (sort + kolone), E2E: filter → export parity, bulk broadcast (postojeći `05` proširiti), RBAC: USER nema bulk.

---

## F4 — Detalji tiketa · L (F4b, F4c po odluci)

**Cilj:** detalji identični `TicketDetail.tsx`, s RAW funkcijama koje nedostaju.
**GAP:** `DET-01` … `DET-15`, `NEW-01` (dio: upozorenja na detalju), `HYG-01`, `I18-01`.

**Zadaci**
1. **Forma po verziji (DET-01):** `TicketFormDataView` renderuje prema `formVersionRef` (učitati shemu te verzije): labele, tipovi (boolean → Da/Ne, datum lokalizovan, select → labela opcije), obavezna/uklonjena polja iz starijih verzija označena „iz ranije verzije forme“; nepoznat ključ → labela „Polje (uklonjeno)“, nikad sirov ključ ni „[object Object]“.
2. **Nazivi (DET-02):** usluga i OJ iz `TicketResponse`; ukloniti `useTicketServiceName` i `useDirectory` iz detalja.
3. **Model grešaka (DET-03, DET-11):** razdvojiti greške po akciji; svaka akcija javlja uspjeh/grešku preko feedback seam-a; učitavanje pod-resursa razlikuje 403 (sakrij) od 5xx (prikaži „Pokušaj ponovo“ na panelu); ukloniti dupli prikaz u composeru.
4. **Prilozi (DET-04):** lokalizovana klasifikacija (ton po nivou, RESTRICTED = danger), uploader i datum, brisanje kroz `ConfirmDialog`; dropzone s dinamičkim hintom (allow-list i max veličina iz postavki).
5. **Učesnici (DET-05):** `ConfirmDialog`; dodavanje ostalih uloga gdje RAW dozvoljava; prikaz uloge na čipu.
6. **Tajmer (DET-06, D7):** živi brojač dok radi; auto-pauza kad je tab neaktivan > X min (klijentski heartbeat) + serverski maksimum trajanja sesije (settings-driven, audit `SYSTEM_EVENT`); matrica `time-tracking-anti-abuse` ažurirana.
7. **Header (DET-09, DET-13):** watch/bell dugme (dodaje/uklanja WATCHER sebe); bedž „SLA pauziran“ iz `sla.pausedAt`; banner confidential s brojem ovlaštenih i „Zatraži break-glass“ kad je primjenjivo; „kanal“ prema D6.
8. **Prioritet (DET-15):** u „Status ▾“ meniju ili u svojstvima: izmjena uticaja/hitnosti (agent/admin) s obaveznim razlogom i auditom.
9. **PII/tajne (DET-14):** upozorenje uz composer prije slanja (klijentska detekcija istim obrascima) i banner na detalju iz `redactionWarnings` (dodati u GET odgovor ili u `ticket.redactionWarnings` iz posljednje mutacije).
10. **State machine (DET-12):** UI koristi isključivo `allowed` statuse/akcije iz `tickets-context` odgovora; ukloniti kopiju prijelaza gdje je moguće.
11. **SLA panel (DET-10):** tick 30 s (zajednički `useNow`).
12. Refaktor: `ticket-detail-page.tsx` (260), `use-ticket-detail.ts` (198), `ticket-sla-panel.tsx`, `ticket-message-composer.tsx`, `ticket-detail-header.tsx` ≤ 150 linija.

### F4b — Cross-OU forwarding · M (ako D3 = da)
**GAP:** `DET-07`.
- Backend: `POST /tickets/:id/forward` `{ targetGroupId | targetOrganizationalUnitId, reason }`; permission `ticket.forward.cross_ou` + OU scope; `FORWARDED_FROM_GROUP` / `FORWARDED_TO_GROUP` participanti; `SYSTEM_EVENT` s razlogom; nakon prosljeđenja pristup po novim OU/group pravilima (stari handleri samo ako ostavljeni kao watchers); realtime + notifikacija novoj grupi.
- Frontend: akcija „Proslijedi…“ (dijalog: ciljna OJ → grupa, obavezan razlog), prikaz u aktivnosti.
- Matrica `ticket-forwarding-cross-ou` (MATRIX + CHANGELOG), testovi RBAC (bez permissiona, van scope-a, confidential).

### F4c — Templates / playbooks · M (ako D4 = da)
**GAP:** `DET-08`.
- Model: šablon odgovora + opciona checklista po servisu (admin CRUD, change log), prikaz u composeru („Umetni šablon“) i panelu checkliste na detalju; ne mijenja sigurnosni model.
- Matrica `ticket-templates-playbooks`.

**Prihvatanje F4**
- Detalji tiketa kreiranog s verzijom forme v1 nakon aktivacije v2 prikazuju polja v1 sa ispravnim labelama.
- Nijedan sirovi ID/enum u UI-u (grep provjera).
- Svaka akcija ima vidljiv rezultat; neuspjeh jedne akcije ne utiče na prikaz drugih panela.
- Tajmer: živi brojač; auto-pauza radi (test s lažnim `visibilitychange`).
- Vizuelno poređenje s baseline snimkom: 0 neobrazloženih razlika.

**Testovi:** helper spec za renderer forme (obrisano/preimenovano polje), composer PII detekcija, E2E: forward (F4b), verzija forme, prilog sa klasifikacijom.

---

## F5 — Novi tiket · M

**Cilj:** čarobnjak identičan `NewTicket.tsx`, s prilozima, ispravnim upozorenjima i ekranom uspjeha.
**GAP:** `NEW-01` … `NEW-11`, `DET-14` (dio), `HYG-01`.

**Zadaci**
1. **Izbor usluge (NEW-03):** kategorije kao chips, kartice s opisom (2 reda), oznakom „forma vN“, lifecycle bedžom, dostupnošću (lokalizovane labele za sva 4 stanja uključujući `DOWN`), brojem koraka odobrenja iz `approvalSteps` (NEW-04), info trakom kad usluga nije potpuno dostupna („prijava ostaje moguća“).
2. **Detalji (NEW-02, NEW-09):** dropzone za priloge (allow-list i limit iz postavki; upload nakon kreiranja tiketa u istom toku, s prikazom napretka i djelimičnog neuspjeha); opcioni prekidač „Povjerljiv tiket“ prema D8; validacija po polju s mapiranjem grešaka servera na polja.
3. **PII/duplikati (NEW-01):** živo upozorenje u naslovu/opisu (warn-only); nakon kreiranja `redactionWarnings`/`duplicateWarnings` se prikazuju na ekranu uspjeha (i kao `warning` poruka).
4. **KB intercept (NEW-07):** pad presretača → poruka i „Nastavi bez prijedloga“; „pomoglo“ vezano za izabrani članak (izbor uz svaki članak ili kliknuti članak), `catch` na povratnu informaciju i vidljiv rezultat; „ipak kreiraj“ ostaje moguće.
5. **Pregled (NEW-05):** routing rezolucija iz `POST /tickets/routing-preview` (ishod, grupa, dubina naslijeđenog, auto-assign, SLA profil), kartice „Trenutna rezolucija“ i „Auto-assign po grupama“ u bočnom panelu prema referenci.
6. **Ekran uspjeha (NEW-06):** broj tiketa, routing ishod, prioritet, SLA profil, verzija forme, „Otvori tiket“ i „Nazad na ploču“ (+ „Kreiraj sličan tiket“ kao prijedlog).
7. **Greške (NEW-08):** inline uz polje i kratak sažetak; `TicketErrorState` samo za blokirajuće greške učitavanja kataloga.
8. **Nacrt (NEW-10):** autosave u `sessionStorage` (bez tajni iz polja označenih kao osjetljiva), upozorenje pri napuštanju.
9. **NEW-11:** dokumentovati odstupanje (`request type`, `due date` zamijenjeni SLA rokom) u RAW-u/matrici prema D5.
10. Refaktor: `create-ticket-form.tsx` (199) razdvojiti u `use-create-ticket-draft.ts` + `use-create-ticket-submit.ts`.

**Prihvatanje**
- Tiket s prilogom, kategorijom i verzijom forme kreira se do kraja bez ručnog unosa ID-eva.
- Pregled prikazuje stvarnu rezoluciju (grupa, fallback) za USER-a.
- Neuspjeh presretača ne blokira kreiranje.
- PII u opisu daje upozorenje prije slanja i na ekranu uspjeha.
- Vizuelno poređenje s baseline snimkom: 0 neobrazloženih razlika.

**Testovi:** `build-create-ticket-input.spec.ts` (confidential, prilozi), helper za nacrt, E2E `01` proširiti (prilog + ekran uspjeha + KB pad).

---

## F6 — Vizuelni paritet s referencom · M

**Cilj:** dokazati i zatvoriti „identičan izgled“ na svim ekranima.
**GAP:** `DSG-01`, `DSG-02`, zatvaranje svih ⚠️ iz `03-GAP…` §5, responsive.

**Zadaci**
1. **`DSG-01`:** ukloniti forsiranje `[&_svg]:size-[15px]` iz `Button` ili ga zamijeniti veličinama po `size` varijanti; provjeriti sve ikone dugmadi (12–14 px) prema referenci.
2. **`DSG-02`:** svi `/12`, `/6`, `/8`… opacity modifikatori u `frontend/src` provjereni skriptom protiv `theme.extend.opacity`; nedostajuće vrijednosti dodati u `tailwind.config.ts` ili zamijeniti (`bg-danger/12` → `/10` ili `/[.12]`).
3. Prolaz po kontrolnim listama §5.1–§5.4: razmaci, tipografija (Constitution §23), boje (80–90 % neutrala), radius, motion; nesklad ispravljati u Tailwind klasama.
4. **Responsive:** na mobilnom breakpointu drawer/sheet umjesto dialoga (Constitution §33) za bulk, saved views, filtere, dijaloge.
5. Pristupačnost: fokus prsten, `aria-current`, `aria-live`, kontrast, tastatura (Constitution §34).
6. Screenshot diff u CI (`e2e/visual/`): prag odstupanja po ekranu, objašnjena dozvoljena odstupanja (npr. dodatne funkcije iz RAW-a: forma podataka, overdue bedževi).

**Prihvatanje:** svi ekrani i viewporti u dozvoljenom pragu; dokument „dozvoljena odstupanja“ (npr. „Podaci forme“ na detalju, bedževi overdue/at-risk, select usluge u filteru) potpisan.

---

## F7 — Toast i jedinstvene povratne poruke · M

**Cilj:** sve poruke, notifikacije i alerti idu kroz jedan sistem (politika D1, katalog u `03-GAP…` §7.3).
**GAP:** `TST-01`, `TST-02`, `INB-03`, `LST-07`, `LST-09`, `DET-03`, `DET-04`, `DET-05`, `DET-14`, `NEW-01`, `NEW-06`, `NEW-08`.

**Zadaci**
1. **Infrastruktura:** `@radix-ui/react-toast` (isti Radix stack) ili `sonner` (odluka u planu); `ToastProvider` u `ApplicationShell` i `InstallSetupLayout` (login/instalacija); `frontend/src/components/ui/toast.tsx` + `toaster.tsx`; stil s tokenima (`elevated`, `border`, semantička boja u obrubu/ikoni, `pop-in`, bez glass/gradijenata), pozicija dole-desno (desktop) / iznad donje ivice (mobilni), max 3, `dedupeKey`, pauza na hover/focus, `prefers-reduced-motion`.
2. **API:** `toast.success/info/warning/error/critical(key, params?, { action?, dedupeKey?, durationMs? })`; poruke isključivo preko i18n ključeva (`toast.*`); greške preko `mapTicketError` + `requestId` u detalju („Kopiraj ID zahtjeva“); nikad sirove backend poruke.
3. **Vezati feedback seam** (F2) na toast; ukloniti `aria-live` privremenu implementaciju.
4. **`ConfirmDialog`** (Radix Dialog) i zamjena svih `window.confirm` (prilozi, učesnici, saved views i administracija korisnika); destruktivno dugme `danger`.
5. **Notifikacije:** pretplata na `notification.created` → toast za Important/Critical (klik vodi na tiket; `dedupeKey` po tiketu); Informational samo zvono. Realtime osvježavanje podataka bez toasta (D1).
6. **Migracija po katalogu (§7.3):** inbox, lista, detalji, novi tiket, globalno (istek sesije, gubitak veze). Greške koje blokiraju prvi prikaz ostaju ErrorState + „Pokušaj ponovo“.
7. **Lint:** `no-restricted-globals` za `confirm`/`alert`; test koji pada ako se u `components/tickets`, `pages/ticket-*` pojavi `setErrorKey`/`setActionError` za greške akcija.
8. i18n: namespace `toast.*` u BS i EN (kratke, akcione poruke; jedan glagol, bez tehničkog žargona).

**Prihvatanje**
- Nijedan `window.confirm/alert` u frontendu (grep).
- Svaka stavka iz kataloga §7.3 ima toast (ručni test-list + `vitest` za mapiranje kod → ključ).
- Neuspjeh akcije nikad ne uklanja listu ni panel.
- Toast je dostupan čitaču ekrana (`role=status`/`alert`), tastatura (Esc, fokus na akciju), reduced-motion.
- 3 istovremene greške → najviše 3 toasta, ostale spojene; istovjetna greška se ne dupla.

**Testovi:** komponentni testovi providera (stack, dedupe, trajanje), spec mapiranja grešaka, E2E: preuzimanje sa konfliktom, upload priloga (uspjeh/odbijen), kreiranje tiketa (uspjeh + „Otvori“).

---

## F8 — Testovi, dokumentacija, CI · M

**GAP:** `QA-01`, `I18-01`, `HYG-01`, zatvaranje matrica.

**Zadaci**
1. **RBAC test suite** (otvorena stavka u `TASKS.md`): scenariji iz `02-FAZNI-PLAN…` (Faza 5) prilagođeni stanju: USER (kreiranje, ne vidi tuđe, nema bulk), AGENT sa i bez članstva u grupi (inbox vs lista), SuperAdmin bypass, bulk close zabranjen, reopen guard, confidential + break-glass, forwarding (F4b), atomično preuzimanje.
2. **E2E:** inbox preuzimanje (dva agenta), lista (filter → export parity, saved view, bulk), detalji (akcije, forma po verziji, prilog), novi tiket (prilog, ekran uspjeha, KB pad), Toast tokovi.
3. **i18n skripta** u `scripts/`: paritet ključeva BS/EN, korišteni-a-nepostojeći ključevi, mrtvi ključevi (`I18-01`), sirovi enumi; dodati u CI.
4. **Skripta „bez UUID-a u UI-u“:** grep obrazac na `\{[a-zA-Z.]+\.(…Id)\}` izvan `value=`/`key=`/`to=`; u CI.
5. **Matrice i CHANGELOG:** ažurirati `ticket-group-inbox`, `ticket-saved-views`, `ticket-bulk-actions`, `ticket-attachments`, `time-tracking-anti-abuse`, `in-app-notifications`; kreirati `ticket-forwarding-cross-ou`, `ticket-templates-playbooks`, `ticket-dedup-merge` (RAW §9 ih traži, u repou ih nema).
6. Arhivirati zastarjele `01-ANALIZA…` i `02-FAZNI-PLAN…` (premjestiti u `docs/archive/` ili označiti „zamijenjeno“).
7. Zaključiti `HANDOFF.md` i označiti fazu u `TASKS.md`.

**Prihvatanje:** CI zelen (backend jest, frontend vitest, e2e, i18n i UUID provjere, vizuelni diff); sve matrice postoje i imaju CHANGELOG; `HYG-01` fajlovi ≤ 150 linija ili opravdani.

---

## Pregled faza i GAP pokrivenosti

| Faza | Veličina | Pokriva |
|---|:-:|---|
| F0 | S | odluke D1–D10, baseline, `NEW-11` (odluka) |
| F1 | L | DAT-01, DAT-02, INB-07, INB-08, INB-09, LST-05, LST-06 (BE), NEW-04, NEW-05 (BE) |
| F2 | M | INB-01…06, INB-10 |
| F3 | L | LST-01…LST-10 |
| F4 | L | DET-01…06, 09…15 (+ F4b: DET-07, F4c: DET-08) |
| F5 | M | NEW-01…NEW-11 |
| F6 | M | DSG-01, DSG-02, zatvaranje §5 |
| F7 | M | TST-01, TST-02, zamjena `window.confirm` |
| F8 | M | QA-01, I18-01, HYG-01, matrice |

**Ukupno:** 55 GAP stavki (19 Visoko, 26 Srednje, 10 Nisko). Pod pretpostavkom D3/D4 = da, plan ima 11 radnih paketa (F0–F8 + F4b + F4c).

---

## Kickoff promptovi (kopirati u novi chat)

- **F1:** „Radimo fazu F1 iz `04-FAZNI-PLAN-TIKETI-UI.md` (backend ugovor). Pročitaj `03-GAP…` stavke DAT-01, DAT-02, INB-07/08/09, LST-05/06, NEW-04/05, `tickets/list-tickets.ts`, `tickets/assignment/claim-ticket.ts`, `groups.controller.ts`. Predloži plan, pa čekaj potvrdu.“
- **F2:** „Radimo F2 (grupni inbox). Referenca je `referenca-dizajn/src/pages/Inbox.tsx`. GAP: INB-01…06, INB-10. Prvo uvedi `useActionFeedback` seam, zatim tabove iz `GET /groups/mine`.“
- **F3:** „Radimo F3 (lista). Referenca `Tickets.tsx`. GAP: LST-01…10. Počni s LST-01 i server-side stanjem liste.“
- **F4:** „Radimo F4 (detalji). Referenca `TicketDetail.tsx`. GAP: DET-01…06, 09…15. Počni s renderom forme po `formVersionRef`.“
- **F5:** „Radimo F5 (novi tiket). Referenca `NewTicket.tsx`. GAP: NEW-01…11. Počni s izborom usluge i prilozima.“
- **F6:** „Radimo F6 (vizuelni paritet). Uporedi baseline snimke iz `e2e/visual/` i zatvori DSG-01/02 i kontrolne liste §5.“
- **F7:** „Radimo F7 (Toast). Politika D1 i katalog događaja u `03-GAP…` §7. Uvedi provider, ConfirmDialog, veži feedback seam, migriraj ekrane.“
- **F8:** „Radimo F8 (testovi, matrice, CI) prema `04-FAZNI-PLAN…`.“
