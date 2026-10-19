# Modul 3: Tickets — ponovni audit

Datum ponovnog audita: **2026-10-19**

Grana: `arena/bd31e07b-help-desk-enterprise`

Auditirani HEAD prije ovog dokumenta: `55cd699`

Status: **implementacija je funkcionalno jaka, ali prethodni closeout nije više tačan; potrebna je nova implementacijska iteracija**.

## 1. Izvršni sažetak

Tickets je najširi i operativno najvažniji frontend modul. Ima ozbiljno domensko pokriće: kreiranje, liste i inbox, detalj, poruke, interne bilješke, priloge, realtime, prisustvo, odobrenja, SLA, vrijeme rada, merge/split/forward, bulk akcije, CSV, saved views i mobilni prikaz. Postoje kvalitetne izolovane funkcije i veliki broj testova.

Ponovni audit je, međutim, pronašao važnu razliku između dokumentovanog stanja i stvarnog produkcijskog puta:

- nova razložena list implementacija (`use-ticket-list-data`, `use-ticket-list-state`, `fetch-ticket-list-snapshot`) postoji i testirana je, ali **nije spojena na stranicu**;
- aktivni `useTicketList` je ponovo narastao na 484 linije, koristi nepaginirani `listGroupInbox()`, guta pomoćne greške i vraća tri error kanala kao stalni `null`;
- composer draft ključ nije vezan za korisnički identitet, pa nacrt javnog odgovora može preživjeti logout/account switch u istoj kartici;
- raniji statusi T5, T12 i T19 zato više nisu potpuno istiniti, iako test suite prolazi.

### Trenutna ocjena: **8.7/10**

Ocjena nije niža zbog nedostupnog E2E stacka, nego zbog konkretnih produkcijskih gapova TA1–TA5. Nakon njihovog zatvaranja, statičkih i komponentnih gateova modul može biti **9.8/10**. Konačnih **10/10** zavisi samo od stvarnog browser/E2E prolaza i mjerljivog browser performance dokaza, u skladu sa dogovorom.

## 2. Obim

### Primarni frontend scope

- `frontend/src/pages/ticket-list-page.tsx`, `ticket-detail-page.tsx`, `ticket-create-page.tsx`;
- `frontend/src/components/tickets/**`;
- `frontend/src/lib/tickets/**`;
- ticket realtime helperi u `frontend/src/lib/realtime/**`;
- `frontend/src/services/tickets-*.ts`, `tickets-api.ts`, `ticket-socket.ts`;
- query/session/capability/download helperi koje ticket tok direktno koristi.

### Cross-reference scope

- backend ticket kontroleri, servisi, access policy, websocket i worker implementacije u `backend/src/modules/tickets/**`;
- Playwright specifikacije 01–08, 10, 13–16, 26 i 40;
- dashboard, assets, problems, templates i status integracije samo kada direktno čitaju ili mijenjaju ticket podatke.

### Van scopea ovog dokumenta

- detaljni backend business audit svih ticket worker-a i Prisma upita;
- vizuelni redizajn cijele aplikacije;
- promjene poslovnih politika bez potvrđenog buga ili ugovora.

## 3. Metodologija i stvarno izvršeni dokazi

Ponovo su pregledani aktivni import putevi, veličine fajlova, storage granice, error kanali, React Query invalidacija, realtime tokovi, API pozivi, historijski/fazni komentari, testovi i E2E katalog.

Izvršeno 2026-10-19:

- ciljani frontend Vitest za ticket/realtime scope: **71/71 fajl, 222/222 testa**;
- ranije u istoj sesiji puni frontend Vitest: **339/339 fajlova, 1371/1371 testova**;
- ranije u istoj sesiji frontend build i TypeScript: prolaze;
- broj pronađenih backend ticket spec fajlova: **106**;
- relevantni ticket Playwright fajlovi: **15**, sa približno **43** `describe/test/it` deklaracije;
- `git diff --check`: prolazi prije izmjene audita.

Backend ticket Jest nije validno izvršen: lokalne backend zavisnosti nisu instalirane, a `npx` je povukao Jest 30 i odbio zastarjeli CLI argument. Taj pokušaj se **ne predstavlja kao prolaz**. Playwright nije pokrenut jer je E2E stack u ovoj sesiji potvrđeno nedostupan.

## 4. Šta je potvrđeno urađeno

Prethodni T1–T26 rad nije odbačen. Sljedeće je ponovnim čitanjem i testovima potvrđeno kao stvarno prisutno:

1. **Zaštita od zastarjelih odgovora:** aktivni hook koristi monotoni `latestLoadId`; izdvojena implementacija ima zaseban request gate.
2. **Debounce pretrage:** filter bar odgađa primjenu upita i ima cleanup test.
3. **Detalj bez inbox permission probe-a:** `loadTicketDetail` učitava osnovni tiket, zatim poruke/učesnike i pomoćne panele paralelno; 403/404 pomoćnog panela ne ruši stranicu.
4. **Sigurno slanje poruke:** post-send refresh kvar ne pretvara uspješan POST u neuspjelo slanje; regresioni test postoji.
5. **Knowledge intercept fallback:** kvar prijedloga ne blokira kreiranje.
6. **Tipizirani ticket i18n ugovor:** stari `ticketText/as never` produkcijski workaround nije pronađen.
7. **Composer i create razlaganje:** composer je 214 linija, time panel 203; dijalozi/editor/actions su izdvojeni.
8. **Panel isolation:** workspace i side stack koriste `PanelErrorBoundary`.
9. **Mobilni prikaz:** postoji `TicketListCards` sa komponentnim testom.
10. **Realtime invalidacija:** lista ima eksplicitnu invalidaciju prije silent reload-a; ticket socket testovi pokrivaju reconnect/deduplikaciju.
11. **Capability granice:** CSV i upravljačke akcije provjeravaju session permissions.
12. **Draft validacija:** storage parser validira oblik zapisa; create draft namjerno ne čuva slobodni tekst i proizvoljni form data.
13. **A11y i UX osnove:** tastaturni linkovi, table semantics, loading/error/retry stanja i disabled busy akcije postoje.
14. **Široko backend pokriće u repozitoriju:** authorization, confidential, attachments, claim atomicity, bulk, messages, merge/split, routing, SLA, time tracking i realtime imaju zasebne spec fajlove.

## 5. Novi registar nalaza

| ID | Prioritet | Status | Nalaz | Uslov zatvaranja |
|---|---|---|---|---|
| **TA1** | P1 / podatkovna izolacija | Otvoren | Composer draft ključ sadrži samo ticket ID (`helpdesk:ticket:<id>:composer-draft:v1`). Logout/account switch ne čisti ove ključeve. Drugi korisnik u istoj kartici koji može otvoriti isti tiket može dobiti nacrt javnog odgovora prethodnog korisnika. Internal draft se odbacuje kada novi korisnik nema pravo, ali javni draft nema subject granicu. | Ključ vezati za `subjectId` ili centralno očistiti sve ticket draftove pri promjeni identiteta; test A→B mora dokazati da B ne vidi A draft. |
| **TA2** | P1 / aktivni produkcijski put | Otvoren | `TicketListPage` importuje stari `components/tickets/hooks/use-ticket-list.ts` od 484 linije. Noviji `use-ticket-list-data`, `use-ticket-list-state` i `fetch-ticket-list-snapshot` nisu povezani ni sa jednom produkcijskom stranicom. Prethodni T5 closeout zato nije stvarno aktivan. | Spojiti facade na izdvojene state/data hookove, ukloniti duplu implementaciju i zadržati javni page contract. |
| **TA3** | P1 / skaliranje inboxa | Otvoren | Aktivni inbox koristi nepaginirani `listGroupInbox()` i računa total iz dužine vraćenog niza. Paginirani `listGroupInboxPage()` postoji u izdvojenom, neaktivnom snapshotu. Prethodni T19 status je regresirao. | Aktivni UI mora koristiti server page/pageSize/total, uz page-boundary test i bez preuzimanja cijelog inboxa. |
| **TA4** | P1 / error contract | Otvoren | Aktivni hook guta katalog/unrouted/count greške (`catch(() => [])`, `catch(() => null)`) i na kraju vraća `catalogErrorKey`, `unroutedErrorKey`, `membershipErrorKey` kao konstantni `null`. UI prima retry propove, ali stvarni error kanal nikad nije popunjen. Prethodni T12 closeout nije tačan za aktivni put. | Aktivirati `captureRead`/snapshot error kanale; razlikovati forbidden/not-found od transport/server greške; komponentni test mora prikazati i retry-ovati svaki pomoćni kvar. |
| **TA5** | P2 / tačnost statusnih brojeva | Otvoren | Standardna lista pretvara kvar `/tickets/counts` u `null`, a page subtitle zatim prikazuje open/risk kao `0`. Korisnik ne može razlikovati stvarnu nulu od nedostupnog brojanja. | Uvesti loading/unavailable stanje ili zadržati posljednju uspješnu vrijednost uz stale indikator; nikad prikazati lažnu nulu. |
| **TA6** | P2 / realtime operativnost | Otvoren | Silent reload namjerno guta glavni transport error. To čuva postojeći ekran, ali nema stale/offline indikatora ni telemetry potvrde u aktivnom list hooku. Lista može ostati zastarjela bez signala. | Sačuvati podatke, ali evidentirati kvar i prikazati nenametljiv stale/retry status; testirati uspješan oporavak. |
| **TA7** | P2 / održivost | Otvoren | Produkcija i dead/refactor put imaju paralelne implementacije istog učitavanja, pagination i error modela. Testovi za `fetchTicketListSnapshot` mogu prolaziti bez zaštite stvarnog UI puta, što stvara lažni osjećaj pokrića. | Jedan produkcijski put i testovi kroz facade/page; obrisati mrtve duplikate nakon migracije. |
| **TA8** | P2 / audit higijena | Otvoren | Ticket scope i dalje sadrži mnogo `Paket`, `Faza`, `Phase`, `Val`, `M8 B*` komentara. Oni opisuju historiju implementacije umjesto trajnog ugovora i već su doprinijeli kontradikciji između audita i koda. | Ukloniti fazne oznake; zadržati samo razlog, sigurnosni ugovor ili ponašanje. Ciljani grep mora biti čist bez brisanja korisnih objašnjenja. |
| **TA9** | P2 / test dubina | Otvoren | Aktivni hook od 484 linije ima samo tri direktna testa fokusirana na stale answer/realtime/deep-link. Nema facade testa za paginaciju inboxa, pomoćne error kanale, counts failure, claim invalidaciju i account-isolated drafts. | Dodati table-driven hook/page testove za navedene grane; svaki novi bug prvo reprodukovati testom. |
| **TA10** | P3 / storage namespace | Otvoren | Create draft koristi jedan globalni ključ bez subject ID-ja. Trenutno čuva samo service/unit/impact/urgency, pa nema slobodnog teksta, ali account switch može prenijeti prethodne organizacijske izbore. | Namespacovati i create draft po subjectu ili dokumentovati i testirati namjerno globalno ponašanje. |
| **TA11** | QA / browser | Blokiran okruženjem | Nisu ponovljeni stvarni browser tokovi create, inbox pagination, detail reply/internal note, realtime, bulk, confidential, approval, time tracking, merge/split/forward i mobilni prikaz. | Pokrenuti relevantnih 15 Playwright fajlova na cookie-enabled stacku; sačuvati rezultate, trace/screenshot samo za padove. |
| **TA12** | QA / performance | Blokiran browserom | Raniji T23 nije imao React Profiler mjerenje. Virtualizacija postoji, ali nema mjerljivog dokaza za listu/inbox/detail pod realtime opterećenjem. | Browser profil sa dogovorenim datasetom i pragovima; bez blind `React.memo` izmjena. |

## 6. Rizici po korisnički tok

### Kreiranje tiketa

Tok je dobro razložen i knowledge fallback više ne blokira korisnika. Preostali rizik je account namespace create drafta (TA10), a puni upload/duplicate/routing preview browser ugovor ostaje E2E dokaz.

### Lista i inbox

Ovo je trenutno najveći implementacijski rizik. Aktivni put nije refaktorisani put koji audit opisuje. Posljedice su nepaginirani inbox, nevidljive pomoćne greške, lažne nule brojača i dupli kod koji testira neaktivnu implementaciju (TA2–TA7).

### Detalj i komunikacija

Post-send semantika, panel isolation i pomoćna paralelnost su dobri. Najvažniji otvoreni sigurnosni nalaz je composer draft preko account switcha (TA1). Stvarni browser dokaz mora pokriti javni odgovor naspram interne bilješke, permissions, attachment download i reconnect.

### Realtime i skaliranje

Invalidacija cachea postoji, ali silent failure nema operativni signal. Inbox ne koristi postojeći paginirani API u aktivnom UI-ju. Oboje treba riješiti prije performance polish-a.

## 7. Fazni plan do 10/10

Faze su namjerno složene tako da se više manjih, zavisnih segmenata završi u istom prolazu.

### Faza 1 — sigurnost draftova i jedinstven list put

**TA1, TA2, TA7, TA10**

1. Uvesti subject-scoped storage namespace za composer i create draft.
2. Dodati A→B account-switch test prije izmjene implementacije.
3. Pretvoriti `useTicketList` u tanki facade nad `useTicketListState` i `useTicketListData`.
4. Ukloniti staru duplu data implementaciju tek nakon parity testova.

**Gate:** account izolacija prolazi; samo jedan produkcijski loader; TypeScript, ciljani ESLint i ticket testovi zeleni.

### Faza 2 — inbox paginacija i potpuni error contract

**TA3, TA4, TA5, TA6**

1. Aktivirati `listGroupInboxPage` i server metadata u stvarnom UI putu.
2. Aktivirati katalog, unrouted i membership error kanale iz snapshota.
3. Uvesti eksplicitno unavailable/stale stanje za counts i silent reload.
4. Dodati retry testove i page boundary testove, uključujući praznu zadnju stranicu.

**Gate:** nijedan transport/server kvar se ne predstavlja kao prazna lista ili nula; forbidden ponašanje ostaje nenametljivo; nema full-inbox zahtjeva.

### Faza 3 — pokriće aktivnog facade-a i održivost

**TA8, TA9**

1. Testirati facade/page grane, ne samo izdvojene helpere.
2. Pokriti claim invalidaciju, URL/deep-link state, counts kvar, membership kvar i realtime oporavak.
3. Ukloniti fazne komentare iz ticket scopea i zamijeniti ih trajnim objašnjenjima gdje su korisna.
4. Ponoviti size/risk-marker/dead-import provjeru.

**Gate:** ciljani marker grep čist; nema neaktivnog refactor koda; ticket test matrica mapirana na svaki TA nalaz.

### Faza 4 — cross-layer quality gate

1. Puni frontend Vitest, build, TypeScript, ESLint, format, i18n/design-system guardovi.
2. Ciljani backend ticket Jest uz postojeću repo verziju zavisnosti; bez `npx` instaliranja druge Jest verzije.
3. Backend/frontend ugovor za paginaciju, error codes, capabilities i realtime payload.
4. `git diff --check` i finalni audit status po svakom TA ID-ju.

**Ciljana ocjena bez E2E:** **9.8/10**.

### Faza 5 — browser/E2E closeout

**TA11, TA12**

1. Pokrenuti ticket Playwright set na cookie-enabled stacku.
2. Posebno dokazati create, paginated inbox, draft account isolation, detail reply/internal note, realtime reconnect, confidential, approvals, SLA/time tracking, bulk, merge/split/forward i mobilni prikaz.
3. Izvršiti dogovoreno profiler mjerenje bez spekulativne memoizacije.

**Gate za 10/10:** svi ne-E2E nalazi zatvoreni; stvarni browser testovi prošli; svaki izuzetak jasno dokumentovan, bez predstavljanja neizvršenog testa kao prolaza.

## 8. Preporučeni redoslijed implementacijskih commitova

1. `fix(tickets): isolate drafts by session principal`
2. `refactor(tickets): activate unified list data flow`
3. `fix(tickets): paginate inbox and expose auxiliary errors`
4. `test(tickets): cover list recovery and account isolation`
5. `refactor(tickets): remove phase-specific comments`
6. `docs(audit): close ticket module findings`

## 9. Zaključak

Prethodni audit je korektno evidentirao veliki broj kvalitetnih popravki, ali njegov zaključak „svih 26 zatvoreno“ više se ne može koristiti kao dokaz trenutnog produkcijskog stanja. Najveći problem nije nedostatak funkcionalnosti, nego to što bolji, testirani list data sloj postoji paralelno sa starijim aktivnim hookom.

Implementacija treba početi od TA1 i TA2: prvo izolacija draftova između identiteta, zatim spajanje stranice na jedinstveni list put. To istovremeno otključava paginaciju, vidljive pomoćne greške i pouzdanije testove. Nakon Faza 1–4 jedini opravdani razlog za zadržavanje ocjene ispod 10/10 biće stvarno neizvršeni browser/E2E i profiler dokazi.
