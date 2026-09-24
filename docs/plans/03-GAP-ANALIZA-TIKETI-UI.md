# EP-HelpDesk — GAP analiza: Grupni inbox, Svi tiketi, Detalji tiketa, Novi tiket

**Datum:** 20.09.2026.
**Obuhvat:** četiri ekrana (`/tickets?view=inbox`, `/tickets`, `/tickets/:id`, `/tickets/new`), podaci i backend rute koje ih hrane, poređenje s `RAW_PROJECT_EPHELPDESK.md` i s `referenca-dizajn/`, i18n, te inventar za Toast sistem.
**Metod:** statička analiza koda (backend NestJS/Prisma, frontend React/Vite, referenca). Aplikacija nije pokretana ni renderovana. Sve tvrdnje o ponašanju izvedene su iz koda; tvrdnje o izgledu označene „provjeriti vizuelno“ traže potvrdu u fazi F0/F6.
**Prati:** `04-FAZNI-PLAN-TIKETI-UI.md` (redoslijed implementacije po fazama).

---

## 1) Ispravke prethodne analize (`01-ANALIZA-…`, `02-FAZNI-PLAN-…`)

Stari dokumenti u repou ne odgovaraju trenutnom kodu. Ovaj dokument ih zamjenjuje za ova četiri ekrana.

| Tvrdnja iz `01-ANALIZA` | Stanje u kodu danas |
|---|---|
| #1 `GET /organizational-units/tree` je admin-only | Ispravljeno: ruta koristi `organizationalUnitTreeReadRoles`. Ostaju admin-only `:id` i `:id/users` (vidi DAT-01). |
| #6 Lista nema CSV export | Postoji: `useTicketsCsvExport`, dugme vidljivo uz permission `audit.export`. |
| #5 Split panel prikazuje sirov `parentTicketId` | Ispravljeno: prikazuje `parentTicketNumber` i naslov. |
| 1.6 Prazan inbox bez članstva u grupi | Ispravljeno: `GET /tickets/inbox/status` + `TicketInboxNoGroupNotice`. |
| 1.3 Auto-fill OU za USER | Implementirano (`resolveCreateTicketOriginUnit`, `originUnitYours`). Detaljno ponašanje nije testirano. |
| „1981 ključ u `tickets.*`“ | Netačno: 429 ključeva u `tickets.*`, 2089 ukupno; paritet BS/EN je 100 %. |
| Nalazi #2–#4 (razlika RBAC scope i članstva u grupi, wildcard „Bilo koja OJ“, auto-fill OU) | Wildcard i RBAC scope nisu ponovo analizirani (izvan ovih ekrana); prazan inbox zbog nepostojanja članstva u grupi je riješen (1.6). |

---

## 2) Rezime

| Modul | Visoko | Srednje | Nisko | Ukupno |
|---|---:|---:|---:|---:|
| Inbox | 5 | 3 | 2 | 10 |
| Lista | 4 | 5 | 1 | 10 |
| Detalji | 5 | 7 | 3 | 15 |
| Novi tiket | 3 | 6 | 2 | 11 |
| Podaci | 1 | 1 | 0 | 2 |
| Dizajn | 0 | 1 | 1 | 2 |
| i18n | 0 | 1 | 0 | 1 |
| Toast | 1 | 1 | 0 | 2 |
| Održavanje | 0 | 0 | 1 | 1 |
| Kvalitet | 0 | 1 | 0 | 1 |
| **Ukupno** | **19** | **26** | **10** | **55** |

**Osnovni zaključak.** Funkcionalna širina je velika: RAW logika za tikete, inbox, statuse, SLA, participante, confidential, prilog, KB intercept, guardrails i CSAT postoji u backendu i uglavnom u UI-u, a struktura ekrana vjerno prati referencu. Razlike su u četiri grupe:

1. **Podaci i ugovor s backendom.** Frontend ne dobija imena OJ i usluge u odgovoru (imena grupa i osoba dobija), pa gradi „direktorij“ s desetinama zahtjeva (DAT-01, DET-02, INB-04). Lista i brojači rade nad cijelim skupom podataka (LST-05, INB-09).
2. **Funkcije iz RAW-a koje nedostaju ili su parcijalne:** cross-OU forwarding (DET-07), templates/playbooks (DET-08), structured broadcast (LST-08), prikaz forme po verziji (DET-01), upozorenja o PII/tajnama (DET-14, NEW-01), anti-abuse tajmera (DET-06), priloge pri kreiranju (NEW-02).
3. **Ispravnost:** kolona „Jedinica“ uvijek prazna (LST-01), brojači tabova (LST-03), preuzimanje tiketa bez atomičnosti (INB-07), greške koje brišu cijeli ekran (INB-03, LST-09).
4. **Povratne poruke.** Ne postoji toast; uspjeh se nigdje ne potvrđuje (TST-01).

---

## 3) RAW → implementacija: funkcionalna matrica za ova četiri ekrana

Legenda: ✅ implementirano · ⚠️ djelimično · ❌ nedostaje. „BE“ = backend, „FE“ = frontend. Stavke označene „komponenta postoji“ nisu pregledane do na nivo ponašanja.

| # | RAW zahtjev | BE | FE | Napomena / GAP |
|---|---|:-:|:-:|---|
| 1 | Novi tiket ide **handler grupi**, ne pojedincu | ✅ | ✅ | `list-group-inbox-tickets.ts`, `apply-ticket-auto-assignment.ts` |
| 2 | Group inbox: lista „unassigned in group“ + „assign to me“ | ✅ | ⚠️ | INB-01, INB-03, INB-07 |
| 3 | Auto-assign Least Busy / Round Robin | ✅ | ❌ | Backend po servisu i globalno; UI ne prikazuje (INB-02, D2) |
| 4 | Unrouted queue s vlasnikom SuperAdmin | ✅ | ✅ | Tab + banner + link na routing; ko sve vidi red nije ispitano |
| 5 | Impact/urgency → priority (matrica) | ✅ | ✅ | `lookupTicketPriority`; override na detalju ❌ (DET-15) |
| 6 | State machine, zabranjeni skokovi | ✅ | ⚠️ | FE ima kopiju prijelaza (DET-12) |
| 7 | Participants + message types | ✅ | ⚠️ | Samo WATCHER u UI-u (DET-05); tipovi poruka prikazani ✅ |
| 8 | Confidential: skrivanje iz lista, break-glass | ✅ | ⚠️ | Ručno označavanje pri kreiranju ❌ (NEW-09); banner bez akcije (DET-13) |
| 9 | Prilozi: upload/download/brisanje, klasifikacija | ✅ | ⚠️ | DET-04, NEW-02 |
| 10 | Time tracking Start/Stop + anti-abuse | ⚠️ | ⚠️ | Server računa trajanje ✅; auto-pauza ❌ (DET-06, D7) |
| 11 | SLA panel, pauza, overdue/at-risk | ✅ | ✅ | Komponenta gotovo identična referenci; bez tickanja (DET-10) |
| 12 | Approvals (1–3 koraka) | ✅ | ⚠️ | Komponenta postoji; kreiranje prikazuje uvijek 1 (NEW-04) |
| 13 | CSAT, close codes, reopen | ✅ | ✅ | Komponente postoje; nisu pregledane do ponašanja |
| 14 | Waiting-for-user (akcija + automatika) | ✅ | ✅ | Dugme „Odgovori i postavi Čeka korisnika“ postoji |
| 15 | Ticket split (parent/child) | ✅ | ✅ | Panel postoji; parent prikaz ispravan |
| 16 | Bulk akcije, bez bulk close | ✅ | ⚠️ | LST-08 |
| 17 | Structured broadcast (šta/koga/ETA/workaround) | ✅ | ❌ | UI šalje pogrešna polja (LST-08) |
| 18 | Dedup/merge | ✅ | ⚠️ | Parent se bira implicitno (LST-08) |
| 19 | Saved views (filteri, sort, kolone, default) | ✅ | ⚠️ | LST-06, LST-07 |
| 20 | **Cross-OU forwarding** (razlog + audit) | ❌ | ❌ | DET-07; permission definisan, nekorišten |
| 21 | **Ticket templates / playbooks** | ❌ | ❌ | DET-08 |
| 22 | KB intercept obavezan + feedback | ✅ | ⚠️ | NEW-07 |
| 23 | Guardrails: duplikat (warn / soft-block) | ✅ | ✅ | „Kreiraj ipak“ radi; upozorenje u odgovoru se gubi (NEW-01) |
| 24 | PII/secret redaction warn-only | ✅ | ⚠️ | DET-14, NEW-01 |
| 25 | Service availability (OPERATIONAL/DEGRADED/**DOWN**/MAINTENANCE), non-blocking | ✅ | ⚠️ | FE tip bez `DOWN` (NEW-03) |
| 26 | Form versioning: render po `formVersionRef` | ✅ | ⚠️ | Kreiranje ✅; prikaz na detalju ❌ (DET-01) |
| 27 | Pretraga i filteri liste | ⚠️ | ⚠️ | Klijentski nad cijelim skupom (LST-05) |
| 28 | CSV export (OU-scoped, audit) | ✅ | ✅ | Postoji; greške blanke listu (LST-09) |
| 29 | Realtime (`ticket.updated`, poruke, `notification.created`) | ✅ | ⚠️ | Tih reload; bez indikatora (INB-10) |
| 30 | In-app notifikacije | ✅ | ✅ | Zvono postoji; bez toasta (TST-02) |
| 31 | i18n BS default + EN fallback | ✅ | ✅ | I18-01 |
| 32 | „Request type“ i „due date“ pri kreiranju | ❌ | ❌ | NEW-11, D5 |

---

## 4) GAP registar

Ozbiljnost: **Visoko** = pogrešno ponašanje, sigurnosni/RAW propust ili velik učinak na korisnika; **Srednje** = funkcionalni ili UX propust; **Nisko** = kozmetika ili održavanje. Faza upućuje na `04-FAZNI-PLAN-TIKETI-UI.md`.

### 4.1 Grupni inbox

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **INB-01** | Visoko | Funkcija | Tabovi grupa se grade iz tiketa koji trenutno postoje, a ne iz članstva. Grupa bez tiketa nema tab, a redoslijed ide po cuid-u grupe. Nema taba „Moja grupa“. | `lib/tickets/inbox-view-tabs.ts` (`inboxGroupTabsFromInboxTickets`), `ticket-inbox-tabs.tsx` | `referenca-dizajn/pages/Inbox.tsx` (tabovi: Neusmjereni red, Moja grupa, sve grupe, s brojačima uključujući 0) | F1, F2 |
| **INB-02** | Visoko | Funkcija + podaci | Nema info trake aktivne grupe (naziv, opseg/OU, broj članova, auto-assign mod, avatari članova). Agent ne može pročitati svoje grupe: `GET /groups` je zaključan na ADMIN, a ruta „moje grupe“ ne postoji. Auto-assign strategija postoji samo na Service i globalno, ne na Group. | `groups.controller.ts` (`@RequireRoles(admin)`), `prisma/schema/catalog.prisma` (`Service.autoAssignStrategy`), `identity.prisma` (`Group` bez strategije), `resolve-effective-auto-assign-strategy.ts` | Inbox.tsx (info traka), NewTicket.tsx (kartica „Auto-assign po grupama“), odluka D2 | F1, F2 |
| **INB-03** | Visoko | UX / greške | Greška pri preuzimanju poziva `setErrorKey` i zamjenjuje cijeli inbox stanjem greške. Uspješno preuzimanje pokreće ne-tihi `load()` (skeleton bljesak). Nema poruke o uspjehu, a tiket se ne otvara. | `lib/tickets/use-ticket-list.ts` (`onClaim`), `ticket-inbox-panel.tsx` | Constitution §30 (greška kontekstualna, zadržati podatke) | F2, F7 |
| **INB-04** | Visoko | Podaci | Ime podnosioca u redu se čita iz direktorija (`requesterNames` iz `useDirectory`), a ne iz `ticket.requesterName` koje backend već šalje. Direktorij se puni preko admin-only rute, pa agent ne vidi podnosioca. Helper `ticketRequesterName` postoji, ali se ne koristi u inboxu. | `ticket-inbox-list.tsx` (`inboxRowMeta`), `pages/ticket-list-page.tsx`, `lib/directory/load-directory.ts` | Inbox.tsx (meta red: usluga · OJ · podnosilac · vrijeme) | F2 |
| **INB-05** | Srednje | UI | U redu nema SLA countdown čipa (Hourglass + „za 2h“ / „kasni“). Podatak postoji: `ticket.sla.resolutionDueAt`. Prikazuju se samo bedževi „kasni / u riziku“. | `ticket-inbox-list.tsx`, `services/tickets-api.ts` (`sla`) | Inbox.tsx (`timeUntil(t.resolveBy)`) | F2 |
| **INB-06** | Nisko | UI | Dugme „Preuzmi“ je uvijek primary. U referenci je primary samo za CRITICAL, inače outline. | `ticket-inbox-list.tsx` | Inbox.tsx | F2 |
| **INB-07** | Visoko | Backend / konkurentnost | `claimTicket` učitava zapis pa ga ažurira bez uslova na `assignedUserId`. `assertCanClaimTicket` to ne provjerava, a claimable statusi uključuju ASSIGNED i IN_PROGRESS. Posljedice: dvostruko preuzimanje istog tiketa (zadnji upis pobjeđuje) i tiho preuzimanje tuđeg tiketa preko API-ja. UI to skriva (`canShowClaimAction`), ali backend je izvor istine. | `tickets/assignment/claim-ticket.ts`, `assert-can-claim-ticket.ts`, `assignment.constants.ts` | RAW: „agenti unutar grupe preuzimaju tiket (assign to self)“ | F1 |
| **INB-08** | Srednje | Performanse | `listGroupInboxTickets` nema limit/paginaciju i provjerava confidential vidljivost tiket po tiketu u petlji (`await` u `for`). | `tickets/assignment/list-group-inbox-tickets.ts` | RAW NFR: odgovor < 300 ms, ≥ 1000 korisnika | F1 |
| **INB-09** | Srednje | Performanse | Sidebar brojači povlače cijelu `listTickets()` i inbox (cache 30 s) samo da izračunaju brojeve. Nema `count` endpointa; brojači se ne osvježavaju realtimeom. | `lib/tickets/use-sidebar-ticket-counts.ts`, `count-sidebar-ticket-badges.ts` | Shell.tsx (brojači uz stavke) | F1, F2 |
| **INB-10** | Nisko | UX | Nema diskretnog indikatora „realtime aktivan“. Realtime reload je tih (debounce 300 ms), bez oznake veze ni pilule „N novih tiketa“. | `ticket-list-page.tsx`, `lib/realtime/use-ticket-collection-realtime.ts` | Inbox.tsx („Osvježi · realtime aktivan“), Constitution §31 | F2 |

### 4.2 Svi tiketi (lista)

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **LST-01** | Visoko | Bug | Kolona „Jedinica“ uvijek prikazuje „—“: `TicketListPage` izračuna `originNames`, ali ih ne prosljeđuje u `TicketListTable`. | `pages/ticket-list-page.tsx`, `ticket-list-table.tsx` | Tickets.tsx (kolona Jedinica) | F3 |
| **LST-02** | Srednje | UI | Zadnja kolona je „Ažurirano“, a referenca ima „SLA resolution“ (rok/countdown, crveno kad kasni, oznaka „pauziran“). Ispod usluge nema „forma vN“. | `ticket-list-table.tsx` | Tickets.tsx (thead + ćelije) | F3 |
| **LST-03** | Visoko | Bug | Brojači tabova statusa se kvare: `load()` ovisi o `filters.status` i ponovo dohvata samo taj status, pa nakon odabira taba ostali tabovi padnu na 0, a „Svi“ postane brojač jednog statusa. Svaka promjena taba je puni reload sa skeletonom. | `lib/tickets/use-ticket-list.ts` (deps `filters.status`), `ticket-list-filters.tsx` (`ticketStatusTabItems(t, list.tickets, …)`) | Tickets.tsx (`countFor` nad cijelim skupom) | F1, F3 |
| **LST-04** | Srednje | Logika | Tab „SLA rizik“ i njegov brojač obuhvataju samo `isOverdue`, bez `isAtRisk`. | `ticket-list-page.tsx` (`riskCount`), `filter-tickets.ts` | Tickets.tsx (`RISK` ili `BREACHED`) | F3 |
| **LST-05** | Visoko | Arhitektura / performanse | Pretraga, filteri i paginacija rade na klijentu nad cijelim skupom. `GET /tickets` nema paginaciju, sort ni datumske filtere. Postoje tri implementacije filtera (klijent pretražuje i opis; list endpoint samo broj i naslov; export ima bogatije filtere: requesterId, unassigned, overdue, createdFrom/To). `includeArchived` se čita u `list-tickets.ts`, ali ga DTO ne dozvoljava. | `tickets/list-tickets.ts`, `dto/list-tickets-query.dto.ts`, `matches-list-search-query.ts`, `export/dto/export-tickets-query.dto.ts`, `lib/tickets/filter-tickets.ts` | RAW §4: indeksi i filteri (status, OU, servis, assignee, priority); NFR | F1, F3 |
| **LST-06** | Srednje | Funkcija | Nema kontrole sortiranja ni izbora kolona. Saved view uvijek upisuje `updatedAt desc`, a backend sortira po `createdAt`. RAW traži da saved view sadrži status, priority, service, assignee, date range, sort i kolone; UI nema filter po assigneeju ni datumski opseg. | `lib/tickets/saved-view-filters.ts`, `list-tickets.ts`, `ticket-list-filters.tsx` | RAW „Saved views“; Tickets.tsx („kolone“, „ažurirano ↓“) | F1, F3 |
| **LST-07** | Srednje | UI + funkcija | Panel sačuvanih pogleda razlikuje se od reference: stalno vidljiv input + checkbox + dugme umjesto jednog „Sačuvaj trenutni filter“; nema brojača ni sažetka upita; nema preimenovanja (backend PATCH postoji); brisanje bez potvrde; greške idu u page-level `setErrorKey` i prazne listu; nema poruke o uspjehu. | `ticket-saved-views-panel.tsx`, `services/tickets-saved-views-api.ts` | Tickets.tsx (SAVED_VIEWS blok) | F3, F7 |
| **LST-08** | Visoko | Funkcija / RAW | Bulk: checkboxovi i bar su prikazani svima (i requesteru), bez permission gate-a. Grupa/korisnik se unose ručno kao tekst (ID). Structured broadcast je lažiran: `whoAffected` = broj primalaca, `eta` = „n/a“, `whatHappened` = polje razloga. Merge uzima prvi označeni tiket kao parent bez izbora. Nema prikaza broja primalaca u potvrdi. | `ticket-bulk-bar.tsx`, `ticket-list-table.tsx`, `tickets/bulk/*` | RAW: structured broadcast (šta/koga/ETA/workaround), preview broja primalaca; Tickets.tsx (Dodijeli grupi…, agentu…, prioritet…) | F3 |
| **LST-09** | Srednje | UX / greške | Greške izvoza, sačuvanih pogleda i bulk akcija prolaze kroz `list.setErrorKey` i zamjenjuju tabelu stanjem greške. | `ticket-list-page.tsx`, `use-tickets-csv-export.ts`, `ticket-bulk-bar.tsx` | Constitution §30 | F3, F7 |
| **LST-10** | Nisko | UI | Red od 5 tabova (Inbox / Dodijeljeni / Nedodijeljeni / Zatraženi / Svi) nema pandan u referenci; reference to izražava kroz sidebar i saved views. | `ticket-workspace-nav.tsx` | Tickets.tsx, Shell.tsx; odluka D10 | F3 |

### 4.3 Detalji tiketa

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **DET-01** | Visoko | RAW | Podaci forme se ispisuju kao sirovi ključevi i `String(value)` (objekti postaju „[object Object]“). RAW traži render prema `formVersionRef` vezanom za tiket (labele, tipovi, opcije, uklonjena/preimenovana polja). | `ticket-form-data-view.tsx`, `services/service-catalog-api.ts` | RAW „Form versioning“: „detalji tiketa renderuju formu prema formVersionRef“ | F4 |
| **DET-02** | Visoko | Bug / UUID | `useTicketServiceName` pri grešci ili nepronalasku prikazuje `ticket.serviceId` (sirov ID) kao naziv usluge, i ponovo dohvata cijeli katalog pri svakoj promjeni objekta `ticket` (uključujući realtime). | `lib/tickets/use-ticket-service-name.ts` | Projektno pravilo: bez UUID-a u UI-u | F1, F4 |
| **DET-03** | Visoko | UX / greške | Jedan zajednički `actionError` za sve akcije. Prikazuje se kao red pod headerom i istovremeno u composeru (duplo), ne može se zatvoriti. Nijedna akcija (preuzmi, dodijeli, status, reopen, prilog, učesnik, tajmer, poruka) nema poruku o uspjehu. | `pages/ticket-detail-page.tsx`, `lib/tickets/use-ticket-detail.ts` (`runAction`), `ticket-message-composer.tsx` | Constitution §30, §32 | F4, F7 |
| **DET-04** | Srednje | i18n + UI | Prilozi prikazuju sirovi enum klasifikacije (`INTERNAL/CONFIDENTIAL/RESTRICTED`); ključ `tickets.detail.classification` nije korišten. Nema uploadera (migracija `ticket_attachment_uploader` postoji). Brisanje kroz `window.confirm`. RESTRICTED nema poseban ton. | `ticket-attachments-panel.tsx` | Reference: klasifikacija + uploader; RAW: audit ko je dodao/skinuo fajl | F4, F7 |
| **DET-05** | Srednje | UI | Učesnici: uklanjanje kroz `window.confirm` i sitno „×“; moguće je dodati samo WATCHER. | `ticket-participants-panel.tsx` | TicketDetail.tsx (Učesnici) | F4, F7 |
| **DET-06** | Srednje | RAW | Aktivan tajmer nema živi brojač (u listi prikazuje „—“). Anti-abuse iz RAW-a (auto-pauza neaktivnog taba > X min, sprječavanje beskonačnog tajmera) nije implementiran; matrica ga izričito isključuje. | `ticket-time-tracking-panel.tsx`, `.cursor/docs/matrices/time-tracking-anti-abuse/MATRIX.md` | RAW „Time tracking (Start/Stop), anti-abuse“; odluka D7 | F4 |
| **DET-07** | Visoko | RAW | Cross-OU forwarding ne postoji: nema akcije „Proslijedi“ s obaveznim razlogom; permission `ticket.forward.cross_ou` je definisan, ali se nigdje ne koristi. Na detalju nema ni pojedinačne promjene grupe. Ne postoji ni matrica `ticket-forwarding-cross-ou`. | `authorization/authorization.constants.ts` (jedina pojava), `ticket-detail-header-actions.tsx`, `.cursor/docs/matrices/` | RAW: „Prosljeđivanje/eskalacija“, „Cross-OU forwarding“; odluka D3 | F4b |
| **DET-08** | Srednje | RAW | Ticket templates / playbooks (agent-side) ne postoje ni u backendu ni u frontendu. Nema ni matrice `ticket-templates-playbooks`. | pretraga koda: 0 pogodaka | RAW „Ticket templates“; odluka D4 | F4c |
| **DET-09** | Nisko | UI | Header nema bell/watch dugme iz reference. Bedž „pauziran“ izvodi se iz statusa, a ne iz `sla.pausedAt`. Bedž „kanal“ iz reference nema domensko polje (odluka D6). | `ticket-detail-header.tsx` | TicketDetail.tsx (header) | F4 |
| **DET-10** | Nisko | UX | SLA panel računa preostalo vrijeme samo pri renderu (`new Date()`), bez periodičnog osvježavanja. | `ticket-sla-panel.tsx` | — | F4 |
| **DET-11** | Srednje | Robusnost | Tiho gutanje grešaka: `load-ticket-detail.ts` postavlja `…Visible=false` na bilo koju grešku (500 izgleda kao „nemate pravo“); isto `use-ticket-context.ts` i `use-ticket-approvals.ts`. | `lib/tickets/load-ticket-detail.ts`, `use-ticket-context.ts`, `use-ticket-approvals.ts` | Constitution §30 | F4 |
| **DET-12** | Srednje | Održavanje | Prijelazi statusa postoje kao kopija u frontendu (`allowedTicketStatusTransitions`) uz backend `allowed` akcije; header i `canWaitForUser` koriste kopiju. | `lib/tickets/ticket-constants.ts`, `ticket-actions.ts`, `pages/ticket-detail-page.tsx` | RAW: state machine guards (backend izvor istine) | F4 |
| **DET-13** | Nisko | UI | Confidential banner nema dugme break-glass ni podatak o broju ovlaštenih (referenca ima). Break-glass postoji kao blokirajući panel kad pristup nije odobren. | `ticket-confidential-banner.tsx`, `ticket-detail-blocking-state.tsx` | TicketDetail.tsx (Povjerljivost) | F4 |
| **DET-14** | Visoko | RAW | PII/secret upozorenje se prikazuje samo kad odgovor PATCH-a sadrži `redactionWarnings`. `GET /tickets/:id` ih ne vraća, a upozorenja uz poruke (`tickets-collaboration-api.ts`) se nigdje ne prikazuju. | `pages/ticket-detail-page.tsx:169`, `services/tickets-collaboration-api.ts`, `tickets.service.ts` | RAW „Redaction: warn-only (UI upozorenje + audit)“ | F4, F7 |
| **DET-15** | Srednje | RAW | Nema UI-a za override prioriteta/uticaja/hitnosti na jednom tiketu (samo bulk). Backend `UpdateTicketInput` podržava impact/urgency. | `ticket-detail-header-actions.tsx`, `tickets.types.ts` | RAW: „agent/admin može override priority, promjena auditovana“ | F4 |

### 4.4 Novi tiket

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **NEW-01** | Visoko | RAW | Odgovor na kreiranje nosi `redactionWarnings` i `duplicateWarnings`, ali forma odmah navigira na detalj i upozorenja se gube. Nema ni upozorenja u toku kucanja. | `create-ticket-form.tsx` (`submitTicket`), `tickets/run-tickets-service-create.ts` | RAW „warn-only (UI upozorenje + audit)“, guardrails | F5, F7 |
| **NEW-02** | Visoko | Funkcija | U koraku „Detalji“ nema priloga (dropzone). Prilozi se mogu dodati tek nakon kreiranja. | `create-ticket-fields.tsx` | NewTicket.tsx (Prilozi), Constitution §13 korak 6 | F5 |
| **NEW-03** | Srednje | UI + RAW | Izbor usluge: nema kategorija (chips), opisa, oznake verzije forme ni lifecycle bedža. Dostupnost se prikazuje kao sirov enum. Frontend tip `ServiceAvailability` nema `DOWN` (backend enum i RAW imaju), pa `availabilityTone[DOWN]` nije definisan. | `create-ticket-service-picker.tsx`, `services/service-catalog-api.ts:12`, `prisma/schema/enums.prisma` | NewTicket.tsx (kategorije, opis, AVAILABILITY_META, info traka) | F5 |
| **NEW-04** | Srednje | Logika | Broj koraka odobrenja je hardkodiran (`count: 1`), a RAW dozvoljava 1–3. | `create-ticket-service-picker.tsx`, `create-ticket-review-view.tsx` | NewTicket.tsx (`svc.approvals`) | F1, F5 |
| **NEW-05** | Visoko | Funkcija + backend | Pregled prikazuje statično „routing pending“. Referenca prikazuje ishod, grupu, dubinu fallbacka i putanju, plus kartice „Trenutna rezolucija“ i „Auto-assign po grupama“. `GET /routing/resolve` je admin-only, pa requester nema izvor podataka (potreban requester-safe preview). | `create-ticket-review-view.tsx`, `create-ticket-side-panel.tsx`, `routing.controller.ts` | NewTicket.tsx (korak 4 + bočni panel) | F1, F5 |
| **NEW-06** | Srednje | UI | Nema ekrana uspjeha (broj tiketa, routing ishod, prioritet, SLA profil, verzija forme; „Otvori tiket“ / „Nazad“). Nakon slanja slijedi direktan redirect bez potvrde. | `create-ticket-form.tsx` | NewTicket.tsx (`submitted`) | F5, F7 |
| **NEW-07** | Srednje | UX / robusnost | KB intercept: greška presretača zaustavlja tok bez opcije „nastavi bez prijedloga“; „pomoglo“ se bilježi samo uz prvi članak (`suggestions[0]`); poziv `resolveKnowledgeIntercept(...).finally(...)` nema `catch`, pa neuspjeh prođe tiho, a UI kaže „pomoglo“. | `create-ticket-form.tsx`, `knowledge-intercept-panel.tsx` | RAW: KB feedback per user i članak; Constitution §13 | F5 |
| **NEW-08** | Srednje | UX / greške | Greške servera se prikazuju kao veliko `TicketErrorState` (EmptyState) unutar forme; nema mapiranja na polja niti sažetka. | `create-ticket-draft-view.tsx`, `create-ticket-review-view.tsx` | Constitution §30 | F5, F7 |
| **NEW-09** | Srednje | RAW | Ručno označavanje tiketa kao CONFIDENTIAL pri kreiranju nije moguće u UI-u (backend DTO podržava `isConfidential`; permission gate nije definisan). | `build-create-ticket-input.ts`, `dto/create-ticket.dto.ts`, `resolve-create-confidential-flag.ts` | RAW „manualno ili po servisu“; odluka D8 | F5 |
| **NEW-10** | Nisko | UX | Nacrt se gubi pri osvježavanju ili napuštanju stranice (nema autosave niti upozorenja). | `create-ticket-form.tsx` | — | F5 |
| **NEW-11** | Nisko | RAW | RAW navodi „request type“ i „due date“ pri kreiranju. U šemi ne postoje (`dueDate`, `requestType`), a rok pokriva SLA. | `prisma/schema/*.prisma` (pretraga: 0 pogodaka) | RAW „Ticketing: service → request type → due date → opis“; odluka D5 | F0 |

### 4.5 Podaci i ugovor s backendom

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **DAT-01** | Visoko | Arhitektura / performanse | `TicketResponse` nema `originUnitName`/`originUnitPath` ni `serviceName`. Zbog toga lista i detalji zovu `useDirectory()` → `loadDirectory()`, koji šalje jedan zahtjev po OJ na `GET /organizational-units/:id/users` (admin-only). Za USER/AGENT to su desetine 403 odgovora koje kod guta. | `lib/directory/load-directory.ts`, `pages/ticket-list-page.tsx`, `pages/ticket-detail-page.tsx`, `organizational-units.controller.ts`, `tickets/load-ticket-display-labels.ts` | Projektno pravilo: UUID → naziv | F1 |
| **DAT-02** | Srednje | Backend | Nema `GET /groups/mine` (id, naziv, OU, broj članova, efektivni auto-assign) za agente; sve rute `groups` su admin-only. | `groups.controller.ts` | Inbox.tsx (info traka) | F1 |

### 4.6 Dizajn sistem

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **DSG-01** | Srednje | UI (provjeriti vizuelno) | `Button` forsira `[&_svg]:size-[15px]` na svim ikonama, pa se eksplicitne veličine 12–14 px iz reference (`size={13}`) ignorišu. Sistemsko odstupanje na svim dugmadima. | `components/ui/button.tsx` | `referenca-dizajn/components/ui.tsx` (Button bez forsiranja) | F6 |
| **DSG-02** | Nisko | UI (provjeriti vizuelno) | Referenca je Tailwind 4, frontend 3.4.19. Opacity klase izvan skale (`/12`) nisu generisane osim ako su u `theme.extend.opacity` (dodani samo 6 i 8). Nađeno 9 pojava (`bg-danger/12`, `bg-success/12`, `bg-primary/12`), među njima `ticket-inbox-tabs.tsx:71`. Ranije 4.x-only razmaci (`size-6.5`, `h-8.5`) su već prevedeni (0 pojava). | `tailwind.config.ts`, `ticket-inbox-tabs.tsx`, `knowledge-article-list.tsx`, `routing-resolution-result.tsx`, `users-summary-row.tsx` | — | F6 |

### 4.7 i18n

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **I18-01** | Srednje | i18n | Paritet BS/EN je potpun (2089/2089; `tickets.*` 429/429), a u ticket komponentama nema hardkodiranog JSX teksta. Preostalo: sirovi enumi u UI-u (klasifikacija priloga, dostupnost usluge), 53 potencijalno mrtva `tickets.*` ključa, i backend-generisani tekstovi (email šabloni, CSV zaglavlja) nisu provjereni. | `i18n/locales/{bs,en}/common.json`, skripta u §6 | RAW „i18n BS default + EN fallback“ | F4, F5, F8 |

### 4.8 Povratne poruke / Toast

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **TST-01** | Visoko | Zahtjev | Toast sistem ne postoji. Povratne informacije idu kroz 58 pojava `setErrorKey/setActionError/onError` u modulima tiketa, inline `<p class=text-danger>` i 4× `window.confirm` (2 u tiketima: prilozi, učesnici; 2 u korisnicima). Uspjeh se nigdje ne potvrđuje. | grep u `components/tickets`, `pages/ticket-*.tsx`, `lib/tickets`; `components/users/user-admin-actions.tsx` | Zahtjev naručioca; Constitution §31/§32 (odluka D1) | F7 |
| **TST-02** | Srednje | Realtime | `notification.created` ažurira samo zvono i tiho osvježava listu. Nema toasta za važne/kritične notifikacije (npr. SLA breach, odobrenje na čekanju, novi CRITICAL tiket u grupi). | `lib/notifications/use-inbox-notifications.ts`, `lib/realtime/use-ticket-collection-realtime.ts` | Constitution §32 (hijerarhija) | F7 |

### 4.9 Održavanje koda

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **HYG-01** | Nisko | Kod | Fajlovi u opsegu iznad cilja od 150 linija: `ticket-detail-page.tsx` 260, `use-ticket-list.ts` 221, `ticket-list-page.tsx` 199, `create-ticket-form.tsx` 199, `use-ticket-detail.ts` 198, `ticket-sla-panel.tsx` 194, `ticket-message-composer.tsx` 188, `ticket-list-table.tsx` 183, `ticket-detail-header.tsx` 182, `knowledge-intercept-panel.tsx` 178, `ticket-inbox-list.tsx` 176. | `wc -l` | RAW §10 Code hygiene (100–150 linija) | F2–F5 (pri dodiru) |

### 4.10 Testovi

| ID | Oz. | Tip | Nalaz | Dokaz u kodu | Referenca / RAW | Faza |
|---|---|---|---|---|---|---|
| **QA-01** | Srednje | Testovi | E2E ima 9 specova za kritične RAW tokove (kreiranje, routing/fallback, odobrenja, realtime/queue, bulk broadcast, confidential, SLA, close codes/CSAT, config ops). Po nazivima specova (sadržaj nije čitan) ne vidim pokrivenost za preuzimanje iz grupnog inboxa, filtere/saved views/paginaciju liste, akcije na detalju niti vizuelnu usporedbu s referencom; nije provjereno voze li specovi UI ili API. RBAC test suite u CI je otvorena stavka u `TASKS.md`. | `e2e/tests/01…09`, `TASKS.md` | RAW §10/§12 (E2E kritični tokovi, RBAC suite) | F8 |

---

## 5) Paritet dizajna s `referenca-dizajn/` — kontrolne liste po ekranu

Design tokeni (`tailwind.config.ts`, `index.css`) i primitivi (`Button`, `Badge`, `Card`, `PageHeader`, `UnderlineTabs`, `EmptyState`, kontrole) su gotovo 1:1 s referencom; razlike su u kompoziciji ekrana i u `DSG-01/02`. Oznake: ✅ identično · ⚠️ razlika · ❌ nedostaje · ◻︎ nije pregledano.

### 5.1 Grupni inbox (`Inbox.tsx`)
| Element reference | Status | GAP |
|---|:-:|---|
| PageHeader (crumbs, naslov, podnaslov) | ✅ | — |
| Dugme „Osvježi · realtime aktivan“ | ⚠️ | INB-10 |
| Tabovi (Neusmjereni red, Moja grupa, grupe, brojači) | ⚠️ | INB-01 |
| Info traka neusmjerenog reda | ✅ | (isti stilovi; `bg-danger/6` je u skali) |
| Info traka aktivne grupe (članovi, opseg, auto-assign, avatari) | ❌ | INB-02 |
| Red: ikona prioriteta, ID + naslov | ✅ | — |
| Red: meta (usluga · OJ · podnosilac · vrijeme) | ⚠️ | INB-04 |
| Red: status + prioritet bedž | ✅ | (dodatno: overdue/at-risk) |
| Red: SLA čip s hourglass | ❌ | INB-05 |
| Dugme „Preuzmi“ (primary samo za CRITICAL) | ⚠️ | INB-06 |
| Prazna stanja, footer napomena | ✅ | — |

### 5.2 Svi tiketi (`Tickets.tsx`)
| Element reference | Status | GAP |
|---|:-:|---|
| Header + „CSV export (audited)“ + „Novi tiket“ | ✅ | (tekstove provjeriti u F6) |
| Panel „Sačuvani pogledi“ 220 px | ⚠️ | LST-07 |
| Tabovi statusa + „SLA rizik“ s tačkom | ⚠️ | LST-03, LST-04 |
| Traka filtera: pretraga + čipovi prioriteta | ✅ | (dodatno: select usluge) |
| „kolone“ i sort indikator | ❌ | LST-06 |
| Bulk traka | ⚠️ | LST-08 |
| Tabela: Tiket · Usluga (+forma vN) · Jedinica · Status · Prioritet · Grupa/Agent · SLA resolution | ⚠️ | LST-01, LST-02 |
| Dodatno u implementaciji: red od 5 workspace tabova | ⚠️ | LST-10 |
| Footer „Prikazano X od Y“ + audit oznaka | ✅ | — |

### 5.3 Detalji tiketa (`TicketDetail.tsx`)
| Element reference | Status | GAP |
|---|:-:|---|
| Breadcrumb traka | ✅ | — |
| Header: ID, status, prioritet, „SLA pauziran“, „Povjerljiv“, „kanal“ | ⚠️ | DET-09 |
| Akcije: Preuzmi, Dodijeli…, Podijeli, Status ▾, bell | ⚠️ | DET-09, DET-07, DET-15 |
| Confidential banner + break-glass dugme | ⚠️ | DET-13 |
| Tabovi Razgovor / Aktivnost / Vrijeme / Prilozi | ✅ | (Vrijeme/Prilozi po permisiji) |
| Poruke, sistemski događaji, composer (javno/interno, Ctrl+Enter, „Čeka korisnika“) | ✅ | — |
| Aktivnost (audit) s ikonama po vrsti | ✅ | — |
| Vrijeme rada | ⚠️ | DET-06 |
| Prilozi | ⚠️ | DET-04 |
| SLA tajmeri | ✅ | DET-10 |
| Odobrenja (timeline) | ◻︎ | komponenta postoji |
| Svojstva | ✅ | — |
| Učesnici | ⚠️ | DET-05 |
| CSAT | ◻︎ | komponenta postoji |
| Podaci forme (nije u referenci, traži RAW) | ⚠️ | DET-01 |

### 5.4 Novi tiket (`NewTicket.tsx`)
| Element reference | Status | GAP |
|---|:-:|---|
| PageHeader + stepper (Usluga → Detalji → Baza znanja → Pregled) | ✅ | — |
| Korak 1: kategorije, kartice usluga, info traka dostupnosti | ⚠️ | NEW-03 |
| Korak 2: naslov, OU, prilozi, polja forme, impact/urgency + izračunat prioritet | ⚠️ | NEW-02 (◻︎ impact/urgency segmenti nisu pregledani) |
| Korak 3: KB intercept (obavezan) | ◻︎ | NEW-07 (panel nije pregledan u detalje) |
| Korak 4: pregled + routing rezolucija | ⚠️ | NEW-05, NEW-04 |
| Ekran uspjeha | ❌ | NEW-06 |
| Bočni panel: „Šta se dešava…“, „Trenutna rezolucija“, „Auto-assign po grupama“ | ⚠️ | NEW-05 |

---

## 6) i18n

- **Paritet:** 2089 ključeva u `bs/common.json` i `en/common.json`, razlika 0 u oba smjera; `tickets.*` 429 / 429.
- **Korišteni ključevi:** svi ključevi u kodu (`tickets.*`, `notifications.*`, `shell.*`, `navigation.*`) postoje u rječniku (jedini pogodak `tickets.csv` je prefiks naziva fajla, ne ključ).
- **Hardkodirani tekst:** skeniranje JSX teksta i atributa (`placeholder`, `title`, `aria-label`) u ticket komponentama, `pages/` i `components/ui` — 0 pogodaka.
- **Curenje sirovih vrijednosti:** klasifikacija priloga (DET-04), dostupnost usluge u pickeru (NEW-03), `serviceId` kao naziv (DET-02).
- **Mrtvi ključevi:** 53 `tickets.*` ključa bez pronađene upotrebe (npr. `tickets.messageType.*`, `tickets.detail.classification`); dio ih je vjerovatno rezerviran za dinamičke ključeve i treba ih provjeriti ručno prije brisanja.
- **Nije provjereno:** backend-generisani tekstovi (email šabloni, CSV zaglavlja u `export/`), kvalitet prevoda (samo postojanje ključeva), `notifications.*` naslovi na EN.
- **Pravilo za novi rad:** svaki novi ključ ide u oba fajla u istom commitu; toast poruke u namespace `toast.*` (vidi §7).

---

## 7) Toast: inventar i katalog događaja

### 7.1 Trenutno stanje
- Nema toast biblioteke ni komponente u `frontend/`.
- Povratne informacije: (a) page-level `errorKey` koji zamjenjuje sadržaj (`TicketErrorState`), (b) inline `<p>` s `text-danger`/`text-warning`, (c) `window.confirm` (prilozi, učesnici u tiketima; brisanje korisnika u administraciji).
- Uspjeh: nikad potvrđen.
- Notifikacije: zvono + tih reload liste.

### 7.2 Sukob s Constitution i predložena politika (odluka D1)
Constitution §31/§32 i `.cursor/rules/frontend-ui-ux.mdc` kažu: bez toasta za trivijalne akcije i za svaku realtime promjenu. Zahtjev naručioca je toast za sve poruke, notifikacije i alerte. Predlog koji ispunjava oba:

1. **Toast za ishod svake korisnikove akcije** (uspjeh, greška, upozorenje) i za alerte i notifikacije. Time je zahtjev „za sve“ ispunjen.
2. **Realtime promjene podataka** (lista se osvježila, tuđa poruka na otvorenom tiketu) **ne prave toast**; koriste indikator „uživo“ i pilulu „N novih“. Izuzetak su notifikacije nivoa Important/Critical (`notification.created`).
3. **Greške koje blokiraju cijeli ekran pri prvom učitavanju** ostaju ErrorState s „Pokušaj ponovo“ (Constitution §30). Sve ostale greške idu u toast, bez zamjene sadržaja.
4. **Potvrde destruktivnih akcija** idu kroz `ConfirmDialog` (Radix Dialog, već u projektu), ne `window.confirm`; rezultat ide u toast.
5. Nivoi: `success` 4 s, `info` 5 s, `warning` 7 s, `error` 8 s (uz ručno zatvaranje, s `requestId`), `critical` ostaje dok se ne zatvori. Najviše 3 vidljiva, spajanje istih poruka (`dedupeKey`), pauza na hover/focus, `role=status`/`alert`, poštovanje `prefers-reduced-motion`. Stil: tokeni `elevated`/`border`, bez glassmorphisma i gradijenata.

Ako se D1 odbaci u korist „toast za apsolutno svaku promjenu“, treba izmijeniti Constitution §31/§32; plan to obuhvata u F0.

### 7.3 Katalog događaja (šta postaje toast)
| Ekran | Događaj | Nivo | Napomena |
|---|---|---|---|
| Inbox | Preuzet tiket | success | Akcija „Otvori“ |
| Inbox | Tiket već preuzet / nije preuzimljiv / nema pravo | warning | Zamjenjuje `errorKey` koji briše listu |
| Inbox | Novi CRITICAL tiket u mojoj grupi | critical | Jedan spojen toast; ostali novi tiketi samo pilula |
| Lista | CSV izvoz: pokrenut / završen / prevelik / greška | info / success / warning / error | `EXPORT_TOO_LARGE` → warning |
| Lista | Saved view: sačuvan / izmijenjen / obrisan / greška | success / error | Brisanje kroz ConfirmDialog |
| Lista | Bulk akcija: uspjeh, djelimičan uspjeh (N od M), greška, broadcast poslan | success / warning / error | Prikaz broja primalaca |
| Detalji | Preuzet, dodijeljen, status promijenjen, reopen (novi tiket → akcija „Otvori“) | success | — |
| Detalji | Poruka nije poslana | error | Akcija „Pokušaj ponovo“, tekst ostaje |
| Detalji | Prilog otpremljen / obrisan / odbijen (veličina, tip, limit) | success / error | Razlog iz mapiranog koda |
| Detalji | Učesnik dodan / uklonjen | success | — |
| Detalji | Tajmer pokrenut / zaustavljen / `OVERLAPPING_TIMER` | success / warning | — |
| Detalji | Odobrenje: odobreno / odbijeno | success | — |
| Detalji | CSAT poslan; split završen; break-glass odobren/odbijen; remote zahtjev poslan / rate limit | success / warning | — |
| Detalji | PII/tajna u tekstu (warn-only) | warning | Uz inline oznaku u composeru |
| Detalji | SLA prešao u rizik/breach na otvorenom tiketu | warning / critical | Iz `notification.created`, ne iz pollinga |
| Novi tiket | Korak: greške validacije (sažetak + inline) | warning | — |
| Novi tiket | Tiket kreiran | success | Akcija „Otvori tiket“ |
| Novi tiket | Mogući duplikat / PII upozorenje | warning | Uz „Kreiraj ipak“ inline |
| Novi tiket | KB „pomoglo“ zabilježeno (ili neuspjeh bilježenja) | success / error | — |
| Globalno | Sesija istekla, veza izgubljena / uspostavljena | critical / info | — |
| Globalno | `notification.created` (Important/Critical) | info / critical | Klik vodi na tiket |

---

## 8) Prijedlozi nadogradnji (izvan minimalnog GAP-a)

1. **Serverska paginacija, sort i filteri** jednog zajedničkog upit-DTO-a za `list`, `export` i `saved views`; confidential vidljivost kao SQL predikat umjesto petlje po tiketu.
2. **`GET /tickets/counts`** za sidebar i tabove (jedan lagan upit; realtime invalidacija).
3. **Denormalizovani nazivi** (`originUnitName/Path`, `serviceName`) u `TicketResponse`; ukidanje `loadDirectory()` iz lista i detalja.
4. **Atomično preuzimanje** (`updateMany … where assignedUserId is null`) i zaseban, auditovani „preuzmi od kolege“ s razlogom.
5. **Pilula „N novih tiketa“** i indikator „uživo“ umjesto automatskog reload-a liste; sačuvana pozicija skrola.
6. **Tipkovnička navigacija** liste i inboxa (j/k, Enter, `c` za preuzimanje, `x` za označavanje, shift-klik raspon).
7. **Živi SLA countdown** (tick 30 s) u inboxu, listi i detalju; sortiranje inboxa po najbližem SLA roku.
8. **„Preuzmi i otvori“** u inboxu i „sljedeći tiket u redu“ na detalju.
9. **Nacrt tiketa** u `sessionStorage` (autosave + upozorenje pri napuštanju).
10. **Živa provjera PII/tajni** u naslovu, opisu i composeru (isti obrasci kao backend `detect-sensitive-content.ts`).
11. **Ekran uspjeha** s ishodom routinga i SLA profilom; „Kreiraj sličan tiket“.
12. **Vizuelni regresioni testovi** (Playwright screenshoti 4 ekrana × 2 viewporta prema referenci) u CI.
13. **Lint pravila:** zabrana `window.confirm/alert`, zabrana prikaza `*Id` polja u JSX-u, zabrana `setErrorKey` za greške akcija nakon F7.
14. **Grupni auto-assign** (`Group.autoAssignStrategy` s prioritetom grupa > servis > globalno) ako se D2 prihvati.

---

## 9) Otvorene odluke (potrebne prije/za vrijeme F0)

| ID | Pitanje | Predloženi default |
|---|---|---|
| D1 | Politika toasta (§7.2) | Toast za ishode akcija, alerte i važne notifikacije; realtime podaci bez toasta |
| D2 | Auto-assign po grupi (referenca) ili po servisu (trenutni model)? | Dodati opcioni `Group.autoAssignStrategy` s prioritetom grupa > servis > globalno |
| D3 | Cross-OU forwarding u ovoj isporuci? (RAW IN, permission postoji) | Da, kao F4b: akcija „Proslijedi“, obavezan razlog, audit, matrica |
| D4 | Ticket templates/playbooks u ovoj isporuci? (RAW „opcionalno, light“) | Odgoditi na F4c nakon F4b; lagan model: šablon odgovora po servisu |
| D5 | „Request type“ i „due date“ (RAW) — implementirati ili dokumentovati kao zamijenjeno SLA-om? | Dokumentovati odstupanje; SLA `resolutionDueAt` je rok |
| D6 | Bedž „kanal“ iz reference (nema polja) | Izostaviti; ili dodati `source` (WEB/EDGE) ako treba Edge analitika |
| D7 | Anti-abuse tajmera (auto-pauza neaktivnog taba, max trajanje) | Uključiti u F4 (klijentski heartbeat + serverski maksimum) |
| D8 | Ko smije ručno označiti tiket kao CONFIDENTIAL pri kreiranju | Agent/Admin uz permission; USER ne |
| D9 | Ruta inboxa: `/tickets?view=inbox` ili zasebno `/inbox` kao u referenci | Zadržati query rutu, uskladiti sidebar i breadcrumb |
| D10 | Red od 5 workspace tabova na listi (nije u referenci) | Ukloniti; „Dodijeljeni/Nedodijeljeni/Zatraženi“ postaju saved views i sidebar |

---

## 10) Šta nije provjereno

- Ponašanje aplikacije u pregledniku, vizuelni razmaci, boje i responsive (sve „provjeriti vizuelno“ stavke).
- Komponente: `knowledge-intercept-panel.tsx`, `create-ticket-severity-fields.tsx`, `service-form-fields.tsx`, `ticket-approvals-panel.tsx`, `ticket-csat-panel.tsx`, `ticket-split-panel.tsx` (samo dijelovi), `ticket-activity-list.tsx`.
- Backend: `create-ticket.ts` (validacije, routing, auto-assign), `apply-ticket-auto-assignment.ts`, `is-confidential-ticket-visible` cijena, ko sve vidi UNROUTED.
- Prijedlog: ova mjesta se zatvaraju na početku F2 (inbox), F4 (detalji) i F5 (novi tiket) prije implementacije.
