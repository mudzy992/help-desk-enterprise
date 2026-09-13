# Frontend ↔ referenca-dizajn alignment plan

Status: **PLAN CREATED** (nema implementacije u ovom koraku).
Datum audita: 2026-09-13.
Scope audita: frontend do kraja Faze 7 (Socket.IO ticket/chat, notifications, settings) + kanonski `referenca-dizajn/`.

---

## 1. Executive summary

Trenutni `frontend/` već koristi isti dark-first jezik kao referenca: `background → surface → elevated`, Inter, Lucide, sidebar 248px, topbar h-14, `PageHeader`, `Badge` tone mape, `EmptyState`, `page-in`, `⌘K`, `N`, notifikacijski panel 380px, Ticket Detail grid `1fr / 330px`.

To **nije** generički redesign. Problem je **parity gap**:

- Shared primitive-i i shell su ~70% usklađeni, ali token imena, button varijante, chartovi i semantičke mape nisu kanonski.
- Navigacijska IA odstupa od reference (nema Izvještaja, nema Grupnog inboxa kao nav item, Administracija je raspršena).
- Dashboard i Reports su vizuelno najdalje (nema `Donut` / `GroupedBars` / `HBars`).
- Ticket Detail je **najbliži** referenci — **ne raditi rewrite**. Treba precizan delta polish.
- Usluge, Baza znanja i Routing imaju stvarni API, ali UI je admin-tabela / inline forma, ne reference layout.
- SLA admin CRUD postoji; SLA tajmeri na Ticket Detail **ne mogu** biti reference-identični dok `TicketResponse` ne izloži postojeći `TicketSlaState`.
- Reports pack/export backend **ne postoji** (Faza 8). FE-4 smije aggregirati postojeće ticket podatke; ne smije kopirati mock brojeve.

Pravilo izvedbe: **postojeća API/state integracija ostaje**; mijenja se vizuelni i interakcijski sloj kroz shared primitive-e.

---

## 2. Audit scope

Pregledano (repo, nije nagađanje):

| Sloj | Šta |
| --- | --- |
| Referenca | `referenca-dizajn/src/{App,nav,index.css,lib/core}.ts(x)`, `components/{Shell,ui,charts}.tsx`, pages: Dashboard, Tickets, TicketDetail, NewTicket, Inbox, Catalog, Knowledge, Routing, Sla, Admin, Reports |
| Tokeni | `.cursor/docs/theme.md`, `.cursor/docs/theme-source.md` |
| UX | `Master UI-UX Design Constitution.md` |
| Current FE | `frontend/src/{app,layouts,pages,components,lib,services,i18n}` |
| Domain | `.cursor/docs/00-mvp-scope.md`, `02-routing-logic.md`, matrice: catalog, onboarding, KB, routing, SLA, overdue, websocket, ticketing, bulk, participants |
| Backend ugovor (samo za “šta UI smije raditi”) | routing/sla/services/kb/tickets kontroleri |

Nije rađeno: vizuelni screenshot/browser pass, runtime protiv live API-ja. Gdje API polje nije u DTO-u, označeno je **OPEN BLOCKER** ili **UNVERIFIED**.

---

## 3. Source hierarchy

1. **Tematika:** `.cursor/docs/theme-source.md` pobjeđuje.
2. **UX / interakcija:** `Master UI-UX Design Constitution.md` pobjeđuje.
3. **Dokaz izgleda:** `referenca-dizajn/` je kanonski.
4. **Implementacijski katalog tokena:** `.cursor/docs/theme.md`.
5. **Funkcionalnosti:** domain/matrix + postojeći `frontend/src/services/*`. Nema izmišljenih CRUD-ova.

Terminologija (Constitution §11): tiket, usluga, katalog usluga, jedinica porijekla, handler grupa, neusmjereni red, baza znanja, usmjeravanje. Current nav label `Usluge` ostaje; vizuelni target je reference “Katalog usluga”.

---

## 4. Current frontend architecture

Stack: React Vite + React Router + Tailwind **v3** (`tailwind.config.ts`) + i18n BS/EN + custom `session-store.ts` (localStorage, nije Zustand) + Socket.IO client + Vitest. `zustand` je u `package.json` ali **nema importa** u `frontend/src`.

Rute (`frontend/src/app/router.tsx`):

| Ruta | Page |
| --- | --- |
| `/` | `dashboard-page.tsx` |
| `/tickets`, `/tickets/new`, `/tickets/:ticketId` | list / create / detail |
| `/services` | katalog |
| `/knowledge-base` | KB |
| `/routing` | usmjeravanje |
| `/sla` | SLA admin |
| `/users`, `/organizational-units`, `/settings` | raspršena administracija |
| `/install` | install wizard (van ovog plana) |
| **nema** `/reports`, **nema** `/inbox`, **nema** `/admin` | — |

Shell: `layouts/application-shell.tsx` već radi `max-w-[1400px] px-4 py-6 lg:px-8` + `page-in` na **svim** stranicama. Referenca to radi **po page**. Current pristup zadržati (jedan wrap).

Shared UI (`frontend/src/components/ui/`): `badge`, `button`, `card`, `page-header`, `tabs` (UnderlineTabs), `empty-state`, `stat-card`, `avatar`, `switch`, `kbd`, `skeleton`, `sheet`, `dropdown-menu`, `control.ts` (klase, ne komponente).

Nedostaje u odnosu na `referenca-dizajn/src/components/ui.tsx` + `charts.tsx`: `MetaBadge`, `Progress`, `Field`, `Input`, `Select`, `Textarea`, `Toggle` (ima `Switch` — KEEP), `Donut`, `GroupedBars`, `HBars`. CSS nema `.bar-grow` / `.draw-ring`.

Realtime:

- `HelpdeskSocketHost` — `session.invalidated`, `settings.updated`
- `useTicketRealtime` — samo Ticket Detail (`ticket.message.created`, `ticket.updated`, room join)
- `useInboxNotifications` — `notification.*`
- Ticket list / dashboard **ne** slušaju `ticket.updated`

---

## 5. Reference architecture

Jedan `App.tsx` + `nav.ts` Route union. Shell (`referenca-dizajn/src/components/Shell.tsx`):

- Sidebar 248px, brand h-14, CTA “Novi tiket” + `Kbd N`
- Nav sekcije: Pregled · Tiketi · Usluge i znanje · Administracija
- Nav item: h-8.5, lijeva crtica 2.5px, ikona `#7FA8F5` kad je aktivan, količinski bedževi
- Topbar: search max-w-md + ⌘K, system chip `dot-pulse`, zvonce + panel 380px, user menu
- Global `N` za novi tiket
- Page: `.page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8` (Ticket Detail `max-w-[1440px]`)

Primitive-i: `Badge`/`MetaBadge`, `Button` (`primary|outline|ghost|danger|subtle`), `Card`/`CardHeader`, `Avatar` (6 hue), `Field`/`Input`/`Select`/`Textarea`, `Tabs`, `Progress`, `Toggle`, `PageHeader`, `StatCard` (delta), `EmptyState`, `Kbd`.

Chartovi: ručni SVG, track `#1B2436`, druga serija `#3B4A6B`.

Domena u `core.ts`: `STATUS_META`, `PRIORITY_META`, `SLA_META`, `OUTCOME_META`, `LIFECYCLE_META`, `AVAILABILITY_META`. Current domain ima dodatne statuse kojih referenca nema: `UNROUTED`, `PENDING_APPROVAL`, `ARCHIVED` — **zadržati** (RAW), mapirati tone (danger / warning / neutral).

Availability enum: referenca `AVAILABLE` / `DEGRADED` / `MAINTENANCE`; current API `OPERATIONAL` / `DEGRADED` / `MAINTENANCE`. Label “Dostupno” na `OPERATIONAL` — ne mijenjati backend enum.

---

## 6. Global delta findings

| Tema | Current | Reference | Klasa | Akcija |
| --- | --- | --- | --- | --- |
| Token imena | `text-foreground`, `text-muted-foreground` | `text-text`, `text-muted` | P2 | Dual alias već postoji u `tailwind.config.ts` (`text` + `foreground`). Konsolidirati usage na reference imena u shared primitive-ima; ne uvoditi nove hexove. |
| Button | `default` / `destructive` / `secondary` | `primary` / `danger` / `subtle` | P1 | Alias varijante na postojećem `button.tsx` (`primary`=`default`, `danger`=`destructive`, `subtle`=`secondary`). Ne praviti drugi design system. |
| Chartovi | nema fajla | `charts.tsx` Donut/GroupedBars/HBars | P0 | Dodati `frontend/src/components/ui/charts.tsx` (ili `components/charts/`) kopijom kanonskog ponašanja; podaci samo iz API aggregacija. |
| Motion | `page-in`, `pop-in`, `fade-in`, `dot-pulse` | + `bar-grow`, `draw-ring` | P1 | Dopuniti `frontend/src/index.css`. |
| Semantičke mape | raspršene (`ticket-badges.tsx`) | `core.ts` META | P1 | Jedan `frontend/src/lib/theme/semantic-meta.ts` (status/priority/SLA/routing/lifecycle). |
| Form primitive | `controlClassName` stringovi | `Field`/`Input`/`Select` | P1 | Komponente koje wrapuju postojeće klase. |
| Progress | nema | SLA trake h-1.5 | P0 | `Progress` primitive prije Ticket Detail / SLA vizuala. |
| StatCard | nema `delta` | label → 24px tnum → delta | P1 | Proširiti postojeći `stat-card.tsx`. |
| Nav IA | Dashboard; Tiketi; Usluge+KB; Users/OU/Routing/SLA/Settings | + Izvještaji, + Grupni inbox, Admin kao jedan item | P0 | Shell IA u FE-1. Inbox ostaje `/tickets?view=inbox` (postojeći state). Reports ruta nova. Admin grupisanje u FE-9. |
| Nav bedževi | nema | open tickets / inbox+unrouted | P1 | Brojati iz postojećih list/inbox API-ja; crveni samo unrouted. |
| Global search | Enter → tickets ili KB po pathu; placeholder spominje korisnike | jedna traka tiketi+KB+korisnici | P1 | Pretraga preko `listTickets` + `listKnowledgeArticles` + `useDirectory`; ne inventirati unified search API. |
| ⌘K | focus input | focus + hint | KEEP | Ponašanje zadržati. |
| Login u topbaru | email/password kad nema session | referenca pretpostavlja login | KEEP | Real auth. Ne kopirati mock user. |
| Tailwind v3 vs v4 `@theme` | `tailwind.config.ts` | `index.css @theme` | KEEP | Ne migrirati na v4 radi parity. Hexovi su isti. |
| Mock podaci | nema u produkcijskim page-ovima | `data/mock.ts` | KEEP | Nikad ne kopirati mock. |

---

## 7. Module-by-module audit

### 7.1 App Shell

**Reference:** `referenca-dizajn/src/components/Shell.tsx`, `nav.ts`.
**Current:** `application-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx`, `header-search.tsx`, `notifications-bell.tsx`, `notifications-panel.tsx`, `session-controls.tsx`, `sidebar-user-card.tsx`, `system-status-chip.tsx`, `lib/navigation.ts`.

| Element | Gap | Pri |
| --- | --- | --- |
| Širina 248px, h-14, CTA Novi tiket, crtica, ikona `#7FA8F5` | usklađeno | KEEP |
| Mobile overlay 270px | current koristi Radix `Sheet` umjesto custom overlay | KEEP (a11y bolji); vizuelno `p-0` već postoji |
| Nav sekcije / itemi | nema Izvještaji, nema Grupni inbox, Admin raspršen | P0 |
| Količinski bedževi | nema | P1 |
| Search | ne pretražuje korisnike; nema unified results overlay | P1 |
| Notif panel 380px, filter, mark all, kind ikone | skoro identično; filter dugme nema aktivni `bg-background`; nema “Prikaži historiju” | P2 |
| System chip | identičan `dot-pulse` | KEEP |
| User menu | ima assigned/settings/jezik/odjava; nema “Moj profil i dozvole”; OU nije u subtitle | P2 |
| Sidebar user card | nema logout ikonu (odjava je u topbar meniju) | KEEP |
| Global `N` | postoji | KEEP |

### 7.2 Dashboard

**Reference:** `referenca-dizajn/src/pages/Dashboard.tsx` — KPI 4 kolone (otvoreni, kritični, SLA breach, avg odziv), Donut statusa, GroupedBars 14d, SLA nadzor lista, grupni inbox HBars, activity feed.
**Current:** `dashboard-page.tsx` + `dashboard-metric-grid.tsx` + `dashboard-recent-tickets.tsx` + `lib/dashboard/summarize-tickets.ts`.

Current KPI-ji su **operativni** (inbox, assigned to me, unassigned, waiting, approval, unrouted, requested) iz `listTickets` + `listGroupInbox`. To je stvarna funkcionalnost — **ne bacati**.

Delta:

- P0: dodati reference vizuelni red (Donut + 14d bars) iz aggregacije postojećeg ticket niza (`createdAt` / `resolvedAt` / `status`).
- P0: SLA nadzor lista: dok nema `slaState`/`resolveBy`, koristiti `isOverdue` + `WAITING_FOR_USER`/`PENDING_APPROVAL` pause chip. Ne fake-ovati “26 min”.
- P1: KPI set proširiti (ne zamijeniti) sa: otvoreni, kritični (`priority===CRITICAL`), SLA prekoračenja (`isOverdue`). Avg odziv = **ne prikazivati** dok nema API polja.
- P1: grupni inbox kartica sa HBars iz inbox count po grupi — `assignedGroupId` je UUID (current truncate). Ime grupe: **UNVERIFIED** (nema `frontend` groups API / `Controller('groups')` nije nađen). Dok nema, label ostaje truncated id ili “grupa”.
- P1: referenca ima i punu tabelu **“Tiketi koji zahtijevaju pažnju”** (top open, status/priority/SLA). Current ima samo `DashboardRecentTickets` (8 po `createdAt`). FE-2.3 dodaje attention tabelu iz istog niza (overdue + critical + unrouted), ne mock redove.
- P2: KPI Waiting/Approval/Unrouted trenutno vode na `/tickets?view=all` bez filtera. Deep-linkovati `status` / `overdue` query gdje `useTicketList` već čita URL.
- KEEP: loading / empty / error, linkovi na view-ove, recent table.
- KEEP: `SystemStatusChip` je statičan “operativni” (nema health API) — isto kao referenca mock.

### 7.3 Reports

**Reference:** `referenca-dizajn/src/pages/Reports.tsx` — date range, export, 4 KPI, bottleneck HBars, volume po usluzi, 14d + aging.
**Current:** **nema rute, nema page, nema `frontend/src/services` reports API, nema backend reports modul.**

RAW IN / Faza 8: report packs + bottleneck dashboard. `private.addons.reports` postoji kao addon flag.

FE-4 smije:

- novu rutu `/reports` + nav item
- layout/KPI/chartove iz **istog** `listTickets()` aggregata kao dashboard
- empty/loading/error
- Export dugme **disabled** + copy da je pack export Faza 8 (nema API)

FE-4 ne smije: mock `248`, `26 min`, `4,6 / 5`, kopirati `VOLUME_14D`.

### 7.4 Tickets list + Inbox

**Reference Tickets:** `Tickets.tsx` — saved views 220px, status tabs + **SLA rizik** tab, search, priority chips, tabela (ID `#7FA8F5`, avatari, SLA remaining, bulk traka bez close), CSV export.
**Reference Inbox:** `Inbox.tsx` — zasebna ruta, tabovi unrouted / moja grupa / grupe, danger banner, Preuzmi, Flame na Critical, auto-assign badge.

**Current:** `ticket-list-page.tsx` — workspace nav (inbox/assigned/unassigned/requested/all), saved views, status tabs, filters (search/priority/overdue/service), bulk bar, pagination, inbox lista sa claim.

| Gap | Pri |
| --- | --- |
| Inbox nije sidebar item | P0 |
| Nema tab “SLA rizik” (ima overdue chip) | P1 — mapirati RISK tab na `isOverdue` dok nema `slaState` |
| Nema SLA remaining kolone | P0/BLOCKED — isti DTO gap |
| Avatari u listi | P1 |
| CSV export | KEEP out — audit export je Faza 8 |
| Bulk close zabranjen, reason, preview | KEEP |
| Inbox vizuel: group tabovi, Flame, unrouted banner | P1 — banner već postoji; tabovi po grupi ako inbox payload ima `assignedGroupId` |
| Auto-assign badge na grupi | UNVERIFIED na inbox DTO |

### 7.5 Ticket Detail — **KEEP, delta only**

**Reference:** `TicketDetail.tsx` (~555 linija).
**Current:** `ticket-detail-page.tsx` + header/workspace/side-stack + conversation/composer/attachments/time/approvals/participants/csat/split/confidential.

Struktura je ista: breadcrumb → header card → `xl:grid-cols-[1fr_330px]` → UnderlineTabs chat/activity/time/files → desno properties/approvals/participants/csat.

| Dio | Current | Reference | Pri | Akcija |
| --- | --- | --- | --- | --- |
| Header ID 16px, status/priority badges, confidential, claim, split, status ▾ | postoji | isto | KEEP | |
| Pause banner waiting / pending-approval | postoji | SLA pauza badge u headeru | KEEP + P2 | Dodatni `SLA pauziran` chip kad je pause (status dovoljan) |
| Channel badge | nema | `kanal: …` | KEEP out | Nema channel na `TicketResponse` |
| Watch/bell | nema u headeru | ghost Bell | P2 | Watcher se dodaje kroz participants API — header Bell može otvoriti add WATCHER, ne mock |
| Assign… | nema zasebno “Dodijeli” | outline UserPlus | P1 | Koristiti postojeći bulk/assign ili participant/claim tok; ne novi backend |
| SLA tajmeri (Progress, respond/resolve, % , MetaBadge) | **nema panela** | desna kartica #1 | P0 | **Gated** na DTO (blocker B1). Do tada: `isOverdue` badge + pause chip |
| Routing EXACT/PARENT_FALLBACK u properties | samo UNROUTED vs truncated groupId | grupa ime + outcome | P1 | Outcome nije na ticket DTO. Prikazati UNROUTED danger / grupu. Full outcome = UNVERIFIED bez novog polja |
| Chat tints, internal lock, system italic | `ticket-message-bubble.tsx` / `ticket-conversation.tsx` | identični classNames | KEEP | |
| Composer public/internal, Ctrl+Enter, wait-for-user | `ticket-message-composer.tsx` | isto | KEEP | |
| Composer attach button | samo hint; upload na Files tab | Paperclip u composeru | P2 | Wire postojeći `onUpload` u composer, ne dupli storage |
| Activity typed ikone (sla/routing/status/security) | SYSTEM_EVENT=GitBranch, APPROVAL=CheckCheck | kind mape | P1 | Mapirati `message.type` / body prefix ako postoji; ne fake kinds |
| Time tracking / files / approvals / CSAT / split / formData | postoji, API | mock | KEEP | Vizuelni polish CardHeader |
| Socket.IO | `useTicketRealtime` | nema (mock) | KEEP | Ne regresirati |
| 404 | `TicketDetailBlockingState` | “nije pronađen” | KEEP | |

**Zaključak Ticket Detail:** rewrite zabranjen. FE-3.x samo delta na postojećim fajlovima.

### 7.6 Usluge / Katalog

**Reference:** `Catalog.tsx` — category chips, search, **card grid**, lifecycle/availability badges, downtime info traka, forma verzija, approvals count, coverage note, onboarding stepper, CTA Nova usluga / Onboarding.
**Current:** `services-page.tsx` + `service-catalog-table.tsx` — tabela, lifecycle/availability/form badges, “Pripremi formu”.

Backend (`services.controller.ts`): `POST/GET/PATCH/DELETE`, `POST :id/lifecycle`. Onboarding: `POST/GET/PATCH/finalize` na `services/:id/onboarding*`.

Frontend client (`service-catalog-api.ts`): **nema** `createService` / `updateService` / `transitionLifecycle` / onboarding wrapper.

Nedostaje u administraciji kataloga (stvarno, ne fake):

1. Card/list UX + search/filter (P0 vizuel)
2. API wrapper + create/edit/lifecycle UI (P0 funkcionalno — backend postoji)
3. Onboarding wizard UI (P0 — backend postoji, frontend 0 fajlova)
4. Kategorije: domain `categoryId` postoji u matrici; current `ServiceResponse` **nema** `categoryId`/`description`/`downtime` — UNVERIFIED na DTO. Ne crtati fake kategorije dok polje nije u response-u.
5. Ownership / open ticket count: nema na DTO — ne izmišljati.

Availability: mapirati `OPERATIONAL` → label “Dostupno” / success (kao `AVAILABLE`).
`ServiceResponse` već ima `runtimeAvailability` i `requiresApproval` — tabela ih ne prikazuje (P1 u FE-5.1). Downtime info traka samo iz `runtimeAvailability.activeDowntimeWindow`.

### 7.7 Baza znanja

**Reference:** `Knowledge.tsx` — wide search, category chips, 2-col kartice, tags, helpful %, views, intercepts, owner avatar, create CTA, empty “napiši članak za query”.
**Current:** `knowledge-base-page.tsx` + list + create form + lifecycle actions + thumbs.

Domain (`KnowledgeArticleResponse`): `DRAFT|IN_REVIEW|PUBLISHED|ARCHIVED`, owner ids, `serviceId`, `organizationalUnitId`, `isStale`, `reviewDueAt`. **Nema tags, categories, views, intercepts, helpfulPct.** Feedback ranking je server-side za intercept, ne list %.

| Gap | Pri | Dozvoljeno |
| --- | --- | --- |
| Nema article detail rute | P0 | `getKnowledgeArticle` postoji, ne koristi se |
| Nema edit | P0 | `updateKnowledgeArticle` + `reason` postoji |
| Create forma sirovi UUID-ovi | P1 | Directory + `listServices` selecti |
| Filter chips | P1 | service / status / stale — **ne** fake tagovi |
| Status raw `PUBLISHED` | P1 | `MetaBadge` + i18n |
| Owner UUID | P1 | resolve displayName iz directory |
| helpful % / views / intercepts | KEEP out | nema u DTO |
| Empty state za query → create | P2 | postojeći create, prefill title |
| KB intercept u create ticket | KEEP | `create-ticket-intercept-view.tsx` |

### 7.8 Routing

**Reference:** `Routing.tsx` — tabovi Matrica / Tester / Pravila / Change log; coverage **usluga × OU** ćelije E/N/×; sticky kolona; tooltip depth.
**Current:** `routing-page.tsx` — create forma (sirovi ID-jevi) + **flat** coverage tabela sa E/N/× badge.

Backend: `POST /routing/rules`, `GET /routing/rules`, `GET /routing/resolve`, `GET /routing/coverage`. **Nema PATCH/DELETE/enable.** Change log se piše na create; **nema** `GET .../changes` na routing kontroleru (za razliku od SLA).

| Gap | Pri |
| --- | --- |
| Matrica umjesto flat table | P0 — isti `listRoutingCoverage()` |
| Tab Pravila iz `GET /routing/rules` (neiskorišten) | P0 |
| Tester iz `GET /routing/resolve` (neiskorišten) | P1 |
| Create forma: OU/service/group selecti + `reason` | P1 |
| Edit/delete/enable | **NE** — nema API |
| Change log tab | **NE** dok nema list endpoint — skeleton “nema API” zabranjen kao fake diff. Skip ili UNVERIFIED. |
| Group imena | UNVERIFIED groups list API |

### 7.9 SLA

**Reference:** `Sla.tsx` — lista profila kao kartice, detail tabela pravila po prioritetu, kalendar 7 dana, HBars, pause/escalation vizual.
**Current:** `sla-page.tsx` — UnderlineTabs profiles/calendars; `SlaProfilesPanel` forme + `SlaRulesTable` + `SlaChangeLogPanel`; kalendari CRUD + change log.

Ovo je **funkcionalno ispred** reference (pravi CRUD + reason + change log). Vizuelno je form-admin, ne profile-card IA.

Ticket-level timer vizual (Constitution §8.3) **nije** na Ticket Detail. Backend računa `responseDueAt` / `resolutionDueAt` / pause; client vidi samo `isOverdue`.

| Gap | Pri |
| --- | --- |
| Profile card selector + calendar week grid | P1 vizuel na postojećem CRUD |
| Enable/disable profil | UNVERIFIED na `SlaProfile` DTO |
| Ticket timers | P0 gated B1 |
| Change log | KEEP |

### 7.10 Administracija (FE-9 skeleton)

**Reference:** `Admin.tsx` — tabovi org / users / settings / ops.
**Current:** odvojene rute users (tabela+search+avatar), OU tree, settings (samo email kanal). Nema ops, policy packs UI, addons katalog, audit export, shadow permission, queue retry.

Faza 9 / Faza 8 poslovna logika **se ne implementira**. FE-9 = shell + tabovi koji mountaju postojeće users/OU/settings + ops **placeholder** (queue je još `[ ]` u TASKS Faza 7).

Permission-aware: koristiti postojeći `useSessionCapabilities` / `permissionKeys`.

### 7.11 Socket.IO / realtime

Implementirano i testirano u FE: ticket room, message upsert, ticket.updated apply, notifications, settings generation, session invalidation, stale-event guard.

Rupe:

- List/inbox/dashboard ne invalidiraju na `ticket.updated` / `notification.created` (P0 za FE-7)
- Composer optimistic (`send-ticket-message-optimistic.ts`) — KEEP, FE-7 samo error recovery vizual
- Settings live — KEEP
- `connectTicketSocket` u `ticket-socket.ts` je neiskorišten; sve ide kroz `acquireHelpdeskSocket` — KEEP, ne uvoditi drugi socket
- Remote request / Edge — van Faze 7 UI scope (Faza 9)

---

## 8. Fazni roadmap

Redoslijed iz briefa je tačan uz jednu izmjenu:

**FE-2 Dashboard i FE-3 Tickets dijele blocker B1** (SLA snapshot na ticket DTO). Dashboard/list koriste `isOverdue` do B1; puni SLA tajmeri idu u FE-3.3 tek kad je B1 riješen.

**FE-4 Reports** ide poslije FE-2 jer dijeli chart primitive i ticket aggregacije; nije Faza 8 report packs.

**FE-6 Routing** ne čeka katalog, ali coverage matrix treba service+OU imena (već u coverage DTO).

```
FE-0 foundation
  → FE-1 shell IA
    → FE-2 dashboard
      → FE-4 reports
    → FE-3 tickets (list/inbox/detail delta)
    → FE-5 usluge + KB
    → FE-6 routing + SLA admin visual
      → FE-7 realtime consolidation
        → FE-8 global QA
        → FE-9 admin skeleton
```

B1 (SLA DTO) može ući paralelno kao mali backend contract task; nije vizuelni-only backend. Ako B1 nije odobren, FE-2/FE-3 slaže se na `isOverdue` + pause status.

---

## 9. FE taskovi

Svaki task je jedan implementation prompt. Checkbox se označava tek nakon verifikacije.

### FE-0 — Audit + Foundation

#### FE-0.1 — Semantic meta + token usage baseline

**Goal:** Jedna semantička mapa i dogovoreni token aliasi.
**Scope:** Novi `frontend/src/lib/theme/semantic-meta.ts`; mapirati domain statuse uključujući `UNROUTED`/`PENDING_APPROVAL`/`ARCHIVED`; `OPERATIONAL`→success “Dostupno”.
**Reference:** `referenca-dizajn/src/lib/core.ts`.
**Current:** `ticket-badges.tsx`, `routing-coverage-table.tsx`, `service-catalog-table.tsx`.
**Dependencies:** none.
**Preserve:** postojeći i18n label keyevi; ne mijenjati backend enum.
**Acceptance:** badge komponente čitaju mapu; nema novih hexova van theme.md.
**Visual:** identični BADGE_TONES kao `ui.tsx`.
**Verification:** `npm run test` + `npm run build` u `frontend/`.
- [ ] FE-0.1 completed

#### FE-0.2 — CSS motion + chart keyframes

**Goal:** Kanonske animacije dostupne globalno.
**Scope:** `frontend/src/index.css` — dodati `.bar-grow`, `.draw-ring`; `prefers-reduced-motion` already covers named classes — proširiti.
**Reference:** `referenca-dizajn/src/index.css`.
**Current:** `frontend/src/index.css`.
**Dependencies:** none.
**Preserve:** postojeći page-in/pop-in/dot-pulse.
**Acceptance:** klase postoje; reduced-motion gasi i nove.
**Visual:** kriva `cubic-bezier(0.22, 0.68, 0.36, 1)`.
**Verification:** build.
- [ ] FE-0.2 completed

#### FE-0.3 — Form primitives (Field, Input, Select, Textarea)

**Goal:** Shared forme umjesto ad-hoc className copy-paste.
**Scope:** komponente koje koriste postojeći `control.ts`; migrirati 1–2 call site-a kao dokaz (npr. routing create), ostalo po modulima.
**Reference:** `referenca-dizajn/src/components/ui.tsx` Field/Input/Select/Textarea.
**Current:** `frontend/src/components/ui/control.ts`.
**Dependencies:** none.
**Preserve:** `controlClassName` export (kompatibilnost).
**Acceptance:** h-9, `bg-background/60`, hover `#31405C`, required `*`.
**Visual:** label 12.5px, hint 11.5px.
**Verification:** build + postojeći form testovi.
- [ ] FE-0.3 completed

#### FE-0.4 — Progress + MetaBadge + StatCard delta + Button aliases

**Goal:** Nedostajući primitive-i i imena varijanti.
**Scope:** `progress.tsx`, `MetaBadge` u `badge.tsx`; `StatCard` `delta`/`deltaTone`; `button.tsx` `primary`/`danger`/`subtle` alias.
**Reference:** `ui.tsx` Progress, MetaBadge, StatCard, Button.
**Current:** `badge.tsx`, `stat-card.tsx`, `button.tsx`.
**Dependencies:** FE-0.1.
**Preserve:** postojeći `default`/`destructive`/`secondary` (ne lomiti call site).
**Acceptance:** alias radi; Progress h-1.5.
**Visual:** StatCard 24px tnum; delta boja samo kad nosi odluku.
**Verification:** build.
- [ ] FE-0.4 completed

#### FE-0.5 — Charts primitives

**Goal:** Donut, GroupedBars, HBars kao shared.
**Scope:** novi modul ≤200 linija po fajlu (split ako treba).
**Reference:** `referenca-dizajn/src/components/charts.tsx`.
**Current:** nema.
**Dependencies:** FE-0.2.
**Preserve:** n/a.
**Acceptance:** hover dim, tnum, druga serija `#3B4A6B`, track `#1B2436`.
**Visual:** thickness ~15, bar top radius 3px, stagger 28ms.
**Verification:** build; vizuelni smoke na dashboard tek u FE-2.
- [ ] FE-0.5 completed

#### FE-0.6 — Visual parity baseline checklist u docs

**Goal:** DoD iz §12 ovog dokumenta kao kratki `frontend` QA snippet (ne novi design system).
**Scope:** ovaj fajl već sadrži DoD; task = potvrditi da FE-0.1–0.5 prolaze checklist (tokens, radius, no new shadows).
**Reference:** theme.md §13.
**Current:** n/a.
**Dependencies:** FE-0.1–0.5.
**Preserve:** n/a.
**Acceptance:** checklist prošao na primitive-ima.
**Verification:** manual + build.
- [ ] FE-0.6 completed

### FE-1 — App Shell

#### FE-1.1 — Navigation IA

**Goal:** Reference sekcije i itemi bez gubitka postojećih rute.
**Scope:** `lib/navigation.ts`, `app-sidebar.tsx`, i18n `navigation.*`.
  - Pregled: Nadzorna ploča, Izvještaji (`/reports` može 404-placeholder do FE-4 — bolje: ruta stub EmptyState “u pripremi” zabranjena; **rutu dodati u FE-4**, u FE-1.1 staviti item disabled ili sakriti dok FE-4 ne doda page). **Odluka:** nav item Izvještaji uvesti u FE-4.1 zajedno sa page. FE-1.1 dodaje **Grupni inbox** → `/tickets?view=inbox`, label “Katalog usluga” vizuelno / i18n za `/services` (ključ ostaje services), zadržava Users/OU/Settings dok FE-9 ne spoji Admin.
**Reference:** `Shell.tsx` NAV_SECTIONS, `nav.ts`.
**Current:** `navigation.ts`.
**Dependencies:** FE-0.1.
**Preserve:** sve postojeće rute; i18n EN fallback.
**Acceptance:** inbox u sidebaru; tickets match uključuje `/tickets/:id`; end flags ispravni.
**Visual:** sekcijski 10px uppercase tracking 0.12em.
**Verification:** manual nav + build.
- [ ] FE-1.1 completed

#### FE-1.2 — Sidebar count badges

**Goal:** Neutralni bedževi za otvorene tikete i inbox+unrouted.
**Scope:** mali hook koji čita postojeći `listTickets`/`listGroupInbox` (cache-friendly, ne spamovati). Badge na tickets/inbox.
**Reference:** `Shell.tsx` badge na tickets/inbox.
**Current:** `app-sidebar.tsx` nema badge.
**Dependencies:** FE-1.1.
**Preserve:** crveni badge samo za unrouted>0 (danger tone).
**Acceptance:** broj iz API-ja, 0 sakriva ili prikazuje 0 konzistentno s referencom (referenca prikazuje broj).
**Verification:** signed-in manual.
- [ ] FE-1.2 completed

#### FE-1.3 — Unified header search

**Goal:** Jedna traka pretražuje tikete + KB + korisnike.
**Scope:** `header-search.tsx` — na Enter ili popover lista iz 3 postojeća izvora; klik vodi na `/tickets/:id`, `/knowledge-base?q=` ili ostaje users filter **UNVERIFIED** (nema user detail rute) → `/users` sa query.
**Reference:** Shell search placeholder + Enter→knowledge (mock). Current već ide na tickets/KB.
**Current:** `header-search.tsx`.
**Dependencies:** FE-0.3 optional.
**Preserve:** ⌘K focus; i18n placeholder.
**Acceptance:** korisnici se filtriraju iz directory; prazan query ne ruši.
**Visual:** isti input chrome.
**Verification:** manual tri entity tipa.
- [ ] FE-1.3 completed

#### FE-1.4 — Notifications panel polish

**Goal:** Aktivni filter stil + kind ikone usklađene.
**Scope:** `notifications-panel.tsx`, `notifications-list.tsx`. Historija link: **nema** notifications history rute — ne dodavati fake. KEEP bez footer linka.
**Reference:** `Shell.tsx` NotificationsPanel.
**Current:** panel + list + realtime hook.
**Dependencies:** none.
**Preserve:** mark all, unread dot, navigate na tiket.
**Acceptance:** filter all/unread vizuel kao referenca (`bg-background` kad je unread aktivan).
**Verification:** postojeći `notification-realtime.spec.ts` + manual.
- [ ] FE-1.4 completed

#### FE-1.5 — Session menu OU subtitle

**Goal:** Topbar user red kao referenca (ime + OU/rola).
**Scope:** `session-controls.tsx`; OU iz session/directory ako postoji na session objektu — **UNVERIFIED** polje. Ako nema, zadržati rola.
**Reference:** Shell user menu.
**Current:** `session-controls.tsx`.
**Dependencies:** none.
**Preserve:** login formu, signOut, locale switch, assigned tickets.
**Acceptance:** nema regresije auth.
**Verification:** sign-in/out manual + session testovi.
- [ ] FE-1.5 completed

### FE-2 — Dashboard

#### FE-2.1 — KPI row (operational + reference)

**Goal:** 4-col StatCard red: otvoreni, kritični, SLA overdue, plus zadržati inbox/unrouted emphasis.
**Scope:** `dashboard-metric-grid.tsx`, `summarize-tickets.ts` (dodati `critical`, `overdue` count).
**Reference:** Dashboard KPI.
**Current:** 8 metric kartica.
**Dependencies:** FE-0.4, FE-0.5.
**Preserve:** linkovi na ticket views; empty/error.
**Acceptance:** brojevi iz `listTickets`; nema fake delte “+3 danas” osim ako se može izračunati iz `createdAt` danas. Waiting/Approval/Unrouted linkovi nose postojeće filter query (`status`, `overdue`) umjesto golog `?view=all`.
**Visual:** StatCard hover border `#31405C`.
**Verification:** unit test summarize + build.
- [ ] FE-2.1 completed

#### FE-2.2 — Status donut + 14d grouped bars

**Goal:** Reference graf red.
**Scope:** novi `dashboard-charts.tsx`; agregacija iz ticket niza.
**Reference:** Dashboard Donut + GroupedBars.
**Current:** nema.
**Dependencies:** FE-0.5, FE-2.1.
**Preserve:** recent tickets kartica.
**Acceptance:** prazan niz → EmptyState, ne prazan donut.
**Visual:** legend desno, tnum, bar-grow.
**Verification:** manual + summarize tests.
- [ ] FE-2.2 completed

#### FE-2.3 — SLA watchlist + inbox snapshot

**Goal:** Donji red kartica + attention tabela.
**Scope:** lista `isOverdue` tiketa (max 5) kao reference SLA nadzor; inbox HBars ako group labels dostupni, inače count lista; tabela “Tiketi koji zahtijevaju pažnju” (reuse list-table chrome: ID, status, priority, overdue).
**Reference:** Dashboard donji red + `TicketRow` tabela.
**Current:** samo recent table.
**Dependencies:** FE-0.5, FE-2.1.
**Preserve:** `isOverdue` semantika iz overdue matrice.
**Acceptance:** klik vodi na ticket detail; recent table ostaje ili se spaja s attention (ne duplirati iste redove bez razloga).
**Visual:** ID `#7FA8F5`, pause chip za waiting/approval.
**Verification:** manual.
- [ ] FE-2.3 completed

#### FE-2.4 — Dashboard header actions

**Goal:** PageHeader actions: Izvještaji (enable u FE-4) + Novi tiket.
**Scope:** `dashboard-page.tsx`.
**Reference:** Dashboard PageHeader.
**Current:** samo Novi tiket.
**Dependencies:** FE-2.1; Reports link čeka FE-4.1.
**Preserve:** crumbs/title i18n.
**Acceptance:** loading skeleton ostaje.
**Verification:** build.
- [ ] FE-2.4 completed

### FE-3 — Tickets

#### FE-3.1 — List: SLA rizik tab + avatars + ID chrome

**Goal:** Lista vizuelno kao Tickets.tsx bez CSV-a.
**Scope:** `ticket-list-page.tsx`, `ticket-list-table.tsx`, `ticket-list-filters.tsx`.
**Reference:** `Tickets.tsx`.
**Current:** status tabs, overdue chip, bulk, saved views.
**Dependencies:** FE-0.1, FE-0.4.
**Preserve:** bulk bez close, saved views, pagination, confidential icon. `TicketOverdueBadge` **već postoji** na list tabeli (`ticket-list-table.tsx`) — ne dirati.
**Acceptance:** tab “SLA rizik” filtrira `isOverdue`; avatari assignee kad ime postoji u directory (ako list nema ime — skip avatar, ne fake).
**Visual:** table head 10.5px uppercase; row hover `elevated/40`.
**Verification:** `filter-tickets` spec + manual.
- [ ] FE-3.1 completed

#### FE-3.2 — Inbox visual (group tabs)

**Goal:** Inbox view bliži `Inbox.tsx`.
**Scope:** `ticket-inbox-list.tsx`, `ticket-list-page.tsx` kad `view===inbox`.
**Reference:** `Inbox.tsx`.
**Current:** flat lista + unrouted banner + claim.
**Dependencies:** FE-1.1, FE-3.1.
**Preserve:** claim API, unrouted copy, Flame na CRITICAL.
**Acceptance:** **UNROUTED nije group inbox** (ticketing-core / routing matrice). Neusmjereni red je zaseban tab/banner iz `listTickets` `status===UNROUTED`; `listGroupInbox` ostaje samo grupni nepreuzeti. Ne miješati UNROUTED u group tabove.
**Visual:** danger banner, Preuzmi primary.
**Verification:** manual inbox.
- [ ] FE-3.2 completed

#### FE-3.3 — Ticket Detail SLA panel (gated B1)

**Goal:** Constitution §8.3 tajmeri.
**Scope:** novi `ticket-sla-panel.tsx` u `ticket-detail-side-stack.tsx` **samo ako** TicketResponse (ili nested snapshot) ima due/pause polja.
**Reference:** TicketDetail SLA card.
**Current:** nema panela; `isOverdue` badge na listi.
**Dependencies:** FE-0.4 Progress; **B1**.
**Preserve:** pause banneri u headeru; socket applyTicket.
**Acceptance:** response “zadovoljen” ne crveni retroaktivno; pause warning chip; breach danger.
**Visual:** Progress h-1.5, tnum remaining.
**Verification:** unit mapiranje snapshot→UI + detail reload.
**Ako B1 nije gotov:** task ostaje otvoren; ne implementirati fake timer.
- [ ] FE-3.3 completed

#### FE-3.4 — Ticket Detail delta polish (no rewrite)

**Goal:** Sitni reference delta na postojećem layoutu.
**Scope:** `ticket-detail-header.tsx`, `ticket-detail-header-actions.tsx`, `ticket-detail-sidebar.tsx`, `ticket-conversation.tsx`, `ticket-message-composer.tsx`.
  - Pause chip “SLA pauziran” kad waiting/approval
  - Assign akcija ako postoji assign API na detail (claim već ima; group assign preko postojećeg update/bulk — ne novo)
  - Composer Paperclip → isti `onUpload`
  - Activity ikone: APPROVAL već success; ostalo KEEP GitBranch osim ako `message.type` razlikuje
**Reference:** TicketDetail header/composer/activity.
**Current:** navedeni fajlovi.
**Dependencies:** FE-0.1.
**Preserve:** cijeli workspace, realtime, approvals, split, CSAT, confidential, redaction.
**Acceptance:** nijedan tab nije uklonjen; composer Ctrl+Enter ostaje.
**Visual:** header card px-5 py-4, 330px sidebar.
**Verification:** manual detail + postojeći ticket testovi.
- [ ] FE-3.4 completed

#### FE-3.5 — Create ticket wizard chrome

**Goal:** Stepper vizuel kao NewTicket (Usluga → Detalji → KB intercept → Pregled).
**Scope:** `create-ticket-stepper.tsx`, `ticket-create-page.tsx`, intercept view. Unutrašnji kontejner `max-w-[1060px]` (referenca NewTicket); shell ostaje 1400.
**Reference:** `NewTicket.tsx`.
**Current:** stepper + intercept već obavezni.
**Dependencies:** FE-0.4.
**Preserve:** KB intercept ne preskakati; schema form; routing preview ako već postoji na create side panel.
**Acceptance:** completed step = success kvačica, active = primary fill.
**Verification:** intercept specs + manual create.
- [ ] FE-3.5 completed

### FE-4 — Reports

#### FE-4.1 — Reports route + layout

**Goal:** `/reports` page + nav item.
**Scope:** `reports-page.tsx`, `router.tsx`, `navigation.ts`, i18n.
**Reference:** `Reports.tsx` PageHeader.
**Current:** nema.
**Dependencies:** FE-0.5, FE-2.1 aggregacije (reuse helpers).
**Preserve:** addon flag `private.addons.reports` — ako je false, EmptyState “dodatak ugašen” (čitati settings ako već postoji client; inače prikaži page i aggregacije — **UNVERIFIED** da FE čita ovaj addon). Ako settings key nije u FE, ne blokirati page.
**Acceptance:** loading/empty/error iz `listTickets`.
**Visual:** max-w 1400 već iz shell.
**Verification:** build; rutu otvoriti.
- [ ] FE-4.1 completed

#### FE-4.2 — Reports charts from ticket aggregations

**Goal:** Bottleneck/volume/aging iz stvarnih polja: `assignedGroupId`, `serviceId`, `createdAt`, `status`, `isOverdue`.
**Scope:** helpers + Reports body.
**Reference:** Reports HBars + GroupedBars.
**Current:** nema.
**Dependencies:** FE-4.1, FE-0.5.
**Preserve:** nema mock brojeva.
**Acceptance:** suffix `h` samo ako imamo duration; dok nema, koristiti **counts** (broj otvorenih po grupi/usluzi) umjesto lažnih sati.
**Visual:** warning color samo za max bar (grlo).
**Verification:** unit aggregations + manual.
- [ ] FE-4.2 completed

#### FE-4.3 — Export action UX (disabled)

**Goal:** Outline dugme “Izvoz paketa” disabled, hint Faza 8.
**Scope:** Reports header actions. Date range: client filter po `createdAt` (npr. 14/30 dana) — to **nije** novi API.
**Reference:** Reports actions.
**Current:** nema.
**Dependencies:** FE-4.1.
**Preserve:** ne zvati nepostojeći export.
**Acceptance:** disabled + aria-disabled; date filter mijenja aggregacije.
**Verification:** manual.
- [ ] FE-4.3 completed

### FE-5 — Usluge + Baza znanja

#### FE-5.1 — Catalog visual (cards + search)

**Goal:** Catalog.tsx layout na `listServices()`.
**Scope:** `services-page.tsx`, novi `service-catalog-grid.tsx`; zadržati table kao fallback ili zamijeniti gridom (jedan pattern).
**Reference:** `Catalog.tsx`.
**Current:** `service-catalog-table.tsx`.
**Dependencies:** FE-0.1, FE-0.3.
**Preserve:** prepare form akcija, lifecycle/availability badges, empty state.
**Acceptance:** search po name/slug; prikazati `requiresApproval` i `runtimeAvailability` (warn, nikad blok); downtime traka iz `activeDowntimeWindow`.
**Visual:** 1/2/3 col cards, hover `#31405C`.
**Verification:** catalog load + empty.
- [ ] FE-5.1 completed

#### FE-5.2 — Catalog API wrappers + create/edit/lifecycle

**Goal:** Admin katalog stvarni CRUD koji backend već ima.
**Scope:** `service-catalog-api.ts` create/patch/lifecycle; forme sa `reason`; permission `service.catalog.write`.
**Reference:** Catalog CTA Nova usluga (mock) — ovdje pravi API.
**Current:** samo list + form prepare.
**Dependencies:** FE-5.1, FE-0.3.
**Preserve:** ne dirati ticket create eligibility.
**Acceptance:** DRAFT→ACTIVE→DEPRECATED po matrici; delete samo DRAFT.
**Visual:** outline/danger buttoni; change reason Field.
**Verification:** API error mapping tests.
- [ ] FE-5.2 completed

#### FE-5.3 — Service onboarding wizard UI

**Goal:** Wizard servis→forma→routing→SLA→approvals.
**Scope:** novi moduli pod `components/services/onboarding/` + API wrappers na postojeće backend rute.
**Reference:** Catalog onboarding stepper.
**Current:** 0 frontend fajlova; i18n kaže “kreiraju se kroz onboarding”.
**Dependencies:** FE-5.2.
**Preserve:** lifecycle ostaje DRAFT do finalize.
**Acceptance:** koraci redom; finalize zove postojeći endpoint.
**Visual:** WizardStepper postoji (`wizard-stepper.tsx`) — reuse.
**Verification:** manual happy path + error.
- [ ] FE-5.3 completed

#### FE-5.4 — Knowledge list visual + filters

**Goal:** Kartice kao Knowledge.tsx bez fake tagova/%.
**Scope:** `knowledge-article-list.tsx`, `knowledge-base-page.tsx`.
**Reference:** `Knowledge.tsx`.
**Current:** 2-col cards već; raw status; UUID owner.
**Dependencies:** FE-0.1, directory.
**Preserve:** feedback thumbs, lifecycle+reason, intercept ranking copy.
**Acceptance:** filter status/service/stale; i18n status; owner ime.
**Visual:** hover title `#7FA8F5`; search card bez border-input chrome lom.
**Verification:** list empty/error.
- [ ] FE-5.4 completed

#### FE-5.5 — Knowledge article detail + edit

**Goal:** Ruta `/knowledge-base/:articleId` (ili query) sa get+patch.
**Scope:** nova page; router; create ostaje na listi ili premješten u detail CTA.
**Reference:** Knowledge title click (nema zasebne page u referenci — current treba pravu detail jer je to app).
**Current:** `getKnowledgeArticle` unused.
**Dependencies:** FE-5.4.
**Preserve:** change log `reason` na update; lifecycle actions.
**Acceptance:** 404/forbidden mapping; edit samo uz write permission.
**Visual:** PageHeader crumbs Usluge i znanje / članak.
**Verification:** get/update error tests + manual.
- [ ] FE-5.5 completed

### FE-6 — Routing + SLA

#### FE-6.1 — Coverage matrix

**Goal:** E/N/× matrica iz `listRoutingCoverage()`.
**Scope:** zamijeniti ili dopuniti `routing-coverage-table.tsx`; sticky first column; legend.
**Reference:** `Routing.tsx` CoverageMatrix.
**Current:** flat table.
**Dependencies:** FE-0.1.
**Preserve:** sr-only outcome labels; empty state.
**Acceptance:** ćelija UNROUTED danger; tooltip path + depth iz DTO.
**Visual:** CELL_STYLE klase iz reference.
**Verification:** manual sa seed coverage.
- [ ] FE-6.1 completed

#### FE-6.2 — Rules list + resolve tester + create form selects

**Goal:** Iskoristiti `GET /rules` i `GET /resolve`.
**Scope:** `routing-api.ts` list+resolve; tabovi na `routing-page.tsx`; create form: OU tree + services + group **ako** group list postoji, inače KEEP id input (UNVERIFIED groups).
**Reference:** Routing tabs tester/rules.
**Current:** samo create+coverage.
**Dependencies:** FE-6.1, FE-0.3.
**Preserve:** create reason ako backend zahtijeva (DTO `CreateRoutingRuleInput` trenutno nema `reason` u FE clientu — **provjeriti** backend DTO pri implementaciji; ako je obavezan, dodati polje).
**Acceptance:** duplicate rule error ostaje.
**Visual:** UnderlineTabs.
**Verification:** create error specs.
- [ ] FE-6.2 completed

#### FE-6.3 — SLA admin visual (no logic change)

**Goal:** Profile cards + calendar week grid na postojećem CRUD.
**Scope:** `sla-profiles-panel.tsx`, `sla-calendars-panel.tsx`.
**Reference:** `Sla.tsx`.
**Current:** forme + tabele + change log.
**Dependencies:** FE-0.4, FE-0.5 optional HBars iz rule exposure counts — skip ako nema ticket-by-profile API.
**Preserve:** create/update/delete + reason + change log.
**Acceptance:** ista API ponašanja.
**Visual:** selected profile `border-primary/50 bg-primary/8`.
**Verification:** postojeći sla error specs + manual.
- [ ] FE-6.3 completed

### FE-7 — Realtime UX consolidation

#### FE-7.1 — Ticket list/dashboard invalidation

**Goal:** Stale-state prevention na listama.
**Scope:** subscribe `ticket.updated` / `notification.created` u `use-ticket-list` i `use-dashboard-summary` (debounce reload); reuse `subscribeSocketEvent` + `isStaleTicketEvent` pattern.
**Reference:** Inbox “realtime aktivan” (mock).
**Current:** samo detail + notifications hook.
**Dependencies:** FE-3.1, FE-2.1.
**Preserve:** detail room join; ne duplirati socket konekcije (`acquireHelpdeskSocket`).
**Acceptance:** update na drugom klijentu osvježi listu bez full page refresh.
**Visual:** n/a.
**Verification:** unit na apply helpers + manual two-tab.
- [ ] FE-7.1 completed

#### FE-7.2 — Notification deep links completeness

**Goal:** Svi kindovi vode na pravu rutu.
**Scope:** `notification-kind.ts`, `notificationTicketPath`.
**Reference:** `routeFromString`.
**Current:** ticket path helper.
**Dependencies:** FE-1.4.
**Preserve:** mark read on click.
**Acceptance:** SLA/approval notifikacije otvaraju isti tiket; unknown kind ne crashuje.
**Verification:** postojeći notification specs proširiti.
- [ ] FE-7.2 completed

#### FE-7.3 — Composer/list optimistic error recovery chrome

**Goal:** Vidljiv error uz optimistic send.
**Scope:** `send-ticket-message-optimistic.ts` consumers; list claim error već postoji.
**Reference:** n/a (mock send).
**Current:** optimistic helper.
**Dependencies:** FE-3.4.
**Preserve:** socket upsert dedup.
**Acceptance:** failed send ne gubi draft.
**Verification:** existing optimistic tests.
- [ ] FE-7.3 completed

### FE-8 — Global parity QA

#### FE-8.1 — One-off style sweep

**Goal:** Ukloniti lokalne radius/hex/shadow izvan tokena.
**Scope:** grep `shadow-`, `rounded-full` na non-avatar, `#` hex van theme.md.
**Reference:** theme.md anti-patterns.
**Current:** cijeli `frontend/src`.
**Dependencies:** FE-1–FE-6.
**Preserve:** `shadow-xl shadow-black/40` samo floating (`floatingPanelClassName`).
**Acceptance:** grep čist osim dopuštenih (`#7FA8F5`, `#1D4FD8`, `#31405C`, avatar hues, `#3B4A6B`).
**Verification:** grep + build.
- [ ] FE-8.1 completed

#### FE-8.2 — Keyboard, focus, contrast, responsive

**Goal:** Constitution §10.
**Scope:** focus-visible već global; provjera custom triggera (status ▾); mobile sidebar; tabela min 36px.
**Reference:** index.css `:focus-visible`.
**Current:** već dosta usklađeno.
**Dependencies:** FE-8.1.
**Preserve:** `N`, `⌘K`.
**Acceptance:** tab kroz shell + ticket list checkbox.
**Verification:** manual desktop+mobile viewport.
- [ ] FE-8.2 completed

#### FE-8.3 — Loading/empty/error consistency

**Goal:** Svaki modul ima EmptyState + ApiErrorText + skeleton.
**Scope:** reports/catalog/kb/routing/dashboard already mostly; popuniti rupe.
**Reference:** EmptyState pattern.
**Current:** `empty-state.tsx`, `api-error-text.tsx`, `skeleton.tsx`.
**Dependencies:** FE-4–FE-6.
**Preserve:** i18n poruke, requestId.
**Acceptance:** nijedna lista nije “Nema podataka” bez next step.
**Verification:** manual.
- [ ] FE-8.3 completed

### FE-9 — Administration skeleton

#### FE-9.1 — Admin shell + tabs

**Goal:** `/admin` (ili wrap) sa tabovima org/users/settings/ops koji renderuju postojeće page tijelo.
**Scope:** `admin-page.tsx`, router, navigation: jedan Admin item; deep link `?tab=`.
**Reference:** `Admin.tsx` tabs.
**Current:** `/users`, `/organizational-units`, `/settings`.
**Dependencies:** FE-1.1 (može prepisati admin nav iteme).
**Preserve:** postojeće rute kao redirect na `/admin?tab=`.
**Acceptance:** permission-aware: settings forbidden EmptyState ostaje.
**Visual:** UnderlineTabs + PageHeader “Administracija sistema”.
**Verification:** manual tabs.
- [ ] FE-9.1 completed

#### FE-9.2 — Org + users visual inside admin

**Goal:** OU tree i users tabela u admin chrome bez nove poslovne logike.
**Scope:** reuse `organizational-units-page` / `users-page` internals.
**Reference:** Admin OuTree / UsersRoles.
**Current:** te page-ove.
**Dependencies:** FE-9.1.
**Preserve:** search, avatars, tree.
**Acceptance:** read-only ako session read-only mode već postoji u FE — **UNVERIFIED** UI hook; ako postoji `useSessionCapabilities` flag, disable write.
**Verification:** manual.
- [ ] FE-9.2 completed

#### FE-9.3 — Settings tab = email + addon/settings hooks

**Goal:** Email panel ostaje; mjesto za buduće addons/toggles (Switch+opis) bez Faze 9 logike.
**Scope:** `settings-page.tsx` unutar admin; skeleton sekcija “Dodaci” koja čita postojeći settings registry **ako** API već vraća addon ključeve; inače samo email.
**Reference:** Admin SettingsTab (toggles).
**Current:** `email-channel-panel.tsx`.
**Dependencies:** FE-9.1.
**Preserve:** change log reason na email save.
**Acceptance:** ne implementirati config versioning/rollback.
**Verification:** email tests.
- [ ] FE-9.3 completed

#### FE-9.4 — Ops tab placeholder

**Goal:** Ops chrome za queue/audit koji još nema FE API.
**Scope:** EmptyState: “Red poslova i audit export dolaze s Fazom 7/8”; bez fake job tabela.
**Reference:** Admin OpsTab (mock jobs).
**Current:** nema.
**Dependencies:** FE-9.1.
**Preserve:** n/a.
**Acceptance:** nula mock jobova.
**Verification:** visual.
- [ ] FE-9.4 completed

---

## 10. Master delta matrix

| Modul | Reference target | Current state | Gap | Priority | Tasks | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Shell | `Shell.tsx`, `nav.ts` | `application-shell` + layout/* | IA, badges, unified search | P0 | FE-1.1–1.5 | FE-0 | Open |
| Dashboard | `Dashboard.tsx`, `charts.tsx` | KPI grid + recent table | charts, SLA list, KPI mix | P0 | FE-2.1–2.4 | FE-0.5 | Open |
| Reports | `Reports.tsx` | **nema rute/API** | layout+aggregacije; export Faza 8 | P0 | FE-4.1–4.3 | FE-2 | Open |
| Tickets List | `Tickets.tsx` | list+filters+bulk+views | SLA rizik tab, avatari, kolona tajmera | P1 | FE-3.1 | FE-0 | Open |
| Inbox | `Inbox.tsx` | `?view=inbox` lista | sidebar + group tabs | P0 | FE-1.1, FE-3.2 | FE-1 | Open |
| Ticket Detail | `TicketDetail.tsx` | puni workspace + socket | SLA panel gated; sitni delta | P0/KEEP | FE-3.3–3.4 | B1, FE-0.4 | Open (KEEP structure) |
| Usluge | `Catalog.tsx` | tabela + prepare form | cards, CRUD wrappers, onboarding | P0 | FE-5.1–5.3 | FE-0, backend already | Open |
| Baza znanja | `Knowledge.tsx` | list+create+lifecycle+feedback | detail/edit, filters, owner names | P0 | FE-5.4–5.5 | FE-0 | Open |
| Routing | `Routing.tsx` | create + flat coverage | matrix, rules GET, tester | P0 | FE-6.1–6.2 | FE-0 | Open |
| SLA | `Sla.tsx` | CRUD+changelog (forme) | visual cards; ticket timers B1 | P1/P0 | FE-6.3, FE-3.3 | B1 | Open |
| Admin skeleton | `Admin.tsx` | users/OU/settings rute | unified tabs; ops placeholder | P1 | FE-9.1–9.4 | FE-1, FE-8 | Open |
| Realtime | (nema u referenci) | detail+notif+settings | list/dashboard invalidate | P0 | FE-7.1–7.3 | FE-2, FE-3 | Open |
| Shared primitives | `ui.tsx`, `charts.tsx`, `index.css` | subset | charts, Progress, aliases | P0 | FE-0.1–0.6 | none | Open |

---

## 11. Dependency / order map

```
FE-0.1 → FE-0.4 → FE-0.6
FE-0.2 → FE-0.5 → FE-2.2 / FE-4.2 / FE-6.3
FE-0.3 → FE-5.2 / FE-6.2
FE-0.6 → FE-1.1 → FE-1.2 → FE-1.3
FE-1.1 → FE-3.2
FE-0.5 + FE-2.1 → FE-2.2 → FE-2.3 → FE-2.4
FE-2.1 → FE-4.1 → FE-4.2 → FE-4.3
FE-0.1 → FE-3.1 → FE-3.5
B1 → FE-3.3
FE-3.1 → FE-7.1
FE-5.1 → FE-5.2 → FE-5.3
FE-5.4 → FE-5.5
FE-6.1 → FE-6.2
FE-1.4 → FE-7.2
FE-3.4 → FE-7.3
FE-6 + FE-5 + FE-4 + FE-3 + FE-2 → FE-8.*
FE-1.1 → FE-9.1 → FE-9.2/9.3/9.4
```

Linear implementation prompt sequence je u §15.

---

## 12. Definition of Done (global)

- [ ] kanonski theme tokens (hex iz theme-source; dual alias dozvoljen)
- [ ] shared primitives (Badge, Button aliases, Card, PageHeader, Tabs, Progress, Field/Input, Charts, EmptyState)
- [ ] reference-equivalent layout (shell 248/h-14, content max-w 1400)
- [ ] reference-equivalent spacing (kartice gap-3, header mb-5)
- [ ] reference-equivalent states (empty/loading/error)
- [ ] nema proizvoljnih novih radiusa (>8px kartice, pill CTA)
- [ ] nema proizvoljnih boja
- [ ] nema proizvoljnih shadowa (samo floating)
- [ ] nema hardcoded fake podataka tamo gdje postoji API/state
- [ ] postojeće funkcionalnosti nisu regresirane
- [ ] Socket.IO nije regresiran (detail join, notifications, settings, session)
- [ ] keyboard/focus/a11y pravila prolaze (`N`, `⌘K`, focus ring)
- [ ] responsive ponašanje provjereno (lg sidebar, sheet, stacked ticket grid)
- [ ] `npm run build` prolazi (`frontend/`)
- [ ] relevantni testovi prolaze (`frontend` vitest)
- [ ] task checkbox označen tek nakon provjere

---

## 13. Visual QA checklist

Po ekranu, prije označavanja taska:

1. PageHeader: breadcrumb 11.5px, title 19px (Ticket Detail title ostaje 16px ID — KEEP).
2. Jedan H1 po stranici.
3. Badge = tekst + tone; boja nije jedini nosilac.
4. Tabular-nums na ID, brojačima, tajmerima.
5. Ticket ID `#7FA8F5` + hover underline.
6. UNROUTED uvijek danger i vidljiv.
7. Kritičan = danger + Flame u inboxu.
8. Hover kartice: border `#31405C`, ne sjena.
9. Dropdown: `pop-in` + `shadow-xl shadow-black/40`.
10. Mobile: sidebar sheet 270px; tabele horizontal scroll.
11. EmptyState: šta se desilo + sljedeći korak.
12. Relativno vrijeme ima apsolutni `title` (`RelativeTime` KEEP).

---

## 14. Open blockers

### B1 — Ticket SLA snapshot nije na `TicketResponse`

**Činjenica:** backend persistira `responseDueAt` / `resolutionDueAt` / pause / breach; FE vidi samo `isOverdue?: boolean`.
**Utjecaj:** Ticket Detail SLA panel i dashboard “avg odziv” / remaining kolona ne mogu biti reference-identični bez izmišljenih brojeva.
**Preporuka:** mali backend DTO task — izložiti postojeći snapshot na GET ticket/list. To **nije** vizuelni-only backend. Dok nije odobreno, UI koristi `isOverdue` + status pause.
**Nije blocker za:** overdue badge/filter (već ima).

### B2 — Nema reports pack/export API

Faza 8. FE-4 radi aggregacije + disabled export.

### B3 — Nema routing PATCH/DELETE/enable niti GET change-log

Ne implementirati. Create + list + coverage + resolve.

### B4 — Groups list API UNVERIFIED

Nema `frontend` groups service; backend `Controller('groups')` nije nađen. Routing create i dashboard HBars mogu ostati na UUID dok se ne potvrdi endpoint.

### B5 — Catalog `categoryId` / description / downtime na list DTO UNVERIFIED

`ServiceResponse` u FE nema `categoryId` / `description`. Ne crtati fake kategorije.
`runtimeAvailability` i `requiresApproval` **jesu** na DTO — prikazati u FE-5.1. Downtime traka samo iz `runtimeAvailability.activeDowntimeWindow`.

### B6 — Knowledge tags/views/helpfulPct nisu u domain DTO

Ne izmišljati. Filter po service/status/stale.

Nisu blocker: Ticket Detail rewrite (ne treba); Socket.IO skeleton (radi); Admin puna logika (namjerno FE-9 skeleton).

---

## 15. Next prompt sequence

Izvoditi **jedan** prompt po tasku, bez preskakanja dependency-ja:

`FE-0.1 → FE-0.2 → FE-0.3 → FE-0.4 → FE-0.5 → FE-0.6 → FE-1.1 → FE-1.2 → FE-1.3 → FE-1.4 → FE-1.5 → FE-2.1 → FE-2.2 → FE-2.3 → FE-2.4 → FE-3.1 → FE-3.2 → FE-3.4 → FE-3.5 → FE-3.3 (samo ako B1) → FE-4.1 → FE-4.2 → FE-4.3 → FE-5.1 → FE-5.2 → FE-5.3 → FE-5.4 → FE-5.5 → FE-6.1 → FE-6.2 → FE-6.3 → FE-7.1 → FE-7.2 → FE-7.3 → FE-8.1 → FE-8.2 → FE-8.3 → FE-9.1 → FE-9.2 → FE-9.3 → FE-9.4`

Napomena: FE-2.4 Reports link može se privremeno sakriti dok FE-4.1 ne doda rutu.

---

## Audit confirmation log

| Stavka | Ishod |
| --- | --- |
| Reference moduli (svi page + Shell/ui/charts/nav/core) | potvrđeno čitanjem |
| Current moduli (router, shell, dashboard, tickets, services, KB, routing, SLA, users, OU, settings) | potvrđeno |
| Ticket Detail KEEP | potvrđeno — ista IA, API-backed |
| Knowledge | potvrđeno — list/create/lifecycle/feedback; nema detail |
| Routing | potvrđeno — coverage+create; GET rules/resolve neiskorišteni |
| SLA admin | potvrđeno — CRUD+changelog |
| SLA ticket timers | blocker B1 |
| Usluge | potvrđeno — list+form prepare; backend CRUD/onboarding bez FE clienta |
| Dashboard | potvrđeno — KPI+recent, bez chartova |
| Reports | potvrđeno odsutnost |
| Admin skeleton | potvrđeno raspršene rute |
| Socket.IO | potvrđeno detail+notif+settings; list ne |
| Groups API | UNVERIFIED |
| Catalog category on DTO | UNVERIFIED |
| Addon reports flag u FE settings client | UNVERIFIED |
| Session store | custom localStorage; `zustand` u package.json neiskorišten |
| `TicketOverdueBadge` na list tabeli | KEEP — već postoji; inbox-only tvrdnja odbačena |
| `service-catalog-api.ts` CRUD/onboarding | **nema** wrappera (domain audit pretjerao) |
| Dashboard “pažnja” tabela (referenca) | dodano u FE-2.3 |
| NewTicket `max-w-[1060px]` | dodano u FE-3.5 |
| UNROUTED ∉ group inbox | dodano u FE-3.2 |
| KPI Waiting/Approval/Unrouted deep-link | dodano u FE-2.1 |
| `connectTicketSocket` | neiskorišten; KEEP singleton `acquireHelpdeskSocket` |

Parallelni auditi (nakon prvog nacrta): [Audit domain matrices docs](cf5f9451-ccbe-464e-818f-d9ddad428e1b), [Audit reference pages](cc6fea0c-492e-4ffe-963c-bd4e67e51ca9), [Audit current frontend modules](4f9473be-a3b2-43d5-bc2b-fbacd7f7bb95). Plan je zakrpan; implementacija i dalje nije krenula.

---

Predložena git poruka kad se ovaj dokument commita (samo na zahtjev):

`docs: add frontend reference alignment plan from Phase 7 audit`
