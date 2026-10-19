# Modul 05 — Admin i Settings: aktuelni frontend reaudit

**Datum reaudita:** 19. 10. 2026.
**Status:** otvoren za faznu implementaciju
**Aktuelna ocjena:** **8,5/10 nakon Faze 2**
**Cilj nakon plana:** **10/10 uz izvršen browser/E2E closeout**

**Implementacijski status:** Faze 1 i 2 završene 19. 10. 2026.; `AS1–AS3` su zatvoreni, OU dio `AS6` je zatvoren, a audit-card pagination dio ostaje u Fazi 5. Config-package dio `AS8` sada ima direktnu component pokrivenost.
**Prefiks nalaza:** `AS` (Admin/Settings)

---

## 1. Izvršni sažetak

Admin/Settings površina je funkcionalno široka i već ima dobre sigurnosne osnove: route i tab pristup su centralizovani, write kontrole koriste capabilities, read-only politika ima backend zaštitu i frontend signalizaciju, osjetljive akcije imaju potvrde, API greške često nose request ID, a konfiguracijske verzije i email predlošci imaju ozbiljan skup funkcija.

Historijski status „zatvoren“ ipak više nije vjerodostojan opis trenutnog stanja. Reaudit je pronašao aktivne probleme u asinhronim ugovorima, zadržavanju podataka pri refresh grešci, batch pending semantici settings registryja, config-package preview toku, direktnoj testnoj pokrivenosti i održivosti najveće admin komponente. Nekoliko ranije navodno zatvorenih higijenskih stavki ponovo je prisutno u produkcijskom kodu.

Najvažniji rizici su:

1. `useConfigVersions` prazni postojeću listu i na refresh grešci te nema zaštitu od out-of-order odgovora;
2. config-package preview koristi globalni mutation runner, poslije svakog previewa nepotrebno reloaduje cijeli katalog i nema vlastitu latest-request zaštitu;
3. settings registry interno prati `pendingKeys`, ali javni/page ugovor svodi stanje na jedan `pendingKey`; concurrent save završeci mogu prerano ukloniti pending stanje;
4. više admin async površina nema direktne race/unmount testove;
5. `ops-health-card.tsx` je narastao na **988 linija** i ostaje koncentracija odgovornosti i regresijskog rizika;
6. email editor ima dobru dirty-navigation i preview osnovu, ali nema direktan component/page test za kritične save/test/preview/navigation ugovore.

Ovaj dokument zamjenjuje historijski audit, closeout i arhivu kao operativni izvor istine. Stare oznake S1–S25 nisu dokaz aktuelne zatvorenosti; relevantni problemi su ponovo formulisani kao `AS1–AS12`.

---

## 2. Scope i granice

### 2.1 U scopeu

- `/admin` shell, query-tab navigacija i tab access;
- Settings tab i settings registry;
- admin Ops i Security površine;
- organizacijska jedinica i audit log tokovi;
- ops health, alerti, support bundle, security metrics i integration queue;
- `/admin/config-versions` lifecycle, diff, shadow, validate, activate, rollback, export i package import;
- `/admin/email-templates`, server preview, test slanje, save/reset i dirty-navigation zaštita;
- frontend route guards, capability/read-only helperi i relevantni backend guard ugovori;
- postojeći unit/component testovi i relevantni E2E scenariji.

### 2.2 Van scopea

- `/admin/workflow` — obrađen u zasebnom Workflow modulu;
- `/admin/teams` — obrađen u zasebnom Teams modulu;
- Install wizard;
- opća refaktorizacija svih shared UI komponenti;
- backend poslovna logika osim provjere ugovora koji direktno određuju frontend sigurnost i ponašanje.

Workflow i Teams se ovdje spominju samo kada admin route/tab matrica mora ostati konzistentna.

---

## 3. Metodologija i dokaz

Reaudit nije izveden iz historijskih tvrdnji nego iz aktuelnog koda.

### 3.1 Statička inspekcija

Pregledani su:

- `admin-page.tsx`, `settings-page.tsx`, `config-versions-page.tsx`, `email-templates-page.tsx`;
- admin/settings/config-version komponente i pripadajući helperi;
- `use-settings-registry.ts`, `use-admin-module-read-only.ts`, admin access helperi;
- config versions hookovi, workspace, package import, diff i shadow tokovi;
- email editor i draft helperi;
- protected route katalog;
- relevantni frontend testovi i E2E fajlovi;
- backend controller/guard/read-only reference za settings, config versions i email templates.

Aktuelni admin/settings/config scope ima približno **11.043 linije** u primarnim component/lib direktorijima. Najveći pojedinačni rizik održivosti je `ops-health-card.tsx` sa **988 linija**.

### 3.2 Izvršeni gateovi

| Gate                                   | Rezultat                                                         |
| -------------------------------------- | ---------------------------------------------------------------- |
| Ciljani Vitest: 15 relevantnih fajlova | **PASS — 15/15 fajlova, 63/63 testa**                            |
| `npm run build`                        | **PASS**                                                         |
| `npm run lint`                         | **PASS bez errora; 12 repo warninga**                            |
| Scope formatting / Prettier            | **PASS**                                                         |
| Stvarni authenticated browser/E2E      | **NIJE IZVRŠEN** — lokalni API/frontend/auth stack nije dostupan |

Relevantni lint warning u scopeu je missing dependency (`shadow`) u `config-versions-workspace.tsx`; ostalih 11 warninga pripada drugim modulima. Build i dalje prijavljuje chunkove iznad 500 kB, uključujući veliki admin chunk; to nije samostalni blocker, ali potvrđuje potrebu da se prati admin bundle.

### 3.3 E2E status

Pročitani su relevantni scenariji `09-config-ops.spec.ts`, `11-email-templates.spec.ts`, `35-ops-health.spec.ts`, `41-admin-identity-ux.spec.ts` i `47-rate-limits-configurable.spec.ts`. U ovom reauditu **nisu pokrenuti**. Zato se race, dirty-navigation i responsive zaključci ne predstavljaju kao browser-verifikovani.

---

## 4. Šta je dobro i mora ostati očuvano

1. `AdminPage` centralno izračunava vidljive tabove; duboki link ka nedostupnom tabu se normalizuje na prvi dozvoljeni tab.
2. Protected route katalog zasebno štiti config versions i email templates rute.
3. Settings write odluka je centralizovana kroz `canWriteSettings`, a read-only zaključavanje se dodaje na permission odluku.
4. Read-only nije samo kozmetički frontend mehanizam; backend klasifikacija blokira obuhvaćene mutacije.
5. Audit i security liste koriste cursor paginaciju, loading/empty/error stanja i request ID gdje je dostupan.
6. Security audit ima sequence zaštitu za listu i user pretragu.
7. Email editor već ima debounce, cancellation guard za preview, unknown-placeholder validaciju, reason potvrdu i `useBlocker`/`beforeunload` zaštitu.
8. Config lifecycle ima eksplicitne potvrde i razdvojene validate/activate/rollback operacije.
9. i18n je dominantno dosljedan; sirovi backend enum/action prikaz ima fallback umjesto rušenja UI-ja.
10. Ciljani statički i unit gateovi prolaze.

Ove osobine su regresijski zahtjevi za svaku implementacijsku fazu.

---

## 5. Aktuelni nalazi

### AS1 — Config versions refresh gubi posljednji uspješni snapshot

**Prioritet:** P1
**Dokaz:** `use-config-versions.ts`

Hook u `catch` grani uvijek poziva `setVersions([])`, bez obzira da li je početno učitavanje ili naknadni refresh. Privremena mrežna/server greška zato uklanja funkcionalnu listu, selekciju i kontekst operatora. Ovo je suprotno robustnom stale-data obrascu i ranijoj closeout tvrdnji da refresh zadržava sadržaj.

**Za zatvaranje:**

- razlikovati initial load od refresh greške;
- na refresh grešci zadržati posljednji uspješni snapshot i prikazati non-destructive error;
- prazniti listu samo kada nema prethodnog uspješnog podatka ili kada pristup eksplicitno nestane;
- dodati hook/component test za „uspjeh → refresh greška → lista ostaje“.

### AS2 — Config versions load nema latest-request/unmount ugovor

**Prioritet:** P1
**Dokaz:** `use-config-versions.ts`

Više `load()` poziva može biti aktivno istovremeno (mount, ručni refresh, završetak akcije). Stariji odgovor može pregaziti noviji; `finally` starijeg poziva može prerano ugasiti loading state. Nema abort/sequence zaštite ni invalidacije pri `enabled=false`/unmount.

**Za zatvaranje:** monotoni request sequence ili AbortController, samo latest request smije pisati data/error/loading; testovi za obrnuti redoslijed resolve/reject i unmount.

### AS3 — Config package preview je spojen na globalni mutation/reload tok

**Prioritet:** P1
**Dokaz:** `config-package-import.tsx`, `config-versions-workspace.tsx`

`preview()` koristi `runAction`, a `runAction` nakon svake operacije poziva `admin.load()`. To znači da izbor fajla/mapiranja za preview:

- aktivira globalni busy state cijelog workspacea;
- nakon svakog previewa reloaduje kompletan version katalog iako ništa nije mutirano;
- dijeli error kanal sa lifecycle mutacijama;
- nema lokalni request sequence, pa programatski ili brzi uzastopni preview odgovori mogu vratiti zastarjeli report;
- može pokrenuti sekundarne selection/shadow efekte usljed nepotrebnog refresha.

**Za zatvaranje:** izdvojiti `runPreview` sa lokalnim busy/error/request-id/latest-only stanjem; `admin.load()` pozivati samo nakon stvarnog importa; invalidirati preview kad se promijene fajl, mapping ili relevantne opcije; testirati out-of-order preview.

### AS4 — Settings registry batch pending ugovor je nepotpun

**Prioritet:** P1
**Dokaz:** `use-settings-registry.ts`, `settings-page.tsx`

Hook interno ima `pendingKeys`, ali javni kompatibilni ugovor i page composition dominantno koriste singularni `pendingKey`. Kod concurrent saveova `finally` briše ključeve trenutne operacije bez brojanja/tokena; ako dvije operacije obuhvate isti ključ, raniji završetak može ga označiti nepending dok druga još traje. UI tako može prerano ponovo omogućiti kontrolu ili prikazati pogrešan status.

**Za zatvaranje:**

- izložiti `pendingKeys` kao kanonski javni ugovor;
- koristiti per-key reference count ili operation tokene;
- migrirati row/dialog consumers sa singularne vrijednosti;
- testirati paralelne disjunktne i preklapajuće saveove te obrnut završetak.

### AS5 — Settings initial-error recovery i observability nisu kompletni

**Prioritet:** P2
**Dokaz:** `settings-page.tsx`, `use-settings-registry.ts`

Settings page za registry grešku prikazuje samo prevedenu poruku. Nema lokalni retry CTA ni request ID, iako druge admin površine koriste oba. Operator pri početnom padu nema direktan oporavak niti korelacijski podatak za podršku.

**Za zatvaranje:** hook treba izložiti mapped error + request ID + eksplicitni `reload`; page treba razlikovati initial error od background refresh greške i ponuditi retry bez gubitka zadnjeg snapshot-a.

### AS6 — Admin organizacijski/audit async tok nije potpuno race-hardened

**Prioritet:** P1
**Dokaz:** `admin-ops-panel.tsx`, `admin-audit-log-card.tsx`

Audit card ima sequence zaštitu, ali OU bootstrap/selection tok u parent panelu nema ekvivalentan latest-only ugovor. Kod ponovnog učitavanja ili promjene capability/session konteksta stariji odgovor može postaviti zastarjele jedinice. Selekcija koristi postojeći ID kada je truthy, bez obavezne provjere da još postoji u novom rezultatu. Paginacija dodatno treba eksplicitno dokazati ponašanje kada se OU promijeni dok je `loadMore` aktivan.

**Za zatvaranje:** latest-only OU load, validacija selekcije prema novom skupu, invalidacija child pagination requesta pri scope promjeni i direktni race testovi parent + audit kartice.

### AS7 — Ops Health je prevelika koncentracija odgovornosti

**Prioritet:** P2
**Dokaz:** `ops-health-card.tsx` — **988 linija**

Jedan fajl upravlja health snapshotom, filterima/prikazom, alert pravilima, mutacijama, modalima, errorima i većom količinom rendering logike. To otežava izolovane testove i povećava vjerovatnoću da promjena jednog podtoka regresira drugi. Historijsko prihvatanje rizika nije zatvaranje problema; komponenta je dodatno narasla.

**Za zatvaranje:** bez behavior rewritea izdvojiti state/controller hookove i prezentacijske cjeline (health summary, alert rules, rule editor, mutation feedback); svaka cjelina dobija direktne testove. Cilj nije proizvoljan line limit nego jasne odgovornosti i testabilnost.

### AS8 — Kritične admin površine nemaju direktnu component pokrivenost

**Prioritet:** P1
**Dokaz:** aktuelni test katalog

Nema očitih direktnih specova za:

- `AdminOpsPanel` OU/access composition;
- `AdminAuditLogCard` initial/refresh/load-more race;
- `AdminSecurityAuditCard` kombinaciju filtera, debouncea i paginacije;
- `OpsHealthCard` glavne state/mutation ugovore;
- config package import preview/import tok;
- `EmailTemplatesEditor` i `EmailTemplatesPage`.

Postoje helper, access i dio security/config-action testova, ali oni ne pokrivaju integraciju stanja u navedenim komponentama.

**Za zatvaranje:** dodati determinističke component/hook testove sa deferred promise helperom; ne zamijeniti ih snapshot testovima.

### AS9 — Email editor treba dokazati i ojačati async/dirty ugovor

**Prioritet:** P1
**Dokaz:** `email-templates-editor.tsx`, `email-templates-page.tsx`

Preview effect ima dobru cancellation zaštitu, a dirty navigation postoji, ali nedostaje izvršni dokaz za kritične slučajeve:

- promjena templatea/localea dok stari preview traje;
- unknown placeholder mora spriječiti preview/save/test gdje je primjenjivo;
- save koji vrati novi overview ne smije izgubiti ili pogrešno označiti draft;
- read-only mora onemogućiti sve write akcije, ali zadržati pregled;
- route blocker: stay/proceed i browser unload;
- istovremeni save/test i dupli submit;
- retry na page load grešci uz request ID.

**Za zatvaranje:** direktni editor/page testovi, jasna mutual-exclusion pravila za save/test, latest-preview dokaz i browser test dirty-navigation dijaloga.

### AS10 — Read-only loading/failure je fail-open na frontend površinama

**Prioritet:** P2
**Dokaz:** `use-admin-module-read-only.ts`, settings/email page composition

`isLocked` postaje true samo kada je registry učitan bez greške. Dok read-only stanje nije poznato ili registry padne, capability-ovlašten korisnik može vidjeti enabled write kontrole. Backend guard ostaje sigurnosna granica i treba odbiti zabranjenu mutaciju, ali frontend iskustvo je fail-open: korisnik može unositi podatke i tek na submit dobiti zabranu.

**Za zatvaranje:** u obuhvaćenim admin modulima tretirati nepoznat read-only status kao write-pending/disabled (ne nužno kao „zaključano“); prikazati retry/error signal; testirati loading, error, locked i unlocked matrice. Backend guard ostaje obavezan.

### AS11 — Historijske milestone oznake su ponovo u aktivnom kodu

**Prioritet:** P3
**Dokaz:** `settings-page.tsx`, `admin-security-settings-cards.tsx`, `admin-security-panel.tsx`, `admin-audit-log-card.tsx` i pripadajući testovi

Komentari sadrže `5.4.0-e.2`, `5.4.0-e.3`, „packet 5.4.0-f follow-up“ i slične implementacijske ostatke. Oni ne objašnjavaju trajni poslovni invariant nego historiju paketa, pa brzo zastarijevaju. Ranija tvrdnja o očišćenoj comment higijeni više nije tačna.

**Za zatvaranje:** zamijeniti ih trajnim komentarima koji objašnjavaju sigurnosnu/UX odluku ili ih ukloniti; test nazivi trebaju opisivati ponašanje, ne milestone.

### AS12 — Browser/responsive/accessibility closeout nije dokazan

**Prioritet:** P1 za finalnih 10/10
**Dokaz:** E2E scenariji su pročitani, nisu izvršeni

Unit/build/lint nisu dokaz za realnu route autorizaciju, focus, modal/blocker ponašanje, horizontalni overflow, live-region najave ili server-integrisane mutacije.

**Za zatvaranje:** na dostupnom stacku izvršiti postojeće relevantne E2E testove i dopuniti ciljane scenarije iz ovog plana. Evidentirati komandu, rezultat i eventualne artefakte. Bez ovog dokaza maksimalna završna ocjena je **9,8/10**.

---

## 6. Access i sigurnosna matrica

| Površina               | Frontend odluka                          | Backend mora ostati autoritet            | Reaudit zaključak                                     |
| ---------------------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `/admin`               | `canOpenAdminPage` + vidljivi tabovi     | permission/role guard po endpointu       | dobra osnova; održati route/tab testove               |
| Settings read          | admin/settings capability                | settings read guard                      | dobro                                                 |
| Settings write         | `canWriteSettings` + read-only           | settings write + read-only guard         | sigurnosno dobro; loading/error UX fail-open (`AS10`) |
| Config versions        | route check + `canWrite`/`canImport`     | lifecycle/import permissions + read-only | dobra osnova; async problemi `AS1–AS3`                |
| Email templates        | route check + settings write + read-only | controller permission + read-only        | dobra osnova; testni dokaz nedostaje (`AS9`)          |
| Ops health/alerts      | `adminOpsVisibility`                     | ops permissions                          | visibility centralizovana; velika komponenta/test gap |
| Security audit/metrics | SuperAdmin/odgovarajuća granica          | installation-wide guard                  | namjerno stroža granica dobro dokumentovana           |
| Audit log              | permission + OU scope                    | OU authorization                         | child ima race guard; parent scope treba ojačati      |

Frontend skrivanje nikada se ne smije tretirati kao sigurnosna kontrola. Svaka nova write akcija mora imati i backend guard i read-only klasifikaciju.

---

## 7. Fazni implementacijski plan

### Faza 1 — Async temelji i non-destructive refresh

**Nalazi:** `AS1`, `AS2`, dio `AS6`
**Cilj:** svi osnovni load tokovi postaju latest-only i zadržavaju uspješan snapshot pri refresh grešci.

1. Uvesti testabilan request-sequence obrazac u `useConfigVersions`.
2. Razdvojiti initial loading, refreshing i background error.
3. Zadržati versions snapshot na refresh grešci.
4. Hardenovati OU bootstrap/selekciju u `AdminOpsPanel`.
5. Dodati deferred-promise testove za success/error/out-of-order/unmount.

**Exit gate:** relevantni testovi + build + lint; nijedan stariji request ne mijenja aktuelni state.

#### Evidencija zatvaranja Faze 1 (19. 10. 2026.)

- `useConfigVersions` sada zadržava posljednji uspješni snapshot pri refresh grešci, razlikuje initial loading i refresh te koristi request sequence za latest-only commit.
- Promjena `enabled` stanja i unmount invalidiraju aktivni config request; zastarjeli odgovor više ne može vratiti podatke niti promijeniti loading state.
- `AdminOpsPanel` OU bootstrap više ne šalje zahtjev bez audit pristupa, invalidira zahtjev pri access promjeni/unmountu i nakon novog rezultata zadržava selekciju samo ako ID još postoji.
- Dodani su `use-config-versions.spec.tsx` i `admin-ops-panel.spec.tsx` sa snapshot-retention, overlapping-request, disable-invalidation, OU selection, access-race i no-access testovima.
- `AS1` i `AS2` su zatvoreni. OU bootstrap/selekcija dio `AS6` je zatvoren; child audit pagination race ostaje eksplicitno mapiran na Fazu 5.

**Izvršni dokaz:** 2 nova ciljna spec fajla, 6/6 testova; prošli puni relevantni test skup, build, scope ESLint, Prettier i `git diff --check` (konačni brojevi navedeni u commit closeoutu).

### Faza 2 — Config package preview/import ugovor

**Nalazi:** `AS3`, dio `AS8`
**Cilj:** preview je lokalna read operacija, import je eksplicitna mutation operacija.

1. Izdvojiti preview busy/error/requestId state.
2. Uvesti latest-preview sequence/abort.
3. Ukloniti version-list reload nakon previewa.
4. Invalidate report pri svakoj ulaznoj promjeni koja ga čini zastarjelim.
5. Direktno testirati file limit, mapping, unsigned potvrdu, out-of-order preview, import success/error i reset.

**Exit gate:** samo uspješan import refreshuje katalog; zastarjeli preview se nikad ne renderuje.

#### Evidencija zatvaranja Faze 2 (19. 10. 2026.)

- Preview više ne prolazi kroz workspace mutation runner i zato ne pokreće `admin.load()` niti globalni lifecycle error kanal.
- Preview ima vlastiti busy/error/request-ID state i monotoni request sequence; samo posljednji odgovor smije postaviti report ili završiti loading.
- Promjena fajla, mapiranja, environment-bound opcije i cancel invalidiraju prethodni preview; import je omogućen samo kada report odgovara aktuelnom inputu.
- Stvarni import i dalje jedini koristi `runAction`, pa samo uspješan mutation prolazi kroz katalog refresh; neuspješan import zadržava validni report za retry.
- Dodan je lokalizovani live status previewa i direktni component testovi za odvajanje preview/import toka, out-of-order odgovore, invalidaciju opcije, unsigned potvrdu, import success/error, oversize fajl te lokalnu grešku sa request ID-em.
- `AS3` i config-package dio `AS8` su zatvoreni.

**Izvršni dokaz:** novi `config-package-import.spec.tsx` sa 7 determinističkih testova, uz postojeće mapping/action/hook testove; završni gateovi evidentirani su u commit closeoutu.

### Faza 3 — Settings registry concurrency i recovery

**Nalazi:** `AS4`, `AS5`
**Cilj:** batch save status je tačan i greške su operativno upotrebljive.

1. `pendingKeys` postaviti kao kanonski public API.
2. Uvesti operation token/ref-count po ključu.
3. Migrirati Settings consumers.
4. Dodati request ID, initial retry i non-destructive refresh grešku.
5. Testirati overlapping/disjoint concurrency i partial failure ugovor.

**Exit gate:** kontrole se ne enableuju prije završetka posljednje operacije za dati ključ.

### Faza 4 — Read-only i access matrica

**Nalazi:** `AS10`, access dio `AS8`
**Cilj:** write UI je konzervativan dok politika nije poznata, bez slabljenja backend zaštite.

1. Modelirati `loading/error/locked/unlocked`, ne samo boolean.
2. Disabled/write-pending ponašanje primijeniti na Settings, Email Templates i obuhvaćene admin settings kartice.
3. Dodati route/tab/deep-link matrice za relevantne role/permissions.
4. Dodati backend contract testove gdje read-only klasifikacija nema eksplicitni endpoint slučaj.

**Exit gate:** nijedna write kontrola nije aktivna dok read-only odluka nije pouzdana.

### Faza 5 — Admin audit/ops direktna pokrivenost

**Nalazi:** `AS6`, admin dio `AS8`
**Cilj:** OU scope, paginacija, filteri i greške imaju izvršni dokaz.

1. Testovi za `AdminOpsPanel` visibility i OU fallback.
2. Testovi za audit refresh/load-more pri promjeni OU.
3. Testovi za security audit debounce, user selection/clear, filter race i pagination.
4. Potvrditi request ID, empty/error/forbidden i unknown-label fallback.

**Exit gate:** deterministic race suite prolazi bez timer/promise flakinessa.

### Faza 6 — Ops Health dekompozicija

**Nalazi:** `AS7`, ops-health dio `AS8`
**Cilj:** smanjiti koncentraciju rizika bez promjene korisničkog ponašanja.

1. Prvo characterization testovi.
2. Izdvojiti data/controller hook.
3. Izdvojiti summary, alert list/editor i mutation feedback cjeline.
4. Sačuvati permissions, request ID, focus i optimistic/pessimistic ugovor.
5. Provjeriti admin chunk poslije refaktora; lazy-load gdje donosi mjerljivu korist.

**Exit gate:** nijedna izdvojena cjelina nema skrivenu zavisnost od parent render redoslijeda; glavni tokovi direktno testirani.

### Faza 7 — Email templates closeout

**Nalazi:** `AS9`, email dio `AS8`
**Cilj:** kompletan editor state machine i navigation safety dokazani.

1. Editor/page component testovi za load/retry/request ID/read-only.
2. Latest-only preview i unknown-placeholder testovi.
3. Save/test mutual exclusion, double-submit i server error testovi.
4. Dirty blocker stay/proceed + successful-save clean state.
5. Test locale/key switcha i reset/default ponašanja.

**Exit gate:** nema gubitka drafta, stale previewa ni write puta u read-only stanju.

### Faza 8 — Higijena, integracijski i browser closeout

**Nalazi:** `AS11`, `AS12` i završna regresija svih nalaza
**Cilj:** očistiti historijske ostatke i dokazati proizvod u realnom browseru.

1. Ukloniti milestone komentare i riješiti scope lint warning.
2. Pokrenuti puni relevantni frontend test skup, build, lint, format i i18n gate.
3. Pokrenuti relevantne postojeće E2E scenarije.
4. Dopuniti E2E: permission/deep-link, config refresh/preview/import, settings batch pending, read-only, email dirty navigation, mobile overflow i keyboard/focus.
5. Ručno provjeriti 320/375/768/1280 px, zoom 200%, tastaturu, dijaloge i horizontalne tabele.
6. Ažurirati ovaj audit dokazima i zatvoriti svaki `AS` nalaz pojedinačno.

**Exit gate:** svi AS nalazi zatvoreni; realni browser run zelen. Ako browser infrastruktura nije dostupna, dokumentovati blokadu i završiti najviše na **9,8/10**.

---

## 8. Obavezna test matrica

### Unit/hook

- permission/read-only helper matrice;
- config load initial/refresh/race/unmount;
- settings overlapping pending operacije;
- package mapping/readiness/latest preview;
- email draft, placeholder i dirty derivacija.

### Component

- admin tab visibility i query normalization;
- settings loading/error/retry/request ID/read-only;
- OU bootstrap i audit pagination race;
- security audit filter/search race;
- ops health load/error/mutations;
- package preview/import;
- email editor preview/save/test/blocker.

### Browser/E2E

- direktan URL za dozvoljene i zabranjene role;
- refresh i back/forward sa `?tab=`;
- read-only banner + disabled writes + backend denial;
- config lifecycle i package import;
- email dirty navigation, preview i test send;
- keyboard focus i modal restore;
- 320/375 px overflow i tabele unutar kontrolisanih scroll regiona;
- request ID prikaz na server greškama.

---

## 9. Kriterij ocjene

| Oblast                                  |   Trenutno |      Cilj |
| --------------------------------------- | ---------: | --------: |
| Access/RBAC/read-only sigurnosna osnova |        8,5 |        10 |
| Async/race/error ugovori                |        7,8 |        10 |
| Settings registry konzistentnost        |        7,2 |        10 |
| Config versions/import                  |        9,0 |        10 |
| Email templates                         |        8,0 |        10 |
| Testabilnost i održivost                |        6,8 |        10 |
| Accessibility/responsive/browser dokaz  |        7,0 |        10 |
| **Ukupno**                              | **8,5/10** | **10/10** |

Ocjena nije kazna za količinu funkcionalnosti; upravo suprotno, modul ima mnogo zrelih funkcija. Snižena je zato što kritične state-machine i race tvrdnje nisu dovoljno testirane, a dio aktuelnog koda demonstrira konkretne edge-case kvarove.

---

## 10. Definition of Done za konačno zatvaranje

Modul se može označiti zatvorenim tek kada:

- [ ] `AS1–AS12` imaju implementaciju, test i evidence bilješku;
- [ ] refresh greške ne brišu uspješne podatke;
- [ ] svi relevantni async tokovi su latest-only;
- [ ] settings pending stanje je tačno za paralelne i preklapajuće operacije;
- [ ] preview ne pokreće mutation reload i ne prikazuje stale report;
- [ ] read-only loading/error ne izlaže aktivne write kontrole;
- [ ] Ops Health je razložen u testabilne odgovornosti;
- [ ] email dirty/save/test/preview tokovi imaju direktne testove;
- [ ] nema historijskih packet/milestone komentara u aktivnom scopeu;
- [ ] build, lint, format, i18n i relevantni testovi prolaze;
- [ ] relevantni E2E/browser scenariji su stvarno izvršeni i evidentirani.

**Preporučeni redoslijed implementacije:** Faza 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
Faze su namjerno segmentirane tako da se svaka može zasebno implementirati, testirati, commitovati i pushati bez oslanjanja na nezavršen kasniji segment.
