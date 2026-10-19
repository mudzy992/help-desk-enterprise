# Modul 4: Dashboard — ponovni audit

Datum ponovnog audita: **2026-10-19**
Grana: `arena/bd31e07b-help-desk-enterprise`
Auditirani HEAD: `0726c19`
Status: **potrebna je nova implementacijska iteracija prije 10/10**

## 1. Izvršni sažetak

Dashboard ima dobru osnovu: server-side brojače, razdvojeno kritično i progresivno učitavanje, React Query keš, realtime invalidaciju, semantičke grafikone, staff/requester varijante, setup checklist i 30 fokusiranih testova. Raniji D1–D19 rad uglavnom je stvarno prisutan.

Ponovni audit ipak ne potvrđuje raniji status „zatvoren“. Pronađeni su aktivni produkcijski gapovi koje stari audit nije obuhvatio ili ih je proglasio prihvaćenim rizikom:

- brojevi i odredišne liste nekoliko metričkih kartica nemaju isti skup tiketa;
- inbox broj i grupni grafikon koriste samo prvu stranicu, pa su netačni iznad page limita;
- kvar pomoćnog inbox zahtjeva može izgledati kao stvarno prazan inbox;
- paralelni reloadovi i promjena korisnika nemaju zaštitu od zastarjelog odgovora;
- 14-dnevni grafikon nije egzaktan niti semantički tačan za „riješeno“, a može napraviti do šest sekvencijalnih zahtjeva;
- granica dana se ne osvježava pouzdano ako dashboard ostane otvoren preko ponoći;
- page-level, component-state i stvarni browser tokovi nisu dovoljno pokriveni.

### Trenutna ocjena nakon Faze 1: **8.8/10**

Faza 1 je uskladila metričke linkove sa brojačima, prebacila inbox metriku na server `total`, razdvojila inbox error od empty stanja i uklonila duplo capability čitanje. Ocjena ostaje ispod 10/10 zbog otvorenih concurrency, recovery, day-boundary, volume, setup-checklist, test-depth i browser/profiler nalaza. Konačnih 10/10 zahtijeva i izvršene browser/E2E i profiler dokaze; neizvršeni testovi se ne računaju kao prolaz.

## 2. Obim

### Primarni scope

- `frontend/src/pages/dashboard-page.tsx`;
- `frontend/src/components/dashboard/**`;
- `frontend/src/lib/dashboard/**`;
- `frontend/src/lib/setup-checklist/**`;
- `frontend/src/services/report-summary-api.ts` i `setup-checklist-api.ts`;
- dashboard query ključevi, realtime invalidacija i direktno korišteni ticket/notification/session helperi.

### Cross-layer scope

- `backend/src/modules/reports/summary/**` i `report-summary.service.ts`;
- `backend/src/modules/setup-checklist/**`;
- ticket list/counts/unrouted ugovori koje dashboard direktno koristi;
- relevantni E2E i accessibility scenariji samo kao pregled postojećeg pokrića.

### Van scopea

- Reports stranica i privatni reporting dashboard iz modula 8;
- opći audit svih notification, ticket i install tokova;
- redizajn cijelog application shella.

## 3. Metodologija i izvršeni dokazi

Ponovo su pročitani aktivni import putevi, query ključevi, pagination contract, server brojači, staff/requester grane, pomoćni failure kanali, realtime reload, setup checklist, i18n/a11y markup i test katalog.

Izvršeno nad `0726c19`:

- ciljani Vitest za dashboard i setup-checklist scope: **7/7 fajlova, 30/30 testova**;
- pregled svih 2.596 linija primarnog dashboard/setup scopea;
- pregled backend summary i setup-checklist ugovora;
- marker pregled je pronašao više historijskih `Val/Faza/Paket/Phase` komentara u produkcijskim fajlovima;
- E2E/Playwright i browser profiler **nisu pokrenuti** u ovom reaudit koraku.

Posljednji puni frontend gate na istom HEAD-u iz Tickets closeouta ostaje: **340/340 Vitest fajlova, 1379/1379 testova**, build/TypeScript/format/i18n prolaze, ESLint ima 0 grešaka i 12 upozorenja izvan ticket scopea. To je regresioni signal repozitorija, ali nije browser dokaz za Dashboard.

## 4. Potvrđene jake strane

1. Dashboard summary brojači računaju se na serveru unutar vidljivog ticket scopea.
2. Kritični podaci učitavaju se paralelno kroz `loadDashboardPrimary`; lookupi ne blokiraju prvi prikaz.
3. Realtime silent reload invalidira dashboard/list/count/inbox prefikse prije ponovnog čitanja.
4. SLA watchlist traži `slaDueAt asc`, a kritični nedodijeljeni imaju zaseban upit.
5. Unrouted summary broj koristi kanonski `buildUnroutedWhere()`.
6. Deep-link parser razumije status, priority, overdue i at-risk parametre.
7. Requester ne vidi staff-only metrike, SLA/inbox panele ni internu assignment kolonu.
8. Donut i area grafikon imaju tekstualni/a11y contract; datumske oznake koriste aktivni locale.
9. Notification kvar se više ne prikazuje kao „nema aktivnosti“; postoji retry.
10. Setup checklist backend je permission-guarded i frontend ne prikazuje karticu neadministratoru.
11. Fokusirani helper, metric-link, invalidation, hook i setup-card testovi postoje i prolaze.

## 5. Novi nalazi

| ID | Ozbiljnost | Status | Nalaz i dokaz | Kriterij zatvaranja |
|---|---|---|---|---|
| DA1 | Visoka | **Zatvoreno — Faza 1** | **Metric count → list contract nije tačan.** `open` vodi na `view=all`, a backend open broji samo PENDING/UNROUTED/ASSIGNED/IN_PROGRESS. `critical` broji samo critical+open, ali link šalje samo `priority=CRITICAL`, pa može uključiti terminalne tikete. `unrouted` broji kanonski queue (uključuje fallback PENDING), ali link šalje samo `status=UNROUTED`. | Svaka kartica mora koristiti kanonski query/view koji vraća isti skup kao njen brojač; dodati contract test brojač → href → parsed API query. |
| DA2 | Visoka | **Zatvoreno — Faza 1** | **Inbox metrika je page-size broj, ne total.** `listGroupInbox()` vraća `.items` prve stranice, a hook iz toga računa `inboxTickets.length`. Za inbox veći od default page sizea kartica prikazuje premali broj. | Koristiti `listGroupInboxPage()` i `total`; dokazati testom gdje je `total > items.length`. |
| DA3 | Srednja | **Zatvoreno — Faza 1** | **Grupni inbox grafikon je nepotpun bez oznake.** `groupInboxCounts()` agregira samo prvu stranicu, ali UI vrijednosti predstavlja kao broj tiketa po grupi. | Dodati backend group agregat ili jasno modelirati/predstaviti „prikazani uzorak“; preferirano je egzaktno server-side grupisanje. |
| DA4 | Visoka | **Zatvoreno — Faza 1** | **Pomoćni kvar može izgledati kao prazno stanje.** Group inbox greška se pretvara u `null`; kada je unrouted 0, `DashboardInboxSnapshot` sa `inboxTickets=null` renderuje `dashboard.inboxEmpty`. Korisniku se transportni/permission kvar predstavlja kao dokaz da nema tiketa. | Uvesti eksplicitno loading/error/unavailable stanje i retry; nikad ne renderovati empty bez uspješnog odgovora. |
| DA5 | Visoka | Otvoreno | **Nema latest-request/account-switch zaštite.** `reload()` može biti aktivan tokom realtime reloada ili promjene `currentUserId`; stariji primary ili lookup odgovor može poslije novijeg upisati `summary`, inbox i mape iz prethodnog konteksta. Cleanup ne poništava asinhrone state upise. | Monotoni request token ili AbortSignal za primary i progressive fazu; test A→B promjene korisnika i out-of-order reloadova. |
| DA6 | Srednja | Otvoreno | **Silent reload kvar je potpuno nevidljiv.** Catch za `silent=true` samo vraća kontrolu; nema telemetry signala, stale/unavailable indikatora ni testa oporavka nakon sljedećeg eventa. | Sačuvati stare podatke, ali evidentirati telemetry i izložiti nenametljiv stale/retry signal; test fail → recovery. |
| DA7 | Visoka | Otvoreno | **Volume grafikon nije 10/10 contract.** „Resolved“ obuhvata samo tikete kreirane u istom 14-dnevnom prozoru; do 300 redova se učitava kroz najviše šest sekvencijalnih poziva, a iznad toga UI prikazuje donju granicu. Raniji „prihvaćen rizik“ ostavlja netačnu poslovnu metriku. | Server-side daily aggregate za created i resolved po njihovim vlastitim datumima i reporting timezoneu; jedan bounded zahtjev, egzaktan rezultat i backend/frontend contract test. |
| DA8 | Srednja | Otvoreno | **Dan se ne rotira pouzdano preko ponoći.** `localDayKey()` se računa tokom rendera, ali nema timer/subscription koji garantuje render na promjeni dana. Otvoren dashboard može nastaviti prikazivati jučerašnji `openedToday`. | Uvesti day-boundary invalidaciju/refetch prema dogovorenoj reporting timezone semantici i test sa fake timerom preko ponoći. |
| DA9 | Srednja | **Zatvoreno — Faza 1** | **Capability izvor je i dalje dupliran.** Stranica čita capabilities, a `useDashboardSummary()` se poziva bez već izračunatog `isStaff`, pa hook ponovo poziva `useSessionCapabilities`. React Query vjerovatno deduplicira mrežu, ali tvrdnja starog audita da stranica prosljeđuje boolean nije tačna. | Izračunati `isStaff` jednom na page boundaryju i proslijediti ga hooku; testirati staff/requester request matricu. |
| DA10 | Srednja | Otvoreno | **Setup checklist failure UX je tih.** Početni read kvar sakrije karticu, a dismiss kvar samo vrati dugme bez poruke/request ID-a. Administrator ne zna je li akcija uspjela niti može razlikovati „sve završeno“ od nedostupnog checklista. | Modelirati loading/error/dismiss error, retry i `ApiErrorText`/toast; zadržati dashboard funkcionalnim. |
| DA11 | Srednja | Otvoreno | **Pokriće ne zaključava glavne produkcijske grane.** Postojeći hook spec ima 3 testa i mockuje compose/volume; nema page testa, inbox snapshot testa, activity testa, race/account-switch testa, pagination-total testa, day rollovera ni cijelog metric contracta. | Dodati integration/component matricu po DA1–DA10; testirati stvarne query inpute i vidljiva stanja, ne samo helper mockove. |
| DA12 | Niska | Otvoreno | **Production comment hygiene nije završena.** Aktivni dashboard/report-summary fajlovi sadrže historijske `Val`, `Faza`, `Paket`, `Phase`, `M15/B*` oznake i komentar u `compose-dashboard-summary.ts` ima prazno `server counters ()`. | Zamijeniti historijske oznake trajnim domain/architecture objašnjenjima i dodati dashboard hygiene guard. |
| DA13 | Validacija | Neizvršeno | **Browser/E2E i profiler dokaz nedostaju.** Postoje accessibility smoke scenariji, ali nema dokaz kartica → filtrirana lista, role varijanti, progressive/realtime recoveryja, inbox > page size ni React Profiler mjerenja. | Izvršiti dogovorenu browser matricu i profiler na realnom/authenticated stacku; ne računati čitanje speca kao prolaz. |

## 6. Faza 1 — implementacijski closeout

Faza „Kanonske metrike i inbox contract“ zatvorila je **DA1, DA2, DA3, DA4 i DA9**:

- open i critical kartice šalju isti četverostatusni skup koji backend koristi za njihove brojače;
- unrouted kartica vodi na kanonski inbox `unrouted` queue, umjesto užeg `status=UNROUTED` skupa;
- dashboard koristi `listGroupInboxPage()` i server-side `total`, uključujući `totalIsCapped` prikaz sa `+`;
- grupna raspodjela je eksplicitno označena kao prikaz prve stranice kada je total veći od učitanih stavki;
- inbox loading, error, request ID i retry su odvojeni od legitimnog empty stanja;
- `isStaff` se računa jednom na page boundaryju i prosljeđuje summary hooku;
- uklonjen je stari `listGroupInbox()` array wrapper koji je skrivao pagination metadata.

Regresioni dokaz nakon implementacije: **8/8 dashboard test fajlova, 34/34 testa**, frontend TypeScript i ciljani ESLint prolaze. Dodani su testovi za kanonske metric URL-ove, `total > items.length`, error-vs-empty i oznaku djelimične grupne raspodjele.

## 6. Korekcije prethodnog audita

- D14 nije zatvoren kako je opisano: `DashboardPage` trenutno ne prosljeđuje `isStaff` u `useDashboardSummary`.
- D4 je zatvoren samo za prikazane brojeve, ne i za kliknuto odredište; unrouted kartica i kanonski queue nisu isti skup.
- D7 se za cilj 10/10 više ne prihvata kao dokumentacijski rizik: naziv poslovne serije mora odgovarati podacima.
- D17 nije potpuno zatvoren. Novi hook test je koristan, ali tri mock-heavy slučaja ne pokrivaju produkcijske race/error/pagination grane.
- Tvrdnja da dashboardu „treba samo prva inbox stranica“ nije validna za metric total ni egzaktne group barove.
- Prethodnih 8/10 bilo je razumno nakon vala 6.1, ali status „zatvoren“ i arhivski nalazi više nisu dovoljno precizan operativni plan.

## 7. Fazni plan do 10/10

### Faza 1 — kanonske metrike i inbox contract (završena)

**DA1, DA2, DA3, DA4, DA9**

1. Definisati tipizirani metric destination/query contract umjesto ručno pisanih URL stringova.
2. Uskladiti open/critical/unrouted count skupove sa list endpoint queryjem.
3. Prebaciti inbox na page envelope (`items`, `total`, metadata).
4. Za group distribuciju dodati egzaktan agregat ili eksplicitno ukloniti tvrdnju da page sample predstavlja total.
5. Uvesti inbox loading/error/retry state.
6. Proslijediti jedan page-level `isStaff` u summary hook.

**Gate:** za svaki metric postoje count/query parity testovi; inbox `total > items.length` je pokriven; greška se ne prikazuje kao empty.

### Faza 2 — determinističko učitavanje i recovery

**DA5, DA6, DA8, DA10**

1. Dodati request generation/abort granicu oko primary i lookup faze.
2. Spriječiti state write nakon unmounta i A→B session promjene.
3. Modelirati silent reload stale signal, telemetry i oporavak.
4. Uvesti day-boundary refetch.
5. Dodati setup checklist read/dismiss error i retry feedback.

**Gate:** out-of-order, account-switch, unmount, silent fail→success i midnight fake-timer testovi prolaze.

### Faza 3 — egzaktan 14-dnevni agregat

**DA7**

1. Proširiti backend summary ili dodati uski endpoint za daily `createdCount` i `resolvedCount`.
2. Koristiti installation reporting timezone i jasne inclusive/exclusive granice.
3. Ukloniti šestostruko client-side ticket pagination učitavanje i `volumeTruncated` kompromis.
4. Dodati backend test za tiket kreiran prije prozora, a riješen unutar prozora.

**Gate:** jedan bounded zahtjev, egzaktnih 14 bucket-a, cross-layer response contract i bez „lower bound“ stanja.

### Faza 4 — test dubina i održivost

**DA11, DA12**

1. Dodati page/component testove za loading, empty, error, role i progressive panele.
2. Testirati `DashboardInboxSnapshot`, `DashboardActivityFeed` i kompletan metric href/query contract.
3. Proširiti hook testove stvarnim compose putem gdje je racionalno.
4. Očistiti fazne komentare i uvesti hygiene guard.
5. Izvršiti puni frontend Vitest, TypeScript/build, ESLint, format, i18n/design-system i relevantni backend Jest.

**Gate:** svi DA1–DA12 zatvoreni dokazom; `git diff --check` čist; nijedan infrastrukturno blokiran test nije predstavljen kao prolaz.

### Faza 5 — browser i profiler closeout

**DA13**

Browser matrica:

- requester i staff dashboard;
- open/critical/overdue/unrouted/waiting/approval kartica → vidljivi filter i odgovarajući rezultati;
- inbox veći od jedne stranice;
- primary loading, pomoćni loading/error/retry i realtime recovery;
- setup checklist read, navigacija i dismiss failure;
- responsive prikaz na uskom viewportu;
- accessibility scan sa tastaturom i screen-reader imenima grafikona.

Profiler matrica:

- initial mount;
- progressive lookup completion;
- jedan ticket realtime event;
- notification event;
- filter/list navigacija nazad na dashboard.

Bilježiti commit duration, broj commitova i neočekivane rerendere za `DashboardPage`, metric grid, charts, inbox snapshot i activity feed. Memoizaciju uvoditi samo gdje mjerenje potvrdi problem.

**Gate za 10/10:** svi funkcionalni nalazi zatvoreni, browser matrica stvarno prošla i profiler rezultat dokumentovan. Ako E2E bude eksplicitno izuzet u budućem zadatku, najviša dokaziva ocjena ostaje 9.8/10.

## 8. Preporučeni commit redoslijed

1. `fix(dashboard): align metric links and inbox totals`
2. `fix(dashboard): make progressive reloads race safe`
3. `feat(dashboard): serve exact daily ticket volume`
4. `test(dashboard): cover page states and contract parity`
5. `refactor(dashboard): remove phase-specific comments`
6. `docs(audit): close dashboard findings`

Svaku fazu treba zasebno verifikovati, commitovati i pushati. Ne spajati server agregat, race zaštitu i browser closeout u jedan teško pregledljiv diff.

## 9. Mapa postojećih nalaza na novu iteraciju

| Stari nalaz | Reaudit odluka |
|---|---|
| D1 | Djelimično regresiran na semantic parity nivou; nastavlja se kao DA1. |
| D2, D8 | Implementacija potvrđena; zadržati regresione testove. |
| D3 | Osnovna invalidacija potvrđena; recovery/race dubina nastavlja se kroz DA5/DA6. |
| D4, D5 | Brojevi uglavnom usklađeni, ali destination i error/page contract nisu; DA1–DA4. |
| D6, D7, D18 | Client volume kompromis nije dovoljan za 10/10; DA7. |
| D9 | Error prikaz postoji; dodati component test kroz DA11. |
| D10 | Nema funkcionalnog razloga za obaveznu row apstrakciju; ostaje zatvoren bez refaktora. |
| D11–D13, D15, D16, D19 | Implementacije potvrđene, osim što D19 ne dokazuje identičan attention skup. |
| D14 | Ponovo otvoren kao DA9. |
| D17 | Ponovo otvoren i proširen kao DA11/DA13. |

## 10. Zaključak

Dashboard nije kandidat za rušenje ili široki redizajn. Potrebna je precizna korekcija ugovora: **broj, kliknuta lista i panel moraju govoriti o istom skupu**, svaki async kanal mora razlikovati loading/error/empty, a reload mora biti siguran na konkurentnost i promjenu sesije. Nakon toga server-side 14-dnevni agregat uklanja posljednji veliki performance i semantički kompromis.

Plan iznad priprema modul za stvarnih 10/10 bez prikrivanja prihvaćenih rizika i bez proglašavanja neizvršenog browser testa prolazom.
