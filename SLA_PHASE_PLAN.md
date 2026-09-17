# EP-HelpDesk — Fazni plan: SLA engine (SLA_PHASE_PLAN.md)

**Scope:** isključivo SLA (backend `modules/sla`, frontend `pages/sla-page.tsx` + `components/sla/*`, i direktne veze — notifications fan-out, config-versioning apply za SLA, reports ako se doda compliance metrika). Ništa van ovog scope-a se ne dira.

**Osnova:** RAW spec (SLA engine sekcije), duboka analiza `backend/src/modules/sla/*` i `frontend/src/{pages,components}/sla*`, poređenje sa `referenca-dizajn/src/pages/Sla.tsx`.

---

## Nalazi (sažetak, detalji u svakoj fazi)

1. **KRITIČNO:** eskalaciona notifikacija ide generičkim ticket participantima, ne konfigurisanom `targetGroupId` — `resolve-notification-recipients.ts` ne zna za eskalaciona pravila.
2. **KRITIČNO:** nema CRUD-a za `SlaEscalationRule` — jedini pisac je `apply-sla-snapshot.ts` (config-version apply). Nema admin forme, nema direktnog API-ja.
3. Model eskalacije podržava samo `targetGroupId` — RAW traži role/group/user.
4. ~~"Prvi odgovor" (response) se markira samo na `IN_PROGRESS` status — RAW definicija: "prva poruka **ili** prelazak u IN_PROGRESS". Prva poruka trenutno ne okida response completion.~~ **Riješeno u Fazi 2** (`AGENT_REPLY` → `agent_replied` + postojeći `IN_PROGRESS` put).
5. ~~`notifyBeforeOverdueMinutes` (T-minus pre-overdue upozorenje) — settings ključ postoji, nigdje se ne koristi u logici. Postoji samo breach detekcija (post-factum), ne i "uskoro će probiti SLA" upozorenje.~~ **Riješeno u Fazi 3** (`isResponseAtRisk`/`isResolutionAtRisk` + runtime eventi + badge).
6. SLA "usklađenost/compliance %" (referenca: kartica "Usklađenost (30 dana)") — ne postoji nigdje, ni backend agregacija ni frontend prikaz.
7. `requireAdminReasonForRuleChanges` i `maxEscalationLevels` — settings ključevi definisani, nikad učitani u `SlaConfiguration` niti provjereni u logici (reason je trenutno *uvijek* obavezan, bez obzira na flag — mrtav ključ).
8. Frontend (`sla-page.tsx`) je tab-switcher (Profili/Kalendari) — referenca je master-detail layout (profil lista lijevo, detalji profila desno: tabela prioriteta, kalendar kartica, "Pauze i eskalacije" kartica, "Usklađenost" kartica, sve vidljivo odjednom bez tab-prebacivanja). Nema "trenutno izloženih" real-time brojača po prioritetu.
9. Postojeće `SlaRulesTable`/service+OU+priority pravila (stvarni RAW model) moraju ostati u novom dizajnu — referenca pojednostavljuje na samo profil×prioritet, mi imamo bogatiji, ispravniji model (service+OU+priority override + fallback profil) koji dizajn treba da prikaže jasno, ne da ga izbaci u korist referentnog pojednostavljenja.

---

## Faza 1 (P0, KRITIČNO) — Eskalacije: ispravan target + CRUD

**Problem:** vidi nalazi #1, #2, #3.

1. **Backend — ispravka notifikacije (prvo, prije bilo čega drugog u ovoj fazi):**
   - [x] `resolve-notification-recipients.ts` — dodaj eksplicitno grananje za `notificationTypes.ticketSla` (eskalacioni tip) koje čita `targetGroupId` (i buduće `targetRole`/`targetUserId` iz tačke 3 niže) sa `SlaEscalationRule` zapisa vezanog za taj escalation event, i vraća članove tog cilja kao recipients — ne generičku ticket-participant listu.
   - [x] Test: eskalacija sa `targetGroupId = X` šalje notifikaciju **isključivo** članovima grupe X, ne assignee/participantima tiketa (osim ako se slučajno preklapaju).

2. **Backend — proširi model targeta (role/group/user):**
   - [x] Prisma: dodaj `targetRole String?` i `targetUserId String?` na `SlaEscalationRule` (`User` relacija za `targetUserId`), sa constraint-om (aplikativnim, ne DB) da je tačno jedan od `targetGroupId`/`targetRole`/`targetUserId` postavljen. Migracija.
   - [x] Ažuriraj `resolve-notification-recipients.ts` grananje iz koraka 1 da pokriva sva tri tipa targeta.

3. **Backend — CRUD za `SlaEscalationRule`:**
   - [x] Novi `sla-escalation-rules.controller.ts` (isti guard pattern kao `sla-rules.controller.ts`: `SessionAuthenticationGuard`+`RoleGuard`+`admin`+`RequirePermissions(slaWrite)`): `POST/GET/PATCH/DELETE`, vezano na `slaProfileId`.
   - [x] Enforce `maxEscalationLevels` (nalaz #7 — sada se konačno koristi): blokiraj kreiranje nivoa eskalacije iznad limita za taj profil, jasna greška.
   - [x] Validacija: `triggerOffsetMinutes` mora rasti sa nivoom (nema smisla da nivo 2 okine prije nivoa 1) — provjeri da li se "nivo" uopšte trenutno eksplicitno broji (redoslijed po `triggerOffsetMinutes`?) i formalizuj.
   - [x] Zadrži `apply-sla-snapshot.ts` funkcionalnim (config-version apply treba i dalje moći da postavi eskalaciona pravila kao dio verzije) — ne diraj taj put, samo dodaj alternativni direktni CRUD pored njega. Ako se oba puta mogu sukobiti (npr. direktna CRUD izmjena pa activate stare config verzije je prepiše), prijavi to kao poznato ograničenje u handoff-u, ne rješavaj u ovoj fazi.
   - [x] Reuse `change-log`/`recordSlaChange` pattern iz `sla-rules.service.ts` za audit svake CRUD izmjene (reason+diff, RAW zahtjev).

4. **Backend — email eskalacije:**
   - [x] `private.ticket.sla.escalations.emailEnabled` postoji kao settings ključ ali se nigdje ne koristi. Ako je `true`, escalation event treba pored in-app i email dispatch prema istom targetu (reuse postojeći `notifications`/email modul, isti mehanizam kao ostale email notifikacije u sistemu — ne piši novi email sistem).

5. **Frontend:**
   - [x] `services/sla-api.ts` — CRUD pozivi za escalation rules.
   - [x] Nova forma/panel `sla-escalation-rule-form.tsx` + `sla-escalation-rules-panel.tsx` (po uzoru na `sla-rule-form.tsx`/`sla-rules-table.tsx` stil) — izbor tipa targeta (rola/grupa/korisnik — dropdown koji se mijenja po tipu), trigger offset, nivo.
   - [x] Ugradnja u SLA stranicu ide u **Fazu 6** (redizajn) — u ovoj fazi samo napravi komponente, funkcionalno dostupne (privremeno može biti nova tab stavka ako se Faza 6 još nije desila, da bude testabilno).
   - [x] BS + EN i18n.

**Verifikacija:** eskalacija sa role/group/user targetom šalje notifikaciju tačnom primaocu (ne ticket participantima); CRUD radi (create/edit/delete escalation rule); `maxEscalationLevels` blokira višak nivoa; email dispatch radi kad je `emailEnabled=true`; `npm run test`/`build` (frontend), backend testovi.

**Handoff / poznata ograničenja:**
- Plumbing: system-event body = `action:slaEscalationRuleId`; fan-out parsira rule id i resolve-uje target.
- SLA runtime notifikacije idu kroz `dispatchSlaRuntimeNotification` (u runtime registruje `NotificationsFanOutService` → in-app + email).
- Email za SLA: samo escalation eventi, i samo ako je `private.ticket.sla.escalations.emailEnabled=true` (breach ne šalje email).
- Nivo = 1-based index kad se pravila sortiraju po `triggerOffsetMinutes` ASC unutar profila; offseti moraju biti strogo rastući / unique.
- Direktni CRUD vs `apply-sla-snapshot` mogu se međusobno prepisati — neriješeno u ovoj fazi (namjerno).
- Config snapshot collect/parse još uvijek nose samo `targetGroupId` (ne diran `apply-sla-snapshot.ts`).

---

## Faza 2 (P0) — Ispravka detekcije "prvog odgovora"

**Problem:** vidi nalaz #4. `isSlaFirstResponseStatus` reaguje samo na `IN_PROGRESS` status. RAW: "prva meaningful reakcija agenta (prva poruka **ili** prelazak u IN_PROGRESS)".

1. **Backend:**
   - [x] Pronađi gdje se agent poruka kreira na tiketu (`tickets` modul, message creation put) i dodaj poziv koji markira SLA response completion (ista logika kao `sync-ticket-sla-timers.ts` trenutno radi za `IN_PROGRESS`, samo drugi okidač) — **samo za poruke koje šalje agent/handler, ne za requester-ove poruke** (requester poruka nije "reakcija agenta").
     - Implementacija: `tickets-collaboration.service.ts` na `MessageType === 'AGENT_REPLY'` poziva `applyTicketSlaTimers(..., event: 'agent_replied')`; `sync-ticket-sla-timers.ts` `applyLifecycle` markira preko `markTicketSlaResponded` (idempotentno).
   - [x] Ne diraj postojeći `IN_PROGRESS` put — oba okidača moraju raditi, koji god se prvi desi.
   - [x] Test: tiket dobije prvu agentovu poruku bez promjene statusa → response se markira kao completed; tiket promijeni status na `IN_PROGRESS` bez prethodne poruke → response se markira (postojeće ponašanje, ne smije se pokvariti); requester poruka sama po sebi ne markira response; oba eventa → `respondedAt` ostaje isti (jednom).

**Ograničenje:** samo backend logika, ne diraj frontend u ovoj fazi.

**Verifikacija:** oba scenarija iz testa gore rade; `npm run test` (backend). ✅ (`tickets.sla-timers.spec.ts`)

---

## Faza 3 (P1) — Pre-overdue T-minus upozorenja

**Problem:** vidi nalaz #5. `notifyBeforeOverdueMinutes` postoji kao settings ključ, nigdje se ne koristi. Trenutno postoji samo breach (post-factum) detekcija.

1. **Backend:**
   - [x] U `sla-configuration.loader.ts` učitaj `notifyBeforeOverdueMinutes` u `SlaConfiguration` (trenutno nije ni tu, provjeri).
   - [x] `evaluate-ticket-sla-breach.ts`/`ticket-sla-timers.service.ts` — dodaj novo stanje "uskoro overdue" (npr. `isResponseAtRisk`/`isResolutionAtRisk` na `TicketSlaStateRecord`) koje se postavlja kad preostalo vrijeme padne ispod `notifyBeforeOverdueMinutes`, prije stvarnog breach-a.
   - [x] `emitTicketSlaRuntimeEvents` — novi event tip za "at risk" prelaz (slično kao breach event), sa notifikacijom istim putem koji je popravljen u Fazi 1 (target grupa/rola/korisnik — vjerovatno isti target kao response/resolution eskalacija nivo 0, ili poseban "at risk" target — odluči i objasni).
   - [x] Test: tiket čije preostalo vrijeme padne ispod praga dobija "at risk" oznaku prije nego što probije SLA.

2. **Frontend:**
   - [x] Prikaz "at risk" stanja u ticket listi/detalju (badge, boja) pored postojećeg overdue badge-a — provjeri gdje se overdue trenutno prikazuje (`ticket-detail-page.tsx`/liste) i dodaj paralelno stanje, ne zamjenjuj overdue.
   - [x] BS + EN i18n.

**Verifikacija:** at-risk stanje se pojavljuje prije breach-a na tačnom pragu; notifikacija se šalje; `npm run test`/`build`.

**Handoff / poznata ograničenja:**
- Settings ključ `private.ticket.sla.notifyBeforeOverdueMinutes` (default 30) sada je u registryju + `SlaConfiguration`.
- Persistirani flagovi `isResponseAtRisk` / `isResolutionAtRisk` na `TicketSlaState`; breach ima prioritet (at-risk se gasi kad je breached/completed).
- At-risk notifikacija ide **handleru tiketa** (`assignedUserId` + članovi `assignedGroupId`) — isti non-escalation branch kao breach u `resolve-sla-notification-recipients.ts`. Eskalacioni targeti (Faza 1) ostaju za post-breach nivoe; nema posebnog "at risk target" koncepta.
- API: `isAtRisk` na ticket response + at-risk flagovi u `sla` snapshotu. UI badge se ne prikazuje kad je već overdue.

---

## Faza 4 (P1) — SLA usklađenost (compliance) metrika

**Problem:** vidi nalaz #6. Referenca prikazuje "Usklađenost (30 dana)" — % tiketa unutar SLA cilja, po profilu, response i resolution odvojeno. Ne postoji nigdje u kodu.

1. **Backend:**
   - [x] Nova agregacija (u `sla` ili `reports` modulu — odluči gdje logički pripada, vjerovatno `reports` jer je to već agregacioni sloj iz ranijih faza; ako ide u `sla`, objasni zašto odstupaš) — za dati period (default 30 dana), po profilu: % tiketa gdje `isResponseBreached=false` na trenutku RESOLVED/CLOSED (response compliance), isto za resolution.
   - [x] Endpoint (novi ili prošireni postojeći `reports`/`sla` GET) koji vraća ovu metriku.
   - [x] Test: agregacija tačno računa % na poznatom test datasetu.

2. **Frontend:**
   - [x] Prikaz ide u **Fazu 6** (redizajn) kao "Usklađenost" kartica — u ovoj fazi samo backend + API klijent poziv spreman za ugradnju.

**Ograničenje:** ne pravi punu vizuelnu karticu ovdje ako Faza 6 još nije urađena — samo osiguraj da je podatak dostupan i tipiziran na frontendu (`services/sla-api.ts` ili `services/reports-api.ts`).

**Verifikacija:** endpoint vraća tačne brojeve na test podacima; `npm run test`/`build`.

**Handoff / poznata ograničenja:**
- Modul: `sla` (ne `reports`) — metrika je po profilu, globalno; `reports` forsira OU scope + `reports.export`, a SLA admin stranica (Faza 6) koristi `/sla/*`.
- Endpoint: `GET /sla/compliance?days=30` (admin read, bez `slaWrite`).
- Dataset: terminal statusi `RESOLVED`/`CLOSED`/`ARCHIVED` sa `TicketSlaState.slaProfileId != null`; `completionAt = closedAt ?? resolvedAt` mora pasti u rolling window; bez state/profila se isključuju.
- Response/resolution %: udio gdje breach flag === false; `sampleCount === 0` ⇒ percenti `null`.
- Frontend: `fetchSlaCompliance` u `sla-api.ts` — bez UI kartice (Faza 6).

---

## Faza 5 (P2) — Housekeeping: `requireAdminReasonForRuleChanges`

**Problem:** vidi nalaz #7 (dio o reason). Trenutno je `reason` uvijek obavezan na SLA mutacijama, bez obzira na settings flag — flag je mrtav.

1. **Odluka (stani i pitaj prije koda ako nisi siguran):** ili (a) settings flag postaje stvarno funkcionalan (reason opcionalan kad je `false`), ili (b) flag se briše iz settings registry-ja kao nepotreban jer je "uvijek obavezno" ionako ispravno ponašanje po RAW-u (RAW ne kaže da je opciono, samo da postoji flag — provjeri RAW tekst ponovo prije odluke). Preporuka: (b) je vjerovatno ispravnije (manje rizika, reason treba uvijek postojati za audit kvalitet) — ali eksplicitno potvrdi prije brisanja settings ključa da ništa drugo na njega ne referencira.
2. Implementiraj odabranu opciju, test, i18n ako treba tekstualna promjena.

**Verifikacija:** ponašanje konzistentno sa odlukom; `npm run test`.

---

## Faza 6 (P1) — Frontend redizajn SLA stranice po referenci

**Problem:** vidi nalaz #8, #9. Ovo je posljednja faza — objedinjuje sve što je Fazama 1-5 izgrađeno (eskalacije, at-risk, compliance) u jedan finalni layout.

**Referenca:** `referenca-dizajn/src/pages/Sla.tsx` — otvori prvo, prije koda.

1. **Layout:** master-detail — lijevo lista SLA profila (kod, naziv, opis, kalendar, broj aktivnih pravila/tiketa koji ga koriste — badge), desno detalji izabranog profila: sve odjednom, bez tab-prebacivanja:
   - Kartica "Ciljevi po prioritetu" — tabela Prioritet/Prvi odgovor/Rješenje/Mjerenje/**Trenutno izloženih** (real-time broj otvorenih tiketa tog prioriteta koji koriste ovaj profil — novi mali backend upit ili reuse postojeće ticket liste sa filterom).
   - **Dodatno u odnosu na referencu (zadrži, ne izbaci):** prikaz service+OU+priority `SlaRule` override-a koji se odnose na ovaj profil (referenca to nema jer je mock pojednostavljen — mi imamo stvaran model, mora biti vidljiv, npr. kao sekcija ispod glavne tabele "Override pravila" sa postojećom `SlaRulesTable` komponentom filtriranom po profilu).
   - Kartica "Kalendar" — reuse postojeći `SlaCalendarWeekGrid` + holidays lista (već postoji, samo premjesti u novi layout).
   - Kartica "Pauze i eskalacije" — pauze (waiting-for-user/pending-approval, statični opis iz settings vrijednosti) + lista eskalacija za ovaj profil (iz Faze 1 CRUD-a, sa target prikazom rola/grupa/korisnik).
   - Kartica "Usklađenost (30 dana)" — bar chart iz Faze 4 agregacije.
   - Dugme "Novi profil" u header-u (već postoji funkcionalnost, samo repozicioniraj u novi layout).
2. Zadrži postojeće guard-ove/permission provjere (`slaWrite` za izmjene) — redizajn je prezentacioni, ne mijenja pristupna prava.
3. BS + EN i18n za sve nove labele/raspored.

**Ograničenja (cijela Faza 6):**
- Fajlovi ≤150 linija — razbij novi layout na više komponenti (profile-list, profile-detail-header, priority-table, calendar-card, pauses-escalations-card, compliance-card).
- Ne mijenjaj backend u ovoj fazi — sve što treba već je izgrađeno u Fazama 1-4.
- Desktop 1440 + mobile 390 provjera izgleda, opiši u handoff-u.

**Verifikacija:** vizuelno poređenje sa `referenca-dizajn/src/pages/Sla.tsx` (uz napomenu gdje se svjesno odstupa zbog bogatijeg modela — service+OU+priority override sekcija); sve funkcionalnosti iz Faza 1-5 vidljive i upotrebljive u novom layoutu; `npm run test`/`build`.

---

**Redoslijed rada:** 1 → 2 → 3 → 4 → 5 → 6, strogo tim redom (6 zavisi od 1-5 jer objedinjuje njihove rezultate u finalni UI). Svaka faza se potvrđuje prije prelaska na sljedeću, isti princip kao R-serija faza.
