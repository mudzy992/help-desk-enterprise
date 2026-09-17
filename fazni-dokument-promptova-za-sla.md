# fazni-dokument-promptova-za-sla.md

Svaki blok ispod je samostalan prompt za jednu fazu iz `SLA_PHASE_PLAN.md`. Agent se referencira na taj dokument radi konteksta, ali prompt sadrži dovoljno detalja da ne mora nagađati scope.

---

## Faza 1

Radiš na `help-desk-enterprise-master` projektu. Postupi po **Fazi 1** iz `SLA_PHASE_PLAN.md`. Scope: isključivo SLA eskalacije — backend `modules/sla`, `modules/notifications/fan-out`, nova `sla-escalation-rules.controller.ts`, frontend escalation komponente. Ne diraj ništa van ovog scope-a (Faze 2-6 su odvojene isporuke).

## Kontekst — najkritičniji nalaz u cijelom SLA modulu

`resolve-notification-recipients.ts` (u `backend/src/modules/notifications/fan-out/`) trenutno **nema nikakvo grananje** za `notificationTypes.ticketSla` (eskalacioni event tip) — pada u generičku granu koja vraća ticket participante/assignee. To znači: kad SLA eskalacija "opali", notifikacija ide **istim ljudima koji već rade na tiketu**, ne konfigurisanom `targetGroupId` iz `SlaEscalationRule`. Cijeli mehanizam eskalacije je trenutno funkcionalno besmislen — popravi ovo **prvo**, prije bilo čega drugog u ovoj fazi.

Drugi potvrđen nalaz: `SlaEscalationRule` redovi se **jedino** kreiraju kroz `apply-sla-snapshot.ts` (config-version apply tok) — ne postoji CRUD controller, ne postoji admin forma. Treći nalaz: model ima samo `targetGroupId` (RAW traži role/group/user).

## Zadaci

1. **Backend — ispravka notifikacije (obavezno prvo):**
   - U `resolve-notification-recipients.ts` dodaj eksplicitno grananje za `notificationTypes.ticketSla` koje pronalazi `SlaEscalationRule` vezano za taj konkretan escalation event (parsiraj iz `firedEscalationKeys`/`extraAfter.slaEscalationRuleId` koji `emit-ticket-sla-runtime-events.ts` već prilaže) i vraća **članove `targetGroupId`** kao recipients, umjesto generičke ticket-participant liste.
   - Test: eskalacija sa `targetGroupId = X` šalje notifikaciju isključivo članovima grupe X.

2. **Backend — proširi model targeta:**
   - Prisma migracija: dodaj `targetRole String?` i `targetUserId String?` na `SlaEscalationRule` (`User` relacija za `targetUserId`). Aplikativna validacija: tačno jedan od `targetGroupId`/`targetRole`/`targetUserId` mora biti postavljen (ne DB constraint, provjeri u servisu).
   - Ažuriraj grananje iz koraka 1 da pokrije sva tri tipa (rola → svi useri sa tom rolom; user → taj jedan user; group → članovi grupe, kao dosad).

3. **Backend — CRUD:**
   - Novi `sla-escalation-rules.controller.ts`: `POST/GET/PATCH/DELETE`, vezano na `slaProfileId`. Guard: `SessionAuthenticationGuard`+`RoleGuard`+`admin`+`RequirePermissions(permissionKeys.slaWrite)` (isti pattern kao `sla-rules.controller.ts`).
   - Učitaj `maxEscalationLevels` iz settings (trenutno se nigdje ne koristi — dodaj u `sla-configuration.loader.ts` ako već nije) i enforce ga: blokiraj kreiranje escalation rule-a iznad limita za dati profil, greška `MAX_ESCALATION_LEVELS_EXCEEDED`.
   - Validacija redoslijeda: `triggerOffsetMinutes` raste sa nivoom — formalizuj kako se "nivo" računa (vjerovatno redoslijed po `triggerOffsetMinutes` unutar profila) ako trenutno nije eksplicitan.
   - **Ne diraj `apply-sla-snapshot.ts`** — config-version apply mora ostati funkcionalan kao alternativni put. Ako uočiš da direktna CRUD izmjena i naknadna aktivacija stare config verzije mogu doći u konflikt (prepisati jedno drugo), **ne rješavaj to u ovoj fazi** — samo jasno prijavi u handoff-u kao poznato ograničenje.
   - Reuse `recordSlaChange`/change-log pattern iz `sla-rules.service.ts` za audit (reason+diff obavezno na svaku CRUD izmjenu).

4. **Backend — email eskalacije:**
   - `private.ticket.sla.escalations.emailEnabled` — ako `true`, escalation event šalje i email (pored in-app) istom targetu iz koraka 2, kroz postojeći email/notifications mehanizam (ne piši novi email sistem, reuse postojeći template/dispatch put iz `notifications` modula).

5. **Frontend:**
   - `services/sla-api.ts` — CRUD pozivi za escalation rules, tipovi 1:1 sa backend DTO-ovima (uključujući novi target-tip shape).
   - `components/sla/sla-escalation-rule-form.tsx` (forma: tip targeta dropdown koji mijenja drugi input — rola select / grupa select / korisnik search, trigger offset, nivo) i `components/sla/sla-escalation-rules-panel.tsx` (lista + add/edit/delete), po vizuelnom uzoru na postojeći `sla-rule-form.tsx`/`sla-rules-table.tsx`.
   - Ugradnja u glavnu SLA stranicu ide u Fazu 6 — ovdje samo napravi komponente funkcionalno dostupne (privremeno kao dodatna tab stavka u postojećem `UnderlineTabs` u `sla-page.tsx`, da bude testabilno prije redizajna).
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 2-6.
- Bez mock podataka. Ako `firedEscalationKeys`/`extraAfter` shape iz `emit-ticket-sla-runtime-events.ts` ne nosi dovoljno informacije da se pouzdano poveže na `SlaEscalationRule` red za resolve u koraku 1, stani i prijavi prije nego što izmišljaš workaround.

**Verifikacija (obavezno prijavi rezultate):**
- Eskalacija sa role/group/user targetom šalje notifikaciju tačnom primaocu, ne ticket participantima (test za sva tri tipa targeta).
- CRUD radi end-to-end (create/edit/delete escalation rule kroz UI).
- `maxEscalationLevels` blokira višak nivoa sa jasnom greškom.
- Email dispatch radi kad je `emailEnabled=true`, ne šalje se kad je `false`.
- `npm run test`, `npm run build` (frontend); odgovarajući backend testovi.

**Obavezno:** čekiraj (`- [x]`) završene stavke direktno u `SLA_PHASE_PLAN.md` (sekcija "Faza 1") i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 2 dok se ne potvrdi.

---

## Faza 2

Radiš na `help-desk-enterprise-master` projektu. Prethodna faza (Faza 1 — eskalacije) je završena. Postupi po **Fazi 2** iz `SLA_PHASE_PLAN.md`. Scope: isključivo detekcija "prvog odgovora" u `backend/src/modules/sla` i `backend/src/modules/tickets` (samo tačka gdje se poruka kreira). Ne diraj frontend, ne diraj Fazu 1/3-6.

## Problem (potvrđen)

`is-sla-pause-status.ts` → `isSlaFirstResponseStatus(status)` markira response completion **samo** kad status pređe u `IN_PROGRESS`. RAW definicija (eksplicitna): "**Response**: prva meaningful reakcija agenta (**prva poruka ili** prelazak u `IN_PROGRESS`)". Trenutno, ako agent odgovori porukom bez promjene statusa, SLA response timer nastavlja da tiče iako je "meaningful reakcija" već desila.

## Zadatak

1. Pronađi tačnu funkciju/servis u `backend/src/modules/tickets` gdje se agent/handler poruka kreira na tiketu (poruka koju šalje agent, ne requester — provjeri postojeći `MessageType`/participant-role razlikovanje da tačno izoluješ "agent je odgovorio" slučaj, ne bilo koju poruku).
2. Na tom mjestu pozovi isti mehanizam koji `sync-ticket-sla-timers.ts` trenutno koristi za `IN_PROGRESS` prelaz (`mark-ticket-sla-completion.ts` ili ekvivalentna funkcija) da markira response kao completed — **samo ako response još nije markiran** (idempotentno, ne prepisuj ako je već completed npr. iz ranijeg IN_PROGRESS prelaza).
3. Ne diraj postojeći `IN_PROGRESS` okidač — oba puta moraju raditi paralelno, koji god se prvi desi "pobjeđuje" (response se markira jednom, na prvi od ta dva eventa).
4. Requester-ova poruka **ne smije** okinuti response completion — eksplicitno provjeri i testiraj ovaj negativni slučaj.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Samo backend, samo ova tačna logika — ne diraj eskalacije (Faza 1, gotovo), ne diraj compliance/at-risk (Faze 3-4, dolaze kasnije).
- Bez mock podataka. Ako mjesto kreiranja poruke u `tickets` modulu nema jasnu distinkciju agent-vs-requester autora na nivou koji ti treba, stani i prijavi umjesto da nagađaš iz drugih signala.

**Verifikacija (obavezno prijavi rezultate):**
- Tiket dobije prvu agentovu poruku bez promjene statusa → response markiran kao completed.
- Tiket promijeni status na `IN_PROGRESS` bez prethodne poruke → response i dalje markiran (postojeće ponašanje nije pokvareno).
- Oba eventa se dese (prvo jedno pa drugo) → response markiran samo jednom, bez greške/duplog upisa.
- Requester poruka sama po sebi → response NIJE markiran.
- `npm run test` (backend).

**Obavezno:** čekiraj (`- [x]`) Faza 2 stavku direktno u `SLA_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 3 dok se ne potvrdi.

---

## Faza 3

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1 — eskalacije, 2 — response detekcija) su završene. Postupi po **Fazi 3** iz `SLA_PHASE_PLAN.md`. Scope: pre-overdue "at risk" upozorenja, backend `modules/sla` + notifikacije (reuse Faza 1 mehanizma), frontend badge prikaz. Ne diraj Faze 1/2/4-6.

## Problem (potvrđen)

`private.ticket.sla.notifyBeforeOverdueMinutes` (T-minus pre-overdue upozorenje) je definisan settings ključ, ali se **nigdje ne koristi** u SLA logici. Trenutno postoji samo breach detekcija (`isResponseBreached`/`isResolutionBreached` — post-factum, nakon što je SLA već probijen). Nema "uskoro će probiti SLA" upozorenja.

## Zadatak

1. **Backend:**
   - `sla-configuration.loader.ts` — potvrdi/dodaj učitavanje `notifyBeforeOverdueMinutes` u `SlaConfiguration` tip (`sla.types.ts`).
   - `ticket-sla-timers.service.ts`/`evaluate-ticket-sla-breach.ts` — dodaj novo stanje na `TicketSlaStateRecord`: `isResponseAtRisk`/`isResolutionAtRisk` (boolean), postavljeno kad preostalo vrijeme do response/resolution roka padne ispod `notifyBeforeOverdueMinutes`, a rok još nije probijen (ne postavljati "at risk" nakon što je već "breached" — to su međusobno isključiva stanja, breach ima prioritet).
   - `emit-ticket-sla-runtime-events.ts` — novi event tip za prelaz u "at risk" (isti pattern kao postojeći breach event zapisi), sa notifikacijom kroz **isti target-resolving mehanizam popravljen u Fazi 1** — odluči i jasno objasni u handoff-u: da li at-risk notifikacija ide istom targetu kao eskalacija nivo 0/response owner (npr. handler grupa tiketa), ili treba poseban koncept "at risk target" (vjerovatno prvi, jednostavniji — objasni zašto).
   - Test: tiket čije preostalo vrijeme padne ispod praga dobija at-risk oznaku prije breach-a; nakon breach-a at-risk se ne prikazuje odvojeno (breach ima prioritet u prikazu/state-u).

2. **Frontend:**
   - Pronađi gdje se trenutno prikazuje overdue badge (`ticket-detail-page.tsx` i/ili liste tiketa) i dodaj paralelan "at risk" vizuelni indikator (drugačija boja/ikona od overdue, ne zamjenjuje ga).
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 1/2 (gotovo), 4-6.
- Bez mock podataka.

**Verifikacija (obavezno prijavi rezultate):**
- At-risk stanje se pojavljuje tačno na pragu `notifyBeforeOverdueMinutes` prije stvarnog breach-a.
- Notifikacija se šalje pravom targetu (reuse Faza 1 mehanizma, ne generic participants).
- At-risk i breach se međusobno ne dupliraju/kontradiktorno prikazuju.
- `npm run test`, `npm run build` (frontend); backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 3 stavku u `SLA_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 4 dok se ne potvrdi.

---

## Faza 4

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1-3) su završene. Postupi po **Fazi 4** iz `SLA_PHASE_PLAN.md`. Scope: SLA usklađenost (compliance) metrika — backend agregacija + API klijent (bez pune vizuelne kartice, to ide u Fazu 6). Ne diraj Faze 1-3/5/6.

## Problem (potvrđen)

Referentni dizajn (`referenca-dizajn/src/pages/Sla.tsx`, kartica "Usklađenost (30 dana)") prikazuje % tiketa unutar SLA cilja, po profilu, response i resolution odvojeno, za period (default 30 dana). Ova metrika **ne postoji nigdje** u trenutnom kodu (ni backend agregacija ni frontend).

## Zadatak

1. **Backend:**
   - Odluči gdje agregacija logički pripada — `reports` modul (već ima agregacioni sloj, `aggregate-bottleneck-dashboard.ts` kao presedan za pattern) je vjerovatno ispravan izbor; ako odlučiš da ide u `sla` modul umjesto toga, kratko objasni zašto u handoff-u.
   - Nova funkcija: za dati period (default 30 dana, parametrizuj), po SLA profilu, izračunaj: % tiketa gdje je `isResponseBreached === false` u trenutku kad je tiket dostigao `RESOLVED`/`CLOSED` (response compliance %), i isto za `isResolutionBreached` (resolution compliance %). Razmotri koji dataset koristiš — tiketi zatvoreni unutar perioda, ili svi tiketi trenutno u tom statusu čiji je datum zatvaranja u periodu — budi eksplicitan u handoff-u.
   - Novi endpoint (u `reports.controller.ts` ili `sla-profiles.controller.ts`, zavisno od odluke gore) koji vraća ovu metriku, sa guard-om istog nivoa kao ostali SLA/reports admin endpointi.
   - Test: agregacija tačno računa % na poznatom test datasetu (kreiraj fixture sa nekoliko tiketa, dio breached dio ne, provjeri tačan procenat).

2. **Frontend:**
   - `services/sla-api.ts` (ili `services/reports-api.ts`, zavisno od backend odluke) — tipiziran poziv na novi endpoint.
   - **Ne pravi punu vizuelnu karticu u ovoj fazi** — to ide u Fazu 6 zajedno sa ostatkom redizajna. Ovdje samo osiguraj da je podatak dostupan i tipiziran, spreman za ugradnju.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 1-3 (gotovo), 5, 6.
- Bez mock podataka — ako dataset odluka (koji tiketi ulaze u izračun) nije jednoznačna iz RAW teksta, napravi razuman izbor i eksplicitno ga navedi, ne ostavljaj nedefinisano.

**Verifikacija (obavezno prijavi rezultate):**
- Endpoint vraća tačne % brojeve na test podacima (navedi tačan test scenario i očekivani/dobijeni rezultat).
- `npm run test`, `npm run build` (frontend); backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 4 stavku u `SLA_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 5 dok se ne potvrdi.

---

## Faza 5

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1-4) su završene. Postupi po **Fazi 5** iz `SLA_PHASE_PLAN.md`. Scope: housekeeping za `requireAdminReasonForRuleChanges` settings ključ. Mali, brz zadatak. Ne diraj Faze 1-4/6.

## Problem (potvrđen)

`private.ticket.sla.requireAdminReasonForRuleChanges` je definisan settings ključ, ali `reason` je trenutno **uvijek obavezan** na SLA mutacijama (rule/profile/calendar), bez obzira na vrijednost ovog flag-a — flag se nigdje ne čita niti provjerava, mrtav je.

## Zadatak

1. **Prije koda — donesi odluku (i navedi je u handoff-u, ne moraš čekati potvrdu za ovu malu fazu, ali obrazloži izbor):**
   - Opcija A: flag postaje stvarno funkcionalan — `reason` postaje opcionalan kad je `requireAdminReasonForRuleChanges === false`.
   - Opcija B: flag se uklanja iz settings registry-ja jer je "reason uvijek obavezan" ispravno ponašanje za audit kvalitet nezavisno od bilo kakvog togglea (RAW ne traži eksplicitno da bude opciono, samo da flag postoji — ponovo pročitaj RAW liniju 517 prije odluke).
   - **Preporuka:** Opcija B (manje rizika, konzistentniji audit trag), ali provjeri prvo da li bilo šta drugo u kodu (frontend forma, drugi backend modul) referencira ovaj settings ključ prije brisanja — ako referencira, prijavi to i ne briši dok se ne razjasni.

2. Implementiraj odabranu opciju:
   - Ako A: učitaj flag u `SlaConfiguration`, uslovna validacija u `sla-rules.service.ts`/`sla-profiles.service.ts`/`sla-calendars.service.ts` (DTO validacija postaje uslovna umjesto uvijek-obavezne).
   - Ako B: ukloni ključ iz `setting-keys.ts`/`definitions/*.ts`, ukloni iz i18n rječnika ako je bio referenciran, potvrdi da ništa ne padne (test suite).

3. Test koji potvrđuje odabrano ponašanje.

**Ograničenja:**
- Fajlovi ≤150 linija.
- Ne diraj Faze 1-4 (gotovo), 6.

**Verifikacija (obavezno prijavi rezultate):**
- Ponašanje konzistentno sa odabranom opcijom, testirano.
- `npm run test` (backend, i frontend ako je i18n/settings UI dirano).

**Obavezno:** čekiraj (`- [x]`) Faza 5 stavku u `SLA_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 6 dok se ne potvrdi.

---

## Faza 6

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1-5) su završene — sve funkcionalnosti koje ova faza treba da prikaže (eskalacije, at-risk badge, compliance %, reason housekeeping) su izgrađene. Postupi po **Fazi 6** iz `SLA_PHASE_PLAN.md`. Scope: isključivo frontend, `pages/sla-page.tsx` + `components/sla/*`. Ovo je posljednja faza u SLA planu.

## Zadatak — redizajn po referenci

Otvori prvo `referenca-dizajn/src/pages/Sla.tsx` — drži se te strukture (raspored, redoslijed kartica), ali sa jednom namjernom nadogradnjom opisanom niže (tačka 3).

1. **Layout — master-detail** (zamjenjuje trenutni tab-switcher `UnderlineTabs` Profili/Kalendari pristup):
   - Lijeva kolona: lista SLA profila — kod, naziv, opis, kalendar kojem pripada, badge broja aktivnih pravila/tiketa. Klik mijenja izabrani profil (isti UX pattern kao referenca — dugme postaje "selected" stanje, ne navigacija).
   - Desna kolona, sve odjednom vidljivo (bez tab-prebacivanja):
     - Kartica "Ciljevi po prioritetu": tabela Prioritet / Prvi odgovor / Rješenje / Mjerenje (BH kalendar naziv) / **Trenutno izloženih** (real-time broj otvorenih tiketa tog prioriteta na ovom profilu — novi mali query ili reuse postojeće ticket-liste sa filterom po `slaProfileId`+`priority`+status nezavršen).
     - Kartica "Kalendar" — reuse postojeći `SlaCalendarWeekGrid` + holidays lista (premjesti komponentu iz trenutnog Calendars taba u ovaj layout, ne piši novu).
     - Kartica "Pauze i eskalacije" — statični opis pauza (waiting-for-user/pending-approval, iz settings vrijednosti pauseOnWaitingForUser/pauseOnPendingApproval) + lista eskalacija za ovaj profil (Faza 1 CRUD, `sla-escalation-rules-panel.tsx` — sad ugrađuje se ovdje umjesto u privremeni tab iz Faze 1).
     - Kartica "Usklađenost (30 dana)" — bar chart iz Faze 4 endpointa (response % i resolution % po profilu).
     - Dugme "Novi profil" u header-u stranice (funkcionalnost već postoji, samo repozicioniraj vizuelno).

2. **Zadrži ono što referenca nema, a mi moramo (RAW zahtjev, ne izbaci):**
   - Sekcija "Override pravila" (service+OU+priority `SlaRule` zapisi vezani za ovaj profil) — ispod glavne tabele "Ciljevi po prioritetu", reuse postojeći `SlaRulesTable` filtriran po `slaProfileId`. Referenca ovo nema jer je mock pojednostavljen na samo profil×prioritet — mi imamo bogatiji, ispravniji model i moramo ga prikazati, ne sakriti u korist pojednostavljenja.
   - `SlaChangeLogPanel` (već postoji) — dugme "Historija" na kartici "Ciljevi po prioritetu" (referenca ima ovo dugme, samo poveži na postojeću komponentu ako već nije).

3. **At-risk badge iz Faze 3** — vidljiv negdje u "Trenutno izloženih" koloni ili kao dodatna vizuelna oznaka (npr. dio brojke je "at risk", dio je "breached" — odluči čitljiv prikaz).

4. Razbij na komponente (fajlovi ≤150 linija): `sla-profile-list.tsx`, `sla-profile-detail-header.tsx`, `sla-priority-targets-table.tsx` (novi, zamjenjuje/nadograđuje trenutnu logiku), `sla-pauses-escalations-card.tsx`, `sla-compliance-card.tsx` — reuse postojeće (`SlaCalendarWeekGrid`, `SlaRulesTable`, `SlaChangeLogPanel`, `SlaEscalationRulesPanel` iz Faze 1) gdje god je moguće umjesto pisanja iznova.

5. Zadrži postojeće permission guard-ove (`slaWrite` za izmjene, čitanje dostupno svima ko ima pristup SLA stranici uopšte) — redizajn je isključivo prezentacioni, ne mijenja ko šta smije.

6. BS + EN i18n za sav novi raspored/labele.

**Ograničenja:**
- Ne diraj backend — sve što treba je izgrađeno u Fazama 1-4.
- Ne diraj Faze 1-5 funkcionalnost, samo je premjesti/ugradi u novi vizuelni raspored.

**Verifikacija (obavezno prijavi rezultate):**
- Vizuelno poređenje sa `referenca-dizajn/src/pages/Sla.tsx`, uz eksplicitnu napomenu gdje se svjesno odstupa (Override pravila sekcija) i zašto.
- Sve funkcionalnosti iz Faza 1-5 (eskalacije CRUD, at-risk badge, compliance %, reason ponašanje) vidljive i upotrebljive u novom layoutu.
- Desktop 1440 i mobile 390 provjera — opiši izgled/probleme u handoff-u.
- `npm run test`, `npm run build`.

**Obavezno:** čekiraj (`- [x]`) Faza 6 stavku u `SLA_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ovo je posljednja faza SLA plana — na kraju potvrdi da li je cijeli `SLA_PHASE_PLAN.md` (Faze 1-6) sada zatvoren, i navedi svaku otvorenu napomenu/poznato ograničenje iz prethodnih faza (npr. Faza 1 CRUD-vs-config-version konflikt) koje je ostalo neriješeno.
