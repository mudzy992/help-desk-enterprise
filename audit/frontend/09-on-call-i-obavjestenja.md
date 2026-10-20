# Reaudit modula 09 — On-call i obavještenja

**Datum reauditiranja:** 20. 10. 2026.
**Revidirani snapshot:** `c800c1445b610e03ac2c21502efce196112fc122`
**Status:** reaudit završen; implementacija nalaza nije započeta
**Aktuelna ocjena:** **9,3/10 nakon Faze 5**
**Maksimum bez stvarnog browser/E2E dokaza:** **9,8/10**

## 1. Izvršni sažetak

Modul je funkcionalno znatno bolji od arhivskog audita 6/10. Ranije kritične state greške su djelimično zatvorene: izbor grupe briše prethodni detail, detail zahtjev ima latest-only zaštitu, refresh greška ostaje vidljiva uz postojeći overview, sedmični kalendar signalizira učitavanje, on-call unos i prikaz koriste zonu rasporeda, reason dijalozi pravilno razdvajaju validaciju od pending stanja, a announcement report odbacuje zastarjele odgovore.

Reaudit ipak ne potvrđuje produkcijski closeout. Glavni preostali rizici su:

1. on-call overview je jedan `Promise.all` snapshot bez latest-only identiteta; kvar jednog od tri izvora blokira sva tri, a zakašnjeli refresh može prepisati noviji;
2. mutation zaštita je zasnovana na React stateu i nije sinhroni operation guard, pa synchronous double-click može poslati dupli swap/delete/announcement zahtjev;
3. detail error nema request ID niti retry dugme, a pri promjeni sedmice stari detail ostaje interaktivan dok novi scope još nije potvrđen;
4. announcement capabilities greška se tiho pretvara u arhiv bez Manage taba;
5. ManageAnnouncements ima ručni list/options controller bez request guardova, korelacije greške i preciznog cache ugovora;
6. AnnouncementsHost potpuno skriva active-query grešku, pa se outage predstavlja kao „nema obavještenja“;
7. ključne page/controller/host/editor state mašine nemaju direktne testove;
8. browser matrica za swap, override, feed token, banner/modal limit, deep link, CSV/reminder/withdraw, responsive i axe nije izvršena.

Ocjena **9,3/10** nakon Faze 5 priznaje zatvoren query identitet/recovery, synchronous mutation concurrency i URL-kanonski prikaz, uz zrelu domensku osnovu, backend zaštite i on-call vremensku zonu. Preostali odbici su announcement civil-time odluka, puna testna mreža, održivost i browser dokaz.

---

## 2. Scope i metodologija

### Primarni frontend scope

- `frontend/src/pages/on-call-page.tsx`
- `frontend/src/pages/announcements-page.tsx`
- `frontend/src/components/on-call/**`
- `frontend/src/components/announcements/**`
- `frontend/src/lib/on-call/on-call-view.ts`
- `frontend/src/lib/announcements/announcement-view.ts`
- `frontend/src/services/on-call-api.ts`
- `frontend/src/services/announcements-api.ts`

### Cross-reference scope

- route access i session capabilities;
- `AnnouncementsHost` montiranje u application shellu;
- zajednički Modal, ConfirmDialog, Field, Toast i API error ugovori;
- backend on-call i announcements kontroleri, servisi, viewer i delivery granice;
- relevantni notification fan-out, realtime i preference tokovi samo gdje direktno utiču na ova dva modula;
- `44-on-call-schedule.spec.ts` i `45-announcements-lifecycle.spec.ts`, uz `04`/`22` kao realtime/a11y cross-reference.

### Izvršena analiza

- pročitani su aktuelni page, component, lib i API controller tokovi;
- provjereni su request lifecycle, stale identity, recovery, mutation concurrency, URL state, vremenska zona, a11y semantika i responsive struktura;
- pregledani su frontend testovi i E2E izvori;
- backend je korišten za provjeru autoriteta dozvola i domenskih invarijanti;
- stvarni browser nije pokrenut jer lokalni E2E stack nije dostupan; nijedan browser nalaz nije predstavljen kao izvršen dokaz.

### Veličina i koncentracija

Aktuelni primarni scope ima približno **4.478 linija**. Najveće cjeline su:

- `on-call-page.tsx`: 725;
- `announcements-page.tsx`: 530;
- `announcement-editor-dialog.tsx`: 544;
- `on-call-schedule-dialog.tsx`: 383;
- `announcements-host.tsx`: 329;
- `announcement-report-dialog.tsx`: 308;
- `on-call-view.ts`: 296.

Ovo nije samo estetski dug: najveće datoteke istovremeno drže query orchestration, mutation lifecycle, URL/UI state i prezentaciju, što otežava direktne determinističke testove.

---

## 3. Potvrđeno dobro stanje

### On-call

- Backend ostaje autoritet za `onCallRead` i `onCallManage` dozvole.
- Promjena grupe odmah uklanja prethodni detail; zakašnjeli detail odgovor ne može commitovati nakon cleanup-a efekta.
- Sedmična promjena izlaže loading status i `aria-busy` umjesto tihog scope prijelaza.
- Kalendar, overview, `/on-call/me`, swap i range unos koriste deklarisanu zonu rasporeda.
- DST helperi odbijaju nepostojeće civilno vrijeme i imaju pure testove.
- Destruktivne akcije traže razlog, dok „Otkaži“ ostaje dostupno tokom validacije.
- ICS token se prikazuje samo kada ga server izda; backend čuva hash, a javni odgovor ima `private/no-store` ugovor.

### Obavještenja

- Archive koristi semantički `<details>` i deep link `?open=<id>` otvara i fokusira cilj.
- Announcement report koristi latest-request guard i poništava aktivni identitet pri promjeni/zatvaranju.
- Editor audience preview ima cleanup zaštitu za debounce i zakašnjeli odgovor.
- Manage refresh greška više ne briše prethodnu tabelu i ima retry akciju.
- CRITICAL koristi interruptive semantiku, dok ostale ozbiljnosti ostaju polite.
- Modal session budžet je centralizovan i testiran kao pure ugovor.
- Backend audience/viewer granice, acknowledgement izvještaj, CSV i reminder pravila postoje.

### Testovi koji već postoje

- on-call civil time, DST, segmenti i mapiranje grešaka;
- announcement view helperi, ton/role i modal session brojač;
- on-call reason i range dijalozi;
- backend resolve/sweep/iCal, announcement audience/delivery i notification fan-out slojevi;
- E2E `44` pokriva osnovni schedule prikaz, a `45` osnovni announcement lifecycle.

---

## 4. Nalazi

### OCN1 — Overview je nekoreliran all-or-nothing snapshot

**Prioritet:** P1
**Lokacija:** `on-call-page.tsx`, `loadOverview`

`overview`, `me` i `swaps` učitavaju se jednim `Promise.all`. Ako jedan endpoint padne:

- uspješna druga dva rezultata se odbacuju;
- korisnik dobija jednu generičku grešku bez informacije koji snapshot je pao;
- prethodni podaci ostaju, ali ne postoji lokalni retry samo pogođenog izvora.

`loadOverview` nema request sequence/abort zaštitu. Refresh, mutation-triggered `reloadAll` i korisnički refresh mogu se preklopiti; stariji odgovor tada može prepisati noviji. `refreshing` takođe postaje `false` kada završi bilo koji zahtjev, ne nužno posljednji.

**Status:** zatvoreno u Fazi 1. Overview, me i swaps sada imaju odvojene typed query snapshot/error/pending ugovore, latest-only guard, request ID i lokalni retry; kvar jednog izvora ne odbacuje druga dva.

### OCN2 — Detail scope nije potpuno identity-safe pri sedmici i grešci

**Prioritet:** P1
**Lokacija:** `on-call-page.tsx`, detail efekt i detail render

Promjena grupe briše detail, ali promjena sedmice ne. Dok se učitava novi period, stari raspored i action površine ostaju interaktivni. Ako novi zahtjev padne, `detailError` se postavlja, ali prethodni detail ostaje prikazan kao da pripada novom `rangeLabel` scopeu.

Greška detaila čuva samo translation key:

- nema API request ID;
- nema eksplicitnog retry dugmeta;
- nema `detailGroupId`/window identiteta koji dokazuje da snapshot pripada aktivnom scopeu.

**Status:** zatvoreno u Fazi 1. Detail controller veže snapshot za group/from/to scope, uklanja prethodni scope odmah pri promjeni grupe ili sedmice, odbacuje zakašnjeli odgovor i izlaže koreliranu grešku sa lokalnim retryjem.

### OCN3 — Mutation concurrency nije sinhrono zaštićen

**Prioritet:** P1
**Lokacije:** on-call swap/delete/feed/dialog mutacije; announcement settle/publish/withdraw/delete/report akcije

UI koristi `setBusy`/`setSaving` prije mrežnog poziva, ali React state update nije sinhroni lock. Dva klika u istom event turnu mogu oba proći guard implicitno jer većina handlera uopšte ne provjerava aktivnu operaciju prije prvog `await`.

Rizici uključuju:

- dupli accept/decline/cancel swapa;
- dupli schedule/override delete;
- dupli feed rotate/revoke;
- dupli acknowledge/dismiss;
- dupli publish/withdraw/delete/reminder;
- dva paralelna savea editora ili schedule forme.

Backend može odbiti dio ponovljenih operacija, ali UX ne smije zavisiti od slučajnog server konflikta.

**Status:** zatvoreno u Fazi 2. Stabilni operation key i sinhroni guard sada štite on-call swap/delete/feed/save te announcement settle/save/publish/withdraw/delete/reminder tokove prije prvog `await`; React pending state ostaje prezentacijski signal, ne concurrency autoritet.

### OCN4 — Capabilities greška degradira dozvole bez objašnjenja

**Prioritet:** P1
**Lokacija:** `announcements-page.tsx`, capabilities query

Query ima `retry: false`, ali render ne čita `error`. Kada capabilities zahtjev padne, `capabilities` ostaje `undefined`, `canManage` postaje `false`, a korisnik vidi samo arhiv. Administratoru Manage tab nestaje kao da nema dozvolu.

Ovo je fail-closed u sigurnosnom smislu, ali netačno u UX i operativnom smislu: outage se predstavlja kao autorizacijska odluka.

**Status:** zatvoreno u Fazi 3. Početna capabilities greška sada je blocking i korelirana request ID-em, sa pending-safe retryjem; Manage odluka se ne donosi dok capability autoritet nije uspješno učitan.

### OCN5 — ManageAnnouncements ručni controller ima race i parcijalni recovery dug

**Prioritet:** P1
**Lokacija:** `announcements-page.tsx`, `ManageAnnouncements`

`list` i `options` se učitavaju kroz jedan ručni `Promise.all` bez request guarda. Mount load, retry i `refreshEverywhere` mogu se preklopiti. Zakašnjeli odgovor može vratiti staru listu nakon uspješne mutacije.

Dodatno:

- kvar options endpointa skriva i uspješnu listu;
- error je već prevedeni string bez request ID-a i strukturiranog scopea;
- retry nema pending/disabled zaštitu;
- `refreshEverywhere` invalidira active/archive tek nakon što `load()` završi; ako refresh liste padne, povezani query cachevi se ne invalidiraju iako je mutation uspio;
- `editing` koristi trostanje `ManagedAnnouncement | null | undefined`, što otežava invariantu edit/create/closed.

**Status:** zatvoreno u Fazi 3. Typed controller razdvaja list/options snapshot, error i pending identitet, koristi latest-only guardove i lokalne retry akcije; mutation invalidacija active/archive cachea više ne zavisi od uspjeha manage refresha.

### OCN6 — AnnouncementsHost skriva query outage kao prazno stanje

**Prioritet:** P1
**Lokacija:** `announcements-host.tsx`

Active query čita samo `data`; `error` se ignoriše. Ako prvi load ili poll padne, host renderuje ništa. Korisnik ne zna da kritična obavještenja nisu provjerena. Kod background greške zadržani cache je koristan, ali nema upozorenja niti telemetry/UI recovery signala.

Header indikator za on-call ima sličan, iako manje kritičan obrazac: greška je tiha, komponenta nestane, a visibility povratak ne pokreće neposredni refresh.

**Status:** zatvoreno u Fazi 3. Initial active-query failure više nije prazan host nego korelirani error/retry prikaz; background failure zadržava aktivna obavještenja uz upozorenje i lokalni retry, a React Query focus lifecycle pokreće visibility recovery.

### OCN7 — Announcement i on-call page state nije URL-kanonski

**Prioritet:** P2
**Lokacije:** `announcements-page.tsx`, `on-call-page.tsx`

Announcement `mine/manage` tab je lokalni state. On-call selected group i week offset su takođe lokalni. Refresh/share/Back/Forward zato ne reproduciraju:

- Manage tab;
- izabranu on-call grupu;
- pregledanu sedmicu;
- otvoreni report/editor kontekst.

Archive `?open=` je pozitivan izuzetak.

**Status:** zatvoreno u Fazi 4. Announcement tab/open i on-call group/week sada su validirani URL modeli; kanonizacija se izvršava tek nakon capability/group podataka, a promjena URL-a neposredno određuje aktivni prikaz i query scope.

### OCN8 — Recovery i API error ugovor nije konzistentan

**Prioritet:** P2

Modul miješa:

- `ApiErrorText` sa request ID-em za overview;
- key bez request ID-a za detail;
- već prevedeni string za Manage list/action;
- toast-only greške za većinu mutation akcija;
- potpuno tihe greške u host/header/feed initial loadu;
- `mapApiError` i `mapOnCallError` na sličnim feed akcijama.

To otežava support korelaciju i testiranje. Nakon greške nije uvijek jasno da li je retry moguć bez zatvaranja dijaloga ili reloadovanja stranice.

**Za zatvaranje:** zajednički typed query/mutation error (`key`, `requestId`, `scope`, `operation`) i eksplicitna retry matrica.

### OCN9 — Zone su popravljene za on-call, ali announcement civil-time ugovor nije donesen

**Prioritet:** P2

On-call koristi zonu rasporeda i predstavlja dobar ugovor. Zatvoreno u Fazi 5. Produktni ugovor je browser-local authoring autora → ISO instant transport → browser-local prikaz primaoca. Editor taj ugovor i IANA zonu preglednika prikazuje uz civil-time unos, a centralni formatter uz svaki prikaz vremena uključuje oznaku zone. Schedule forma validira IANA zonu prije API poziva i daje pristupačnu field grešku. Pure contract testovi pokrivaju DST granicu, eksplicitnu cross-zone konfiguraciju formattera i nevalidne zone.

### OCN10 — A11y/responsive ugovor je djelimičan, bez browser potvrde

**Prioritet:** P2

Pozitivno: role/aria-live, semantičke tabele, details/summary, modal i reason dijalozi imaju dobre osnove. Preostaje dokazati:

- fokus povratak nakon report/editor/reason/range dijaloga;
- keyboard tok za group, calendar, swap i table akcije;
- announcement preview/edit toggle semantiku;
- 320/375/768/1280 px overflow za 28-dnevni kalendar i `min-w-[760px]` manage tabelu;
- 200% zoom;
- serious/critical axe za banner, modal, archive, manage, on-call i feed;
- ponašanje live regiona nakon mutation ishoda.

Bez stvarnog browser runa nalaz ostaje otvoren bez obzira na strukturalni pregled.

### OCN11 — Testna mreža ne pokriva kritične state mašine

**Prioritet:** P1

Nedostaju direktni testovi za:

- OnCallPage overview partial failure, stale refresh, group/week identity, request ID i retry;
- swap/delete synchronous double submit i mutation recovery;
- schedule dialog save race i timezone validaciju;
- feed load/create/rotate/revoke/copy recovery;
- header visibility refresh i stale behavior;
- AnnouncementsPage capabilities error i URL state;
- ManageAnnouncements list/options race, stale refresh i mutation cache matricu;
- AnnouncementsHost initial/background error, modal selection, acknowledge/dismiss race;
- editor save concurrency, duration/date validation i field semantics;
- report CSV/reminder double submit i recovery.

E2E `44` i `45` su korisni, ali ne zatvaraju navedene state mašine.

### OCN12 — Održivost i production hygiene

**Prioritet:** P2

Najveće komponente i dalje kombinuju previše odgovornosti. Scope sadrži delivery-history komentare (`Paket`, `K2/K3`, numerisani `§`) i duplirane mape ozbiljnosti/locale logiku. `Intl.DateTimeFormat` instance se kreiraju u render tokovima. Announcement editor i Manage tabela imaju duboke ternare i širok mutation scope.

**Za zatvaranje:** characterization testovi, typed controller hookovi, izdvajanje prezentacijskih sekcija, centralni severity/time formatter i comment-hygiene gate.

### OCN13 — Browser/E2E closeout nije izvršen

**Prioritet:** P1 za 10/10

Potrebna je stvarna matrica:

- `44` schedule + novi swap/override/delete/feed/header scenariji;
- `45` lifecycle + banner/modal/deep-link/CSV/reminder/withdraw scenariji;
- initial/background error i retry sa request ID-em;
- stale A→B group/week race;
- synchronous double-submit;
- responsive 320/375/768/1280, 200% zoom, keyboard/focus i axe;
- trace/screenshot artefakti i revision SHA bez skipova koji se računaju kao prolaz.

---

## 5. Ocjena po oblasti

| Oblast                                      |   Trenutno |      Cilj |
| ------------------------------------------- | ---------: | --------: |
| Backend autorizacija i domenske granice     |        9,2 |        10 |
| Async identity, stale state i recovery      |        9,3 |        10 |
| Mutation concurrency i cache konzistentnost |        8,4 |        10 |
| Vremenska zona i reporting tačnost          |        9,6 |        10 |
| URL/shareability i navigacija               |        9,5 |        10 |
| Accessibility i responsive struktura        |        7,5 |        10 |
| Testabilnost i održivost                    |        7,2 |        10 |
| Browser/E2E dokaz                           |        4,5 |        10 |
| **Ukupno**                                  | **9,3/10** | **10/10** |

Ocjena nije aritmetički prosjek. P1 correctness i recovery rizici imaju veću težinu od vizuelne zrelosti.

---

## 6. Fazni implementacijski plan do 10/10

### Faza 1 — On-call query identitet i recovery

**Nalazi:** `OCN1`, `OCN2`, dio `OCN8`, dio `OCN11`

1. Izdvojiti typed on-call page controller.
2. Razdvojiti overview/me/swaps state i recovery.
3. Uvesti latest-only identitet i request ID.
4. Vezati detail snapshot za group/window identity.
5. Dodati lokalni retry i stale/background prikaz.
6. Deferred testovi za refresh race, partial failure, group A→B i week A→B.

**Exit gate:** nijedan odgovor ne može commitovati u pogrešan scope; kvar jednog izvora ne briše druga dva.

#### Evidencija zatvaranja Faze 1 (20. 10. 2026.)

- Izdvojen je `useOnCallOverviewData` controller sa odvojenim overview/me/swaps snapshotima, errorima i pending identitetima. Svaki izvor ima vlastiti latest-request guard, API request ID i lokalni retry; zajednički refresh više nije all-or-nothing `Promise.all`.
- Uspješan snapshot ostaje dostupan pri background grešci, a kvar me ili swaps izvora više ne blokira overview i izbor grupe. Globalni refresh pokreće tri nezavisna zahtjeva i završava tek kada svi aktivni izvori završe.
- Izdvojen je `useOnCallGroupDetail` controller. Snapshot je vezan za `groupId/from/to`; promjena grupe ili sedmice odmah uklanja stari detail i action površine, cleanup odbacuje zakašnjeli odgovor, a greška prikazuje request ID i lokalni retry.
- Direktni deferred hook testovi dokazuju parcijalni failure/recovery, latest-only overlapping overview refresh, group/week scope blokadu, zakašnjeli odgovor i correlated detail retry.
- `OCN1` i `OCN2` su zatvoreni. Announcement async nalazi i mutation concurrency ostaju mapirani na naredne faze.

**Izvršni dokaz:** ciljni modul prolazi 5/5 fajlova i 24/24 testa; puni frontend Vitest prolazi **382/382 fajla i 1513/1513 testova**. Production TypeScript/Vite build, puni ESLint sa 0 grešaka i 0 warninga, i18n/design-system gate i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E dokaz nije izvršen.

### Faza 2 — Mutation concurrency i precizni refresh

**Nalazi:** `OCN3`, mutation dio `OCN8`, dio `OCN11`

1. Uvesti sinhroni operation guard.
2. Definisati pending key po swap/delete/feed/save/settle/publish/withdraw/reminder akciji.
3. Definisati mutation→query/cache matricu.
4. Čuvati request ID i omogućiti retry.
5. Deferred synchronous-double-click testovi.

**Exit gate:** svaka korisnička akcija šalje najviše jedan zahtjev i osvježava samo pogođeni snapshot.

#### Evidencija zatvaranja Faze 2 (20. 10. 2026.)

- Uveden je stabilni `useOperationGuard` adapter nad kanonskim sinhronim operation guardom. Rezervacija nastaje prije prvog `await` i ostaje ista kroz rerender, pa synchronous double-click ne zavisi od kašnjenja React state updatea.
- On-call swap accept/decline/cancel koristi per-swap key; schedule i override delete koriste zasebne entity ključeve. Range i schedule save, kao i feed rotate/revoke, zaštićeni su prije mrežnog zahtjeva.
- Announcement banner/modal acknowledge/dismiss, editor create/update, publish/withdraw/delete i report reminder koriste entity/action ključeve. Paralelne različite akcije ostaju dozvoljene, dok se identična aktivna operacija odbacuje.
- Mutation toastovi nastavljaju prosljeđivati originalni API error, pa zajednički toast prikazuje i kopira request ID gdje ga backend vraća. Query/error standardizacija izvan mutation toka ostaje mapirana na `OCN8` i Fazu 3.
- Precizni refresh ugovor ostaje domenski: swap odluke osvježavaju overview/me/swaps/detail; schedule/override promjene osvježavaju on-call scope; announcement mutacije osvježavaju manage, active i archive površine.
- Direktni hook test dokazuje sinhrono blokiranje duplikata, stabilnost kroz rerender i otključavanje po završetku. `OCN3` i mutation concurrency dio `OCN8` su zatvoreni.

**Izvršni dokaz:** ciljni suite prolazi 8/8 fajlova i 32/32 testa; puni frontend Vitest prolazi **383/383 fajla i 1514/1514 testova**. Production TypeScript/Vite build, puni ESLint sa 0 grešaka i 0 warninga, i18n/design-system gate, Prettier i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E dokaz nije izvršen.

### Faza 3 — Announcement capabilities, host i manage recovery

**Nalazi:** `OCN4`, `OCN5`, `OCN6`, dio `OCN8`

1. Capabilities blocking error + retry.
2. List/options typed controller ili React Query migracija.
3. Latest-only zaštita i parcijalni recovery.
4. Host initial/background error politika i visibility refresh.
5. Precizna active/archive/manage invalidacija nakon mutacija.

**Exit gate:** outage se nikad ne predstavlja kao nedostatak dozvole ili „nema obavještenja“.

#### Evidencija zatvaranja Faze 3 (20. 10. 2026.)

- Announcement capabilities query sada razlikuje loading, autoritativni rezultat i blocking failure. Greška prikazuje mapirani ključ, API request ID i pending-safe retry; administrator više ne gubi Manage tab kao lažni permission rezultat.
- Izdvojen je `useManagedAnnouncementsData` controller sa nezavisnim list/options snapshotima, latest-request guardovima, request correlationom i lokalnim retryjem. Kvar options kataloga ne briše uspješnu Manage tabelu; create/edit akcije ostaju blokirane samo dok options nisu dostupne.
- Preklopljeni mount/retry/post-mutation zahtjevi više ne mogu vratiti stariju listu. Manage refresh, active invalidacija i archive invalidacija sada su nezavisni, pa uspješna mutation akcija osvježava povezane cacheve i kada naredni manage load padne.
- `AnnouncementsHost` prikazuje initial active-query failure umjesto praznog stanja. Background failure zadržava posljednji uspješan banner/modal snapshot i prikazuje korelirano upozorenje sa retryjem; focus lifecycle ostaje React Query recovery signal bez dodatnog polling spama.
- Deferred controller testovi dokazuju list/options parcijalni failure, options-only recovery i latest-only preklopljeni list refresh. `OCN4`, `OCN5`, `OCN6` i announcement query/recovery dio `OCN8` su zatvoreni.

**Izvršni dokaz:** ciljni suite prolazi 3/3 fajla i 9/9 testova; puni frontend Vitest prolazi **384/384 fajla i 1516/1516 testova**. Production TypeScript/Vite build, puni ESLint sa 0 grešaka i 0 warninga, i18n/design-system gate, Prettier i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E dokaz nije izvršen.

### Faza 4 — URL state i navigacijski ugovor

**Nalazi:** `OCN7`

1. Announcement `tab` i `open` URL model.
2. On-call `groupId` i `week` URL model.
3. Validacija nakon učitanih capability/group opcija.
4. Očuvanje scopea kroz refresh/share/Back/Forward.
5. Parser, page i history testovi.

**Exit gate:** URL reproducira isti prikaz i aktivni scope.

#### Evidencija zatvaranja Faze 4 (20. 10. 2026.)

- Announcement `mine/manage` tab sada se čita iz validiranog `tab` parametra. Promjena taba čuva postojeći `open` deep link i nepovezane parametre; korisnik bez Manage capabilityja dobija kanonski `mine` URL tek nakon autoritativnog capability odgovora.
- On-call `group` i četverosedmični `week` offset sada su URL source of truth. Direktni link, refresh i browser history određuju izabranu grupu i period bez mount-local kopije stanja.
- Nevalidan ili nedostupan group ID kanonizuje se tek nakon učitanog overview kataloga na prvi raspored ili prvu grupu. Week prihvata samo granice `-52…52` u koraku četiri; nevalidna vrijednost se vraća na trenutnu sedmicu, a navigacija na granicama je blokirana.
- Promjena grupe resetuje sedmicu i čuva nepovezane parametre. URL promjena automatski mijenja detail `group/from/to` identity, pa postojeći latest-only controller blokira prethodni scope.
- Pure parser/update testovi dokazuju deep link, invalidne vrijednosti, canonical default i očuvanje `open`/nepovezanih parametara. `OCN7` je zatvoren determinističkim URL ugovorom; stvarni browser Back/Forward dokaz ostaje mapiran na Fazu 8.

**Izvršni dokaz:** ciljni suite prolazi 5/5 fajlova i 10/10 testova; puni frontend Vitest prolazi **386/386 fajlova i 1520/1520 testova**. Production TypeScript/Vite build, puni ESLint sa 0 grešaka i 0 warninga, i18n/design-system gate, Prettier i `git diff --check` prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E dokaz nije izvršen.

### Faza 5 — Civil-time i formular ugovor

**Nalazi:** `OCN9`

1. Dokumentovati announcement timezone odluku.
2. Centralizovati formatter i civil-time input konverziju.
3. Prikazati zonu uz period.
4. Dodati client-side IANA validaciju schedule forme.
5. DST/cross-zone contract testovi.

**Exit gate:** isti civilni input proizvodi isti trenutak na klijentu i serveru.

**Status nakon Faze 5: završeno.**

- Announcement civil-time odluka je eksplicitna: autor unosi zidno vrijeme u IANA zoni svog preglednika, klijent ga prije API poziva pretvara u ISO instant, a svaki primalac isti instant vidi u svojoj browser zoni. Editor uz unos navodi zonu i ovu semantiku.
- Centralni announcement formatter prima eksplicitnu zonu i uvijek prikazuje kratku oznaku zone, pa archive, manage, banner/modal i report više ne predstavljaju neoznačen sat.
- Schedule dijalog prije slanja validira trimovanu IANA zonu kroz `Intl.DateTimeFormat`; prazna ili nepoznata zona blokira API poziv i prikazuje povezanu field grešku.
- Contract testovi dokazuju DST prelaz Europe/Sarajevo, 23-satni dan, cross-zone formatter ugovor i odbijanje nevalidne zone. `OCN9` je zatvoren.

**Izvršni dokaz:** ciljni timezone suite prolazi **2/2 fajla i 23/23 testa**; puni frontend Vitest prolazi **386/386 fajlova i 1521/1521 test**. Production TypeScript/Vite build, puni ESLint, i18n/design-system gate i Prettier prolaze. Build zadržava postojeće non-fatal chunk-size upozorenje. Browser/E2E nije izvršen.

### Faza 6 — Puna deterministička testna mreža

**Nalazi:** `OCN11`

1. Page/controller testovi za on-call.
2. Manage/Host/Editor/Report component testovi.
3. Feed/header lifecycle testovi.
4. Race/recovery/mutation matrica.
5. Statički responsive i accessibility contract testovi gdje su deterministički.

**Exit gate:** kritične state mašine imaju direktan dokaz, ne samo pure helper ili E2E pokrivenost.

### Faza 7 — Održivost i statički closeout

**Nalazi:** `OCN12`, završna regresija `OCN1–OCN12`

1. Characterization testovi prije refaktora.
2. Typed controller hookovi i prezentacijske sekcije.
3. Centralni severity/time helperi.
4. Ukloniti delivery-history komentare.
5. Pokrenuti puni frontend/backend relevantni suite, build, ESLint 0/0, i18n/design-system, Prettier i `git diff --check`.

**Exit gate:** deterministički i statički gateovi zeleni; bez browser dokaza ocjena najviše 9,8/10.

### Faza 8 — Browser/E2E closeout

**Nalazi:** `OCN10`, `OCN13`

1. Proširiti `44` i `45` scenarije.
2. Izvršiti route/recovery/race/double-submit tokove.
3. Provjeriti responsive, zoom, keyboard/focus i axe.
4. Evidentirati komandu, rezultat bez skipova, trace/screenshot i revision SHA.

**Exit gate:** `OCN1–OCN13` zatvoreni i stvarni browser run zelen.

---

## 7. Obavezna završna matrica

### Unit/hook

- overview/me/swaps partial failure i latest-only;
- group/week detail identity;
- request correlation i retry pending;
- synchronous operation guard;
- URL parser i Back/Forward;
- civil-time/DST/cross-zone;
- modal session limit i host selection.

### Component/page

- capabilities failure/retry;
- manage list/options recovery;
- host initial/background error;
- editor save i validation;
- report load/CSV/reminder;
- feed token lifecycle;
- header visibility lifecycle;
- swap/override/delete recovery.

### Backend

- on-call route guards i participant/manage invarijante;
- overview/me/swaps timezone ugovor;
- announcement viewer/manage/report scope;
- acknowledgement/reminder rate limit;
- notification fan-out i realtime payload;
- iCal token/no-store ugovor.

### Browser

- schedule, swap, override, delete i feed;
- banner acknowledge/dismiss i modal limit;
- archive deep link;
- manage create/edit/publish/withdraw/delete;
- report CSV/reminder;
- URL history;
- 320/375/768/1280 px, 200% zoom;
- keyboard/focus return i axe.

---

## 8. Zaključak

On-call i obavještenja više nisu modul ocjene 6/10 iz arhivskog audita. Najvažnije ranije greške oko pogrešne grupe, vremenske zone i reason dijaloga su popravljene. Međutim, aktuelni kod još nema produkcijski dokaz za query identitet, parcijalni recovery, synchronous mutation concurrency, capability/host outage ponašanje i punu testnu mrežu.

Preporučeni redoslijed je **Faza 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. Svaka faza treba imati zasebnu audit evidenciju, validaciju, commit i push. Browser/E2E dokaz mora ostati jasno označen kao neizvršen dok stvarni stack ne bude dostupan.
