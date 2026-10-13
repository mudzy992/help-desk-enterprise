# Modul 3: Tickets

Datum audita: 2026-10-13
Grana: `arena/3cc0c561-help-desk-enterprise`
Status: analiza završena. Nijedan kod nije mijenjan (čeka se potvrda obima refaktorisanja).

Provjere izvršene u sandboxu:
- Brojanje veličina fajlova (`wc -l`) za sve fajlove modula.
- Pretraga po obrascima rizika u `components/tickets/`, `lib/tickets/`, `pages/ticket*`, `services/tickets*`: `as never`, `as unknown as`, `eslint-disable`, `localStorage`, `ErrorBoundary`, `React.memo`, `any`.
- Provjera da li `frontend/` i koren repozitorija imaju ESLint ili Prettier konfiguraciju: nema nijedne.
- Provjera korišćenja `listTickets`, `listGroupInbox`, `ticketText` kroz cijeli `src/` (bez spec fajlova).
- Nije pokrenut pregledač i nije mjereno mrežno ponašanje. Nalazi T1, T3, T7, T8 i T10 zasnovani su na čitanju koda i označeni su kao „za provjeru“ (vidi kraj izvještaja).

---

## Modul

**Tickets.** Obuhvata sve ekrane i tokove rada sa tiketima:
- listu tiketa (prikaz „lista“ i „inbox“), filtere, paginaciju, brojače, grupne akcije, CSV izvoz
- detalj tiketa: zaglavlje, status, poruke i composer (javni odgovor i interna bilješka), vrijeme rada, prilozi, učesnici, odobrenja, SLA, spajanje, razdvajanje, prosljeđivanje, prioritet, CSAT
- kreiranje tiketa (wizard sa koracima, prijedlozi iz baze znanja, provjera duplikata)
- realtime osvježavanje (socket) i prisustvo (ko gleda tiket i ko kuca)

Granica modula: `ticket-list-page.tsx`, `ticket-detail-page.tsx`, `ticket-create-page.tsx`, `tickets-page.tsx`, komponente u `components/tickets/`, hookovi i helperi u `lib/tickets/`, `services/tickets-*.ts`, `ticket-socket.ts`.

**Nisu pročitani u punom obimu** (pregledani samo po imenu ili veličini): `use-ticket-presence.ts` (pregledan samo djelimično), `ticket-bulk-bar.tsx` (samo grep), `ticket-detail-workspace.tsx`, `ticket-detail-header.tsx`, `ticket-detail-side-stack.tsx` (samo zaglavlje), `filter-tickets.ts` (155), `ticket-list-filters.tsx` (samo dio), `use-detail-sections.ts`, `use-ticket-form.ts`, `use-ticket-playbook`, `use-ticket-approvals.ts`, `tickets-attachments-api.ts`, `tickets-collaboration-api.ts`, `ticket-saved-views-menu.tsx`, `mention-picker.tsx`. Nalazi iz tih fajlova nisu uključeni. Ako se ocjena ili nalazi moraju potvrditi u punom obimu, ovi fajlovi su sljedeći prolaz.

---

## Povezani fajlovi i folderi

**Stranice**
- `frontend/src/pages/tickets-page.tsx` (5)
- `frontend/src/pages/ticket-list-page.tsx` (229)
- `frontend/src/pages/ticket-detail-page.tsx` (583)
- `frontend/src/pages/ticket-create-page.tsx` (20)

**Komponente: `frontend/src/components/tickets/`** (63 fajla, oko 8.800 linija)
- Najveće: `ticket-message-composer.tsx` (510), `ticket-time-tracking-panel.tsx` (486), `create-ticket-form.tsx` (278)
- Lista: `ticket-list-table.tsx`, `ticket-list-filters.tsx`, `ticket-bulk-bar.tsx`
- Detalj: `ticket-detail-header.tsx`, `ticket-detail-workspace.tsx`, `ticket-detail-side-stack.tsx`, `ticket-detail-blocking-state.tsx`, `ticket-forward-panel.tsx`, `ticket-merge-panel.tsx`, `ticket-split-panel.tsx`, `ticket-priority-panel.tsx`, `ticket-csat-panel.tsx`, `ticket-collaboration-bar.tsx`
- Ostalo: `ticket-links-panel.tsx`, `ticket-form-data-view.tsx`, `mention-picker.tsx`, `ticket-saved-views-menu.tsx`

**Logika: `frontend/src/lib/tickets/`** (95 fajlova)
- Lista: `use-ticket-list.ts` (438), `filter-tickets.ts` (155), `ticket-page-query.ts`, `ticket-constants.ts`, `inbox-view-tabs.ts`, `use-sidebar-ticket-counts.ts`, `use-tickets-csv-export.ts`
- Detalj: `use-ticket-detail.ts` (193), `load-ticket-detail.ts` (71), `use-ticket-realtime.ts`, `use-ticket-context.ts`, `use-ticket-approvals.ts`, `use-ticket-form.ts`, `use-detail-sections.ts`, `detail-sections.ts`
- Poruke: `send-ticket-message-optimistic.ts`, `use-ticket-presence.ts`, `presence-view.ts`
- Kreiranje: `use-create-ticket-catalog.ts`, `load-create-ticket-catalog.ts`, `recent-services-storage.ts`
- Greške i tekst: `map-ticket-error.ts`, `ticket-text.ts` (8 linija)
- Realtime: `frontend/src/lib/realtime/use-ticket-collection-realtime.ts`, `apply-ticket-updated.ts`, `upsert-ticket-message.ts`, `should-invalidate-ticket-collection.ts`, `schedule-debounced-callback.ts`

**API sloj: `frontend/src/services/`**
- `tickets-api.ts` (283), `tickets-list-api.ts`, `tickets-counts-api.ts`, `tickets-collaboration-api.ts`, `tickets-attachments-api.ts`, `tickets-merge-api.ts`, i ostali `tickets-*.ts` (19 fajlova ukupno)
- `ticket-socket.ts` (32): nazivi događaja i `joinTicketRoom` / `leaveTicketRoom`

**Srodni dijelovi van modula**
- `frontend/src/app/lazy-page.tsx` (`PageLoadBoundary`, granica za greške stranica)
- `frontend/src/lib/session/use-session-capabilities.ts` (modul 2, A3)
- `frontend/src/lib/time-tracking/` (`use-ticket-time-tracking.ts`, `summarize-time-logs.ts`)
- `frontend/src/lib/realtime/` i `frontend/src/services/helpdesk-socket.ts`
- `frontend/e2e` (u rootu repozitorija): više Playwright specifikacija za tikete (`01-ticket-create`, `03-approvals`, `07-sla`, `26-assets-tickets`, `40-ticket-workspace`)
- Unit testovi: oko 41 spec fajl vezan za tikete (`lib/tickets` 34, `components/tickets` 2, ostali u `services` i `lib/realtime`)

---

## Trenutna implementacija

**Lista tiketa.** `ticket-list-page.tsx` prikazuje dva prikaza, „lista“ i „inbox“, u jednoj komponenti (grananje preko `isInbox`). Sve stanje je u `useTicketList()`: filteri, stranica, brojači, nerutirani tiketi, odabrani redovi, greška, učitavanje, klaim i deep-link parametri iz URL-a. Filteri se šalju serveru (`toTicketPageQuery`), a server vraća jednu stranicu od 25 redova. Brojači za tabove dolaze iz zasebnog zahtjeva `GET /tickets/counts` i pokrivaju sve tikete koje korisnik može da vidi. Nerutirani red za inbox ima stranicu od 50 redova. Realtime osvježava listu kroz `useTicketCollectionRealtime` sa debounce-om od 300 ms.

**Tabela.** `ticket-list-table.tsx` je virtualizovana (`isVirtualized`, `max-h-[70vh]`), ima `aria-rowindex` i `aria-rowcount`. Red je klikabilan (`onClick` na `<tr>`), a ticket-number je `Link` za tastaturu i čitače ekrana (komentar `a11y-row-link`). Tabela ima `min-w-[900px]`.

**Detalj tiketa.** `ticket-detail-page.tsx` poziva više od 10 hookova (`useTicketDetail`, `useTicketForm`, `useTicketApprovals`, `useTicketTimeTracking`, `useDirectory`, `useTicketPlaybook`, `useTicketContext`, `useAgentCollaborationConfiguration`, `useTicketPresence`, `useTicketDetailSections` i drugi), drži oko 13 `useState` vrijednosti i renderuje oko 12 panela. `loadTicketDetail` (`load-ticket-detail.ts`) učitava ticket, pa poruke i učesnike paralelno, pa `listGroupInbox()`, pa vremenske zapise, pa priloge, jedan za drugim. Kontekst tiketa (`use-ticket-context.ts`) učitava ljude, dozvoljene akcije i SLA paralelno, a historiju i javnu aktivnost u drugom krugu, uz `orNull` koji guta greške.

**Poruke.** `TicketMessageComposer` šalje poruku kroz `sendTicketMessageOptimistic`: dodaje privremenu poruku, šalje zahtjev, usklađuje je sa odgovorom, pa poziva `getTicket` da osvježi tiket. Pri grešci uklanja privremenu poruku i baca grešku nazad u composer, koji tada ne briše tekst.

**Kreiranje.** `create-ticket-form.tsx` je wizard u koracima: podaci, provjera baze znanja (`interceptKnowledgeArticles`), pregled i potvrda, uz provjeru duplikata. Katalog usluga je u React Query (`useCreateTicketCatalog`), a obrazac usluge se učitava u efektu sa `cancelled` flagom.

**Realtime i prisustvo.** `useTicketRealtime` pridružuje socket sobi tiketa i pri `connect` događaju ponovo učitava podatke. `useTicketCollectionRealtime` debounce-uje osvježavanje liste. Oba koriste `acquireHelpdeskSocket` i čiste pretplate u cleanup-u.

**Greške i loaderi.** Postoje `TicketLoadingState` i `TicketErrorState` sa dugmetom „pokušaj ponovo“. Dugmad akcija imaju `disabled` stanje dok traje zahtjev (`isSending`, `isClaiming`, `isSavingStatus`, `isReopening`).

**Automatizacija.** Nema ESLint ni Prettier konfiguracije ni u `frontend/` ni u rootu repozitorija. Postoje Vitest testovi i Playwright specifikacije za glavne tokove.

---

## Realno/željeno stanje

| Oblast | Željeno | Realno |
|---|---|---|
| Odgovori na zahtjeve liste | Prikazuje se samo odgovor za trenutne filtere | Odgovor starog zahtjeva može prepisati novi, nema poređenja ni otkazivanja (T1) |
| Pretraga | Debounce, jedan zahtjev po pauzi u kucanju | Svaki znak šalje zahtjev za listu i za brojače (T2) |
| Otvaranje detalja | Paralelni zahtjevi, bez zahtjeva koji služe kao provjera prava | Lanac od 4 koraka; `listGroupInbox()` služi kao provjera prava i preuzima cijeli inbox (T3) |
| Slanje poruke | Poruka se šalje jednom | Ako padne osvježavanje tiketa nakon uspješnog slanja, korisnik vidi grešku i može poslati duplikat (T8) |
| Prijevod | Tipizirani ključevi, provjera pri kompajliranju | `ticketText()` koristi `as never` na 125 mjesta (T4) |
| Veličina komponenti | Ekran od oko 150–250 linija, izdvojeni hookovi po odgovornosti | `use-ticket-list.ts` 438, `ticket-detail-page.tsx` 583, `ticket-message-composer.tsx` 510, `ticket-time-tracking-panel.tsx` 486 (T5, T6, T16) |
| Nacrt poruke i wizard | Nacrt se čuva pri osvježavanju i napuštanju | Nacrt nije sačuvan nigdje; osvježavanje ili napuštanje briše tekst (T9) |
| Baza znanja pri kreiranju | Greška baze znanja ne blokira kreiranje | Ako `/knowledge-base/intercept` padne, korak ostaje blokiran (T10) |
| Brojači u navigaciji | Jedan izvor istine, osvježava se realtime-om | Tri izvora na stranici liste: sidebar keš sa TTL-om, React Query za tabove i `counts` iz hooka liste (T11) |
| Prazno stanje | Razlikuje „nema tiketa“ od „nema rezultata“ | Oba slučaja daju istu poruku i dugme „poništi filtere“ (T13) |
| Greške u pomoćnim podacima | Tiha greška ili jasna poruka, ali ne lažna nula | Katalog, nerutirani red i vremenski zapisi greškom postaju prazno ili nula bez poruke (T12) |
| Greška u panelu | Greška u jednom panelu ne ruši detalj | Samo `PageLoadBoundary` na nivou stranice; panel sa greškom obara cijeli detalj (T21) |
| Mobilni prikaz liste | Kartice ili prilagođena tabela | Tabela sa minimalnom širinom 900 px i horizontalnim skrolovanjem (T14) |
| Datumi | Format prema jeziku aplikacije (bs / en) | Mješavina: `toLocaleString()` koristi jezik pregledača, dok drugi dijelovi koriste `RelativeTime` sa `i18n.language` (T17) |
| Automatizacija | ESLint, Prettier, pravila za tipove i `exhaustive-deps` | Nema konfiguracije; 4 `eslint-disable` komentara u modulu za pravilo koje možda nije aktivno (T20) |

---

## Gap analiza

**Kritični i visoki gapovi**

1. **Odgovori liste mogu doći van redoslijeda (T1).** `load()` u `use-ticket-list.ts:130-275` pokreće `fetchQuery` i zatim direktno postavlja `setPageItems`, `setPageInfo`, `setCounts`, `setServices` bez provjere da li je odgovor još relevantan. Nema `AbortController`-a, nema brojača zahtjeva, nema `useQuery` koji bi to rješavao. Kad korisnik brzo mijenja filtere, spor odgovor za stari filter može završiti poslednji i prikazati pogrešnu listu uz nove filtere. Ovo nije vidljivo na brzoj mreži, pa je i sporo tokom testiranja teško uočiti.

2. **Ponovljeno slanje javnog odgovora (T8).** `sendTicketMessageOptimistic` (`send-ticket-message-optimistic.ts:37-52`) u istom `try` bloku šalje poruku, uskladi je i zatim čeka `getTicket`. Ako `getTicket` padne, poruka je već na serveru, ali catch prikaže grešku i baci je nazad. Composer ne briše tekst, pa korisnik ponovo klikne „pošalji“ i javni odgovor ide dva puta. Javni odgovor vidi podnosilac zahtjeva, pa je posljedica vidljiva izvan tima.

3. **Otvaranje detalja: lanac zahtjeva i pregled cijele inbox liste kao provjera prava (T3).** `load-ticket-detail.ts:46-48` poziva `listGroupInbox()` samo da bi saznao da li korisnik ima pristup inboxu. Taj poziv vraća cijeli grupni inbox, a ne samo jedan podatak. Vremenski zapisi i prilozi (`:49-60`) se takođe traže bez provjere prava, pa 403 odgovori postaju očekivano ponašanje. Svaka greška (uključujući prekid mreže) sakriva panel (`catch(() => setTimeVisible(false))`). Ukupno oko 15 zahtjeva po otvaranju detalja (procjena iz koda, treba izmjeriti).

4. **Kreiranje tiketa blokira se kad baza znanja ne odgovara (T10).** U `create-ticket-form.tsx` (`onSubmit`, oko linije 195–203) greška iz `interceptKnowledgeArticles` postavlja `errorKey` i ostavlja korisnika na koraku 1. Prijedlozi baze znanja su pomoćni korak, ali njihov pad zaustavlja cijeli tok kreiranja. Ovo je fail-closed ponašanje za funkciju koja bi trebalo da bude opciona.

**Srednji gapovi**

5. **Tipovi prijevoda su zaobiđeni (T4).** `ticketText()` (`ticket-text.ts:8`) prima `key: string`, zatim `key as never` i `as unknown as string`. Upotrebljava se 125 puta. Sa `t(controls.errorKey)` u vremenskom panelu i `value as never` u `ticket-bulk-bar.tsx:221-222` ključevi se ne provjeravaju pri kompajliranju. Nepostojeći ključ se vidi tek u UI-ju kao sirovi tekst.

6. **Stanje i logika su previše koncentrisani (T5, T6).** `useTicketList` ima 15 `useState` vrijednosti i vraća oko 30 polja. Lista, inbox, nerutirani red, brojači, odabir, deep-link i realtime su u jednom hooku. `TicketDetailPage` prosljeđuje 30 prop-ova `TicketDetailWorkspace` i 24 prop-ova `TicketDetailSideStack`. Obrazac `setBusy(true); void x().finally(() => setBusy(false))` ponavlja se pet puta. `versionKey` (`ticket-detail-page.tsx:93-100`) je spojeni string koji služi kao ključ za osvježavanje konteksta, što je krhko.

7. **Potencijalni stale closure pri umetanju šablona (T7).** U `ticket-message-composer.tsx` efekat za umetanje šablona (oko linija 188–212) poziva asinhronu `renderTicketTemplate`, a `onTemplateInserted` (oko linija 233–242) koristi `body` iz renderovanja u kojem je efekat pokrenut. Ako korisnik kuca dok šablon rendera, to se gubi. Efekat ima `eslint-disable` (linija 209), pa upozorenje nije prijavljeno. Treba potvrditi u pregledaču.

8. **Nacrti se gube (T9).** Tekst u composeru, obrazac za kreiranje i tok kreiranja nemaju `localStorage` ni `sessionStorage` zapis. Ako dođe do osvježavanja, promjene tokena (A2 iz modula 2 demontira stranicu) ili navigacije, unos je izgubljen. Za dugački opis problema ovo je ozbiljno.

9. **Tri izvora brojača na jednoj stranici (T11).** `use-sidebar-ticket-counts.ts` ima modulski keš sa TTL-om i sopstveni `inFlight` mehanizam, nezavisan od React Query. Nema poništavanja pri realtime događaju ni pri klaimu. Lista koristi `queryKeys.ticketCounts` (osvježava se). `ticket-list-page.tsx:21` poziva `useSidebarTicketCounts` i pored brojača iz hooka liste. Brojevi na istom ekranu mogu da se razlikuju.

10. **Prazno stanje ne razlikuje dva slučaja (T13).** U `ticket-list-page.tsx` `list.total === 0` prikazuje „emptyFilterTitle“ i dugme „clearFilters“. Kad nema nijednog tiketa u sistemu, korisnik dobija poruku o filterima koje nije postavio.

11. **Automatizacija nije uspostavljena (T20).** Nema ESLint ni Prettier konfiguracije u `frontend/`. `eslint-disable-next-line react-hooks/exhaustive-deps` postoji u četiri fajla modula (`mention-picker.tsx:48`, `ticket-message-composer.tsx:209` i `:230`, `ticket-saved-views-menu.tsx:83`). Ako pravilo nije aktivno, komentari su mrtvi, a ako jeste, ne rade ništa osim što gase upozorenje.

**Niski gapovi**

12. **Tihe greške u pomoćnim podacima (T12).** `use-ticket-list.ts` koristi `.catch(() => [])` za katalog usluga i `.catch(() => null)` za nerutirani red. Oboje daju praznu vrijednost bez poruke. `use-ticket-context.ts` (`orNull`, oko linija 36–45) isto guta sve greške, pa tab „Historija“ može biti prazan bez objašnjenja.

13. **Mobilni prikaz (T14).** Tabela ima `min-w-[900px]`, pa se na telefonu skroluje horizontalno. Nema kartica za manje ekrane.

14. **Navigacija je zbijena.** Na listi se slažu tri nivoa: `TicketWorkspaceNav`, `UnderlineTabs` za statuse i `TicketListFiltersBar`. Uz to dolazi bulk traka. Vertikalni prostor se troši prije nego što se pojavi prvi red.

15. **Vrijeme rada (T15).** Pokrenuti tajmer ne prikazuje proteklo vrijeme. `active` služi samo za dugme „zaustavi“, a u listi se vidi samo `RelativeTime` od početka. `controls.start(false)` prima boolean bez imena, što je nejasan API. `maxBackdateDays ?? 7` duplira serversku politiku na klijentu.

16. **Prevelike datoteke sa više komponenti (T16).** `ticket-time-tracking-panel.tsx` (486) u istom fajlu ima panel i tri dijaloga (`ManualEntryDialog`, `CorrectionDialog`, `DeleteDialog`). `ticket-message-composer.tsx` (510) ima composer, mention, šablone i potvrdu kolizije.

17. **Datumi prema jeziku pregledača (T17).** `ticket-detail-page.tsx:240` koristi `new Date(...).toLocaleString()` za naslov prioriteta. To ne prati jezik aplikacije.

18. **Mrtav i nepaginiran kod (T19).** `listTickets()` u `tickets-api.ts` (oko linije 247) nema upotrebe u kodu van testova. `listGroupInbox()` vraća cijeli inbox i koristi se u tri mjesta (dashboard, detalj, lista). Kako raste broj tiketa, raste i odgovor.

19. **Potvrda CSV izvoza (T25).** Dugme „CSV izvoz“ je vidljivo samo uz permisiju `auditExport` (`ticket-list-page.tsx:36`). Prevodi (`bs/common.json` ~linija 268) pominju „izvoz pokrenut“ kao audit događaj. Treba potvrditi da li je to namjerno. Ako jeste, tekst dugmeta bi trebalo da kaže da je izvoz auditovan.

20. **Greške u panelima obaraju cijeli detalj (T21).** `lazy-page.tsx:48` ima `PageLoadBoundary` koji hvata greške na nivou stranice. Nema lokalne granice oko panela (prilozi, problemi, sredstva, veze, playbook), pa greška u jednom panelu prazni cijelu stranicu tiketa.

21. **Manje stvari u kodu.** `setPage` se koristi u efektu (`use-ticket-list.ts:121`) prije deklaracije na liniji 123. Radi, ali čitanje je teško. `window.requestAnimationFrame` nije otkazan pri unmount-u (composer). `.finally(...)` lanci bez `.catch` u detalju (linije 316, 392, 521) rade samo zato što `runAction` guta grešku, što je implicitan ugovor.

---

## Mišljenje tima i preporuka

*Ovo je mišljenje auditora na osnovu čitanja koda, a ne rezultat ankete među članovima tima.*

Modul je **funkcionalno bogat i ozbiljno urađen**: serverska paginacija (Faza 1.1), odvojeni brojači, debounce realtime-a sa čišćenjem, optimistične poruke sa usklađivanjem, virtualizovana tabela, dobra a11y pravila (`aria-rowindex`, link u ćeliji za tastaturu), i e2e pokrivenost glavnih tokova. Komentari u kodu većinom objašnjavaju razlog (npr. zaštita od React greške 310 pri redoslijedu hookova).

Problemi su u tri grupe:

- **Ispravnost podataka:** odgovor koji dolazi kasnije može prepisati noviji (T1); osvježavanje tiketa nakon slanja može izazvati duplo slanje (T8); baza znanja može blokirati kreiranje (T10). Prva i treća su u kodu koji korisnici koriste svaki dan.
- **Arhitektura:** tri velika hooka i stranice sa 30+ prop-ova (T5, T6); više izvora istine za brojače (T11); `as never` prijevodi (T4). Ovo otežava izmjene i uzrokuje greške koje se vide tek u produkciji.
- **UX i automatizacija:** nacrti se gube (T9), prazna stanja se ne razlikuju (T13), nema ESLint-a ni Prettier-a (T20).

Preporuka za redoslijed:
1. **Ispraviti T1** (lista): preći `load()` na `useQuery` sa ključem koji sadrži filtere. Alternativno, uvesti brojač zahtjeva i ignorisati zastarjele odgovore. Napisati test sa dva odgovora u obrnutom redoslijedu.
2. **Ispraviti T8** (dupla poruka): osvježavanje tiketa nakon slanja odvojiti od slanja. Greška osvježavanja ne smije vratiti tekst kao neuspjeh slanja. Napisati test za slučaj „poruka prošla, `getTicket` pao“.
3. **Ispraviti T10** (baza znanja): pri grešci preskočiti korak sa prijedlozima i dozvoliti nastavak.
4. **Ispraviti T3** (detalj): paralelno učitavanje, ukloniti `listGroupInbox()` kao provjeru prava, koristiti dozvole iz `context.actions`. Pri 403 ne prikazivati grešku, a pri mrežnoj grešci prikazati „pokušaj ponovo“.
5. **Ispraviti T4** (prijevodi): ukloniti `ticketText()` i uvesti tipiziranu uniju ključeva. Dodati skriptu koja provjerava da svaki ključ iz koda postoji u `bs` i `en`.
6. **Dodati ESLint i Prettier** u `frontend/` sa pravilom `react-hooks/exhaustive-deps` kao upozorenjem i `@typescript-eslint/no-explicit-any` kao greškom. Ukloniti `eslint-disable` komentare ili ih opravdati.
7. **Razdvojiti** `use-ticket-list.ts` na lista-upit, inbox-upit, odabir i URL stanje. Razdvojiti `ticket-detail-page.tsx` na zaglavlje, radni prostor i bočnu kolonu sa vlastitim hookovima. Izdvojiti tri dijaloga iz `ticket-time-tracking-panel.tsx`.
8. **Debounce za pretragu** (T2) koristiti postojeći `scheduleDebouncedCallback`.
9. **Nacrti** (T9): sačuvati tekst composera i wizard u `sessionStorage` po tiketu, uz upozorenje pri napuštanju.

Refaktor se ne radi bez potvrde obima.

---

## Otkriveni bugovi i neusklađenosti

| # | Ozbiljnost | Lokacija | Opis | Predložena popravka |
|---|---|---|---|---|
| T1 | Visoka | `lib/tickets/use-ticket-list.ts:130-275` | Odgovor starog zahtjeva liste može prepisati noviji. Nema otkazivanja ni provjere relevantnosti. **Za provjeru** (sporo mrežno, brza promjena filtera). | `useQuery` sa filterima u ključu, ili brojač zahtjeva. Test sa obrnutim redoslijedom odgovora. |
| T8 | Srednja-visoka | `lib/tickets/send-ticket-message-optimistic.ts:37-52` | Ako `getTicket` padne nakon uspješnog slanja, catch prikaže grešku i tekst ostaje. Korisnik šalje ponovo i javni odgovor ide dva puta. **Za provjeru** (simulirati pad `GET /tickets/:id` nakon POST-a). | Osvježavanje tiketa odvojiti od slanja, greška osvježavanja ne mijenja status poruke. Idempotency ključ na serveru ako je moguće. |
| T10 | Srednja | `components/tickets/create-ticket-form.tsx` (`onSubmit`, ≈ 195–203) | Pad `interceptKnowledgeArticles` ostavlja korisnika na koraku 1 bez mogućnosti kreiranja. **Za provjeru** (odgovor 500 na `/knowledge-base/intercept`). | Pri grešci prikazati upozorenje i dozvoliti nastavak na korak 2. |
| T3 | Srednja | `lib/tickets/load-ticket-detail.ts:38-60` | Lanac od 4 koraka; `listGroupInbox()` kao provjera prava; vremenski zapisi i prilozi bez provjere prava; svaka greška sakriva panel. | `Promise.all`; dozvole iz `context.actions` ili sesije; 403 tiho, mrežna greška sa porukom. |
| T7 | Srednja | `components/tickets/ticket-message-composer.tsx` (≈ 188–225, `eslint-disable` na 209) | Umetanje šablona koristi `body` iz renderovanja prije asinhronog poziva. Tekst unesen tokom rendera šablona se gubi. **Za provjeru.** | Čitati `body` preko `ref` ili funkcijskog `setBody`. Ukloniti `eslint-disable`. |
| T4 | Srednja | `lib/tickets/ticket-text.ts:8`, 125 poziva; `ticket-bulk-bar.tsx:221-222`; `ticket-time-tracking-panel.tsx:80` | Zaobilaženje provjere ključeva prijevoda. Nepostojeći ključ se prikazuje kao sirov tekst. | Tipizirana unija ključeva; uklanjanje wrappera; skripta za provjeru ključeva. |
| T9 | Srednja | `components/tickets/ticket-message-composer.tsx`, `create-ticket-form.tsx` | Nema čuvanja nacrta. Osvježavanje, navigacija ili demontiranje (A2 iz modula 2) brišu unos. | `sessionStorage` po tiketu / po wizardu, čišćenje pri uspješnom slanju. |
| T11 | Srednja | `lib/tickets/use-sidebar-ticket-counts.ts` (modulski keš, TTL); `pages/ticket-list-page.tsx:21` | Tri izvora brojača na jednoj stranici. Sidebar keš se ne poništava realtime događajima ni klaimom. | Jedan React Query ključ `ticketCounts`, realtime invalidacija, bez modulskog keša. |
| T5 | Srednja | `lib/tickets/use-ticket-list.ts` (438 linija, 15 `useState`, ≈ 30 povratnih vrijednosti) | Previše odgovornosti u jednom hooku. | Razdvojiti na lista-upit, inbox-upit, odabir, URL stanje. |
| T6 | Srednja | `pages/ticket-detail-page.tsx` (583 linije, ≈ 13 `useState`, 30 + 24 prop-ova) | Velika stranica, ponovljeni `.finally` obrazac, dupli `onApprove`/`onReject`, spojeni `versionKey`. | Hook za zauzetost akcija, izdvojeni zaglavlje/radni prostor/bočna kolona, tipizirani ključ osvježavanja. |
| T2 | Srednja | `components/tickets/ticket-list-filters.tsx:124` | Pretraga bez debounce-a: svaki znak šalje zahtjev za listu i brojače. | Debounce 250–300 ms (`scheduleDebouncedCallback`). |
| T13 | Srednja | `pages/ticket-list-page.tsx` (`list.total === 0`) | Isto prazno stanje za „nema tiketa“ i „nema rezultata“. | Dvije poruke, dugme „poništi filtere“ samo kad postoje filteri. |
| T20 | Srednja | cijeli modul; `frontend/` i root bez ESLint/Prettier konfiguracije | Nema automatske provjere. Četiri `eslint-disable` komentara. | Uvesti konfiguraciju; provjeriti da li pravila važe. |
| T12 | Niska | `use-ticket-list.ts` (`.catch(() => [])`, `.catch(() => null)`); `use-ticket-context.ts` (`orNull`) | Tihe greške daju praznu listu ili nulu bez poruke. | Razlikovati 403 od ostalih grešaka, prikazati poruku. |
| T14 | Niska | `components/tickets/ticket-list-table.tsx:300` | `min-w-[900px]`, horizontalno skrolovanje na telefonu. | Kartice na malim ekranima. |
| T15 | Niska | `components/tickets/ticket-time-tracking-panel.tsx` (`controls.start(false)`, linija 70; `active` bez proteklog vremena; `maxBackdateDays ?? 7`) | Pokrenuti tajmer nema proteklo vrijeme; boolean argument bez imena; duplirana politika. | Prikaz proteklog vremena, objektni argument, politika sa servera. |
| T16 | Niska | `ticket-time-tracking-panel.tsx` (486), `ticket-message-composer.tsx` (510) | Više komponenti u jednom fajlu. | Razdvojiti dijaloge i podkomponente. |
| T17 | Niska | `pages/ticket-detail-page.tsx:240` | `toLocaleString()` koristi jezik pregledača. | `formatTicketTimestamp` ili `RelativeTime` sa `i18n.language`. |
| T19 | Niska | `services/tickets-api.ts` (`listTickets`, ≈ 247); `listGroupInbox()` | Mrtav kod; nepaginiran inbox. | Obrisati mrtav kod; paginirati inbox ili ograničiti broj redova. |
| T25 | Za provjeru | `pages/ticket-list-page.tsx:36`, `i18n` | Vidljivost CSV izvoza zavisi od `auditExport`; tekst ne kaže da je izvoz auditovan. | Potvrditi namjeru sa vlasnikom; ako je namjerno, dodati tekst. |
| T21 | Niska | `app/lazy-page.tsx:48`; paneli u `ticket-detail-page.tsx` | Nema lokalnih granica za panele. Greška u jednom panelu prazni cijeli detalj. | `ErrorBoundary` oko svakog panela (vidi modul 1, B2). |
| T22 | Niska | `pages/ticket-detail-page.tsx:316, 392, 521`; `ticket-list-page`/`use-ticket-list.ts:121` | `.finally` bez `.catch` (radi zbog `runAction`); `setPage` prije deklaracije. | Eksplicitan `catch`; premjestiti efekat poslije deklaracije. |
| T23 | Za provjeru | `components/tickets/*`, `lib/tickets/use-ticket-presence.ts` | `React.memo` nije korišćen ni u jednom fajlu u `components/tickets/`. Broj ponovnih renderovanja nije mjeren. | Mjeriti React Profiler na listi sa 50 redova i na detalju. |
| T24 | Za provjeru | `lib/tickets/use-ticket-list.ts:97-122` | Na prvom renderu `isStaff` je još `false` (dozvole stižu asinhrono), pa se deep-link filteri privremeno računaju kao prazni. Efekat na linijama 112–122 ih naknadno primjenjuje, ali to je zakrpa za problem iz modula 2 (A3). | Riješiti kroz `currentSession` iz modula 2. |

---

## Ocjena: 5/10

**Obrazloženje:** Modul je funkcionalno najbogatiji u aplikaciji i ima dobre temelje: serversku paginaciju, realtime sa čišćenjem, optimistične poruke, virtualizovanu tabelu, a11y pravila i e2e testove. Oduzimaju se bodovi zbog T1 (odgovor koji prepisuje noviji), T8 (duplo slanje javnog odgovora) i T10 (baza znanja blokira kreiranje), zatim zbog složenosti tri velika hooka i dvije velike stranice (T5, T6), zbog 125 `ticketText` zaobilaženja prijevoda (T4), zbog tri izvora brojača (T11), gubitka nacrta (T9) i odsustva ESLint-a i Prettier-a (T20). Ocjena je ista kao za modul 2, ali iz drugačijih razloga: ovdje je problem u složenosti i ispravnosti podataka, a ne u bezbjednosnom modelu.

---

## Must-Have (za ovaj modul)

1. **T1:** odgovori liste ne smiju prepisati novije. Prvo napisati test za redoslijed odgovora, zatim popraviti (`useQuery` ili brojač zahtjeva).
2. **T8:** neuspjelo osvježavanje tiketa nakon uspješnog slanja ne smije izgledati kao neuspjelo slanje. Test za slučaj „poruka prošla, `getTicket` pao“.
3. **T10:** pad baze znanja ne smije blokirati kreiranje tiketa.
4. **T3:** detalj tiketa bez `listGroupInbox()` kao provjere prava; paralelno učitavanje; 403 se ne prikazuje kao greška.
5. **T4:** ukloniti `ticketText()` i `as never` iz modula, uvesti tipizirane ključeve i skriptu za provjeru prijevoda.
6. **T20:** dodati ESLint i Prettier u `frontend/`, pravilo `exhaustive-deps` aktivirati kao upozorenje, ukloniti nepotrebne `eslint-disable` komentare.
7. **T2:** debounce za pretragu.
