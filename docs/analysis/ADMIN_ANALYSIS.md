# EP-HelpDesk — Analiza "Administracije" (Org/Groups/Users/Permissions/Settings/Ops)

**Metodologija:** kod iz najnovijeg zip-a (post-R6/R8), unakrsno provjeren sa `referenca-dizajn/src/pages/Admin.tsx` i sa backend modulima (`settings`, `rbac`, `authorization`, `users`, `directory-sync`, `integration-queue`). Sve niže je potvrđeno grep-om/čitanjem koda, ne pretpostavka.

---

## 1) "Red poslova i audit" (Ops tab) — nedostaje tabela za worker/integracioni red

**Potvrđeno:** `components/admin/admin-ops-panel.tsx` sadrži **samo** dvije kartice — Audit export i Support bundle. Nema tabele integracionih poslova (`INTEGRATION_JOBS` iz reference — Posao/Red/Status/Pokušaji/Napomena/Vrijeme).

`IntegrationQueuePage` (tabela poslova, retry now) **postoji**, ali je zaseban top-level route (`/admin/queue`), potpuno odvojen od Ops taba — ne dijeli isti prostor/kontekst kao u referenci gdje je "Trajni integracioni red" prva, najistaknutija kartica u Ops tabu.

**Backend nalaz — nema koncepta "worker" statusa uopšte.** Referenca prikazuje badge `worker: aktivan`. Grep na cijeli `integration-queue` modul ne nalazi nijedan health/heartbeat/status signal za sam BullMQ/Redis worker proces — samo se prate pojedinačni jobovi (status po jobu: PENDING/FAILED/DLQ), ne da li worker uopšte živi. Ako se worker proces ugasi, admin trenutno nema način da to primijeti kroz UI — jobovi bi se samo gomilali u PENDING bez ikakve indikacije da niko ne obrađuje red.

**Zaključak:** treba (a) uneseti integration-queue tabelu fizički u Ops tab (ne kao zaseban route), i (b) backend treba stvaran worker-health signal (npr. heartbeat timestamp koji worker upisuje periodično, provjeren protiv trenutnog vremena za "aktivan/neaktivan" status), ne samo status pojedinačnih poslova.

---

## 2) "Postavke i dodaci" — i18n i dizajn po grupi

**i18n potvrđeno prazan:** `settings.registry.keys` i `settings.registry.categories` u i18n rječnicima (**i BS i EN**) imaju **0 unosa** (provjereno parsiranjem JSON-a). Override mehanizam (`resolveRegistryDescription`/`resolveRegistryCategoryTitle`) postoji u kodu i ispravno je napisan — ali rječnik iza njega je potpuno prazan, pa se **svaki** opis i naslov kategorije za "generic" registry postavke (sve osim Email/Addons featured panela) prikazuje kao sirovi backend opis (developerski, vjerovatno engleski) i sirovi dotted key (npr. `public.maintenance` umjesto "Održavanje sistema").

**Backend nalaz — "kategorija" nije stvarni koncept, nego frontend heuristika.** `group-settings-by-category.ts` pravi kategoriju uzimanjem prva dva segmenta ključa (`public.maintenance`, `private.confidential`...) — **backend ne šalje nikakvo category/icon/prioritet polje** u `GET /settings` odgovoru. Zato svaka grupa dobija identičan generički prikaz (`SettingsRegistrySection`: naslov + 3 preview reda + "otvori drawer" dugme) — nema mehanizma da bilo koja grupa dobije svoj vizuelni tretman jer backend ne nosi metapodatke po kojima bi se to razlikovalo.

**Zaključak:** ovo su dva odvojena zadatka: (a) popuniti i18n rječnike (BS+EN) za sve postojeće ključeve/kategorije — mehanički ali obiman posao; (b) ako se želi da svaka grupa ima *drugačiji dizajn* (ne samo drugačiji tekst), backend registry treba prošireno polje (npr. `category`, `icon`, `priority`) po ključu, jer trenutna grupacija je isključivo string-prefix trik bez ikakve namjere iza sebe.

---

## 3) "Permisije" — nema opisa, ni na backendu ni na frontendu

**Potvrđeno — najozbiljniji nalaz u ovoj analizi:** `listPermissionCatalog()` (backend, `backend/src/modules/rbac/list-permission-catalog.ts`) vraća `allPermissionKeys` — **običan niz stringova** (`Object.values(permissionKeys)` iz `authorization.constants.ts`). Nigdje u backendu ne postoji struktura tipa `{ key, description }` za permisije. Frontend (`permissions-panel.tsx`) tip `catalog: readonly string[]` potvrđuje da ni frontend ne očekuje ništa više od sirovog ključa.

**Zaključak:** ovo nije samo i18n gap (kao settings) — **ne postoji nijedan izvor opisa permisija u cijelom sistemu**. Treba: (a) backend strukturu koja uz svaki permission key nosi opis (može biti isti pattern kao settings registry — key/description/category), (b) i18n prevod tih opisa, (c) frontend prikaz opisa uz svaki switch u RBAC editoru (trenutno se vidi samo sirovi permission string, npr. `tickets.bulkAssign`, bez objašnjenja šta tačno znači).

---

## 4) "Dodaj korisnika" — nema lozinke; **potvrđen bug: novi lokalni korisnik se ne može prijaviti**

**Potvrđeno u modelu:** `User.localPasswordHash` je `String?` (nullable), postoji i `entraObjectId String? @unique` (za AD-linked identitet) i `isLocalOnly Boolean`.

**Potvrđeno u kodu kreiranja (`backend/src/modules/users/create-user.ts`):**
- `localPasswordHash` se **nikad ne postavlja** pri kreiranju — novi red u `User` tabeli ima `localPasswordHash = null`.
- `isLocalOnly` se postavlja na `true` **samo** ako je rola SuperAdmin (`isLocalOnly: isSuperAdminRole`) — za sve ostale nove korisnike ostaje `false`, iako će oni de facto biti lokalni nalozi (nema AD linkovanja u ovom flow-u uopšte).
- `entraObjectId` se nikad ne postavlja niti nudi opcija povezivanja.

**Posljedica:** korisnik kreiran kroz "Dodaj korisnika" formu ima prazan password hash → bilo koji pokušaj lokalne prijave (bcrypt compare protiv `null`) će uvijek propasti. **Novi lokalni korisnik trenutno nema nijedan način da se prijavi u sistem.** Ovo je potvrđen, konkretan bug, ne teorijski rizik — potvrđuje tačno ono što si primijetio.

**Za razmatranje (arhitektonska odluka, ne mala izmjena):**
- Init-password tok: generiši privremenu lozinku pri kreiranju, postavi `localPasswordHash`, dodaj `mustChangePassword`-tip flag na `User` (trenutno ne postoji u modelu — potreban je novi boolean), pošalji je na email kad SMTP bude aktivan (`SmtpEmailSettingsCard`/email addon već postoji kao infrastruktura, samo treba novi template), forsiraj promjenu pri prvoj prijavi.
- AD-linking tok: `entraObjectId` polje već postoji u modelu ali **nigdje u kodu se ne koristi za povezivanje postojećeg lokalnog naloga sa AD identitetom** — trenutno directory-sync (i manual-only provider iz R8) samo kreira/ažurira OU stablo, ne postoji "poveži ovog lokalnog korisnika sa AD nalogom X" akcija. Kad se AD prijava koristi, lozinka zaista ne bi trebala biti relevantna za taj nalog (autentifikacija ide kroz domain/Entra) — model to već predviđa (`entraObjectId` + `isLocalOnly=false`), samo nedostaje UI/API tok da se ta veza uspostavi eksplicitno umjesto implicitno kroz email-match (što bi bio rizičan default — treba eksplicitna admin akcija, ne auto-match po emailu).

---

## 5) "Grupe" tab — nema referentni dizajn, trenutno je generički

**Potvrđeno:** `groups-page.tsx` je jedna `Card` sa filter-dropdown-om i listom — strukturno identično kopiran pattern kao Users/OU stranice (Card + CardHeader + actions + lista), bez ijednog vizuelnog elementa specifičnog za "grupu" kao koncept (npr. broj članova kao istaknuta vizuelna metrika, jasna razlika fallback grupe vs. obične, veza sa routing pravilima koja je na tu grupu vezana). Funkcionalno radi (CRUD + članovi, potvrđeno u ranijoj fazi R2), ali vizuelno je "generic admin table #4", ne namjerno dizajniran ekran — ovo je čisto dizajnerski dug, ne funkcionalni bug.

---

## 6) "Organizacija (OU)" — funkcionalno stanje i šta treba jasnije definisati

**Stanje je zapravo dosta kompletno** (post-R8): add/edit/delete OU kroz manual-only katalog (`use-manual-directory-catalog-actions.ts`), automatska materijalizacija u stablo nakon izmjene (`syncManualDirectoryCatalog`), `DirectorySyncCard` sa ručnim pokretanjem čitanja. Ovo NIJE prazan gap kao gornje stavke.

**Šta nije jasno definisano (dokumentaciono, ne kod):**
- Nigdje u UI nije objašnjeno korisniku *šta znači* "manual-only katalog" naspram "AD sinhronizacija" — admin vidi dugme "Pokreni ručno očitavanje" i formu za CRUD, ali ne i mentalni model *zašto* izmjena OU ide kroz dvostepeni proces (izmijeni katalog → sync materijalizuje). Ako se ikad prebaci u `entra_ad` režim, ovaj CRUD bi trebao nestati/biti onemogućen (jer AD postaje source-of-truth) — nije potvrđeno u kodu da UI to razlikuje po trenutnom `readMode`.
- Nije definisano šta se dešava sa korisnicima/routing pravilima kad se **preimenuje** OU (mijenja se `ouPath`) — brisanje je blokirano ako ima djece/mapiranih korisnika, ali rename/move nije pokriven istom analizom u ovoj sesiji (nije provjeren kod za tu putanju — treba posebno pregledati `updateManualDirectoryOrganizationalUnit` prije nego što se ovo zatvori kao "riješeno").

---

## Sažetak nalaza (za dalje planiranje, bez izmjena koda u ovoj sesiji)

| # | Oblast | Tip nalaza | Ozbiljnost |
|---|---|---|---|
| 1 | Ops — worker tabela/integracija | Nedostaje UI + nedostaje backend worker-health koncept | Visoka (operativna vidljivost) |
| 2 | Settings — i18n + per-grupa dizajn | i18n rječnici prazni (0/0); "kategorija" je frontend heuristika bez backend metapodataka | Srednja |
| 3 | Permisije — opisi | Ne postoji nigdje u sistemu (ni backend ni frontend) | Visoka (usability za SuperAdmin) |
| 4 | Add user — lozinka | **Potvrđen bug: novi lokalni korisnik se ne može prijaviti** (`localPasswordHash` nikad postavljen) | **Kritična** |
| 4b | Add user — AD linking | Model predviđa (`entraObjectId`), tok ne postoji | Niska za sad (buduća faza) |
| 5 | Grupe — dizajn | Generički, bez namjere | Niska (kozmetika) |
| 6 | OU — jasnoća modela | Funkcionalno gotovo, nedostaje dokumentacija/UI objašnjenje dvostepenog toka; rename/move putanja nije provjerena u ovoj sesiji | Srednja |

Nijedna stavka iznad nije implementirana u ovoj sesiji — ovo je isključivo analiza, po zadatku.
