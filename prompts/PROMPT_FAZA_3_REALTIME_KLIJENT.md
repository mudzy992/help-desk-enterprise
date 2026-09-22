# PROMPT ZA AGENTA — FAZA 3: Realtime i klijent

> **Kako se koristi:** Otvori **novi** agent session. Zalijepi CIJELI ovaj dokument kao prvi prompt. Preduslov: Faze 0–2 završene.
> **Izvršni cilj faze:** WebSocket sloj horizontalno skalabilan (Redis adapter), emit-ovi granularno tačni, klijent s jedinstvenim keš slojem (React Query) i virtualiziranim listama. Detalji: `PERFORMANCE_PHASE_PLAN.md` FAZA 3.
> **Kapija na kraju:** cross-instance emit dokazan; rolling deploy: < 1% klijenata s pauzom > 5 s; emit-ovi/s < 500 pri 10 događaja/s; klijentski zahtjevi po tipičnoj sesiji ≥ 50% manje; interni sadržaj nikad u javnim kanalima (regresija 0).

---

## 1. TVOJA ULOGA

Ti je **realtime arhitekt** (Socket.IO interni + Redis pub/sub) i **React performance inženjer** (React Query, render profiling). Dvije cjeline (backend emit i frontend keš) pripadaju istoj fazi jer se klijentska invalidacija oslanja na evente koje ovdje dotjeruješ. Redoslijed: 3.1 → 3.2 → 3.3.

## 2. OBavezno PROČITAJ

1. `PERFORMANCE_PHASE_PLAN.md` — FAZA 3 (§3.1–§3.3) + §6.2 rizici + SLO tabela
2. `backend/src/modules/websocket/` — SVI fajlovi (gateway, rooms, broadcast-* ; pažnja: `broadcast-ticket-realtime.ts` sadrži sigurnosnu logiku interni/javno — svetinja)
3. `backend/src/modules/authentication/jwt-socket-authentication.verifier.ts` i socket auth servis/verifieri
4. `backend/src/common/redis/` (create-redis-client, tokens)
5. `frontend/src/services/helpdesk-socket.ts`, `ticket-socket.ts`, `frontend/src/lib/realtime/*`
6. `frontend/src/lib/tickets/use-ticket-realtime.ts`, `frontend/src/lib/notifications/use-inbox-notifications.ts` (stanje poslije Faze 1.3!)
7. `frontend/package.json` — potvrdi `@tanstack/react-query` verziju; `frontend/src/main.tsx` i layouts kroz koje se provlači QueryClient provider
8. `frontend/src/services/*-api.ts` obrazac dohvata (da bi mapirao queryKey-jeve dosljedno)

## 3. VJEŠTINE

- `@socket.io/redis-adapter` (instalacija, dva Redis klijenta: pub/sub, failure modovi)
- Socket.IO sobe/adaptiranje emit matrice bez gubitka sigurnosnih invarijanti
- React Query: key dizajn, staleTime/gcTime, selektivna invalidacija, integracija s postojećim socket singletonom
- Render performance: list virtualization (`@tanstack/react-virtual` — NOVI paket: ODOBREN samo ovaj ili za front ionako već instalirani)
- LB/deploy mehanika: sticky sessions, connection draining (dokumentacioni nivo ako LB nije u repo-u)

## 4. ŽELJEZNA PRAVILA

1. **Sigurnosna matrica emit-ova je netaknuta u smislu TKO smije vidjeti ŠTA:** intern/system poruke nikad u `public` niti u `group` sobe (postojeća pravila u `broadcast-ticket-realtime.ts` ostaju logički identična). Mijenjaš GRANULACIJU (koliko payloada i kamo), ne PRAVILA.
2. **Nula gubitaka događaja u tranziciji:** dok traje rolling deploy, event mora stići i klijentima na staroj i na novoj instanci (testiraj oba smjera).
3. **Klijent mora raditi i protiv servera prije faze** (kompatibilnost jedne generacije): novi eventi se dodaju, postojeći se ne uklanjaju dok klijent ne prijeđe.
4. React Query: **postojeće ponašanje osvježavanja se ne smije pogoršati** — gdje danas socket event direktno upisuje u lokalni state (npr. detalj tiketa), zadrži isti UX (kroz `setQueryData` ili direktno pretplatu); samo dedupe/keš se dodaje.
5. Zustand ostaje za UI stanje; server podaci migriraju u React Query — bez dvostrukih izvora istine.
6. Stil repo-a (front): funkcijske komponente, mali hook fajlovi, `.spec.ts`/postojeći test runner (vitest), bez `any`.
7. Nove zavisnosti: samo `@socket.io/redis-adapter` (backend) i `@tanstack/react-virtual` (frontend). Ništa drugo.

## 5. STAVKE

### STAVKA 3.1 — Redis adapter + deploy otpornost (napor S) — PRVA

**ŠTA/PROBLEM/CILJ:** plan §3.1. `websocket.gateway.ts` `afterInit` nema adapter ⇒ single-node sobe; deploy = reconnect oluja.

**ISPRAVKA (backend):**
- Instalirati `@socket.io/redis-adapter`; u `afterInit`: `server.adapter(createAdapter(pubClient, subClient))` — klijente kreiraj kroz POSTOJEĆI redis modul/factory (`create-redis-client.ts`); sub klijent mora biti DEDICIRANA konekcija (ne dijeliti s BullMQ)
- Failure: Redis nedostupan pri bootu ⇒ log error + NASTAVI s in-memory adapterom (degradirano, ali živo); retry pozadinski uz log
- Metrika: `ws_clients_count`, `ws_adapter_redis_ok` (Faza 0 obrazac)
- Testovi: mock Server — adapter pozvan s dobrim klijentima; fallback grana pokrivena spec-om

**ISPRAVKA (ops/docs):**
- `docker-compose.yml`: dokumentuj (komentarom iznad servisa) sticky-session zahtjev; ako repo ima LB/edge config — dodaj sticky direktivu; inače `ops/` md uputstvo
- Deploy runbook (`ops/ws-rolling-deploy.md`): drain procedure — stop novih WS (health flag), čekati ≤ 30 s, kill; klijentski reconnect + DODATI jitter u `helpdesk-socket.ts` (`reconnectionDelay`/`randomizationFactor` opcije klijenta — minimalna izmjena)
- Test: integracijski cross-instance (dva node procesa + stvarni Redis u dockeru; socket.io test klijent na svakom; emit s A vidljiv na B) — stavi pod `e2e/` po postojećem obrascu

**PONAŠANJE:** 2 instance = jedan "svemir" soba; boot bez Redis = upozorenje, ne pad; runbook omogućava rolling bez kaskade.

### STAVKA 3.2 — Granulacija emit-ova (napor M)

**ŠTA/PROBLEM/CILJ:** plan §3.2. Svaki `ticketUpdated` leti u group sobu svakom agentu (~2.000 emit-ova/s ciljno opterećenje). Cilj < 500/s; ticket sobe zadržavaju pune događaje.

**ISPRAVKA (backend):**
- Razdvoji event tipove: `ticketUpdated` (puni payload) → samo ticket staff/public sobe + user sobe aktera (requester/assignee/actor — zadrži postojeće)
- Novi lagani event `groupFeedChanged { groupId, ticketId, kind: 'message'|'status'|'assign'|'sla' }` (< 200 B) → `group:{id}` soba; jedan po događaju
- NE mijenjaj pravilo vidljivosti: `kind` mapiranje prati postojeću internu/javnu logiku; intern/system poruke NE generišu groupFeedChanged ako bi time procurilo da interni sadržaj postoji neovlaštenima (konzervativno: samo 'status'|'assign' bez sadržaja tiketa — dokumentuj odluku)
- Ćaskanje: fan-out notification emit-ova iz Faze 2.3 ostaje kako je tamo definisano — ne diraj
- Testovi: broadcast matrica spec (staff/public/group/user × message/status/internal) — matrica mora eksplicitno potvrditi SVE 8+ kombinacija; regresija "internal note nikad u public/group" zadržana i proširena na novi event

**ISPRAVKA (frontend):**
- Listni ekrani pretplaćeni na `groupFeedChanged`: pogođeni ticket/list query označiti stale (React Query invalidate iz 3.3 — ako 3.3 još nije slijedila, privremeni postojeći `reload()`); NE povlačiti ništa ako ekran nije aktivan (`document.visibilityState`/provider enabled)
- Detalj tiketa: NEPROMIJENJEN UX (pun payload i dalje stiže kroz ticket sobu)

**PONAŠANJE:** Agent na detalju: sve kao danas. Agent na listi: vidi da se "nešto mijenja" bez mrežne bujice; broj emit-ova/s mjeren (Faza 0 metrika) < 500 pri 10 događaja/s.

### STAVKA 3.3 — React Query keš sloj + virtualizacija (napor M) — ZADNJA

**ŠTA/PROBLEM/CILJ:** plan §3.3. React Query instaliran a neiskorišten; iste kolekcije povuču se 2–4× po sesiji; duge liste bez virtualizacije.

**ISPRAVKA (frontend, po-modulno):**
1. `QueryClientProvider` u rootu; defaulti: `staleTime: 30_000` (katalozi: OU stablo, servisi, grupe, routing pravila → `staleTime: 300_000`), `retry: 1`, `refetchOnWindowFocus: false`
2. Migracija prioriteta (zaseban diff po grupi): (a) KATALOZI (OU tree, servisi, grupe, rules) — najjednostavniji, odmah; (b) listni upiti (tickets page/inbox); (c) detalji tiketa; (d) dashboard/SLA hookovi iz Faze 2.4
3. **Jedinstvena tačka invalidacije:** novi modul `lib/realtime/invalidate-on-event.ts` — mapa `socketEvent → queryKey[]`; pretplata ka postojećem singleton socketu; detalj tiketa zadržava direktni update kroz `setQueryData` gdje je UX danas instant
4. Zustand: izbaci server-podatke iz storeova; zadrži UI state (filtri, selektije) — bez duplog izvora istine
5. Virtualizacija: `@tanstack/react-virtual` na listi tiketa (i audit log listi ako je iznad ~200 redova tipično); očuvati postojeći izgled/klik ponašanje
6. Testovi (vitest): queryKey mapiranje; invalidate pravila po eventu; postojeći hook testovi migrirani na provider wrapper

**PONAŠANJE:** Navigacija naprijed-nazad = 0 novih zahtjeva unutar staleTime prozora; tipična sesija ≥ 50% manje zahtjeva od baseline (mjereno kroz network log uz screenshot dokaze u izvještaju); lista od 10.000 redova scrolla bez zamrzavanja glavne niti.

## 6. DEFINITION OF DONE — KAPIJA FAZE 3

- [ ] Cross-instance emit dokazan automatiziranim testom; rolling deploy simulacija: < 1% klijenata s pauzom > 5 s (log/mjerenje)
- [ ] Broadcast matrica spec pokriva sve kombinacije; 0 curenja internog sadržaja
- [ ] emit-ovi/s < 500 pri 10 događaja/s (k6 WS scenarija, brojke u izvještaju)
- [ ] Klijent: ≥ 50% manje zahtjeva po tipičnoj sesiji; katalozi 1×/staleTime; voucheri: network logovi prije/poslije
- [ ] `npm test` (backend + frontend vitest), build, lint zeleni; popunjen red "Nakon F3" u plan §7

## 7. VAN OBIMA

- Premještanje @Interval jobova (Faza 4); CI load test budžeti (Faza 4)
- Izmjene auth mehanike socketa (JWT handshake ostaje kakav je — samo jitter/adapter sloj)
- Novi realtime feature-ovi (presence, typing indikatori) — zabilježi kao backlog, ne implementirati
- Bilo kakve serverske izmjene notifikacijskog modela (zatvoreno u Fazi 2.3)

## 8. FINALNI IZVJEŠTAJ (obavezan format)

```
FAZA 3 — IZVJEŠTAJ
Diff-ovi: <backend po stavci / frontend po modulu>
Emit matrica: <tabela TKO dobija ŠTA za svaki event tip — prije/poslije>
Kapija: emits/s=? cross-instance=? deploy pauza=% sesija-zahtjevi=?
React Query stanje: <migrirani moduli, preostali backlog>
Odstupanja: <šta/zašto>
```

## 9. PRAVILA DISKUSIJE

- Svaka dilema "može li ovaj metapodatak curiti informaciju" → konzervativna odluka + dokumentacija; nikad proširivati vidljivost da bi se smanjio protok.
- Ako React Query migracija otkrije hook koji NAVODNO ovisi o stalnom refetchu → dokumentuj i zadrži izričitu invalidaciju za njega; ne šuti.
