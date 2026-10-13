# Modul 4: Dashboard

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena. Nijedan kod nije mijenjan (čeka se potvrda obima refaktorisanja).

Provjere izvršene u sandboxu:
- Čitanje svih fajlova modula u cijelosti (stranica, hook, dva sloja composera, sve komponente, helperi).
- Provjera parsiranja URL parametara u listi tiketa: `use-ticket-list.ts`, `staff-deep-link-filters.ts`, `ticket-list-search-params.ts`. Potvrđeno da se `status`, `priority`, `overdue` i `atRisk` iz URL-a ne čitaju.
- Provjera definicije „nerutiranih“ na serveru: `reports/summary/load-dashboard-summary-counts.ts` naspram `tickets/counts/get-ticket-counts.ts`.
- Provjera ponašanja `fetchQuery` u instaliranoj verziji `@tanstack/query-core` (5.102.8). Test je pokrenut van repozitorija (`/tmp/fetchquery-check.cjs`): dva uzastopna `fetchQuery` poziva sa `staleTime: 30000` daju **jedan** zahtjev prema serveru.
- Provjera sortiranja na serveru: `slaDueAt` je dozvoljen u `ticketListSortFields`.
- Brojanje i18n ključeva `dashboard.*` u `bs` i `en`.
- Nije pokrenut pregledač. Nalazi D1 i D2 potvrđeni su čitanjem koda i parametara; treba ih reprodukovati u pregledaču (vidi listu za provjeru na kraju).

---

## Modul

**Dashboard (početna za prijavljene korisnike).** Obuhvata:
- zaglavlje sa dugmadima „Izvještaji“ i „Novi tiket“
- mrežu od 9–11 kartica sa brojevima (zavisno od uloge)
- grafikon statusa (donut) i grafikon 14 dana (kreirano / riješeno)
- „SLA watchlist“ (prekoračeni tiketi), „Stanje inboxa“ (nerutirani i po grupama) i „Aktivnost“ (notifikacije) — samo za osoblje, aktivnost za sve
- tabelu „Pažnja“ (tiketi koje treba odmah pogledati)
- tabelu „Nedavni tiketi“

Granica modula: stranica `/` (dashboard-page), `components/dashboard/` (7 fajlova), `lib/dashboard/` (6 fajlova), i API poziv `/reports/dashboard/summary` samo u mjeri u kojoj ga dashboard koristi. Izvještaji (`reports-page`, `reports-metric-grid`) pripadaju modulu 8.

**Nisu pročitani u punom obimu:** `components/charts/donut.tsx` (djelimično), `components/charts/dual-area-chart.tsx` (samo a11y dio), `components/charts/h-bars.tsx` (samo struktura), `components/ui/stat-card.tsx`, `components/ui/api-error-text.tsx`, `components/shortcuts/global-shortcuts.tsx`, backend `load-dashboard-summary-counts.ts` (samo dio sa brojevima).

---

## Povezani fajlovi i folderi

**Stranica i hook**
- `frontend/src/pages/dashboard-page.tsx` (131)
- `frontend/src/lib/dashboard/use-dashboard-summary.ts` (263)

**Komponente: `frontend/src/components/dashboard/`**
- `dashboard-metric-grid.tsx` (192): kartice sa brojevima i linkovima
- `dashboard-attention-table.tsx` (177): tabela „Pažnja“
- `dashboard-activity-feed.tsx` (101): notifikacije
- `dashboard-inbox-snapshot.tsx` (120): stanje inboxa, banneri za nerutirane
- `dashboard-charts.tsx` (70): donut i grafikon 14 dana
- `dashboard-sla-watchlist.tsx` (81): prekoračeni tiketi
- `dashboard-recent-tickets.tsx` (78): nedavni tiketi

**Logika: `frontend/src/lib/dashboard/`**
- `compose-dashboard-summary.ts` (71) + `.spec.ts` (192)
- `dashboard-ticket-sets.ts` (135) + `.spec.ts` (121)
- `build-volume-14d.ts` (95)
- `load-dashboard-volume.ts` (57) + `.spec.ts` (70)

**Zavisnosti van modula**
- `frontend/src/services/report-summary-api.ts` (`fetchDashboardSummary`, `GET /reports/dashboard/summary`)
- `frontend/src/services/tickets-api.ts`, `tickets-counts-api.ts`
- `frontend/src/lib/notifications/use-inbox-notifications.ts` (dijele ga zvonce u ljusci i feed na dashboardu)
- `frontend/src/lib/query/query-client.ts` (`staleTime` 30 s, `gcTime` 5 min)
- `frontend/src/components/charts/` (donut, dual-area-chart, h-bars)
- `frontend/src/components/tickets/ticket-badges.tsx` (zajednički za sve tabele tiketa)

**Testovi:** 3 spec fajla, svi za čiste helpere. Nema testova za hook, stranicu ni komponente. Jedini e2e koji pominje dashboard je `e2e/tests/22-accessibility.spec.ts`.

---

## Trenutna implementacija

**Učitavanje.** `useDashboardSummary` radi u tri faze.
1. Prva `Promise.all` (sedam stavki): brojevi sa servera (`/reports/dashboard/summary`), nedavni tiketi (8), prekoračeni (5), dodijeljeni meni (8), nedodijeljeni (8), i grafikon `loadDashboardVolume`, koji čita do 6 stranica po 50 tiketa **redom**.
2. Zatim se `setSummary(composeDashboardSummary(...))` poziva, ali `isLoading` ostaje `true`.
3. Druga `Promise.all` (4 stavke): grupni inbox (samo za osoblje), katalog usluga, organizaciona struktura i pravila rutiranja (samo za osoblje). Tek poslije ove grupe `isLoading` postaje `false`.

**Keširanje.** Sve je preko React Query-ja, pozivom `fetchQuery`. Ključ sumarnog zahtjeva sadrži `dayKey`, pa se mijenja kad dan promijeni. Ključevi listi nemaju dan.

**Realtime.** `useTicketCollectionRealtime(reloadSilent)` osvježava tiho sa debounce-om od 300 ms. Tiho osvježavanje ponovo poziva `fetchQuery`.

**Prikaz.** Stranica ima tri stanja: skeleton dok se učitava, `ApiErrorText` sa `requestId` kod greške i `EmptyState` kad je `summary.total === 0`. Inače renderuje sve kartice. Kartice za podnosioca vidi samo tri metrike (`requesterMetricLabelKeys`), a sve metrike su tipizirane kao unije ključeva prevoda (`MetricLabelKey`, `MetricHintKey`).

**Računanje „Pažnje“.** `selectAttentionTickets` bira tikete u redoslijedu: dodijeljeni meni, kritični bez vlasnika, nerutirani. Ograničenje je 8.

**Grafikon.** `buildVolume14d` broji tikete po lokalnom danu. Dvije serije: „kreirano“ (`createdAt`) i „riješeno“ (`resolvedAt`, ili `closedAt` / `archivedAt` za zatvorene). Ako je prozor pun (6 × 50), prikazuje se napomena da je serija donja granica.

**Notifikacije.** `DashboardActivityFeed` poziva `useInboxNotifications()`, isto kao i zvonce u ljusci. Svaka komponenta ima svoju instancu stanja, socket pretplatu i fallback polling.

---

## Realno/željeno stanje

| Oblast | Željeno | Realno |
|---|---|---|
| Linkovi sa kartica | Klik vodi na listu sa istim filterom | Pet linkova (`status=UNROUTED`, `priority=CRITICAL`, `overdue=true`, `status=WAITING_FOR_USER`, `status=PENDING_APPROVAL`) ne filtriraju listu (D1) |
| SLA watchlist | Prikazuje najkritičnije (najduže prekoračene) | Sortira po `updatedAt`, pa top 5 može da izostavi najgore slučajeve (D2) |
| „Pažnja“ | Prikazuje najkritičnije tikete bez obzira na to kad su ažurirani | Uzima 8 po `updatedAt` iz svakog izvora, pa kritični bez vlasnika mogu da izostanu (D8) |
| Nerutirani | Jedna definicija na cijelom dashboardu | Kartica koristi `UNROUTED`, banner koristi red nerutiranih (`UNROUTED` + fallback PENDING). Na istoj stranici mogu biti dva različita broja (D4, D5) |
| Osvježavanje po realtime događaju | Odmah prikazuje promjenu | Tiho osvježavanje koristi `fetchQuery`, koji vraća keš mlađi od 30 s. Promjena može kasniti do 30 s (D3) |
| Grafikon „riješeno“ | Broj riješenih tiketa po danu | Broji samo tikete koji su kreirani u prozoru i riješeni u prozoru (D7) |
| Vrijeme učitavanja | Kartice se prikazuju čim stignu podaci | Prvi prikaz čeka dvije grupe zahtjeva i do 6 uzastopnih stranica za grafikon (D6) |
| Greška u aktivnosti | Poruka o grešci | Greška se prikazuje kao „nema aktivnosti“ (D9) |
| Pristup podnosioca | Samo lični podaci, bez internih pojmova | Tabela „Pažnja“ i kolona „Dodjela“ prikazuju se i podnosiocu, sa pojmovima „nerutirano“ i „samo grupa“ (D11) |
| Datumi i brojevi | Prate jezik aplikacije | Oznake grafikona su `dd. MM` bez obzira na jezik (D12) |
| Dostupnost grafikona | Tekstualna alternativa za čitače ekrana | Donut reaguje samo na miš, a SVG je `aria-hidden` (D13) |
| Testovi | Hook, stranica i ključni tokovi pokriveni | Samo 3 spec fajla za helpere; nema testova za hook, stranicu ni komponente (D17) |

---

## Gap analiza

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

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

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

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| D1 | Visoka | `components/dashboard/dashboard-metric-grid.tsx:124,142,150,173,180`; `dashboard-sla-watchlist.tsx:31,42`; `lib/tickets/use-ticket-list.ts` (čita samo `view`, `q`, `inboxTab`, `createdFrom/To`, staff parametre) | Linkovi sa `status`, `priority`, `overdue` ne filtriraju listu. Korisnik vidi sve tikete bez oznake filtera. Potvrđeno čitanjem parsera. | Parsirati ove parametre u listi, ili promijeniti linkove. Test „kartica → filter“. |
| D2 | Visoka | `lib/dashboard/use-dashboard-summary.ts:127-136`; `lib/dashboard/dashboard-ticket-sets.ts:31-34` | SLA watchlist sortira po `updatedAt`. Najgore prekoračeni tiketi mogu da izostanu. Server podržava `slaDueAt`. Kartica ne prikazuje koliko je tiket prekoračen. | `sort: "slaDueAt", dir: "asc"`; prikazati rok ili broj sati prekoračenja. |
| D3 | Srednja | `lib/dashboard/use-dashboard-summary.ts:81-111, 114-165`; `lib/realtime/use-ticket-collection-realtime.ts` | Tiho osvježavanje realtime-om koristi `fetchQuery`, koji vraća keš mlađi od 30 s. Potvrđeno testom van repozitorija. | `invalidateQueries` za relevantne ključeve umjesto `fetchQuery` pri realtime osvježavanju. |
| D4 | Srednja | `backend/src/modules/reports/summary/load-dashboard-summary-counts.ts:169`; `backend/src/modules/tickets/counts/get-ticket-counts.ts:122`; `frontend/.../dashboard-inbox-snapshot.tsx:47` | Kartica „Nerutirano“ broji status `UNROUTED`, banner i red broje `unroutedQueue` (uključujući fallback PENDING). Na istoj stranici mogu biti dva različita broja. Izvještaji imaju treću varijantu. | Jedna definicija na serveru, korištena svuda. |
| D5 | Srednja | `components/dashboard/dashboard-inbox-snapshot.tsx:31-46` | Brojači za inbox se dohvataju direktno u efektu, van React Query-ja. Osvježava se samo kad se promijeni `unroutedCount`. | React Query ključ `ticketCounts`, realtime invalidacija. |
| D6 | Srednja | `lib/dashboard/use-dashboard-summary.ts:178-214`; `lib/dashboard/load-dashboard-volume.ts:49-55` | Dvije uzastopne grupe zahtjeva prije `isLoading=false`. Grafikon čita do 6 stranica redom. | Jedna faza gdje je moguće; agregat po danu na serveru. |
| D7 | Srednja | `lib/dashboard/build-volume-14d.ts:32-35, 62-73`; `use-dashboard-summary.ts` (`volumeTickets` iz prozora kreiranja) | „Riješeno“ broji samo tikete kreirane u prozoru. Tiket riješen danas, a kreiran ranije, nije uračunat. | Promijeniti naziv i podnaslov, ili posebnim upitom po `resolvedAt`. |
| D8 | Srednja | `lib/dashboard/use-dashboard-summary.ts:144-163`; `lib/dashboard/dashboard-ticket-sets.ts:68-97` | „Pažnja“ uzima 8 po `updatedAt` iz svakog izvora. Kritični tiket bez vlasnika može da izostane. | Poseban upit `priority=CRITICAL, unassigned=true`. |
| D9 | Srednja | `lib/notifications/use-inbox-notifications.ts:44-57`; `components/dashboard/dashboard-activity-feed.tsx:28-32` | Greška u `refreshList` prikazuje „nema aktivnosti“. Feed i zvonce imaju zasebne instance stanja. | Prikazati grešku; zajedničko stanje. |
| D10 | Niska | `dashboard-attention-table.tsx`, `dashboard-recent-tickets.tsx`, `dashboard-sla-watchlist.tsx`, `ticket-list-table.tsx` | Četiri implementacije reda tiketa, sa različitim kolonama i širinama. | Zajednička komponenta reda. |
| D11 | Niska | `components/dashboard/dashboard-attention-table.tsx:31-54`, `dashboard-metric-grid.tsx` | Podnosilac vidi kolonu „Dodjela“ sa pojmovima „nerutirano“ i „samo grupa“. | Provjeriti namjeru; ako nije namjerno, sakriti kolonu za podnosioca. |
| D12 | Niska | `lib/dashboard/build-volume-14d.ts:79-83` | Oznake datuma `dd. MM` bez obzira na jezik. | `Intl.DateTimeFormat` sa `i18n.language`. |
| D13 | Niska | `components/charts/donut.tsx`; `components/charts/dual-area-chart.tsx` | Donut reaguje samo na miš, SVG je `aria-hidden`, nema tekstualne alternative za čitače ekrana. | Fokusabilna legenda sa vrijednostima; `role="img"` sa opisom. |
| D14 | Niska | `pages/dashboard-page.tsx:24`; `lib/dashboard/use-dashboard-summary.ts:63` | Dva poziva `useSessionCapabilities()` na jednoj stranici (posljedica A3 iz modula 2). | Jedan izvor sesije (modul 2). |
| D15 | Niska | `components/dashboard/dashboard-charts.tsx:19-27` | Grana za `total === 0` je nedostižna, jer stranica prvo prikazuje prazno stanje. | Ukloniti. |
| D16 | Niska | `components/dashboard/dashboard-charts.tsx:30` | `ticketText` zaobilazi provjeru prevoda (T4 iz modula 3). | Tipizirani ključevi. |
| D17 | Niska | `frontend/src/**/dashboard*.spec.*`; `e2e/tests/` | Nema testova za hook, stranicu, komponente ni e2e tok „kartica → lista“. | Vidi preporuku 8. |
| D18 | Za provjeru | `lib/dashboard/use-dashboard-summary.ts:98-111` | Ključ grafikona ne sadrži granicu prozora. Ispravno samo zbog `staleTime`. | Dodati granicu u ključ. |
| D19 | Za provjeru | `components/dashboard/dashboard-attention-table.tsx:71,82`; `pages/dashboard-page.tsx:118` | „Sve“ link iz „Pažnje“ vodi na nefiltriranu listu (`view=all`), a skup „Pažnja“ je drugačiji. Korisnik ne vidi istu listu. | Link na odgovarajući filter (vidi D1). |

---

## Ocjena: 5/10

**Obrazloženje:** Arhitektura je čista: brojevi su sa servera, metrike su tipizirane, uloge su odvojene, a grafikon je iskren o granicama. Oduzimaju se bodovi zato što dashboard ne ispunjava svoju glavnu obavezu: kartice ne filtriraju (D1), SLA lista ne prikazuje najkritičnije (D2), a „Pažnja“ može izostaviti kritične tikete (D8). Dodaju se problemi sa definicijom nerutiranih (D4), kašnjenjem realtime osvježavanja (D3) i gotovo nikakvim testovima za hook i stranicu (D17). Ocjena je ista kao za tikete, ali za drugačiji razlog: ovdje je pogrešan sadržaj, a ne složenost koda.

---

## Must-Have (za ovaj modul)

1. **D1:** svaka kartica i link vodi na listu koja primjenjuje isti filter. Test koji prolazi kroz link.
2. **D2:** SLA watchlist sortiran po `slaDueAt`, uz prikaz prekoračenja.
3. **D8:** kritični tiketi bez vlasnika uvijek u „Pažnji“, bez obzira na datum ažuriranja.
4. **D3:** realtime osvježavanje ne vraća keš stariji od događaja (`invalidateQueries`). Isto za listu tiketa (T26).
5. **D4:** jedna definicija „nerutiranih“ na cijeloj stranici i u izvještajima.
6. **D17:** testovi za hook i linkove prije promjena (regresija).

---

## Lista za ručnu provjeru u pregledaču

- D1: klik na „Kritični“, „Nerutirano“, „Prekoračeni“ i „Čeka korisnika“; provjeriti da li se lista filtrira.
- D2: uporediti prvih pet u SLA watchlist sa stvarnim rokovima (u tabeli tiketa, sortiranoj po roku).
- D3: u drugom tabu kreirati tiket, pa u prvom pratiti dashboard unutar 30 s od zadnjeg učitavanja.
- D4: uporediti „Nerutirano“ u kartici i banner u inbox kartici kad postoje fallback PENDING tiketi.
- D6: Network tab pri prvom učitavanju (broj i redoslijed zahtjeva).
- D11: prijaviti se kao podnosilac i provjeriti kolonu „Dodjela“ u „Pažnji“.
</content>
