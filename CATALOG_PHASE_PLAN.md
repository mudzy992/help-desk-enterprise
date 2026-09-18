# EP-HelpDesk — Fazni plan: Katalog usluga (CATALOG_PHASE_PLAN.md)

**Scope:** isključivo Service Catalog (backend `modules/service-catalog`, frontend `pages/services-page.tsx` + `components/services/`*), plus direktno vezan orphan model `PriorityMatrixRule` (koji RAW vezuje za tok kreiranja tiketa preko kataloga/forme — impact/urgency se biraju u istoj formi). Ne diramo Routing/SLA/RBAC/Settings-registry osim tačaka gdje se service-catalog direktno oslanja na njih (routing coverage note, policy-pack apply — oba već rade, samo se čitaju).

**Osnova:** RAW spec (service catalog + forme, lifecycle, availability/downtime, priority matrix, read-only mode sekcije), duboka analiza `backend/src/modules/service-catalog/`*, poređenje sa `referenca-dizajn/src/pages/Catalog.tsx`.

---

## Status

- [x] Faza 1 — Downtime window scheduling: admin UI
- [x] Faza 2 — Priority matrix (impact×urgency→priority): admin CRUD
- [x] Faza 3 — Read-only mode enforcement (service catalog scope)
- [x] Faza 4 — Sitni nalazi i finalno poravnanje sa referencom

---

## Nalazi (sažetak)

1. **Modul je već vrlo zreo.** Servisi/kategorije/forme/form-verzije/lifecycle CRUD je potpun na backendu (svih 6 controllera imaju pun Get/Post/Patch/Delete gdje ima smisla), i frontend (`service-catalog-card.tsx`, `service-catalog-grid.tsx`, kategorije, form-builder, onboarding wizard, lifecycle akcije) je već skoro 1:1 usklađen sa referencom — uključujući routing coverage notu na kartici (reuse iz Routing modula), pretragu, kategorijske chipove, i onboarding pipeline teaser karticu. Ovo NIJE gap, potvrđeno kao urađeno.
2. **Nedostaje:** admin UI za zakazivanje downtime prozora. Backend (`service-availability.controller.ts`: `GET/POST/PATCH/DELETE :serviceId/downtime-windows`) je potpuno gotov i testiran (`assert-downtime-windows-do-not-overlap.ts`, `resolve-downtime-window-phase.ts`), ali frontend **samo prikazuje** aktivan downtime (read-only badge na kartici) — nema forme za kreiranje/izmjenu/otkazivanje prozora. RAW eksplicitno traži: "admin UI omogućava zakazivanje downtime (from/to) i prikaz aktivnih/budućih prozora" (linija 1028).
3. **Nedostaje:** admin CRUD za `PriorityMatrixRule` (impact×urgency→priority). Model postoji, ali jedini pisac je `apply-sla-snapshot.ts` (config-version apply tok) — isti obrazac kao SLA eskalacije prije Faze 1 tog plana. RAW: "sistem predlaže priority po matrici, uz mogućnost da Admin/SuperAdmin podešava pravila" (linija 61, 906-908). Ovo je bilo eksplicitno izostavljeno iz Routing plana kao van scope-a; sada ima prirodno mjesto — vezano je za tok kreiranja tiketa preko servisa/forme, ne za "usmjeravanje na grupu".
4. **Nedostaje potpuno:** "read-only mode" enforcement. Settings ključevi postoje i eksplicitno navode `service_catalog` kao jedan od lock-ovanih modula (`private.readOnlyMode.modulesCsv` default uključuje `service_catalog`), ali **nigdje u backendu ne postoji guard/interceptor** koji bi stvarno blokirao write operacije kad je modul zaključan — ni u service-catalog, ni u routing/sla/settings kontrolerima. Ovo je sistemski gap (ne samo service-catalog), ali pošto RAW eksplicitno navodi service catalog kao jedan od modula i ovaj plan je najbliža prilika da se to popravi, uzimamo ga ovdje kao minimalni scope (samo service-catalog write rute), uz jasnu napomenu da isti guard treba primijeniti i drugdje kao odvojen budući rad.
5. **Sitno, potvrđen gap:** kartica servisa u referenci prikazuje "N otvorenih" (broj otvorenih tiketa za taj servis) — trenutna implementacija to ne prikazuje, i taj podatak trenutno ne postoji nigdje (ni backend ni frontend).

---

## Faza 1 (P1) — Downtime window scheduling: admin UI

**Problem:** vidi nalaz #2. Backend potpuno gotov, frontend nedostaje u potpunosti.

1. **Backend:** ništa se ne dira — sve postoji (`GET/POST/PATCH/DELETE :serviceId/downtime-windows`, overlap-validacija, phase resolution). Samo potvrdi tačan DTO shape (`from`, `to`, `message`, opciono `scope` global/per-service — provjeri `parse-service-availability-configuration.ts` za tačan shape prije pisanja frontend tipova).
2. **Frontend:**
  - `services/service-catalog-api.ts` (ili novi `services/service-downtime-api.ts`) — CRUD pozivi za downtime windows, tipovi 1:1 sa backend DTO-ovima.
  - Nova forma `service-downtime-window-form.tsx` (from/to datetime pickeri, message textarea) i lista `service-downtime-windows-panel.tsx` (aktivni/budući prozori, edit/otkaži akcije) — dostupno kroz karticu servisa (npr. dugme "Zakaži prekid" pored postojećih lifecycle akcija u `service-catalog-lifecycle-actions.tsx`, ili u edit-sheet-u servisa — odaberi mjesto koje se najprirodnije uklapa u postojeći `service-catalog-mutation-sheet.tsx` layout, objasni izbor).
  - Prikaz "aktivnih/budućih prozora" liste (ne samo trenutno aktivnog) — trenutna kartica prikazuje samo `activeDowntimeWindow`, dodaj pregled budućih zakazanih prozora (npr. mali badge "+N zakazano" koji otvara listu).
  - Zaštita: `RequireAccess`/permission isti nivo kao ostale service-catalog write akcije (`serviceCatalogWrite` ili `serviceAvailabilityWrite` — provjeri tačan permission key u `service-availability.controller.ts` guard-u).
  - BS + EN i18n.

**Ograničenja:**

- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 2-4.
- Bez mock podataka.

**Verifikacija (obavezno prijavi rezultate):**

- Admin zakaže downtime prozor (from/to u budućnosti) → servis prikazuje "zakazano" indikator prije nego prozor počne.
- Kad prozor počne (ili test simulira trenutak unutar prozora), servis prikazuje aktivni downtime banner (postojeće ponašanje, samo sad sa podatkom koji je admin sam unio kroz UI, ne samo backend fixture/seed).
- Preklapajući prozor je odbijen sa jasnom greškom (postojeća backend validacija, samo potvrdi da se greška čitljivo prikazuje na frontend-u).
- Otkazivanje/brisanje zakazanog prozora radi.
- `npm run test`, `npm run build`; backend testovi (ako je DTO shape zahtijevao izmjenu).

**Obavezno:** čekiraj (`- [x]`) Faza 1 stavku u `CATALOG_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 2 dok se ne potvrdi.

---

## Faza 2 (P1) — Priority matrix (impact×urgency→priority): admin CRUD

**Problem:** vidi nalaz #3. `PriorityMatrixRule` postoji kao model, jedini pisac je config-version apply tok — nema direktnog CRUD-a ni admin UI-ja.

1. **Backend:**
  - Novi `priority-matrix.controller.ts` (u `service-catalog` modulu, jer je konceptualno vezan za tok kreiranja tiketa preko servisa — ili u zasebnom malom modulu ako smatraš da je čistije, objasni izbor): `GET /priority-matrix` (sve kombinacije impact×urgency→priority), `PATCH /priority-matrix` (izmjena jedne ili više ćelija matrice, sa `reason` — isti change-log pattern kao SLA/Routing).
  - Guard: `admin` rola + odgovarajuća permission (provjeri da li postoji već definisan `priorityMatrixWrite` ključ u permission katalogu iz ranijih faza — ako ne postoji, predloži novi po konvenciji, ne aktiviraj bez potvrde ako ideš izvan uobičajenog obrasca).
  - **Ne diraj** `apply-sla-snapshot.ts`/config-version apply put za `PriorityMatrixRule` — ostaje funkcionalan alternativni put (isti pattern kao SLA eskalacije Faza 1 — zadrži oba puta, prijavi eventualni konflikt kao poznato ograničenje, ne rješavaj ovdje).
  - Test: PATCH mijenja ćelije matrice, ispravan change-log zapis; GET vraća punu 4×4 matricu (impact LOW/MEDIUM/HIGH/CRITICAL × urgency LOW/MEDIUM/HIGH/CRITICAL, ili koja god je stvarna dimenzija — potvrdi iz modela prije pretpostavke).
2. **Frontend:**
  - `services/priority-matrix-api.ts` — GET/PATCH pozivi.
  - Novi admin ekran (novi tab u Admin panelu, ili dio Settings/Service Catalog admin sekcije — odaberi mjesto koje se najprirodnije uklapa u postojeću IA, objasni izbor u handoff-u) — grid prikaz impact×urgency sa priority Select-om po ćeliji, reason obavezan pri snimanju izmjene.
  - Prikaz predložene vrijednosti na formi kreiranja tiketa (provjeri da li `components/tickets/create-ticket-service-picker.tsx` ili ekvivalentna forma već ima impact/urgency select i da li čita ovu matricu za predlog prioriteta — ako trenutno koristi hardkodovanu/drugu logiku, poveži je na novi izvor).
  - BS + EN i18n.

**Ograničenja:**

- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 1/3/4.
- Bez mock podataka. Ako ticket-creation forma trenutno uopšte nema impact/urgency select (samo priority direktno), prijavi to kao veći nalaz prije nego što praviš workaround — to bi značilo da RAW "impact/urgency → predloženi priority" tok nije uopšte povezan na ticket creation, što je ozbiljniji nalaz od same admin-CRUD praznine.

**Verifikacija (obavezno prijavi rezultate):**

- Admin izmijeni jednu ćeliju matrice (npr. HIGH×HIGH → CRITICAL) kroz UI → change-log zapis ispravan.
- Kreiranje tiketa sa tom kombinacijom impact/urgency predlaže ispravan (ažurirani) priority.
- `npm run test`, `npm run build`; backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 2 stavku i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 3 dok se ne potvrdi.

---

## Faza 3 (P2) — Read-only mode enforcement (service catalog scope)

**Problem:** vidi nalaz #4. Settings ključevi postoje (`private.readOnlyMode.enabled`, `private.readOnlyMode.modulesCsv` sa `service_catalog` u default listi, `private.readOnlyMode.activeModulesCsv`), ali nema nijednog guard-a/interceptora koji ih stvarno provjerava bilo gdje u backendu.

**Napomena o obimu:** ovo je sistemski koncept (RAW ga vezuje i za settings/routing/sla, ne samo service catalog), ali scope ove faze je **samo service-catalog write rute** — ostali moduli su van scope-a ovog plana, prijavi ih kao poznatu, namjerno neriješenu tačku za poseban budući rad (ne "riješi sve dok si tu").

1. **Backend:**
  - Novi guard/interceptor (npr. `ReadOnlyModeGuard`) koji: učita `private.readOnlyMode.enabled` + `private.readOnlyMode.activeModulesCsv` (trenutno aktivni zaključani moduli, ne samo dozvoljena lista), i ako je `service_catalog` u aktivnoj listi, odbija sve write operacije (`POST/PATCH/DELETE`) na `services.controller.ts`, `service-categories.controller.ts`, `service-forms.controller.ts`, `service-availability.controller.ts` (uključujući nove downtime/priority-matrix rute iz Faza 1-2) sa jasnom greškom (npr. `MODULE_READ_ONLY`).
  - Bypass rola: provjeri RAW tekst za tačnu definiciju "bypass role" (linija 1021: "zaključani moduli odbijaju write operacije osim bypass role") — vjerovatno SuperAdmin, potvrdi umjesto pretpostavke.
  - Primijeni guard **samo** na service-catalog kontrolere u ovoj fazi (dekorator na nivou controllera, ne globalni middleware — da se izbjegne slučajno širenje na module van scope-a).
  - Test: kad je `service_catalog` u aktivnoj read-only listi, sve write rute vraćaju grešku osim za bypass rolu; kad nije u listi ili je `enabled=false`, sve radi normalno.
2. **Frontend:**
  - Ako write poziv vrati `MODULE_READ_ONLY`, prikaži jasnu poruku (ne generičku grešku) — reuse `mapServiceCatalogError`/ekvivalentni error-mapper pattern.
  - Vizuelna oznaka na Katalog usluga stranici kad je modul zaključan (banner, ne blokira čitanje/pregled, samo najavljuje da su izmjene privremeno onemogućene) — provjeri da li generic `Settings` admin UI (iz ranije faze) već ima UI za uključivanje/isključivanje read-only moda po modulu; ako da, samo poveži katalog stranicu da reaguje na to stanje, ne pravi novi admin toggle.
  - BS + EN i18n.

**Ograničenja:**

- Fajlovi ≤150 linija.
- Ne diraj Faze 1/2/4.
- Ne primjenjuj guard na routing/sla/settings kontrolere u ovoj fazi — samo prijavi da isti mehanizam treba tamo primijeniti kao poseban budući rad.

**Verifikacija (obavezno prijavi rezultate):**

- Uključivanje read-only moda za `service_catalog` blokira sve write pokušaje osim bypass role, sa jasnom porukom i na backendu i na frontendu.
- Čitanje/pregled kataloga i dalje radi normalno dok je modul zaključan.
- `npm run test`, `npm run build`; backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 3 stavku i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 4 dok se ne potvrdi.

---

## Faza 4 (P3) — Sitni nalazi i finalno poravnanje sa referencom

**Problem:** vidi nalaz #5, plus opšta finalna provjera nakon što su Faze 1-3 dodale novi sadržaj na karticu/stranicu.

1. **Backend:**
  - Dodaj `openTicketCount` (broj tiketa za taj servis koji nisu u terminalnom statusu RESOLVED/CLOSED/ARCHIVED) u `ServiceResponse`/`build-service-response.ts` — jedan agregacioni upit po servisu ili batch upit za listu (izbjegni N+1, objasni pristup).
  - Test: broj tačno odražava otvorene tikete za taj servis.
2. **Frontend:**
  - `service-catalog-card.tsx` — dodaj "N otvorenih" prikaz (tačno mjesto/stil kao referenca: `<span className="ml-auto tnum ...">{N} otvorenih</span>` u istom redu kao form-version/approvals bedževi).
  - Finalna vizuelna provjera cijele Katalog usluga stranice naspram `referenca-dizajn/src/pages/Catalog.tsx` nakon što su Faze 1-3 dodale nove UI elemente (downtime forma, priority matrix link ako je na ovoj stranici, read-only banner) — potvrdi da se sve uklapa bez vizuelnog nereda, desktop 1440 + mobile 390.
  - BS + EN i18n za novi tekst.

**Ograničenja:**

- Fajlovi ≤150 linija.
- Ne diraj backend logiku van jednog novog polja iz koraka 1.

**Verifikacija (obavezno prijavi rezultate):**

- Broj otvorenih tiketa po servisu tačan i vidljiv na kartici.
- Vizuelno poređenje sa referencom, uz napomenu za namjerna proširenja (downtime forma, priority matrix, read-only banner — referenca ih nema jer je mock, mi ih moramo imati).
- `npm run test`, `npm run build`.

**Obavezno:** čekiraj (`- [x]`) Faza 4 stavku u `CATALOG_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ovo je posljednja faza — na kraju potvrdi da li je cijeli plan (Faze 1-4) zatvoren, i eksplicitno navedi read-only mode enforcement za routing/sla/settings module (van scope-a Faze 3) kao otvorenu tačku za poseban budući rad.
