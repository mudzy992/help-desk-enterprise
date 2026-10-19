# Modul 3: Tickets — ponovni audit

Datum ponovnog audita: **2026-10-19**

Grana: `arena/bd31e07b-help-desk-enterprise`

Auditirani HEAD prije ovog dokumenta: `55cd699`

Status: **Faze 1–4 završene; implementacijski i frontend quality gate zatvoreni, browser/E2E i profiler dokazi nisu izvršeni.**

## 1. Izvršni sažetak

Tickets je najširi i operativno najvažniji frontend modul. Ima ozbiljno domensko pokriće: kreiranje, liste i inbox, detalj, poruke, interne bilješke, priloge, realtime, prisustvo, odobrenja, SLA, vrijeme rada, merge/split/forward, bulk akcije, CSV, saved views i mobilni prikaz. Postoje kvalitetne izolovane funkcije i veliki broj testova.

Ponovni audit je pronašao važnu razliku između dokumentovanog stanja i stvarnog produkcijskog puta. Faza 1 je zatvorila njen sigurnosni i arhitektonski korijen:

- razložena list implementacija (`use-ticket-list-data`, `use-ticket-list-state`, `fetch-ticket-list-snapshot`) sada je spojena na produkcijsku stranicu kroz tanki facade;
- stari 484-linijski loader, nepaginirani inbox put i konstantni `null` pomoćni error kanali više nisu aktivni;
- composer i create draft ključevi vezani su za korisnički identitet, uključujući in-place account switch u istoj kartici;
- statusi TA1–TA4, TA7 i TA10 sada imaju implementacijski dokaz, dok TA5/TA6 i dublji page-level recovery testovi ostaju sljedeća faza.

### Trenutna ocjena nakon Faze 4: **9.8/10**

Svi identifikovani produkcijski gapovi TA1–TA10 su zatvoreni. Ocjena ostaje **9.8/10** isključivo zato što E2E u ovom closeoutu nije dio izvršnog scopea, a stvarno browser profiler mjerenje bez raspoloživog browser stacka nije moguće legitimno prikazati kao prolaz. Konačnih **10/10** i dalje zahtijeva oba stvarna dokaza.

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

- puni frontend Vitest nakon Faze 4: **340/340 fajlova, 1379/1379 testova**;
- frontend TypeScript i produkcijski build: prolaze (Vite upozorava na postojeće chunkove veće od 500 kB);
- ESLint: **0 grešaka, 12 upozorenja izvan ticket scopea**;
- Prettier `format:check`: prolazi;
- i18n/design-system guard: prolazi, uz bs/en paritet **8791 ključa**;
- ciljani backend ticket/websocket Jest, isključivo repo Jest: **18/82 suiteova i 70/70 stvarno izvršenih testova prolaze**; preostalih 64 suitea nije izvršeno jer `backend/generated/prisma` nije prisutan nakon `npm ci --ignore-scripts`;
- statičkim cross-layer pregledom potvrđeni su pagination query/envelope, error-code, capability guard i realtime event/payload ugovori između backend i frontend izvora; komponentni i helper testovi ih dodatno pokrivaju;
- ticket comment hygiene sada obuhvata i singularni `ticket-socket.ts`;
- E2E/Playwright **nije pokrenut**, u skladu sa eksplicitnim izuzećem ovog closeouta.

Backend rezultat nije potpuni zeleni gate: 64 suitea zaustavljena su pri TypeScript kompilaciji zbog nedostajućih generisanih Prisma artefakata i ne predstavljaju se kao prolaz. Mrežno Prisma generisanje nije ponavljano jer potrebni binary host nije dostupan u okruženju. Browser profiler nije izvršen: raspoloživo okruženje nema funkcionalan browser/authenticated stack, a jsdom trajanja ili čitanje historijskih `perf/` rezultata ne bi bili validan React/browser profiler dokaz.

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

| ID       | Prioritet                      | Status              | Nalaz                                                                                                                                                                                                                                                                                                    | Uslov zatvaranja                                                                                                                   |
| -------- | ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **TA1**  | P1 / podatkovna izolacija      | Urađeno u Fazi 1    | Composer i create draft ključevi sada uključuju normalizovani/enkodirani `subjectId`; javni i interni nacrt više se ne mogu vratiti drugom accountu u istoj kartici.                                                                                                                                     | `ticket-message-composer.spec.tsx` dokazuje A→B izolaciju nad istim ticket ID-jem; storage test dokazuje izolaciju oba namespacea. |
| **TA2**  | P1 / aktivni produkcijski put  | Urađeno u Fazi 1    | `useTicketList` je tanki facade nad `useTicketListState` i `useTicketListData`; zadržan je postojeći page contract i claim lifecycle.                                                                                                                                                                    | Produkcijski page koristi jedinstveni state/data put; TypeScript i ciljani hook testovi prolaze.                                   |
| **TA3**  | P1 / skaliranje inboxa         | Urađeno             | Aktivni data put koristi `listGroupInboxPage()` i čuva server page/pageSize/total/totalIsCapped metapodatke. Test potvrđuje drugi page i capped total; nepaginirani poziv nije u list UI putu.                                                                                                           | Zatvoreno ciljanim snapshot i facade testovima.                                                                                    |
| **TA4**  | P1 / error contract            | Urađeno             | Aktivni facade prosljeđuje katalog, unrouted, membership i counts error kanale. Inbox/standard prikazi nude retry; pomoćni kvar se više ne pretvara u praznu vrijednost bez objašnjenja.                                                                                                                 | Zatvoreno snapshot, hook i postojećim inbox komponentnim testovima.                                                                |
| **TA5**  | P2 / tačnost statusnih brojeva | Urađeno             | Kvar `/tickets/counts` ima zaseban `countsErrorKey`. Subtitle i tabovi ne prikazuju lažne nule: count badgevi se izostavljaju, a header prikazuje unavailable stanje i retry. Silent counts kvar može zadržati posljednju uspješnu vrijednost uz upozorenje.                                             | Zatvoreno counts-failure i no-false-zero testovima.                                                                                |
| **TA6**  | P2 / realtime operativnost     | Urađeno             | Silent reload zadržava posljednju uspješnu stranicu, postavlja `refreshErrorKey`, emituje `ticket_list_refresh_failed` telemetry i prikazuje nenametljiv retry banner. Sljedeći uspješan reload čisti upozorenje i zamjenjuje podatke.                                                                   | Zatvoreno hook testom failure → retained data → recovery.                                                                          |
| **TA7**  | P2 / održivost                 | Urađeno u Fazi 1    | Paralelni loader je uklonjen iz starog 484-linijskog hooka. Facade, state hook, data hook i snapshot sada čine jedan produkcijski tok.                                                                                                                                                                   | Ciljani facade/snapshot testovi i TypeScript prolaze; nema drugog list loadera u page putu.                                        |
| **TA8**  | P2 / audit higijena            | Urađeno             | Produkcijski ticket scope je očišćen od `Paket`, `Package`, `Faza`, `Phase`, `Val` i acceptance marker komentara. Trajna objašnjenja ponašanja su zadržana bez historijskih oznaka.                                                                                                                      | `ticket-comment-hygiene.spec.ts` i ciljani grep čuvaju ugovor.                                                                     |
| **TA9**  | P2 / test dubina               | Urađeno             | Aktivni facade sada direktno pokriva stale answer, permission-sensitive deep link, counts failure bez lažne nule, claim invalidaciju/reload, silent-refresh retention/telemetry/recovery i cache bypass. Snapshot testovi pokrivaju paginaciju i pomoćne error kanale; draft test pokriva A→B izolaciju. | Ticket/realtime suite prolazi 72/72 fajla i 229/229 testova.                                                                       |
| **TA10** | P3 / storage namespace         | Urađeno u Fazi 1    | Create draft koristi `subjectId` namespace; submit i persistence lifecycle čiste/pišu isključivo ključ aktivnog korisnika. Dozvoljeni payload ostaje ograničen na service/unit/impact/urgency.                                                                                                           | Storage test potvrđuje različite create ključeve za dva korisnika.                                                                 |
| **TA11** | QA / browser                   | Blokiran okruženjem | Nisu ponovljeni stvarni browser tokovi create, inbox pagination, detail reply/internal note, realtime, bulk, confidential, approval, time tracking, merge/split/forward i mobilni prikaz.                                                                                                                | Pokrenuti relevantnih 15 Playwright fajlova na cookie-enabled stacku; sačuvati rezultate, trace/screenshot samo za padove.         |
| **TA12** | QA / performance               | Blokiran browserom  | Raniji T23 nije imao React Profiler mjerenje. Virtualizacija postoji, ali nema mjerljivog dokaza za listu/inbox/detail pod realtime opterećenjem.                                                                                                                                                        | Browser profil sa dogovorenim datasetom i pragovima; bez blind `React.memo` izmjena.                                               |

## 6. Rizici po korisnički tok

### Kreiranje tiketa

Tok je dobro razložen i knowledge fallback više ne blokira korisnika. Preostali rizik je account namespace create drafta (TA10), a puni upload/duplicate/routing preview browser ugovor ostaje E2E dokaz.

### Lista i inbox

Faza 1 je aktivirala refaktorisani put, paginirani inbox i pomoćne error kanale te uklonila dupli loader. Preostali rizici liste su lažna nula pri kvaru brojača i nevidljiv silent-reload kvar (TA5–TA6), uz potrebu za dubljim page-level recovery testovima.

### Detalj i komunikacija

Post-send semantika, panel isolation i pomoćna paralelnost su dobri. Najvažniji otvoreni sigurnosni nalaz je composer draft preko account switcha (TA1). Stvarni browser dokaz mora pokriti javni odgovor naspram interne bilješke, permissions, attachment download i reconnect.

### Realtime i skaliranje

Invalidacija cachea postoji, ali silent failure nema operativni signal. Inbox ne koristi postojeći paginirani API u aktivnom UI-ju. Oboje treba riješiti prije performance polish-a.

## 7. Faza 1 — implementacijski closeout

Faza „Izolacija draftova i jedinstven list data put“ mapirana je na **TA1, TA2, TA7 i TA10**. Aktiviranje jedinstvenog data puta je istovremeno zatvorilo produkcijski dio **TA3 i TA4**, jer su paginacija i pomoćni error kanali već postojali u izdvojenom snapshot sloju, ali ranije nisu bili spojeni na stranicu.

Dokazi:

- `useTicketList` je smanjen sa 484 linije na tanki facade i više ne sadrži paralelni transport/state loader;
- composer i create storage ključevi imaju user namespace i verziju `v2`;
- A→B test potvrđuje da drugi korisnik na istom tiketu ne dobija prvi nacrt;
- uski ciljani Vitest: **4/4 fajla, 18/18 testova**;
- kompletni ticket/realtime Vitest: **71/71 fajl, 223/223 testa**;
- TypeScript, frontend build i i18n/design-system provjera: prolaze.

TA5/TA6 i puni page-level retry/boundary testovi preneseni su u Fazu 2.

### Faza 2 — implementacijski closeout

Faza „Inbox paginacija i potpuni error contract“ zatvorila je **TA3, TA4, TA5 i TA6**:

- grupni inbox koristi server pagination metadata i testira page 2/capped total;
- katalog, unrouted, membership i counts imaju zasebne error kanale;
- nedostupni brojači više se ne predstavljaju kao nula u subtitleu ili tabovima;
- header prikazuje retry upozorenje za counts i silent realtime kvar;
- silent refresh čuva posljednje podatke, šalje telemetry i dokazano se oporavlja sljedećim uspješnim pozivom.

Novi/regresioni testovi prolaze 11/11; kompletni ticket/realtime suite prolazi **71/71 fajl, 226/226 testova**. TypeScript, ciljani ESLint, build, format, i18n/design-system i `git diff --check` također prolaze.

### Faza 3 — implementacijski closeout

Faza „Pokriće aktivnog facade-a i uklanjanje faznih komentara“ zatvorila je **TA8 i TA9**:

- facade ima šest direktnih regresionih testova za konkurentnost, permissions, counts, claim i realtime recovery;
- ticket comment hygiene test skenira komponente, lib, stranice i ticket service fajlove;
- historijske oznake su uklonjene, dok su trajni domain/security komentari zadržani;
- kompletni ticket/realtime suite prolazi **72/72 fajla i 229/229 testova**.

## 8. Fazni plan do 10/10

Faze su namjerno složene tako da se više manjih, zavisnih segmenata završi u istom prolazu.

### Faza 1 — sigurnost draftova i jedinstven list put (završena)

**TA1, TA2, TA7, TA10**

1. Uvesti subject-scoped storage namespace za composer i create draft.
2. Dodati A→B account-switch test prije izmjene implementacije.
3. Pretvoriti `useTicketList` u tanki facade nad `useTicketListState` i `useTicketListData`.
4. Ukloniti staru duplu data implementaciju tek nakon parity testova.

**Gate:** account izolacija prolazi; samo jedan produkcijski loader; TypeScript, ciljani ESLint i ticket testovi zeleni.

### Faza 2 — inbox paginacija i potpuni error contract (završena)

**TA3, TA4, TA5, TA6**

1. Aktivirati `listGroupInboxPage` i server metadata u stvarnom UI putu.
2. Aktivirati katalog, unrouted i membership error kanale iz snapshota.
3. Uvesti eksplicitno unavailable/stale stanje za counts i silent reload.
4. Dodati retry testove i page boundary testove, uključujući praznu zadnju stranicu.

**Gate:** nijedan transport/server kvar se ne predstavlja kao prazna lista ili nula; forbidden ponašanje ostaje nenametljivo; nema full-inbox zahtjeva.

### Faza 3 — pokriće aktivnog facade-a i održivost (završena)

**TA8, TA9**

1. Testirati facade/page grane, ne samo izdvojene helpere.
2. Pokriti claim invalidaciju, URL/deep-link state, counts kvar, membership kvar i realtime oporavak.
3. Ukloniti fazne komentare iz ticket scopea i zamijeniti ih trajnim objašnjenjima gdje su korisna.
4. Ponoviti size/risk-marker/dead-import provjeru.

**Gate:** ciljani marker grep čist; nema neaktivnog refactor koda; ticket test matrica mapirana na svaki TA nalaz.

### Faza 4 — cross-layer quality gate (završena uz evidentiran backend infrastrukturni blokator)

1. Puni frontend Vitest, build, TypeScript, ESLint, format, i18n/design-system guardovi.
2. Ciljani backend ticket Jest uz postojeću repo verziju zavisnosti; bez `npx` instaliranja druge Jest verzije.
3. Backend/frontend ugovor za paginaciju, error codes, capabilities i realtime payload.
4. `git diff --check` i finalni audit status po svakom TA ID-ju.

**Rezultat bez E2E:** **9.8/10**.

Cross-layer dokaz je provjeren po sljedećoj matrici:

| Ugovor | Backend izvor | Frontend potrošač/dokaz |
|---|---|---|
| pagination query | `dto/ticket-list-query.dto.ts`, `dto/group-inbox-query.dto.ts` | `ticket-page-query.ts`, `ticket-list-search-params.spec.ts` |
| page envelope | `list/respond-ticket-list-page.ts`, `list/list-group-inbox-tickets.ts` | `services/tickets-api.ts`, `fetch-ticket-list-snapshot.spec.ts` |
| error codes | `tickets.error.ts`, kontroleri i guardovi | `map-ticket-error.spec.ts`, list snapshot/facade error testovi |
| capabilities | backend access-policy/guardovi | `use-session-capabilities.ts`, facade permissions testovi |
| realtime event/payload | `ticket-realtime.types.ts`, gateway/bridge publish put | `ticket-socket.ts`, `apply-ticket-updated.ts`, realtime testovi |

Matrica je statički contract dokaz nad istim commitom, ne zamjena za neizvršeni browser/E2E. Backend runtime dokaz ostaje djelimičan zbog Prisma blokatora opisanog u metodologiji.

### Faza 5 — browser/E2E closeout (izuzeta / nije izvršena)

**TA11, TA12**

1. Ticket Playwright set nije pokrenut; E2E je eksplicitno izuzet iz ovog closeouta.
2. Posebno dokazati create, paginated inbox, draft account isolation, detail reply/internal note, realtime reconnect, confidential, approvals, SLA/time tracking, bulk, merge/split/forward i mobilni prikaz.
3. Profiler mjerenje nije izvršeno zbog nedostupnog browser/authenticated stacka; nije zamijenjeno spekulativnom memoizacijom niti jsdom pseudo-mjerenjem.

**Gate za 10/10:** svi ne-E2E nalazi zatvoreni; stvarni browser testovi prošli; svaki izuzetak jasno dokumentovan, bez predstavljanja neizvršenog testa kao prolaza.

## 9. Preporučeni redoslijed implementacijskih commitova

1. `fix(tickets): isolate drafts by session principal`
2. `refactor(tickets): activate unified list data flow`
3. `fix(tickets): paginate inbox and expose auxiliary errors`
4. `test(tickets): cover list recovery and account isolation`
5. `refactor(tickets): remove phase-specific comments`
6. `docs(audit): close ticket module findings`

## 10. Zaključak

Prethodni audit je korektno evidentirao veliki broj kvalitetnih popravki, ali njegov zaključak „svih 26 zatvoreno“ više se ne može koristiti kao dokaz trenutnog produkcijskog stanja. Najveći problem nije nedostatak funkcionalnosti, nego to što bolji, testirani list data sloj postoji paralelno sa starijim aktivnim hookom.

Faze 1–4 zatvorile su sve pronađene implementacijske ticket nalaze i frontend quality gate: draft izolaciju, jedinstveni list put, paginaciju, potpuni error/recovery contract, facade regresije i komentar higijenu. Ocjena ostaje ispod 10/10 samo zbog stvarno neizvršenih browser/E2E i profiler dokaza. E2E je u ovom zadatku eksplicitno izuzet; backend gate je djelimično izvršen i precizno dokumentovan, bez prikazivanja 64 compile-blokirana suitea kao prolaza.
