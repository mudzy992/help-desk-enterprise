# Modul 4: Dashboard

Datum početnog audita: 2026-10-13
Datum zatvaranja: 2026-10-14
Grana: `arena/bd31e07b-help-desk-enterprise`
Referentni commit prije polish-a: `36c055a`
Status: **zatvoren**

Zatvaranje je potvrđeno čitanjem stvarnog koda i automatizovanim provjerama. Početni audit je otkrio URL, cache, sortiranje, brojače i a11y gapove; konačno stanje je opisano u sekcijama **Trenutna implementacija**, **Status ispravki** i **Završne provjere**. Deep-link parser je pokriven u `staff-deep-link-filters.spec.ts`, a href ugovor kartica u `dashboard-metric-grid.spec.tsx`. Ručna provjera u pregledaču nije izvršena.

---

## Modul

**Dashboard (početna za prijavljene korisnike).** Obuhvata:

- zaglavlje sa dugmadima „Izvještaji“ i „Novi tiket“
- mrežu od 9–11 kartica sa brojevima (zavisno od uloge)
- grafikon statusa (donut) i grafikon 14 dana (kreirano / riješeno)
- „SLA watchlist“ (prekoračeni tiketi), „Stanje inboxa“ (nerutirani i po grupama) i „Aktivnost“ (notifikacije) — samo za osoblje, aktivnost za sve
- tabelu „Pažnja“ (tiketi koje treba odmah pogledati)
- tabelu „Nedavni tiketi“

Granica modula: stranica `/` (`dashboard-page`), `components/dashboard/`, `lib/dashboard/` i API poziv `/reports/dashboard/summary` samo u mjeri u kojoj ga dashboard koristi. Izvještaji (`reports-page`, `reports-metric-grid`) pripadaju modulu 8.

---

## Povezani fajlovi i testovi

- Stranica i stanje: `frontend/src/pages/dashboard-page.tsx`, `frontend/src/lib/dashboard/use-dashboard-summary.ts`.
- Dashboard komponente: `frontend/src/components/dashboard/*`.
- Dashboard logika: `frontend/src/lib/dashboard/*`, uključujući `compose-dashboard-summary.ts`, `dashboard-ticket-sets.ts`, `build-volume-14d.ts`, `load-dashboard-volume.ts` i invalidaciju silent reload-a.
- Zavisnosti: `report-summary-api`, `tickets-api`, `tickets-counts-api`, `use-inbox-notifications`, `components/charts/*` i staff deep-link parser liste tiketa.
- Backend usklađenje D4: `backend/src/modules/reports/summary/load-dashboard-summary-counts.ts` i kanonski `buildUnroutedWhere()`.

**Relevantni testovi:**

- `components/dashboard/dashboard-metric-grid.spec.tsx`
- `lib/tickets/staff-deep-link-filters.spec.ts`
- `lib/tickets/ticket-page-query.spec.ts`
- `lib/dashboard/invalidate-dashboard-queries.spec.ts`
- `lib/dashboard/dashboard-ticket-sets.spec.ts`
- `lib/dashboard/compose-dashboard-summary.spec.ts`
- `lib/dashboard/load-dashboard-volume.spec.ts`
- backend `load-dashboard-summary-counts.spec.ts`, `get-ticket-counts.spec.ts` i `report-summary.service.spec.ts`

Brojevi linija nisu zamrznuti u auditu; za trenutno stanje vidi repo. Ne postoji dashboard hook integration spec niti e2e tok „kartica → filtrirana lista“; granica automatizovanog pokrića je eksplicitno navedena u D17.

---

## Trenutna implementacija (nakon vala 6.1)

**Učitavanje (D6).** `useDashboardSummary` renderuje metrike, karte, grafikon i tabele čim faza 1 (kritični podaci) završi: brojevi sa servera, SLA watchlist, nedavni, dodijeljeni meni, nedodijeljeni, kritični bez vlasnika (zaseban upit) i 14-dnevni volumen. Pomoćni lookupi (katalog, OU, routing pravila, grupni inbox) dolaze paralelno u pozadini i osvježavaju imena/grupe bez skeleton bljeska. `isLoading` se gasi nakon faze 1.

**Keširanje i invalidacija (D3, D5, D18).** Sve ide preko React Query-ja. Pri svakom silent (realtime) reloadu poziva se `invalidateQueries` za `dashboardSummaryPrefix`, `ticketLists`, `ticketCountsPrefix` i `groupInbox` prije `fetchQuery`, tako da se keš mlađi od 30 s nikad ne vraća. Ključ `dashboard-volume` uključuje `windowFrom`, čime je D18 zatvoren. Inbox snapshot (D5) koristi `useQuery` sa `queryKeys.ticketCounts`, dijeleći isti keš sa ostalim potrošačima brojača.

**URL deep linkovi (D1, D19).** Kartice na dashboardu šalju `status`, `priority`, `overdue`, `atRisk`; `staffDeepLinkFilters` ih parsira i prosleđuje u `TicketListFilters`. Ponovljeni `status=` parametri idu u `statusesFromDeepLink` koji se pretapa u serverski upit (filter chip prikazuje samo prvi, ali server filtrira po svima). Link „Sve“ iz Pažnje vodi na `/tickets?view=inbox`, što je kanonski prikaz „tickets that need attention“ (D19).

**SLA watchlist (D2).** Server sortira `overdue=true` po `slaDueAt asc`; klijent samo filtrira i kapira (bez re-sorta po `updatedAt`).

**Pažnja (D8).** Pored `unassigned` stranice, postoji zaseban serverski upit `priority=CRITICAL&unassigned=true`, pa kritični tiketi bez vlasnika nikad ne ispadaju iz skupa jer nisu bili među 8 najskorije ažuriranih.

**Nerutirani (D4, D5).** Jedinstvena definicija = _unrouted queue_ (`UNROUTED` + fallback-routed PENDING): backend `load-dashboard-summary-counts` sada broji kroz `buildUnroutedWhere()`, čime se kartica, sidebar bedž i inbox banner slažu. Inbox snapshot više nema ad-hoc `useEffect`.

**Grafikon (D7, D12).** Serija „riješeni“ se i dalje izvodi iz tiketa prozora (kreirani u 14d), ali naslov/podnaslov eksplicitno kaže „iz istog niza tiketa“ (prihvaćeno: ispravna semantika sa posebnim `resolvedFrom` upitom bi koštala još jedan krug stranica; objašnjenje: „Kreirani naspram riješenih, iz istog niza tiketa“ iskreno opisuje šta se broji). Oznake dana koriste `Intl.DateTimeFormat` sa aktivnim jezikom (D12).

**Notifikacije (D9).** `useInboxNotifications` čuva stare stvari kod greške i izlaže `listErrorKey`/`listRequestId`; `DashboardActivityFeed` prikazuje `ApiErrorText` sa „Pokušaj ponovo“ umjesto praznog stanja. Socket se refcountira preko `acquireHelpdeskSocket`, tako da feed i zvonce dijele jednu konekciju. Lista notifikacija nije zajednički React state: dva mounta hooka drže zasebne liste; to je prihvaćeno jer se izbjegava veći refaktor bez funkcionalnog kvara.

**Kolona Dodjela (D11).** Sakrivena je za podnosioce (ne-staff); vidljiva je za osoblje sa internim labelama (namjerno).

**Pristupačnost (D13).** Donut: SVG je `role="img"` sa `aria-label` opisom, a legenda je tastaturom dostupna (fokus na <button>), sa hover/focus sinhronizacijom sa centrom. Dual-area-chart već je imao `role="img"` + skrivenu `ChartDataTable` i ostaje takav.

**i18n (D16).** `ticketText` je uklonjen iz `dashboard-charts.tsx`; koristi se tipizirani `t()`.

**Sesija (D14).** Stranica prosljeđuje već riješeni `isStaff` u `useDashboardSummary(isStaff)`. Hook i dalje poziva `useSessionCapabilities()` radi fallbacka kada argument nije proslijeđen (npr. izolovani test/potrošač); oba čitanja koriste isti React Query session key, pa nema duplog mrežnog zahtjeva.

**Mrtva grana (D15).** Uklonjena je nedostižna `summary.total === 0` provjera unutar `DashboardCharts` (stranica je već prikazivala EmptyState).

**Testovi (D17).** Pokriveni su `staffDeepLinkFilters` (multi-status i zastavice), `selectSlaWatchlist`, `DashboardMetricGrid` href ugovor (4 linka), `toTicketPageQuery` i svi silent-reload query prefiksi kroz `invalidate-dashboard-queries.spec.ts`. Nema hook integration testa niti e2e klika do renderovane liste; prihvaćeno za ovaj polish jer parser, query mapping, href i invalidacija imaju fokusirane regresije, a browser provjera je iskreno ostavljena neizvršenom.

**Pokrivenost:** 222 test fajla / 949 testova; backend brojači imaju postojeći `get-ticket-counts.spec.ts` i `report-summary.service.spec.ts`.

**Poznata ograničenja:**

- SLA watchlist ne prikazuje broj sati prekoračenja po redu (odgovor servera ne izlaže `slaDueAt`; badge i sort vam govore koji su najkritičniji). Povećanje response shapea bi uticalo na više endpointa i širi je scope od modula 4.
- Prijedlog iz D10 (zajednička komponenta reda) nije primijenjen: širina i kolone se razlikuju (SLA red nema kolone, recent ima skraćeni set, attention je 7 kolona, a full `ticket-list-table` je 10+ kolona i uvezuje clipboard/bulk selekciju koji ne trebaju dashboardu). Povlačenje zajedničke `*Row` komponente bi povećalo diff bez funkcionalne koristi.

---

## Ocjena (zatvaranje val 6.1): 8/10

**Obrazloženje:** Kritični bugovi (D1, D2, D3, D4, D8) su ispravljeni, load phase je podijeljen na kritični + progresivni dio (D6), a dodati su regresioni testovi za kartice i URL parser. Preostali low-priority gapovi su ili zatvoreni ili eksplicitno dokumentovani kao prihvaćeni rizik sa obrazloženjem (D10: nema ROI za apstrakciju reda; D7: semantika ostaje „iz istog niza tiketa“ uz jasan naslov).

---

## Kriterij zatvaranja (val 6.1+)

Modul 4 je zatvoren kada su svi nalozi D1–D19 u statusu **Urađeno**, **Prihvaćen rizik** (sa datumom, razlogom i odbijenom alternativom) ili **Zaključeno** (istraživanje), i kada prolaze:

- `npx tsc -b` (frontend) — prolazi (0 grešaka).
- `npm run lint` — 0 novih grešaka (postojeća 14 upozorenja nisu u modulu 4).
- `npm run format:check` — svi izmijenjeni fajlovi formatirani.
- `npx vitest run` — 222 fajla / 949 testova, svi prolaze (uključujući nove `dashboard-metric-grid.spec.tsx` i proširene `staff-deep-link-filters.spec.ts`, `dashboard-ticket-sets.spec.ts`).
- `npm run build` — prolazi.
- Guard skripte (`check-hooks-order`, `check-ticket-id-leaks`) — prolaze.
- Svi D1–D19 imaju konačan status, a polazni nalazi su odvojeni kao arhiva koja nije izvor trenutnog stanja.

## Status ispravki

| #   | Status                           | Dokaz / test                                                                                                                                                                                                                                                                                                                                                                                      | Napomena                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Urađeno**                      | `staff-deep-link-filters.ts` (čita `status`, `priority`, `overdue`, `atRisk`); `ticket-page-query.ts` (multi-status kroz `statusesFromDeepLink`); `staff-deep-link-filters.spec.ts` (9 testova); `dashboard-metric-grid.spec.tsx` (4 linka).                                                                                                                                                      | Pojedinačni status je u filter state-u; ponovljeni idu kao array u serverski upit.                                                                                                                                                                                                                                |
| D2  | **Urađeno**                      | `use-dashboard-summary.ts` (`sort: "slaDueAt", dir: "asc"`); `dashboard-ticket-sets.ts` (uklonjen dupli sort); `dashboard-ticket-sets.spec.ts` ažuriran.                                                                                                                                                                                                                                          | **Prihvaćen rizik (2026-10-14):** Prikaz broja sati prekoračenja nije dodat — API response ne izlaže `slaDueAt`, a proširenje response shape-a je šireg opsega (moduli 3/8). Sort je ispravan; badge pokazuje da je tiket prekoračen.                                                                             |
| D3  | **Urađeno**                      | `use-dashboard-summary.ts` `reload(silent=true)` preko `invalidateDashboardQueries` invalidira `dashboardSummaryPrefix`, `ticketLists`, `ticketCountsPrefix` i `groupInbox` prije fetcha; `invalidate-dashboard-queries.spec.ts` zaključava sva četiri prefiksa.                                                                                                                                  | `fetchQuery` se sada poziva sa svježim kešom.                                                                                                                                                                                                                                                                     |
| D4  | **Urađeno**                      | `backend/.../load-dashboard-summary-counts.ts`: unrouted count sada koristi `buildUnroutedWhere()` (isti where kao `get-ticket-counts.ts`); `dashboard-inbox-snapshot.tsx` koristi RQ sa istog counta.                                                                                                                                                                                            | Jedna semantika (unrouted queue) svuda na stranici: kartica, sidebar bedž, banner.                                                                                                                                                                                                                                |
| D5  | **Urađeno**                      | `dashboard-inbox-snapshot.tsx` koristi `useQuery` sa `queryKeys.ticketCounts`; nema više ad-hoc efekta.                                                                                                                                                                                                                                                                                           | `ticketCountsPrefix` se invalidira u D3, pa snapshot ne ostaje stale dok se summary osvježi.                                                                                                                                                                                                                      |
| D6  | **Urađeno**                      | Faza 1 (kartice, karte, grafikon, tabele) postavlja `summary` i gasi `isLoading`; faza 2 (OU, catalog, routing, group inbox) se dešava paralelno i popunjava mape imena progresivno.                                                                                                                                                                                                              | **Prihvaćen rizik (2026-10-14):** 6×50 klijentsko stranicačenje za grafikon je zadržano (bez server agregata iz modula 8); nasuprot, sa uklonjenim sekvencijalnim čekanjem druge faze, kritični podaci se prikazuju ranije. Proširenje `/reports/dashboard/summary` sa 14-dnevnim agregatom bi mijenjalo modul 8. |
| D7  | **Prihvaćen rizik (2026-10-14)** | `dashboard-charts.tsx` + i18n `volumeChartSubtitle` = „Kreirani naspram riješenih, iz istog niza tiketa“ / „Created versus resolved, from the same ticket list“.                                                                                                                                                                                                                                  | Odbijena alternativa: poseban `resolvedFrom` stream bi udvostručio broj stranica; semantika ostaje iskreno opisana u podnaslovu.                                                                                                                                                                                  |
| D8  | **Urađeno**                      | `use-dashboard-summary.ts` dodaje `listTicketsPage({ unassigned: true, priority: "CRITICAL", ... })` kao četvrti izvor; `selectAttentionTickets` već prioritizuje kritične bez vlasnika.                                                                                                                                                                                                          | Kritični bez vlasnika nikad ne mogu ispasti iz skupa.                                                                                                                                                                                                                                                             |
| D9  | **Urađeno**                      | `use-inbox-notifications.ts` čuva `items` kod greške, izlaže `listErrorKey/listRequestId`; `dashboard-activity-feed.tsx` prikazuje `ApiErrorText` + retry. Socket se refcountira kroz `acquireHelpdeskSocket`, tako da feed i zvonce dijele jednu konekciju.                                                                                                                                      | **Prihvaćen rizik (2026-10-14):** lista notifikacija nije shared React state između dva mounta hooka. Odbijena alternativa: migracija obje površine na novi shared provider/RQ model u ovom polish-u; jedna socket konekcija i vidljiva greška zadovoljavaju funkcionalni cilj.                                   |
| D10 | **Prihvaćen rizik (2026-10-14)** | —                                                                                                                                                                                                                                                                                                                                                                                                 | Povlačenje zajedničke `DashboardTicketRow` komponente ne donosi funkcionalnu dobit; SLA red, attention (7 kolona), recent (3 kolone) i full `ticket-list-table` (10+ kolona, bulk opcije) se znatno razlikuju. Nastavak u zasebnom refaktoru.                                                                     |
| D11 | **Urađeno**                      | `dashboard-attention-table.tsx` prima `isStaff`; kolona „Dodjela“ i čelija se renderuju samo za osoblje; `dashboard-page.tsx` prosleđuje `isStaff`.                                                                                                                                                                                                                                               | Zadržane su interne labele za staff (namjerno); podnosilac ih više ne vidi.                                                                                                                                                                                                                                       |
| D12 | **Urađeno**                      | `build-volume-14d.ts` koristi `Intl.DateTimeFormat` sa `i18next.language` (kružni cache formatera).                                                                                                                                                                                                                                                                                               | Oznake dana prate jezik.                                                                                                                                                                                                                                                                                          |
| D13 | **Urađeno**                      | `donut.tsx`: SVG je `role="img"` sa `aria-label`; legenda je niz `<button>` elemenata sa `onFocus/onBlur` sinhronizacijom i aria-label sa postotkom. `dual-area-chart.tsx` već imao `role="img"` + `ChartDataTable`.                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                   |
| D14 | **Urađeno**                      | `dashboard-page.tsx` računa `isStaff` i prosljeđuje ga u `useDashboardSummary(isStaff)`; fallback hook ostaje unutar summary hooka za pozive bez argumenta.                                                                                                                                                                                                                                       | Jedan mrežni session upit preko zajedničkog React Query ključa; nije tačno tvrditi da postoji samo jedan React hook poziv.                                                                                                                                                                                        |
| D15 | **Urađeno**                      | Uklonjena `summary.total === 0` grana u `dashboard-charts.tsx`.                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                   |
| D16 | **Urađeno**                      | `dashboard-charts.tsx` koristi tipizirani `t(ticketStatusLabelKey[entry.status])`; `ticketText` import je obrisan.                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                                                                   |
| D17 | **Urađeno**                      | `dashboard-metric-grid.spec.tsx` (4 linka); prošireni `staff-deep-link-filters.spec.ts` (9); `dashboard-ticket-sets.spec.ts` (5); postojeći `compose-dashboard-summary.spec.ts`, `load-dashboard-volume.spec.ts`, `ticket-list-search-params.spec.ts` nastavljaju da prolaze. Backend `get-ticket-counts.spec.ts` i `report-summary.service.spec.ts` nisu mijenjani, ali ostaju u zelenom stanju. | Nema `use-dashboard-summary` integration speca ni e2e toka kartica → renderovana lista. Prihvaćeno: fokusirani testovi pokrivaju href, parser, query mapping, SLA setove i silent invalidaciju; vidi ručnu provjeru.                                                                                              |
| D18 | **Urađeno**                      | `queryKeys.ticketList({ view: "dashboard-volume", windowFrom, page })` uključuje `windowFrom`.                                                                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                   |
| D19 | **Urađeno**                      | Link „Sve“ u Pažnji vodi na `/tickets?view=inbox` (kanonski view za tikete koji trebaju pažnju); banner link za nerutirane vodi na `/tickets?view=inbox&inboxTab=unrouted`.                                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                   |

## Završne provjere (2026-10-14)

| Provjera                          | Nalog                   | Rezultat                                                                                                                     |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` (frontend)         | —                       | 0 grešaka (14 postojećih upozorenja izvan modula 4).                                                                         |
| `npm run format:check`            | —                       | Sve formatirano.                                                                                                             |
| `npx tsc -b` (frontend)           | —                       | 0 grešaka.                                                                                                                   |
| `npx vitest run`                  | —                       | 222 fajla / 949 testova, svi prolaze.                                                                                        |
| `npm run build`                   | —                       | Build prolazi.                                                                                                               |
| Guard `check-hooks-order.mjs`     | —                       | OK.                                                                                                                          |
| Guard `check-ticket-id-leaks.mjs` | —                       | OK.                                                                                                                          |
| Pregledač (ručna provjera)        | D1, D2, D3, D4, D6, D11 | **Nije izvršeno.** Automatizovano e2e-om nije pokriveno; preporuka vlasniku da klikne kartice i provjeri filtere u sandboxu. |

---

## Lista za ručnu provjeru u pregledaču

- D1: klik na „Kritični“, „Nerutirano“, „Prekoračeni“ i „Čeka korisnika“; provjeriti da li se lista filtrira.
- D2: uporediti prvih pet u SLA watchlist sa stvarnim rokovima (u tabeli tiketa, sortiranoj po roku).
- D3: u drugom tabu kreirati tiket, pa u prvom pratiti dashboard unutar 30 s od zadnjeg učitavanja.
- D4: uporediti „Nerutirano“ u kartici i banner u inbox kartici kad postoje fallback PENDING tiketi.
- D6: Network tab pri prvom učitavanju (broj i redoslijed zahtjeva).
- D11: prijaviti se kao podnosilac i provjeriti kolonu „Dodjela“ u „Pažnji“.

## Polazno stanje (arhiva audita 2026-10-13)

Sljedeći odjeljci bili su tačni prije vala 6.1.4 i čuvaju historiju nalaza; **ne opisuju zatvoreni modul**. Konačno stanje i odluke nalaze se iznad, u tabeli **Status ispravki**.

### Realno/željeno stanje

| Oblast                            | Željeno                                                          | Realno                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linkovi sa kartica                | Klik vodi na listu sa istim filterom                             | Pet linkova (`status=UNROUTED`, `priority=CRITICAL`, `overdue=true`, `status=WAITING_FOR_USER`, `status=PENDING_APPROVAL`) ne filtriraju listu (D1)  |
| SLA watchlist                     | Prikazuje najkritičnije (najduže prekoračene)                    | Sortira po `updatedAt`, pa top 5 može da izostavi najgore slučajeve (D2)                                                                             |
| „Pažnja“                          | Prikazuje najkritičnije tikete bez obzira na to kad su ažurirani | Uzima 8 po `updatedAt` iz svakog izvora, pa kritični bez vlasnika mogu da izostanu (D8)                                                              |
| Nerutirani                        | Jedna definicija na cijelom dashboardu                           | Kartica koristi `UNROUTED`, banner koristi red nerutiranih (`UNROUTED` + fallback PENDING). Na istoj stranici mogu biti dva različita broja (D4, D5) |
| Osvježavanje po realtime događaju | Odmah prikazuje promjenu                                         | Tiho osvježavanje koristi `fetchQuery`, koji vraća keš mlađi od 30 s. Promjena može kasniti do 30 s (D3)                                             |
| Grafikon „riješeno“               | Broj riješenih tiketa po danu                                    | Broji samo tikete koji su kreirani u prozoru i riješeni u prozoru (D7)                                                                               |
| Vrijeme učitavanja                | Kartice se prikazuju čim stignu podaci                           | Prvi prikaz čeka dvije grupe zahtjeva i do 6 uzastopnih stranica za grafikon (D6)                                                                    |
| Greška u aktivnosti               | Poruka o grešci                                                  | Greška se prikazuje kao „nema aktivnosti“ (D9)                                                                                                       |
| Pristup podnosioca                | Samo lični podaci, bez internih pojmova                          | Tabela „Pažnja“ i kolona „Dodjela“ prikazuju se i podnosiocu, sa pojmovima „nerutirano“ i „samo grupa“ (D11)                                         |
| Datumi i brojevi                  | Prate jezik aplikacije                                           | Oznake grafikona su `dd. MM` bez obzira na jezik (D12)                                                                                               |
| Dostupnost grafikona              | Tekstualna alternativa za čitače ekrana                          | Donut reaguje samo na miš, a SVG je `aria-hidden` (D13)                                                                                              |
| Testovi                           | Hook, stranica i ključni tokovi pokriveni                        | Samo 3 spec fajla za helpere; nema testova za hook, stranicu ni komponente (D17)                                                                     |

---

### Gap analiza

**Kritični i visoki gapovi**

1. **Linkovi sa kartica ne vode na filtrirane liste (D1).** `dashboard-metric-grid.tsx` (linije 124, 142, 150, 173, 180) i `dashboard-sla-watchlist.tsx` (linije 31, 42) šalju `status`, `priority` i `overdue` u URL. Lista tiketa iz URL-a čita samo `view`, `q`, `inboxTab`, `createdFrom`, `createdTo` i staff parametre (`forwarded`, `personal`, `hideMerged`, `unroutedOverdue`). Ostali parametri se ignorišu. Korisnik klikne „Kritični: 4“ i dobija **sve tikete** bez oznake filtera. Ovo je najvidljiviji nalaz modula, jer kartica obećava jednu stvar, a lista pokazuje drugu.

2. **SLA watchlist ne prikazuje najkritičnije (D2).** Server poziva `overdue=true, sort=updatedAt, dir=desc, pageSize=5` (`use-dashboard-summary.ts:127-136`), a `selectSlaWatchlist` opet sortira po `updatedAt`. Tiket koji je prekoračen tri dana, a dugo nije ažuriran, može biti izostavljen u korist tiketa koji su prekoračeni sat vremena, a nedavno su komentarisani. Server podržava `slaDueAt` (`list-tickets.constants.ts`), pa je dovoljno sortirati `slaDueAt, dir=asc`. Kartica takođe ne prikazuje koliko je tiket prekoračen (rok ili broj sati), pa korisnik ne vidi hitnost.

**Srednji gapovi**

3. **Realtime osvježavanje može prikazati staro stanje (D3).** Sumarni zahtjev, nedavni, prekoračeni, dodijeljeni, nedodijeljeni i grafikon idu kroz `fetchQuery`. Ako je zadnje učitavanje bilo prije manje od 30 s, `fetchQuery` vraća keš bez zahtjeva. Potvrđeno testom van repozitorija: drugi poziv unutar 30 s ne šalje zahtjev. Posljedica: tiket kreiran ili riješen u posljednjih 30 s ne pojavljuje se na dashboardu dok ne istekne `staleTime` ili se stranica ne osvježi ručno. Isti obrazac postoji u listi tiketa (vidi T26 u modulu 3).

4. **Dvije definicije „nerutiranih“ (D4, D5).** Server za sumarnu karticu broji samo status `UNROUTED` (`load-dashboard-summary-counts.ts:169`). Server za red nerutiranih (`get-ticket-counts.ts:122`, `unroutedQueue`) broji i `PENDING` tikete koje je sistem prebacio na fallback grupu. Banner u inbox kartici koristi drugu definiciju (`displayUnroutedCount = queueCount ?? unroutedCount`). Na istoj stranici korisnik može vidjeti „Nerutirano: 3“ i banner „5 nerutiranih“. Izvještaji (`bottleneck`) koriste treću varijantu (`isUnroutedQueueTicket`). Treba odlučiti koja je definicija ispravna i koristiti je svuda.

5. **Stanje inboxa ima svoj izvor podataka (D5).** `dashboard-inbox-snapshot.tsx:31-46` poziva `getTicketCounts()` direktno u efektu, bez React Query-ja i bez `queryKeys`. Ovo je treći izvor brojača na stranici (uz sumarni zahtjev i `useSidebarTicketCounts`, vidi T11 u modulu 3). Efekat zavisi od `unroutedCount`, pa se osvježava samo kad se taj broj promijeni, a ne kad se promijeni red.

6. **Sporo prvo učitavanje (D6).** Dvije grupe zahtjeva idu jedna iza druge: druga čeka kraj prve, a `isLoading` se gasi tek na kraju druge. Grafikon 14 dana čita do 6 stranica redom (do 300 punih tiketa) da bi izbrojao dane. Server već ima agregat (`/reports/dashboard/summary`), pa se serija dana može dobiti jednim zahtjevom. Za tipičan dan ostaje jedan zahtjev za grafikon, ali u dane sa velikim brojem tiketa dashboard čeka do šest zahtjeva prije prikaza.

7. **Grafikon „riješeno“ broji pogrešnu stvar (D7).** `buildVolume14d` dobija samo tikete kreirane u prozoru (`volumeTickets`, `createdFrom`), pa „riješeno“ znači „kreirano u prozoru i riješeno u prozoru“. Ticket kreiran prije 10 dana, a riješen danas, ne ulazi u današnji broj riješenih. Naziv serije i podnaslov obećavaju sve riješene tikete tog dana.

8. **„Pažnja“ može da izostavi kritične tikete bez vlasnika (D8).** `unassignedPage` uzima 8 nedodijeljenih po `updatedAt`. `selectAttentionTickets` zatim prioritizuje kritične, ali vidi samo tih 8. Kritičan tiket bez vlasnika koji nije ažuriran nedavno ne ulazi u listu. Komentar u `use-dashboard-summary.ts` (Val 1, M15/B6) kaže da je ovo već riješeno, ali ispravka je samo djelimična.

9. **Greška u aktivnosti izgleda kao prazno stanje (D9).** `useInboxNotifications.refreshList` u `catch` postavlja `setItems([])`, pa feed prikazuje „nema aktivnosti“ čak i kad API padne. Feed i zvonce imaju zasebne instance stanja i socket pretplate. Feed se ne sinhronizuje sa zvoncetom ako socket nije dostupan (treba potvrditi).

**Niski gapovi**

10. **Podnosilac vidi interne pojmove (D11).** Kartica „Pažnja“ i kolona „Dodjela“ (`AttentionAssignmentCell`) renderuju se bez provjere uloge. Podnosilac vidi „nerutirano“ i „samo grupa“ za svoje tikete. Treba provjeriti da li je to namjerno.

11. **Ponavljanje tabela za tikete (D10).** Ista logika za red tiketa (broj sa linkom, naslov, status, prioritet, `<tr onClick>`) postoji u četiri fajla: `dashboard-attention-table.tsx`, `dashboard-recent-tickets.tsx`, `dashboard-sla-watchlist.tsx` i `ticket-list-table.tsx`. Svaki ima svoje kolone i svoj `min-w`.

12. **Datumi grafikona nisu lokalizovani (D12).** `build-volume-14d.ts:79-83` formatira `dd. MM` bez obzira na jezik aplikacije. Engleski korisnik vidi „13. 10“.

13. **Grafikoni nisu pristupačni (D13).** `donut.tsx` prikazuje detalje na `onMouseEnter`, bez fokusa i bez tastature. SVG je `aria-hidden`, pa čitač ekrana ne dobija podatke. Legenda postoji, ali nije povezana sa podacima grafikona.

14. **Dupli zahtjevi za sesiju (D14).** `DashboardPage` i `useDashboardSummary` oba pozivaju `useSessionCapabilities()`. Ovo je posljedica nalaza A3 iz modula 2 i dodaje najmanje dva `GET /auth/session` zahtjeva po otvaranju dashboarda.

15. **Nedostižna grana u grafikonu (D15).** `DashboardCharts` ima svoju provjeru `summary.total === 0`, ali stranica ga već prikazuje kao prazno stanje pa ta grana nikad ne bude prikazana.

16. **Prevod kroz `ticketText` (D16).** `dashboard-charts.tsx:30` koristi `ticketText(t, ...)`, pa važe nalazi T4 iz modula 3.

17. **Pokrivenost testovima (D17).** Tri spec fajla pokrivaju helpere, a ne hook, stranicu, komponente ni tokove. Nema e2e scenarija „kartica → lista“, pa D1 nije mogao da se uoči automatski.

18. **Ključ grafikona bez prozora (D18, za provjeru).** Ključ `dashboard-volume` ne sadrži granicu prozora. Ispravno je samo zato što `staleTime` istekne za 30 s. Dovoljno za sada, ali fragilno.

---

### Mišljenje tima i preporuka

_Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima._

Dashboard ima dobru arhitekturu za svoj obim. Brojevi dolaze sa servera kao agregat, a ne računaju se u browseru. Metrike su tipizirane. Granica grafikona je iskrena (napomena kad je prozor pun). Nalazi o uslovima pristupa za podnosioca su pažljivo razmotreni. Problemi su u **sadržaju**: dashboard obećava da pokazuje šta treba pogledati, a u nekoliko slučajeva to ne radi.

- Kartice vode na liste koje ne filtriraju (D1). Ovo je najvidljiviji problem i najlakši za popravku.
- SLA watchlist i „Pažnja“ sortiraju po datumu ažuriranja, a ne po hitnosti (D2, D8).
- Realtime kasni do 30 s (D3). Isti uzrok postoji u listi tiketa i treba ga riješiti jednom, na nivou hookova.
- Dvije definicije nerutiranih na istoj stranici (D4). Treba odluka o definiciji.

Preporuka za redoslijed:

1. **D1:** odlučiti da li lista čita `status`, `priority`, `overdue`, `atRisk` iz URL-a (preporuka: da, u `staff-deep-link-filters.ts`), ili da kartice šalju parametre koje lista već razumije. Napisati test koji prolazi kroz link i provjerava filter.
2. **D2 i D8:** SLA watchlist sortirati po `slaDueAt` i prikazati koliko je tiket prekoračen. „Pažnja“ tražiti kritične bez vlasnika posebnim upitom (`priority=CRITICAL, unassigned=true`), umjesto da se oslanja na zadnjih 8 po `updatedAt`.
3. **D3:** tiho osvježavanje (realtime) pozivati sa `invalidateQueries` za relevantne ključeve, umjesto da ide kroz `fetchQuery`. Isto važi za listu tiketa (T26).
4. **D4 i D5:** odrediti jednu definiciju „nerutiranih“ na serveru i u UI-ju. Inbox kartica treba da koristi React Query i isti ključ kao ostatak stranice.
5. **D6:** dvije grupe zahtjeva spojiti u jednu fazu gdje je to moguće. Razmotriti agregat po danu na serveru umjesto šest stranica tiketa.
6. **D7:** ili promijeniti naziv serije u „riješeno u periodu“ (što zahtijeva drugi upit), ili je ostaviti sa jasnijim podnaslovom.
7. **D9:** ne prikazivati „nema aktivnosti“ kad je greška. Dijeliti stanje notifikacija između zvonca i dashboarda (jedna instanca ili React Query ključ).
8. **D17:** dodati testove za hook (sa mock-ovima), za `DashboardMetricGrid` (linkovi) i jedan e2e scenarij „kartica → lista sa filterom“.

Refaktor se ne radi bez potvrde obima.

---

### Otkriveni bugovi i neusklađenosti

| #   | Ozbiljnost  | Lokacija                                                                                                                                                                                                           | Opis                                                                                                                                                                                                | Predložena popravka                                                                        |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | Visoka      | `components/dashboard/dashboard-metric-grid.tsx:124,142,150,173,180`; `dashboard-sla-watchlist.tsx:31,42`; `lib/tickets/use-ticket-list.ts` (čita samo `view`, `q`, `inboxTab`, `createdFrom/To`, staff parametre) | Linkovi sa `status`, `priority`, `overdue` ne filtriraju listu. Korisnik vidi sve tikete bez oznake filtera. Potvrđeno čitanjem parsera.                                                            | Parsirati ove parametre u listi, ili promijeniti linkove. Test „kartica → filter“.         |
| D2  | Visoka      | `lib/dashboard/use-dashboard-summary.ts:127-136`; `lib/dashboard/dashboard-ticket-sets.ts:31-34`                                                                                                                   | SLA watchlist sortira po `updatedAt`. Najgore prekoračeni tiketi mogu da izostanu. Server podržava `slaDueAt`. Kartica ne prikazuje koliko je tiket prekoračen.                                     | `sort: "slaDueAt", dir: "asc"`; prikazati rok ili broj sati prekoračenja.                  |
| D3  | Srednja     | `lib/dashboard/use-dashboard-summary.ts:81-111, 114-165`; `lib/realtime/use-ticket-collection-realtime.ts`                                                                                                         | Tiho osvježavanje realtime-om koristi `fetchQuery`, koji vraća keš mlađi od 30 s. Potvrđeno testom van repozitorija.                                                                                | `invalidateQueries` za relevantne ključeve umjesto `fetchQuery` pri realtime osvježavanju. |
| D4  | Srednja     | `backend/src/modules/reports/summary/load-dashboard-summary-counts.ts:169`; `backend/src/modules/tickets/counts/get-ticket-counts.ts:122`; `frontend/.../dashboard-inbox-snapshot.tsx:47`                          | Kartica „Nerutirano“ broji status `UNROUTED`, banner i red broje `unroutedQueue` (uključujući fallback PENDING). Na istoj stranici mogu biti dva različita broja. Izvještaji imaju treću varijantu. | Jedna definicija na serveru, korištena svuda.                                              |
| D5  | Srednja     | `components/dashboard/dashboard-inbox-snapshot.tsx:31-46`                                                                                                                                                          | Brojači za inbox se dohvataju direktno u efektu, van React Query-ja. Osvježava se samo kad se promijeni `unroutedCount`.                                                                            | React Query ključ `ticketCounts`, realtime invalidacija.                                   |
| D6  | Srednja     | `lib/dashboard/use-dashboard-summary.ts:178-214`; `lib/dashboard/load-dashboard-volume.ts:49-55`                                                                                                                   | Dvije uzastopne grupe zahtjeva prije `isLoading=false`. Grafikon čita do 6 stranica redom.                                                                                                          | Jedna faza gdje je moguće; agregat po danu na serveru.                                     |
| D7  | Srednja     | `lib/dashboard/build-volume-14d.ts:32-35, 62-73`; `use-dashboard-summary.ts` (`volumeTickets` iz prozora kreiranja)                                                                                                | „Riješeno“ broji samo tikete kreirane u prozoru. Tiket riješen danas, a kreiran ranije, nije uračunat.                                                                                              | Promijeniti naziv i podnaslov, ili posebnim upitom po `resolvedAt`.                        |
| D8  | Srednja     | `lib/dashboard/use-dashboard-summary.ts:144-163`; `lib/dashboard/dashboard-ticket-sets.ts:68-97`                                                                                                                   | „Pažnja“ uzima 8 po `updatedAt` iz svakog izvora. Kritični tiket bez vlasnika može da izostane.                                                                                                     | Poseban upit `priority=CRITICAL, unassigned=true`.                                         |
| D9  | Srednja     | `lib/notifications/use-inbox-notifications.ts:44-57`; `components/dashboard/dashboard-activity-feed.tsx:28-32`                                                                                                     | Greška u `refreshList` prikazuje „nema aktivnosti“. Feed i zvonce imaju zasebne instance stanja.                                                                                                    | Prikazati grešku; zajedničko stanje.                                                       |
| D10 | Niska       | `dashboard-attention-table.tsx`, `dashboard-recent-tickets.tsx`, `dashboard-sla-watchlist.tsx`, `ticket-list-table.tsx`                                                                                            | Četiri implementacije reda tiketa, sa različitim kolonama i širinama.                                                                                                                               | Zajednička komponenta reda.                                                                |
| D11 | Niska       | `components/dashboard/dashboard-attention-table.tsx:31-54`, `dashboard-metric-grid.tsx`                                                                                                                            | Podnosilac vidi kolonu „Dodjela“ sa pojmovima „nerutirano“ i „samo grupa“.                                                                                                                          | Provjeriti namjeru; ako nije namjerno, sakriti kolonu za podnosioca.                       |
| D12 | Niska       | `lib/dashboard/build-volume-14d.ts:79-83`                                                                                                                                                                          | Oznake datuma `dd. MM` bez obzira na jezik.                                                                                                                                                         | `Intl.DateTimeFormat` sa `i18n.language`.                                                  |
| D13 | Niska       | `components/charts/donut.tsx`; `components/charts/dual-area-chart.tsx`                                                                                                                                             | Donut reaguje samo na miš, SVG je `aria-hidden`, nema tekstualne alternative za čitače ekrana.                                                                                                      | Fokusabilna legenda sa vrijednostima; `role="img"` sa opisom.                              |
| D14 | Niska       | `pages/dashboard-page.tsx:24`; `lib/dashboard/use-dashboard-summary.ts:63`                                                                                                                                         | Dva poziva `useSessionCapabilities()` na jednoj stranici (posljedica A3 iz modula 2).                                                                                                               | Jedan izvor sesije (modul 2).                                                              |
| D15 | Niska       | `components/dashboard/dashboard-charts.tsx:19-27`                                                                                                                                                                  | Grana za `total === 0` je nedostižna, jer stranica prvo prikazuje prazno stanje.                                                                                                                    | Ukloniti.                                                                                  |
| D16 | Niska       | `components/dashboard/dashboard-charts.tsx:30`                                                                                                                                                                     | `ticketText` zaobilazi provjeru prevoda (T4 iz modula 3).                                                                                                                                           | Tipizirani ključevi.                                                                       |
| D17 | Niska       | `frontend/src/**/dashboard*.spec.*`; `e2e/tests/`                                                                                                                                                                  | Nema testova za hook, stranicu, komponente ni e2e tok „kartica → lista“.                                                                                                                            | Vidi preporuku 8.                                                                          |
| D18 | Za provjeru | `lib/dashboard/use-dashboard-summary.ts:98-111`                                                                                                                                                                    | Ključ grafikona ne sadrži granicu prozora. Ispravno samo zbog `staleTime`.                                                                                                                          | Dodati granicu u ključ.                                                                    |
| D19 | Za provjeru | `components/dashboard/dashboard-attention-table.tsx:71,82`; `pages/dashboard-page.tsx:118`                                                                                                                         | „Sve“ link iz „Pažnje“ vodi na nefiltriranu listu (`view=all`), a skup „Pažnja“ je drugačiji. Korisnik ne vidi istu listu.                                                                          | Link na odgovarajući filter (vidi D1).                                                     |

---
