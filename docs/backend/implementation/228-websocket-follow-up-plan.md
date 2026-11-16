# WebSocket follow-up — provjera i plan

**Status:** implementacija u toku, nije closeout. Ovaj paket ne mijenja historijski owner-directed status Vala 6. Baseline je [reaudit 227](227-websocket-reaudit-live-refresh.md).

## Provjera postojećih mehanizama

| Oblast | Već postoji | Preostala provjera / posao |
| --- | --- | --- |
| Detalj tiketa, revoke i join/snapshot | Djelimične ispravke: [229](229-ticket-refresh-revoke.md) i [230](230-ticket-revoke-join.md). | WR-02/03 owner-directed zatvoreni uz browser acceptance i izričito prihvaćen nedokazan Redis cross-instance revoke; detalji i ograničenja u [230](230-ticket-revoke-join.md). |
| Lista/dashboard, reconnect/hidden | React Query catch-up, debounced reload na event, fencing lokalnih snapshotova i room-ready signal. | WR-01 owner-directed zatvoren nakon korisnikovih L1–L7 DA; realni Redis cross-instance/outage ostaje N/A i bez tvrdnje o replayu ili zdravom adapteru. [234](234-collection-room-ready-catchup.md). |
| Notifikacije | Snapshot, read-all i badge utrke obrađeni u [231](231-notification-snapshot-race.md), recipient izolacija u [233](233-edge-notification-recipient-isolation.md). | Korisnik je potvrdio ponovljeni N1, N2 i N3 te odobrio zatvaranje provjerenog segmenta; pagination N4 i cross-instance R1/R2 su N/A. Nema tvrdnje o svim redoslijedima, replayu ili nedokazanim acceptance scenarijima; [232](232-websocket-browser-redis-acceptance.md). |
| Admin drugi tab/reconnect/draft | Konzervativni banner umjesto automatskog reload-a, i reconnect obavijest. | Korisnik potvrdio A1/A2; scoped admin bez globalnog feeda i nedokazana šira matrica ostaju dokumentovani, bez proširenja globalne sobe. |
| Integration/browser acceptance | Postoje Redis integration i lokalni outage test, kao i pozitivni E2E 59. | Ne dokazuju sve navedene utrke i recovery pod gubitkom. Planirati determinističke frontend testove i izolovani browser/Redis test, pa korisnik pokreće ciljani/full E2E prema dogovoru. Nema garancije replaya. |

## Prvi implementacijski korak — WR-01

`useTicketCollectionRealtime` sada bilježi promjenu dok je tab skriven te pri povratku raspoređuje jedan debounced `reload` umjesto da samo invalidira query cache. Na `connect` ponovo učitava montiranu projekciju, uključujući prvi connect nakon mogućeg load/join prozora. Vidljivi eventovi koriste isti mehanizam. Timer se pri unmountu čisti; skriven tab ne pokreće mrežni dohvat. Ovo je ciljano poboljšanje za listu i dashboard, ne opći durable replay niti dokaz da je room setup već završen u momentu connecta.

Prije popravke dva nova hook testa pala su na očekivanom nedostajućem `reload` pozivu; poslije popravke zajedno s reconnect/dashboard testovima prošlo je 14/14, frontend TypeScript i ciljani ESLint. Fake socket/unit nije browser/production dokaz. Preostali slučajevi: spori/istovremeni reload, adapter degradacija bez browser disconnecta, join-readiness i runtime end-to-end; status prije kasnijeg korisničkog acceptancea je bio otvoren; završni rezultat je u [234](234-collection-room-ready-catchup.md).

## Redoslijed

1. Ticket revoke i join/snapshot: prvo kontrolisana regresija, zatim usklađivanje ack-a i REST/state generacija; ne objavljivati ticket sadržaj u grupnu sobu.
2. Ojačati WR-01 prema realnim room-readiness i failure scenarijima te notification snapshot/event race.
3. Admin: cross-tab/reconnect/hidden sa zaštitom dirty nacrta i konzervativnom global/scoped autorizacijom.
4. Cross-instance/Redis i browser acceptance, dokumentovanje testiranih i netestiranih stanja; nikakvi ručni full CI/E2E, migracija ili deployment bez zasebnog korisnikovog koraka.

## Dodatni WR-01 korak — spori snapshot

Relevantan event ili connect odmah invalidira generacije aktivnih lokalnih snapshotova, prije debounce čekanja; catch-up zatim poništava odgovarajuće pending React Query upite prije invalidacije i novog dohvata, da ne preuzme isti stari pending odgovor. Ista zaštita generacije vrijedi za listu i dashboard; pri skrivenom tabu catch-up čeka povratak. Dva regresijska hook testa su prije ispravke pala (nedostajuća neposredna invalidacija i primjena starog dashboard odgovora); nakon izmjene ciljanih 20/20 testova, TypeScript i ESLint prolaze. Zaseban test sa stvarnim QueryClientom provjerava poništavanje pending dashboard upita i kasno razrješenje starog odgovora. To samo po sebi nije dokazivalo sve konkurentne scenarije, browser ili Redis delivery; kasnija korisnička potvrda i nedokazani rizici su u [234](234-collection-room-ready-catchup.md). Read-all cutoff/ordering WR-06 i dalje nije riješen ovom izmjenom; nema promjene ugovora ni tvrdnje o durable replayu.

## Admin WR-04/05 — konzervativna zaštita nacrta

Dva deterministička hook testa su prije izmjene pala: događaj istog korisnika je ignorisan, a povratak skrivenog taba je pozvao reload uprkos mogućem nefokusiranom nacrtu. Budući da postojeći ekrani ne izlažu pouzdan zajednički dirty-state, hook sada za relevantan događaj, uključujući vlastiti korisnički ID, prikazuje obavijest umjesto automatskog reload-a; isto vrijedi ako je tab bio skriven. Na ponovnu socket konekciju montirani admin ekran prikazuje zasebnu neutralnu obavijest o mogućim propuštenim promjenama, bez tvrdnje da je promjena zaista nastala. Korisnik eksplicitno bira osvježavanje; tekst upozorava da može odbaciti nespremljene izmjene. Ovo je svjesni UX kompromis: banner se može pojaviti i nakon vlastite lokalne izmjene, a čisti ekrani se više ne osvježavaju automatski na taj signal. Event se ne obogaćuje sadržajem, ne mijenja se backend room ili autorizacija. Scoped admin koji ne prima globalne evente nema garantovan signal promjene dok je veza stabilna; reconnect obavijest nije zamjena za autorizovani feed ili polling.

Regresijski testovi pokrivaju identitet, skriveni tab, reconnect signal i eksplicitni refresh na nivou hooka/fake socketa. Korisnik je potvrdio konkretne A1/A2 browser scenarije; oni ne dokazuju sve pojedine forme ili Redis adapter. Nema durable replaya.

## Korisnički potvrđen segment i otvoreni nastavak

Korisnik je potvrdio ispravljeni N1, N2, N3, A1 i A2 i odobrio zatvaranje provjerenog notifikacijskog/admin segmenta; N4, R1 i R2 N/A. To nije dokaz stvarnog Redis outage/cross-instance, svih oblika paginationa ili durable replaya. Ticket revoke/join već je ranije owner-directed zatvoren uz prihvaćeni rizik. WR-01 je korisnik nakon L1–L7 DA odobrio zatvoriti, uz dokumentovani nedokazani cross-instance/outage i adapter rizik. Scoped admin live osvježavanje dok veza ostaje aktivna nema autorizovani zasebni feed; razmotriti potrebnu svježinu i siguran pristup. Generički EDGE payload-i sada se šalju samo adresiranom korisniku; promjena ranije ticket-room semantike i kompatibilnosni rizik dokumentovani su u [235](235-edge-recipient-scope.md). Paket 228 nije kompletno zatvoren.

## WR-01 — dodatni room-ready catch-up

Dodat signal i ciljani regresijski testovi: detalji, ograničenja i browser plan u [234](234-collection-room-ready-catchup.md). Korisnik je nakon implementacije potvrdio L1–L7 i odobrio zatvaranje; ne izvlačiti zaključak o zdravlju Redis adaptera iz socket connecta ili room-ready signala.

## Generički EDGE — sigurna podrazumijevana publika

Utvrđen je dodatni mogući cross-recipient broadcast generičkog EDGE payload-a; regresija i izričita promjena ranijeg ticket-room ugovora dokumentovane su u [235](235-edge-recipient-scope.md). Stvarni repo producenti su notification i user timer; vanjski potrošači/legacy payloadovi nisu dokazivo isključeni. Korisnik je izabrao zaseban autorizovani scoped feed; reprodukcija postojećeg ograničenja i redoslijed po domenama su u [236](236-scoped-admin-feed-investigation.md). Feed još nije implementiran; ne širiti globalnu sobu.
