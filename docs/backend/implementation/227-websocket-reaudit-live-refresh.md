# Zasebni reaudit WebSocket audita i potrebe za live osvježavanjem

**Vrsta:** statički audit, novi follow-up nalazi; bez promjene produkcijskog koda.  
**Pregledana baza:** `46f4099` (Val 6 owner-directed closeout).  
**Granice:** nije izvršen novi browser E2E, Redis outage, produkcijski test niti provjera runtime konfiguracije. P1/P2/P3 su preporuke ovog zasebnog audita, nisu automatski dodani u izvorni registar 694 nalaza i ne mijenjaju historijski closeout. Koraci ispod su ciljevi za kontrolisani test, ne tvrdnja da su već reproducirani.

## 1. Zaključak o prethodnom auditu

Audit `docs/backend/audits/18-websocket.md` vrijedan je izvor baseline prijetnji, ali njegove početne sekcije 3–8 opisuju stanje prije implementacija i sadrže tvrdnje poput nepostojanja revalidacije sesije/ticket soba, default-on legacy emit i fire-and-forget join. One ne opisuju nužno trenutno stanje; treba ih čitati uz kasnije dopune i [Val 6 closeout](226-val6-owner-directed-closeout.md). U kodu sada postoje sesijski i room lease/revalidation, default-off legacy group payload, awaitanje room setupa i Redis readiness. Ne podrazumijevati iz toga kompletnu browser/multi-instance revocation matricu: Val 6 je zatvoren odlukom vlasnika uz eksplicitno prihvaćene granice. Konkretno BA-websocket-09 testira invalidaciju React Query ključeva, ali to nije dovoljno za sve ekrane čije se vidljivo stanje drži u `useState` (nalaz WR-01 ispod). Test pozitivnog reconnecta nije dokaz bezgubitnog replaya.

## 2. Stvarna arhitektura i granice

- Browser dijeli jedan ref-counted Socket.IO klijent (`frontend/src/services/helpdesk-socket.ts`), cookie/origin autentikaciju, jitter reconnect. Server provjerava session i autorizaciju, user/group/global-admin/ticket sobe i njihove leaseove (`backend/src/modules/websocket/websocket.gateway.ts`, `socket-group-membership.service.ts`, `ticket-chat.gateway.ts`).
- Javna ticket poruka ide staff/public sobama i requester user sobi; interna samo staff sobi. Group room dobija ograničen `group.feed-changed`; legacy puni group payload je eksplicitni opt-in (`broadcast-ticket-realtime.ts`, `group-feed-change.ts`). Private settings metadata i admin konfiguracija idu globalnoj admin sobi, a settings signal bez ključa svima (`broadcast-user-realtime.ts`). Edge payload može ići user i ticket sobi; budući događaji moraju imati jednako strogu payload/scope kontrolu.
- Redis adapter je best-effort, ima health/readiness signal, ne durable replay. Događaj se može izgubiti tokom disconnecta ili degradacije. `PUBLISHED_BEST_EFFORT` nije potvrda browser isporuke. REST je izvor istine i potrebno je osvježavanje na oporavku/vidljivosti; konektovan browser nije dokaz da je adapter zdrav.
- Globalni `role:admins` namjerno zahtijeva nescope-irani ADMIN/SUPER_ADMIN (`socket-group-membership.service.ts`). Scoped administratori ne dobijaju globalni config feed; ne širiti sobu radi UX-a bez sigurnog scope ugovora.

## 3. Novi nalazi

### WR-01 — P1: lista tiketa i dashboard nemaju potpun catch-up nakon reconnecta ili skrivenog taba

**Dokaz u kodu:** `frontend/src/lib/realtime/reconnect-catchup.ts:9-16,41-62` samo invalidira React Query ključeve; `use-ticket-list-data.ts:44,169-173` i `use-dashboard-summary.ts:49-50,204-211` prikazuju podatke iz lokalnog statea, čiji `reloadSilent` nije pozvan na reconnect. `use-ticket-collection-realtime.ts:50-58` odbacuje group događaje dok je tab hidden, bez bilježenja stanja i poziva reload pri povratku. Globalni `invalidate-on-event.ts:77-83` također preskače sve događaje dok je hidden. Vidljivost sama po sebi ne pokreće reconnect catch-up osim ako reconnect već čeka (`reconnect-catchup.ts:61-63`).

**Posljedica:** otvoren inbox/lista i dashboard mogu ostati zastarjeli poslije propuštene grupne promjene čak i kad socket ponovo radi; invalidiranje keša ne ažurira automatski kopiju u `useState`. Drugi događaj ili ručni/navigacijski reload može prikaz popraviti. Ne tvrdi se da su svi slučajevi svih korisnika pogođeni.

**Provjera:** s dva korisnika/grupom otvoriti inbox i dashboard A; bez drugih događaja sakriti tab A, promijeniti tiket kroz B, vratiti A bez reconnecta; ponoviti s prekidom i reconnectom bez događaja nakon oporavka. Usporediti s autorizovanim REST snapshotom. Testirati i hidden reconnect, višestruke evente/debounce, grešku reload-a i unmount. **Popravka:** vidljivosti i reconnectu dodati bounded coalesced `reloadSilent` za montirane imperativne projekcije ili prebaciti prikaz na aktivne query observatore; bez polling storma i sa stale/error signalom. Ne oslanjati se samo na invalidiranje keša.

### WR-02 — P1: ticket join i REST snapshot nisu sinhronizovani; stariji odgovor može prepisati novi događaj

**Dokaz:** `frontend/src/services/ticket-socket.ts:27-29` šalje join bez ack; `backend/src/modules/websocket/ticket-chat.gateway.ts:160-210` join autorizuje i dovršava asinkrono. `use-ticket-realtime.ts:42-53` ne čeka potvrdu joina prije reconnect `reload()`, a `use-ticket-detail.ts` pokreće početni REST load nezavisno. `load-ticket-detail.ts:68-95` zatim bez generation/merge zaštite postavlja ticket i listu poruka; event handler istovremeno upsertuje poruku (`use-ticket-realtime.ts:55-63`).

**Posljedica:** promjena između snapshota i završenog joina može se propustiti; poruka pristigla tokom sporog REST čitanja može biti prepisana starijim odgovorom. Join odbijen zbog access/limita također nije vidljiv klijentu. Ovo je analiza mogućeg racea, ne dokaz učestalosti u produkciji.

**Provjera/popravka:** deterministički odgoditi join i REST odgovor, ubaciti promjenu u oba prozora; potvrditi da nijedna autorizovana promjena ne nestaje. Uvesti ack s timeoutom, jasan neuspjeh i autorizovani snapshot *nakon* potvrde, uz generation/version ili kontrolisano spajanje eventova i snapshota. Testirati retry, promjenu ID-a, disconnect, limit soba, out-of-order i cleanup. Ne izlagati sadržaj grupnoj sobi.

### WR-03 — P1: silent ticket refresh na odbijen pristup zadržava stare podatke

**Dokaz:** `load-ticket-detail.ts:96-100` pri `silent: true` guta svaku grešku, uključujući 403/404, bez čišćenja prikazanog tiketa i bez korisničkog signala. `use-ticket-realtime.ts:49-53` koristi silent reload na reconnect. Backend room revalidation zaustavlja buduće poruke, ali ne briše sadržaj već držan u browser memoriji.

**Posljedica:** nakon opoziva pristupa i pokušaja silent refresh-a na ekranu mogu ostati ranije učitani podaci. To nije dokaz novog server-side curenja niti garancija da će refresh biti pokrenut odmah nakon revocationa.

**Provjera/popravka:** s kontrolisanim korisnicima oduzeti pristup otvorenom tiketu, izazvati reconnect/refetch i simulirati 403/404; očistiti osjetljive detalje, poruke i panele i prikazati pristupačnu poruku. Mrežni/5xx kvar tretirati zasebno kao stale/error, ne kao uspjeh niti automatsko brisanje. Provjeriti stare konkurentne zahtjeve da ne vrate prethodni prikaz.

### WR-04 — P2: administratorski live refresh zanemaruje promjene istog korisnika u drugom tabu i reconnect

**Dokaz:** `use-admin-config-live-refresh.ts:31-47` odbacuje event kada je `actorUserId === currentUserId`, iako nema identiteta taba/mutacije. Bus je lokalni za tab (`admin-config-events.ts`). Admin domeni nisu dio `reconnect-catchup.ts`, a admin stranice kao groups/routing/SLA/templates imaju imperativni `reload`.

**Posljedica:** isti administrator mijenja konfiguraciju u tabu B, dok tab A ostaje star; isto vrijedi za propušten event tokom socket prekida. To ne predstavlja autorizacijski bypass i backend provjere ostaju nužne.

**Provjera/popravka:** isti korisnik u dva taba, promjena konfiguracije i disconnect/reconnect, uključujući editor sa nespremljenim izmjenama. Razlikovati vlastitu mutaciju po identifikatoru taba/operacije umjesto user ID-a ili sigurno prikazati pending banner; pri reconnectu ponovo učitati/označiti stale uz zaštitu drafta. Za scoped administratore potreban zaseban autorizovani feed ili ograničeni polling/ručni refresh, ne proširenje globalne admin sobe.

### WR-05 — P2: povratak skrivenog admin taba zaobilazi zaštitu editora

**Dokaz:** `use-admin-config-live-refresh.ts:34-47` skriveni event označi stale, ali na povratku bez provjere `isEditingWithin` pozove `reload`. Za vidljiv event ista provjera postavlja pending umjesto reload-a. Fokus ili otvoren dialog/draft mogu postojati pri povratku.

**Posljedica:** mogući reset ili zastarjeli konflikt uređivanog prikaza zavisno od konkretnog `reload` i forme; gubitak drafta nije zasebno reproduciran. Zaštita samo fokusom uopće nije ekvivalent provjeri dirty stanja.

**Provjera/popravka:** otvoriti modal/izmijeniti draft u A, sakriti tab, promijeniti isti domen s drugim korisnikom pa vratiti A. Očuvati draft i prikazati pending banner; ponovna provjera treba koristiti eksplicitni dirty state i slijediti isti ugovor za reconnect i visibility.

### WR-06 — P2: odgovor inbox snapshota može prepisati noviji notification event

**Dokaz:** `use-inbox-notifications.ts:60-82` asinhroni `listNotifications` bez povezivanja s event generacijom direktno zamjenjuje `items` i `unreadCount`; `:217-245` u međuvremenu lokalno primjenjuje socket event. `requestSequence` štiti od drugih list zahtjeva, ne automatski od socket eventa.

**Posljedica:** ako event stigne nakon što je server formirao odgovor, ali prije njegove primjene, stariji snapshot može prepisati novi red ili badge do naknadnog osvježenja. Reconnect i fallback poll pomažu, ali poll badgea ne osvježava cijeli otvoreni inbox dok je socket zdrav.

**Provjera/popravka:** deferovani REST odgovor + simultani create/read event; snapshot/event reconciliation uz stabilne ID-jeve i eventualnu dodatnu autorizovanu provjeru, testirati read-all, pagination, duplikate i brojač. Ne koristiti client-side delta kao jedini izvor istine.

## 4. Gdje je live potrebno, a gdje nije automatski

| Površina | Sadašnji mehanizam | Procjena i preporuka |
| --- | --- | --- |
| Detalj tiketa / poruke / presence | ticket sobe, public/staff, reconnect reload; presence best-effort | **Visok prioritet:** WR-02/03; presence ne treba durable replay. Provjeriti panele priloga/učesnika i prava odvojeno. |
| Liste, grupni inbox, dashboard | group/feed, notification i ticket event sa 300 ms debounce; imperativni state | **Visok prioritet:** WR-01; dohvatiti snapshot samo za vidljiv/montiran ekran, ograničiti frekvenciju. |
| Notifikacije | user/group event; badge poll kod disconnecta; vidljiv inbox reload na reconnect/visibility | **Visok prioritet:** WR-06 i testovi utrka; ne tvrditi da je badge zdrav samo zato što je socket povezan. |
| Aktivne najave | recipient signal + React Query + 60 s poll (`announcements-host.tsx`) | Postojeći push + fallback je razuman. Validirati opoziv/istek, skrivene tabove i multi-instance; ne dodavati drugi globalni broadcast. |
| Status servisa | `use-status-overview-data.ts`: 60 s visibility-aware poll, immediate na visibility/online, ručni refresh | Za sada polling može biti dovoljan; realtime samo ako se odluči da latencija do 60 s nije prihvatljiva. Sačuvati authorized REST i fallback. |
| Dežurstva | `use-on-call-overview-data.ts` učita pri mountu i nakon vlastitih akcija; stranica ima ručni refresh | Kandidat srednjeg prioriteta: izmjena rasporeda/zamjene u drugom tabu i prelazak vremena mogu ostati neosvježeni. Odlučiti dopuštenu latenciju; visibility-aware polling ili uski signal, bez širenja podataka o rasporedu. |
| Problemi i promjene | stranice/list/detail čitaju REST/React Query; u pregledanim stranicama nema specifične socket pretplate; globalno `refetchOnWindowFocus=false` | Kandidat srednjeg prioriteta za saradnju na otvorenom detalju/statusu/odobrenjima. Potrebno provjeriti sve mutacijske i scheduler putanje, vidljivost i scope; ne tvrditi potpuno odsustvo drugih indirektnih mehanizama. |
| Admin konfiguracija routing/SLA/catalog/groups/templates | globalni admin domain event i hook; selektivni query keys | Ispraviti WR-04/05 i odlučiti sigurnu podršku scoped korisnicima. Ne resetovati editor pod korisnikom. |
| Aktivni timer | user `time.timer.changed` + visibility refresh, heartbeat i lokalna synchronizacija | Zadržati lagani signal i REST; provjeriti reconnect i promjenu u drugoj instanci, bez dodavanja sadržaja u ticket room. |
| Assets, korisnici, permisije, izvještaji, historija | REST/ručni ili lokalni refresh, neke pojedinačne query/poll putanje | Nije dokazano da svi zahtijevaju realtime. Prioritet prema riziku rada s više operatera; eksplicitni refresh/stale signal može biti dovoljan. Sigurnost autorizacije i konkurentni upisi nikad ne zavise od WebSocketa. |

Globalna React Query konfiguracija koristi `staleTime` 30 s i `refetchOnWindowFocus: false` (`frontend/src/lib/query/query-client.ts`). **Stale nakon 30 s ne znači automatski periodični dohvat**. Za konkretni ekran utvrditi da li ima aktivan observer, vlastito osvježavanje i autorizovani endpoint.

## 5. Preporučeni redoslijed i prihvatni testovi

1. WR-03 i WR-02: zaštita opozvanog prikaza, ack/ordering i regresija sa stvarnim Socket.IO klijentima; 403/404, nepristupačni ticket, slow REST, revoke, reconnect i retry. Ne zaobilaziti room policy.
2. WR-01 i WR-06: montirana lista/dashboard i notification panel, hidden tab + reconnect, race, duplicate, 2 taba, single-flight/debounce i oporavak poslije greške. Testirati vidljivi state, ne samo poziv `invalidateQueries`.
3. WR-04/05: dva taba istog korisnika i različiti administratori, dirty/dijalog, hidden/reconnect, scoped/global role; zadržati draft i dokazati da nema neovlaštenog payload-a.
4. Tek zatim dogovoriti SLO svježine za on-call, probleme i promjene; dodati minimalni signal ili visibility-aware polling samo gdje postoji poslovna potreba. Status i najave već imaju poll; ne povećavati trajno mrežno opterećenje bez mjerenja.
5. Cross-instance integracija na stvarnom Redis adapteru, outage između dvije instance i browser catch-up, kao i authz revocation tokom otvorenog taba; mjeriti broj aktivnih socketova, reconnect/refetch rate, degraded vrijeme i greške. Događaji emitovani dok je Redis nedostupan nisu garantovani; verifikovati restauraciju REST snapshotom, ne tvrditi replay.

Nema sigurnog osnova iz ovog statičkog pregleda da je produkcija trenutno reproducirala svaki race ili da je svaka površina obuhvaćena. Implementacija, migracija, testni rollout i eventualno uključivanje nalaza u globalni registar zahtijevaju zasebnu odluku i evidenciju.
