# Reaudit modula 08: Izvještaji i SLA

**Datum reaudit-a:** 20. 10. 2026.
**Status:** otvoren implementacijski plan
**Aktuelna ocjena:** **8,3/10 nakon Faze 1**
**Cilj:** **10/10** uz izvršen browser/E2E closeout; bez browser dokaza maksimalno **9,8/10**

---

## 1. Scope i metoda

Reaudit je urađen nad aktuelnim kodom, a ne nad arhiviranim stanjem vala 6.1.8.

### Frontend

- `frontend/src/pages/reports-page.tsx`
- `frontend/src/pages/sla-page.tsx`
- `frontend/src/components/reports/**`
- `frontend/src/components/sla/**`
- `frontend/src/lib/reports/**`
- `frontend/src/lib/sla/**`
- `frontend/src/services/reports-api.ts`
- `frontend/src/services/report-*.ts`
- `frontend/src/services/sla-api.ts`
- `frontend/src/services/sla-types.ts`
- povezani CSAT, organizational-unit, session/access i download helperi

### Backend i sigurnosne reference

- `backend/src/modules/reports/**`
- `backend/src/modules/sla/**`
- `backend/src/modules/tickets/csat/**`
- route/access guardovi i reports/SLA konfiguracija

### Testovi i browser izvori

- postojeći frontend unit/hook/component testovi za reports i SLA;
- E2E izvori `07`, `12`, `17`, `18`, `19`, `29`, `42` i `50`;
- ukupno **8 E2E fajlova i 12 deklarisanih scenarija**;
- E2E izvori su pročitani, ali u ovom reaudit-u nisu izvršeni. Lokalni stack je u neposredno prethodnom closeoutu bio nedostupan na `localhost:10001/5173`, što se ne računa kao browser dokaz za ovaj modul.

Metoda: statičko čitanje page/component/hook/API tokova, provjera cache/race/error ugovora, URL i vremenske semantike, permission granice, direktne testne mreže, održivosti, accessibility/responsive ponašanja i browser pokrivenosti.

---

## 2. Sažetak aktuelnog stanja

Modul je znatno bolji od arhivske ocjene 6/10:

- Reports OU katalog razlikuje grešku od praznog stanja i prikazuje request ID/retry.
- Overview i bottlenecks imaju latest-request zaštitu.
- Trends imaju validirano URL stanje, cancelled zaštitu, izvoz i print ugovor.
- CSAT je eksplicitno označen kao all-time i ima breakdown po OU/servisu/grupi.
- SLA base, detail i compliance loadovi su odvojeni i imaju latest-request guardove.
- Compliance se učitava samo na aktivnom podtabu.
- Eskalacije imaju race zaštitu, vidljivu load grešku i validaciju razloga brisanja.
- Hook testovi za izbor novog profila i ciljani reload sada postoje.
- Frontend i backend permission granice su u osnovi usklađene.

Ipak, modul još nije na 10/10. Najveći preostali rizici su:

1. izbor SLA profila može privremeno prikazati pravila prethodnog profila, a `isDetailLoading` se ne renderuje;
2. SLA greške nemaju request correlation ni deterministički retry ugovor;
3. reports filter supporting-data greške se pretvaraju u prazne opcije;
4. URL nije potpuni source of truth izvan Trends taba;
5. mutation double-submit i precizna invalidacija nisu dokazani;
6. custom period i vremenska zona i dalje imaju tihu, nedosljednu semantiku;
7. najveće Reports komponente i dalje su koncentrisane i gotovo bez direktnih component testova;
8. browser/responsive/keyboard closeout nije izvršen.

---

## 3. Pozitivni nalazi koje treba sačuvati

- **Access granica:** route access, frontend capability provjera i backend role/permission guardovi koriste isti domenski smjer (`reportsExport`/`auditExport`, `reportsScheduleManage`, `slaWrite`).
- **Trends URL parser:** allow-list provjera, validacija datuma, `from <= to` i ograničenje slobodnog teksta su izdvojeni i direktno testirani.
- **Async race osnova:** `createLatestRequestGuard` je prisutan u Reports overview/bottlenecks i SLA base/detail/compliance tokovima.
- **Non-destructive namjera:** Reports overview čuva prethodni dashboard tokom refetcha; bottlenecks eksplicitno resetuje snapshot kada se scope promijeni, pa ne prikazuje stari scope kao novi.
- **CSAT semantika:** all-time obim je sada vidljivo označen umjesto da izgleda kao da slijedi globalni period.
- **Print cleanup:** light-theme print lifecycle vraća prethodnu temu i čisti event listenere.
- **Schedule recipient search:** debounce, cancellation i vidljiva greška su implementirani.
- **SLA dekompozicija:** profile list/detail, kalendari, matrica, compliance i escalation cjeline već imaju razumne prezentacijske granice.
- **Backend agregacije:** reports pack/trends/summary i SLA agregacije imaju široku pure/backend testnu bazu.

---

## 4. Novi nalazi

### RSL1 — SLA detail može prikazati podatke prethodnog profila

**Prioritet:** P1
**Lokacije:** `lib/sla/use-sla-page-data.ts`, `pages/sla-page.tsx`, `components/sla/sla-profile-detail.tsx`

Pri promjeni `selectedId`, `reloadSelected` postavlja `isDetailLoading`, ali ne resetuje niti verzionira `rules` i `changes`. `SlaPage` uopće ne prosljeđuje `isDetailLoading` u detail prikaz. Novi profil zato može biti prikazan zajedno sa pravilima i change-logom prethodnog profila dok zahtjev traje. Ako novi detail zahtjev padne, stari podaci ostaju uz globalnu grešku i mogu izgledati kao podaci odabranog profila.

Latest-request guard sprečava out-of-order commit, ali ne rješava pogrešan snapshot identitet.

**Za zatvaranje:** vezati detail snapshot za `profileId`, renderovati loading/stale/error stanje po identitetu i onemogućiti edit/delete akcije dok prikazani snapshot ne pripada aktivnom profilu. Direktno testirati brzu promjenu A→B, grešku B i out-of-order A response.

### RSL2 — SLA error ugovor nema request ID ni lokalni retry

**Prioritet:** P1
**Lokacije:** `use-sla-page-data.ts`, `use-sla-page-mutations.ts`, `sla-page.tsx`, `sla-escalation-rules-panel.tsx`, calendars/matrix/profile forme

SLA hookovi čuvaju samo prevedivi `SlaErrorKey`. API request ID se gubi. Base, detail, compliance i escalation greške nemaju zajednički recoverable prikaz sa korelacijom i retryjem. `SlaPage` prikazuje jedan globalni alert, pa detail greška može izgledati kao greška cijele stranice, dok compliance greška nema retry.

**Za zatvaranje:** uvesti typed SLA query/mutation error (`key`, `requestId`, `scope`), lokalne retry akcije za base/detail/compliance/escalations i pending zaštitu. Stale uspješan snapshot ostaje vidljiv samo uz jasno background upozorenje.

### RSL3 — Reports supporting filter greške glume prazne kataloge

**Prioritet:** P1
**Lokacija:** `pages/reports-page.tsx:112–137`

`listServices()` greška postavlja `[]`, a `listGroups()` greška postavlja `null`. Korisnik ne razlikuje “nema opcija”, “nema dozvolu” i mrežnu/server grešku. Nema request ID-a ni retryja. Trends/schedule filter tada tiho gubi mogućnost izbora i može generisati drugačiji izvještaj od očekivanog.

**Za zatvaranje:** supporting-data state mora razlikovati loading, forbidden/unavailable, empty, error i ready; server greška prikazuje request ID/retry, a controls objašnjavaju zašto su disabled ili skriveni.

### RSL4 — URL nije source of truth za Reports i SLA prikaze

**Prioritet:** P1
**Lokacije:** `reports-page.tsx`, `sla-page.tsx`

Trends ima dobar URL model, ali ostali Reports tabovi gube OU i period pri `changeTab`: `setSearchParams({ tab: key })` briše scope. `initialUnitId` je `useRef`, pa Back/Forward promjena `organizationalUnitId` dok je stranica mountovana ne ažurira lokalni state. Overview custom period/preset nije dijeljiv. SLA view (`profiles/calendars/matrix`), podtab, OU i aktivni profil žive samo u lokalnom stateu.

**Za zatvaranje:** definisati jedan validirani URL model za Reports i SLA; sačuvati relevantne parametre pri promjeni taba, pratiti Back/Forward bez petlje i direktno testirati deep link, invalidne parametre, reset i history navigaciju.

### RSL5 — Mutation concurrency i cache ugovor nisu kanonski

**Prioritet:** P1
**Lokacije:** `use-sla-page-mutations.ts`, escalation/calendar/matrix forme, report schedule forme/paneli

Mutation tokovi koriste `useState(isSubmitting)` kao jedinu zaštitu. Dva synchronous submit/click događaja mogu proći prije React rerendera. Nema per-action operation guarda niti direktnog testa da create/update/delete/run-now ne šalju dupli zahtjev. Nakon SLA mutacija često se radi imperativni full base/detail reload umjesto eksplicitne mutation→query matrice.

**Za zatvaranje:** sinhroni guard prije prvog await-a, per-action pending, request-correlation feedback i precizna refresh matrica. Direktno testirati profile/rule/calendar/escalation/schedule create-update-delete i manual run, uključujući error→retry.

### RSL6 — Custom period tiho mijenja korisnički unos

**Prioritet:** P1
**Lokacije:** `lib/reports/report-window.ts`, `reports-page.tsx`, `reports-date-filter.tsx`

Prazan ili nevalidan custom period pada na rolling 30d bez poruke, iako inputi ostaju prazni. Obrnut raspon se automatski zamijeni. UI zato može prikazati jedan unos, a poslati drugi period. To je posebno rizično za izvoz i audit evidenciju izvještaja.

**Za zatvaranje:** custom period mora imati eksplicitno valid/invalid stanje; ne slati zahtjev niti omogućiti izvoz dok su datumi nepotpuni/nevalidni; obrnut raspon prikazati kao validacijsku grešku umjesto tihog swap-a.

### RSL7 — Vremenska zona nije jedan dokazani ugovor

**Prioritet:** P1 za reporting tačnost
**Lokacije:** `report-window.ts`, `report-schedule-form.ts`, trends/print/schedule komponente i backend report calendar helperi

Overview period i schedule preview koriste browser-local civil time, schedule konfiguracija ima `settings.timeZone`, a Trends response vraća vlastitu zonu. Print naslov može kombinovati lokalno formatiran period i server zonu. DST i korisnik iz druge zone mogu dobiti drugačiji preview od stvarnog slanja/agregacije.

**Za zatvaranje:** usvojiti eksplicitnu organizacijsku/reporting zonu kao ugovor, prikazati je uz period, koristiti istu civil-calendar funkciju na preview/server strani i dodati DST/boundary contract testove.

### RSL8 — Reports recovery nije dosljedan kroz sve podtokove

**Prioritet:** P2
**Lokacije:** `report-packs-panel.tsx`, schedule runs sheet, schedules list/preview/run tokovi

Pack list greška prikazuje request ID, ali nema retry. Preview greška nema lokalni retry. Schedule run history postavlja `requestId={null}` i nema retry. Pojedini toastovi imaju `error`, ali inline podtokovi nemaju isti recovery ugovor.

**Za zatvaranje:** shared recoverable query prikaz za list/preview/history sa request ID-em, retryjem i disabled/pending ugovorom; uspješan snapshot ne brisati pri background refresh grešci.

### RSL9 — Dynamic report redovi koriste index key

**Prioritet:** P2
**Lokacija:** `components/reports/report-packs-panel.tsx:280`

Sortabilni preview redovi koriste `key={index}`. Promjena sorta može prenijeti DOM identitet na drugi red. Trenutno nema inputa u ćeliji, ali screen-reader/selection/focus identitet i buduće interaktivne ćelije ostaju nestabilni.

**Za zatvaranje:** backend descriptor treba dati stabilni row key ili frontend treba izgraditi determinističan ključ iz deklarisanih domain kolona; dodati test sort/reorder identiteta.

### RSL10 — Koncentracija odgovornosti u Reports komponentama je previsoka

**Prioritet:** P2
**Lokacije:** `report-trends-panel.tsx` (~922), `report-schedules-panel.tsx` (~569), `report-schedule-sheet.tsx` (~530), `reports-page.tsx` (~413)

Komponente kombinuju URL state, API orchestration, validation, export/print, forme, preview i velike prezentacijske cjeline. Pure helperi postoje, ali page/controller i component granice nisu direktno testirane. Promjena jednog recovery ili URL pravila zahtijeva izmjene kroz veliki render scope.

**Za zatvaranje:** izdvojiti typed controller hookove i prezentacijske sekcije po odgovornosti; prvo characterization testovi, zatim mehaničko izdvajanje bez behavior rewritea.

### RSL11 — Direktna testna mreža ne pokriva kritične state mašine

**Prioritet:** P1
**Dokaz:** aktuelni test katalog

Postoje korisni pure testovi i po jedan minimalni test za `useSlaPageData`, `useSlaPageMutations` i packs. Nedostaju direktni testovi za:

- ReportsPage OU/period/tab/Back-Forward state;
- overview initial/background error i stale snapshot;
- service/group supporting-data recovery;
- bottlenecks/CSAT race i retry pending;
- pack list/preview/download recovery i sort identitet;
- schedule list/form/recipient/history/manual-run race i double-submit;
- SLA base/detail/compliance identitet, request correlation i retry;
- profile/rule/calendar/matrix/escalation mutation concurrency;
- timezone/DST parity.

Postojeći hook test ima samo jedan scenario; mutation test provjerava redoslijed select→load, ali ne race, error ni dupli submit.

**Za zatvaranje:** deferred-promise hook/component testovi za sve navedene matrice; snapshot-only testovi nisu dovoljni.

### RSL12 — Historijski komentari ostaju production noise

**Prioritet:** P3
**Lokacije:** Reports/SLA pages, components, libs i service tipovi

Komentari `Paket`, `Package`, `Val`, `Phase` i numerisani `§` opisuju historiju isporuke. Neki korisni opisi su pomiješani s tim oznakama.

**Za zatvaranje:** ukloniti delivery-history prefikse, zadržati samo trajni invariant i dodati scope comment-hygiene test.

### RSL13 — Browser, responsive i accessibility closeout nije izvršen

**Prioritet:** P1 za 10/10
**Dokaz:** 8 E2E izvora / 12 scenarija pročitano, bez aktuelnog runa

Nisu izvršno dokazani:

- Reports/SLA deep link i Back/Forward;
- initial/background error + retry sa request ID-em;
- stale snapshot pri scope promjeni;
- profile A→B race i mutation double-submit;
- schedule timezone/DST preview;
- print lifecycle u stvarnom browseru;
- 320/375/768/1280 px overflow za charts, široke tabele, calendars i forms;
- keyboard/focus return za sheet/drawer/confirm;
- 200% zoom i axe za sve glavne tabove.

**Za zatvaranje:** dopuniti i izvršiti browser matricu na stvarnom stacku, bez skipova koji se računaju kao prolaz. Bez browser dokaza maksimalna ocjena ostaje **9,8/10**.

---

## 5. Ocjena po oblasti

| Oblast                                     |   Trenutno |      Cilj |
| ------------------------------------------ | ---------: | --------: |
| Route access i backend sigurnosna granica  |        9,5 |        10 |
| Async state, race i recovery               |        8,8 |        10 |
| Reporting tačnost, period i vremenska zona |        7,2 |        10 |
| Mutation i cache konzistentnost            |        7,4 |        10 |
| URL/shareability i navigacija              |        7,0 |        10 |
| Testabilnost i održivost                   |        7,8 |        10 |
| Accessibility/responsive/browser dokaz     |        6,5 |        10 |
| **Ukupno**                                 | **8,3/10** | **10/10** |

Ocjena priznaje široku funkcionalnost, dobru backend zaštitu, poboljšane race guardove i kvalitetan pure sloj. Odbici ostaju zbog identiteta SLA detail snapshotova, nedosljednog recovery/request-correlation ugovora, tihih filter/period fallbacka, mutation concurrency rizika, nepotpunog URL modela, slabe direktne component mreže i neizvršenog browser closeouta.

---

## 6. Fazni implementacijski plan do 10/10

### Faza 1 — SLA detail identitet i recoverable query matrica

**Nalazi:** `RSL1`, SLA dio `RSL2`, dio `RSL11`
**Cilj:** aktivni profil nikada ne prikazuje detail snapshot drugog profila.

1. Uvesti detail state vezan za `profileId`.
2. Razdvojiti base/detail/compliance/escalation error objekte (`key`, `requestId`, `scope`).
3. Renderovati initial, stale/background i blocking state bez destruktivnog brisanja uspješnog snapshot-a.
4. Dodati lokalni retry i pending zaštitu.
5. Deferred testovi za A→B, out-of-order, B error, retry i compliance scope promjenu.

**Exit gate:** detail akcije nisu dostupne dok snapshot ne pripada aktivnom profilu; svaka server greška prikazuje request ID gdje postoji.

#### Evidencija zatvaranja Faze 1 (20. 10. 2026.)

- SLA detail snapshot sada nosi eksplicitni `detailProfileId`; `detailReady` je tačan samo kada rules/change-log snapshot pripada trenutno izabranom profilu.
- Promjena profila više ne može renderovati edit/delete površine nad pravilima prethodnog profila: tokom identity promjene prikazuje se loading stanje, a ne stale detail kao novi profil.
- Base, detail i compliance query greške razdvojene su u typed state sa mapiranim ključem i API request ID-em.
- Base, detail i compliance prikazi imaju lokalni retry sa disabled/pending zaštitom; detail koji je pao ostaje blokiran dok retry ne vrati snapshot aktivnog profila.
- Escalation load ima zaseban query error, request correlation, retry i loading stanje; promjena profila odmah uklanja redove prethodnog profila.
- Deferred testovi dokazuju A→B identity blokadu, latest-only out-of-order commit, B error + request ID + retry, base error + retry i compliance error + retry. Component test dokazuje escalation request ID i retry aktivnog profila.
- `RSL1` je zatvoren. Query/recovery dio `RSL2` je zatvoren; mutation request-correlation dio ostaje mapiran na Fazu 4.

**Izvršni dokaz:** ciljni suite ima 3 fajla sa 7/7 testova; puni frontend Vitest prolaz ima 369/369 fajlova odnosno 1479/1479 testova. Production TypeScript/Vite build, puni ESLint sa 0 warninga, i18n/design-system gate, Prettier i `git diff --check` su prošli.

### Faza 2 — Reports supporting-data i recovery konzistentnost

**Nalazi:** `RSL3`, `RSL8`, Reports dio `RSL11`
**Cilj:** nijedna server greška ne izgleda kao prazan filter/list/preview/history.

1. Standardizovati service/group supporting-data state.
2. Dodati request ID/retry za pack list/preview i schedule history.
3. Zadržati uspješne podatke pri background grešci uz jasno upozorenje.
4. Retry dugmad onemogućiti tokom aktivnog zahtjeva.
5. Direktno testirati initial/background/retry matrice.

**Exit gate:** recovery ne zahtijeva reload stranice i ne mijenja tiho scope izvještaja.

### Faza 3 — URL state i validacija perioda

**Nalazi:** `RSL4`, `RSL6`
**Cilj:** URL je source of truth, a prikazani period jednak je poslanom periodu.

1. Uvesti validirani Reports URL model za tab, OU, preset/custom datume i trends filtere.
2. Uvesti SLA URL model za view, podtab, OU i profil.
3. Sačuvati parametre pri tab navigaciji i pratiti Back/Forward.
4. Custom period učiniti eksplicitno validnim/nevalidnim; ukloniti silent 30d fallback i swap.
5. Testirati deep link, invalid parametre, reset, history i disabled fetch/export.

**Exit gate:** refresh/share/Back/Forward reproduciraju isti prikaz i isti API scope.

### Faza 4 — Mutation concurrency i precizni refresh

**Nalazi:** `RSL5`, mutation dio `RSL11`
**Cilj:** nema duplih mutation zahtjeva ni nepotrebnog full reloada.

1. Uvesti sinhrone operation guardove i per-action pending.
2. Definisati mutation→query/state refresh matricu.
3. Standardizovati request-ID feedback i error→retry.
4. Primijeniti na profile, rules, calendars, matrix, escalations i schedules.
5. Deferred testovi create/update/delete/manual-run i synchronous double click.

**Exit gate:** svaki mutation šalje najviše jedan zahtjev i osvježava samo pogođeni snapshot.

### Faza 5 — Reporting timezone contract

**Nalazi:** `RSL7`
**Cilj:** preview, API agregacija, schedule i print koriste isti civil-time ugovor.

1. Donijeti i dokumentovati produkt odluku o reporting zoni.
2. Centralizovati civil-date/window računanje.
3. Prikazati zonu uz period i schedule preview.
4. Uskladiti frontend preview s backend schedulerom.
5. Dodati DST spring/fall, midnight i korisnik-u-drugoj-zoni contract testove.

**Exit gate:** isti input proizvodi isti period/sljedeće slanje na klijentu i serveru.

### Faza 6 — Održivost i stabilni identiteti

**Nalazi:** `RSL9`, `RSL10`, `RSL12`
**Cilj:** velike cjeline imaju testabilne typed granice bez historijskog noisea.

1. Characterization testovi prije refaktora.
2. Izdvojiti Reports page/trends/schedules controller hookove i prezentacijske sekcije.
3. Uvesti stabilni report row ID ugovor.
4. Ukloniti delivery-history komentare uz čuvanje invarijanti.
5. Dodati scope comment-hygiene test.

**Exit gate:** nema index ključeva na dinamičkim redovima, najveće state mašine su izvan render monolita i hygiene gate je zelen.

### Faza 7 — Puna deterministička testna mreža i statički closeout

**Nalazi:** `RSL11`, završna regresija `RSL1–RSL12`
**Cilj:** kritični page/hook/component ugovori direktno dokazani.

1. Dopuniti ReportsPage/SlaPage component testove.
2. Dopuniti hook race/recovery/mutation testove.
3. Dodati responsive strukturalne i accessibility contract testove gdje su deterministički.
4. Pokrenuti puni frontend i relevantni backend suite.
5. Pokrenuti build, ESLint 0/0, i18n/design-system, Prettier i `git diff --check`.

**Exit gate:** svi statički i deterministički gateovi zeleni; bez browser dokaza ocjena najviše 9,8/10.

### Faza 8 — Browser/E2E closeout

**Nalazi:** `RSL13`
**Cilj:** stvarni route, recovery, race, responsive, keyboard i print dokaz.

1. Dopuniti E2E za URL history, error/retry, stale snapshot, A→B race i double-submit.
2. Izvršiti `07`, `12`, `17`, `18`, `19`, `29`, `42`, `50` i nove scenarije.
3. Provjeriti 320/375/768/1280 px, 200% zoom, charts/table overflow.
4. Provjeriti keyboard, focus trap/return, confirm i sheet/drawer ponašanje.
5. Evidentirati komandu, rezultat bez skipova, trace/screenshot artefakte i revision SHA.

**Exit gate:** `RSL1–RSL13` zatvoreni i stvarni browser run zelen.

---

## 7. Preporučeni redoslijed

Preporučeni redoslijed je **Faza 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**.

- Faze 1 i 2 prvo zatvaraju correctness i recovery rizike.
- Faza 3 stabilizuje reproducibilan scope prije mutation i timezone rada.
- Faza 4 zatvara write concurrency prije velikog refaktora.
- Faza 5 zahtijeva eksplicitnu produkt odluku, ali ne treba blokirati prve četiri faze.
- Faza 6 se radi nakon characterization testova, bez behavior rewritea.
- Faza 7 zatvara determinističku regresiju.
- Faza 8 ostaje posljednja integracijska potvrda.

Svaku završenu fazu treba zasebno validirati, auditirati, commitovati i pushati.

---

## 8. Obavezna završna matrica

### Unit/hook

- SLA base/detail/compliance identity i latest-only matrica;
- request correlation i retry pending;
- Reports/SLA URL parser i Back/Forward;
- custom period validacija;
- mutation synchronous guard;
- timezone/DST parity;
- stabilni report row ID.

### Component/page

- Reports overview/supporting-data/list/preview/history recovery;
- trends filter/export/print state;
- schedule recipient/form/history/manual-run;
- SLA profile A→B, create/edit/delete i rule lifecycle;
- calendars, matrix, compliance i escalations;
- empty, forbidden, loading, stale i background-error stanja.

### Browser/E2E

- route i permission matrica;
- deep link/share/Back/Forward;
- initial i background error + retry/request ID;
- profile race i mutation double-submit;
- schedule timezone/DST preview;
- export i print lifecycle;
- 320/375/768/1280 px, 200% zoom;
- keyboard, focus trap/return i axe.

---

## 9. Završni zaključak

Reports i SLA više nisu modul ocjene 6/10 iz arhivskog audita. Async guardovi, SLA load razdvajanje, CSAT označavanje, recovery dijelovi i backend testna baza podigli su kvalitet. Trenutna profesionalna ocjena je **7,9/10**: funkcionalno široko i sigurnosno dobro postavljeno, ali još bez jedinstvenog identity/recovery, URL, mutation i timezone ugovora te bez izvršnog browser dokaza.

Plan iznad vodi do **9,8/10** kroz determinističke faze 1–7. Punih **10/10** je opravdano tek nakon stvarno izvršene Faze 8 bez preskočenih kritičnih scenarija.
