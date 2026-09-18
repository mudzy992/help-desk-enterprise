# EP-HelpDesk — Fazni plan: Routing/Usmjeravanje (ROUTING_PHASE_PLAN.md)

**Scope:** isključivo Routing (backend `modules/routing`, frontend `pages/routing-page.tsx` + `components/routing/*`, direktne veze — `change-log` modul, `service-onboarding` samo za coverage-warning kuku, settings ključevi `private.ticket.routing.*`). Ništa van ovog scope-a se ne dira. `PriorityMatrixRule` (impact×urgency→priority) je **van scope-a** — to je poseban koncept (određivanje prioriteta tiketa), ne "usmjeravanje na grupu", referentni dizajn ga ne prikazuje ni u jednom od 4 Routing taba. Samo se bilježi kao nalaz na kraju ovog dokumenta, ne radi se.

**Osnova:** RAW spec (routing sekcije), duboka analiza `backend/src/modules/routing/*`, poređenje sa `referenca-dizajn/src/pages/Routing.tsx`.

---

## Nalazi (sažetak)

1. **KRITIČNO:** `RoutingController`/`RoutingService` podržavaju **samo kreiranje** pravila (`POST /routing/rules`, `createRule()`). **Nema update, nema delete.** `RoutingRule` ima `@@unique([originUnitId, serviceId])` — jednom kreirano pravilo za par (OU, servis) se **ne može nikad izmijeniti niti ukloniti** kroz aplikaciju. Potvrđeno da hard delete reda ne bi ugrozio integritet (ništa drugo ne referencira `RoutingRule.id` kao FK).
2. **KRITIČNO:** nema `GET` endpointa za routing change-log — `persist-routing-rule-change.ts` **već piše** change-log zapis pri kreiranju (elegantno: before/after je puna `RoutingResolution` prije/poslije, ne sirovi field diff), ali se ti zapisi nigdje ne mogu pročitati. Frontend nema "Change log" tab uopšte (referenca ima 4. tab, trenutna implementacija ima samo 3: Matrica/Tester/Pravila).
3. `private.ticket.routing.requireCoverage` (blokiraj aktivaciju servisa/OU bez routing pokrivenosti) — settings ključ postoji, **nigdje se ne koristi**. RAW eksplicitno traži ovo ("routing coverage check + fallback pravila", "upozorava ako servis nema routing coverage ili fallback" u onboarding wizardu) — trenutno servis/OU može biti aktivan bez ijednog routing pravila, bez upozorenja.
4. `private.ticket.routing.fallbackGroupId` — settings ključ postoji, ali se koristi **samo** u install-seed skripti (`ensure-install-seed-service.ts`), **nikad** u stvarnoj `resolve-ticket-routing.ts` logici. I referenca i trenutna implementacija namjerno tretiraju "bez pogotka" kao first-class `UNROUTED` (`groupId: null`), **nikad** proizvoljna fallback grupa — ovo je arhitektonski ispravnije i sigurnije. Settings ključ je u koliziji sa tim principom — odluka je potrebna (vjerovatno: deprecirati ključ), ne implementacija bez razmišljanja.
5. `private.routing.strictOuIsolation` — settings ključ postoji, **nigdje se ne koristi**. `RequireOrganizationalUnitScope`/`RequireServiceScope` decoratori na `routing.controller.ts` su bezuslovni (izgleda da OU/service scope enforcement već uvijek radi) — treba potvrditi da li je to zaista uvijek-uključeno ponašanje namjerno, pa ključ ukloniti, ili treba stvarno uslovno.
6. Frontend Matrica/Tester/Pravila tabovi su **strukturno vrlo blizu referenci** (coverage matrica sa E/N/× ćelijama, resolution tester sa fallback path prikazom i JSON blokom, create-rule forma sa Select poljima za sve, duplicate-rule upozorenje, obavezan reason) — glavni nedostatak nije dizajn nego funkcionalnost iz nalaza #1/#2.
7. i18n za postojeća 3 taba je već kompletan (69/69 BS/EN ključeva poklopljeno) — novi rad (Faza 1/4) treba nove ključeve, ne popravku postojećih (za razliku od SLA/Settings gdje je i18n bio prazan).

---

## Progress

- [x] Faza 1 — Puni CRUD za routing pravila + Change log
- [ ] Faza 2 — `requireCoverage` enforcement
- [ ] Faza 3 — Housekeeping: `fallbackGroupId` i `strictOuIsolation`
- [ ] Faza 4 — Finalno usklađivanje frontend UI-ja sa referencom

---

## Faza 1 (P0, KRITIČNO) — Puni CRUD za routing pravila + Change log

**Problem:** vidi nalaz #1, #2.

1. **Backend — update/delete:**
   - `routing.service.ts` — nova `updateRule(ruleId, input, context)`: mijenja `groupId` postojećeg pravila (originUnit+service par se ne mijenja — to bi bilo efektivno novo pravilo; ako treba promijeniti OU/servis, to je delete+create, ne update). Isti before/after `RoutingResolution` diff pattern kao `persistRoutingRuleChange` za create — reuse `buildRoutingChangeSnapshot`.
   - `routing.service.ts` — nova `deleteRule(ruleId, context)`: hard delete (potvrđeno sigurno, nema FK referenci na `RoutingRule.id`). Before/after diff: before = trenutna rezolucija (EXACT preko ovog pravila), after = rezolucija nakon brisanja (najvjerovatnije PARENT_FALLBACK ili UNROUTED) — isti diff-pattern, prikazuje admin-u tačno šta će se promijeniti prije potvrde.
   - Oba: `reason` obavezan (isti `requireChangeReason` mehanizam), isti guard nivo kao create (`admin` rola + `routingWrite` permission + OU/service scope).
   - `routing.controller.ts`: `PATCH /routing/rules/:ruleId`, `DELETE /routing/rules/:ruleId`.
   - Test: update mijenja grupu, ispravan diff zapisan; delete uklanja pravilo, naredna rezolucija za taj par pada na parent fallback/UNROUTED, ispravan diff zapisan.

2. **Backend — change log GET:**
   - Novi endpoint `GET /routing/rules/:ruleId/changes` (isti pattern kao SLA-ov `/sla/rules/:ruleId/changes` — pogledaj taj kod prije pisanja, reuse isti pristup/servisni sloj ako je moguće umjesto duple implementacije čitanja `changeLogEntityTypes.routingRule` zapisa).
   - Opciono ali preporučeno: `GET /routing/changes` (svi routing change-log zapisi, ne samo po pravilu) za prikaz na Change log tabu koji u referenci prikazuje kompletnu listu, ne po pojedinačnom pravilu — provjeri kako referenca prikazuje (globalna lista, ne per-rule) i uskladi endpoint dizajn s tim.
   - Test: endpoint vraća zapise sa reason + before/after diff, sortirano najnovije prvo.

3. **Frontend:**
   - `services/routing-api.ts` — `updateRoutingRule`, `deleteRoutingRule`, `listRoutingChanges` (ili `getRoutingRuleChanges`, uskladi sa backend odlukom iz koraka 2).
   - `routing-rules-table.tsx` — dodaj edit/delete akcije po redu (referenca ih nema jer je mock, ali "full funkcionalan routing" to zahtijeva — koristi isti vizuelni jezik kao dugmad edit/delete na drugim admin tabelama u aplikaciji, npr. Groups/Users iz ranijih faza, ne izmišljaj novi stil).
   - Edit forma: reuse `CreateRoutingRuleForm` strukturu (Select za originUnit — vjerovatno disabled na edit jer se ne mijenja, Select za servis — isto disabled, Select za grupu — editable, Textarea za reason obavezan) — napravi kao mod na postojeću formu (edit mode prop) umjesto duplog fajla ako razumno staje pod 150 linija, inače novi `edit-routing-rule-form.tsx`.
   - Delete: potvrda dijalog koji prikazuje before/after rezoluciju (isti podaci koje backend već računa) prije nego što se potvrdi — admin mora vidjeti "ovo pravilo će nakon brisanja pasti na: [fallback/UNROUTED]" prije klika.
   - Novi 4. tab **"Change log"** u `routing-page.tsx` (`History` ikona kao u referenci) — nova `routing-change-log-panel.tsx` komponenta (isti vizuelni pattern kao referenca: entity badge, ko/kad, reason italic, before/after tabela po polju).
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 2-4.
- Bez mock podataka.

**Verifikacija (obavezno prijavi rezultate):**
- Kreiraj pravilo → izmijeni grupu → obriši pravilo — sve kroz UI, sve upisuje change-log sa tačnim before/after.
- Delete potvrda jasno pokazuje kuda će tiketi pasti nakon brisanja, prije potvrde.
- Change log tab prikazuje kompletnu istoriju (create+update+delete), najnovije prvo.
- `npm run test`, `npm run build` (frontend); backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 1 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 2 dok se ne potvrdi.

---

## Faza 2 (P1) — `requireCoverage` enforcement

**Problem:** vidi nalaz #3. RAW eksplicitno traži da se ne može aktivirati servis/OU kombinacija bez routing pokrivenosti, bez upozorenja — trenutno nema nikakve provjere.

1. **Backend:**
   - Učitaj `private.ticket.routing.requireCoverage` u routing konfiguraciju (`routing-configuration.loader.ts`/`routing.types.ts`, ako već nije).
   - Odluči tačnu tačku provjere: najvjerovatnije servis-aktivacija (`service-catalog`/`service-onboarding` finalize korak, iz ranije R8/onboarding faze) treba pozvati `routingService.coverage()` ili sličnu provjeru prije nego dozvoli da servis pređe u `ACTIVE` lifecycle status. Ako je `requireCoverage=true` i servis nema nijedno routing pravilo (ni exact ni naslijeđeno za nijednu OU koja ga koristi) — blokiraj aktivaciju sa jasnom greškom.
   - Ako je `requireCoverage=false`, dozvoli aktivaciju ali (RAW: "upozorava ako servis nema routing coverage ili fallback") vrati **upozorenje** u odgovoru (ne grešku) da frontend može prikazati non-blocking banner.
   - Test: sa `requireCoverage=true`, aktivacija servisa bez routing pokrivenosti je blokirana; sa `false`, prolazi uz upozorenje u odgovoru.

2. **Frontend:**
   - Service onboarding wizard (iz ranije R8 faze, `components/services/onboarding/onboarding-routing-step.tsx` ili finalize korak) — prikaži blokirajuću grešku ili non-blocking upozorenje zavisno od backend odgovora iz koraka 1.
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija.
- Ne diraj Faze 1/3/4.
- Ne diraj ostatak service-onboarding logike van ove jedne provjere.

**Verifikacija:**
- `requireCoverage=true` blokira aktivaciju servisa bez pokrivenosti, sa jasnom porukom.
- `requireCoverage=false` dozvoljava uz vidljivo upozorenje.
- `npm run test`, `npm run build`; backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 2 stavku i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 3 dok se ne potvrdi.

---

## Faza 3 (P2) — Housekeeping: `fallbackGroupId` i `strictOuIsolation`

**Problem:** vidi nalaz #4, #5 — dva settings ključa koja se nigdje stvarno ne koriste u routing logici (isti tip nalaza kao SLA Faza 5).

1. **`fallbackGroupId` — odluka (obrazloži u handoff-u, ne pretpostavljaj):**
   - Preporuka: **deprecirati** ovaj ključ iz `private.ticket.routing.*` registry-ja. Razlog: i referenca i stvarna `resolve-ticket-routing.ts` logika namjerno tretiraju "bez pogotka" kao first-class `UNROUTED`, nikad proizvoljnu grupu — to je arhitektonski ispravnije (rupe su vidljive, ne skrivene, tačno kako referenca eksplicitno kaže). Uvođenje "fallback grupe" bi sakrilo rupe u pokrivenosti umjesto da ih pokaže u Matrici pokrivanja/coverage provjeri iz Faze 2.
   - Prije brisanja: potvrdi da ništa drugo (install-seed skripta) ne bi propalo — `ensure-install-seed-service.ts` ga koristi za nešto specifično install-time, provjeri da li se taj install-seed use-case može zadovoljiti drugačije (npr. direktno kreiranje prvog routing pravila u seed skripti umjesto settings-ključa) prije nego što ukloniš ključ.
   - Ako se ipak odluči da ključ ostane (npr. ako install-seed zavisnost nije trivijalno uklonjiva), jasno dokumentuj u kodu/komentaru da je ovo **install-time-only** koncept, nikad korišten u runtime rezoluciji, da se izbjegne buduća zabuna.

2. **`strictOuIsolation` — odluka:**
   - Provjeri da li `RequireOrganizationalUnitScope`/`RequireServiceScope` decoratori (već primijenjeni bezuslovno na routing endpointima) zaista uvijek enforce-uju OU izolaciju za sve role osim super admina (pogledaj implementaciju decoratora, ne pretpostavljaj iz imena).
   - Ako je enforcement već uvijek aktivan (najvjerovatnije) → ukloni settings ključ kao mrtav/redundantan, isti proces provjere reference kao za `fallbackGroupId` prije brisanja.
   - Ako enforcement NIJE uvijek aktivan i ključ zaista treba da ga uslovljava → implementiraj uslovnu logiku u decorator/guard.

3. Test za odabrano ponašanje u oba slučaja.

**Ograničenja:**
- Fajlovi ≤150 linija.
- Ne diraj Faze 1/2/4.
- Ne briši ključ ako bilo šta drugo (install seed, drugi modul) na njega i dalje oslanja bez zamjene — prijavi kao blokirajuće pitanje umjesto da tiho ostaviš slomljeno stanje.

**Verifikacija:**
- Odluke za oba ključa implementirane i testirane, obrazložene u handoff-u.
- `npm run test`.

**Obavezno:** čekiraj (`- [x]`) Faza 3 stavku i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 4 dok se ne potvrdi.

---

## Faza 4 (P1) — Finalno usklađivanje frontend UI-ja sa referencom

**Problem:** vidi nalaz #6 — objedinjuje rezultate Faza 1-3 u finalni, referenci identičan izgled sa 4 taba.

**Referenca:** `referenca-dizajn/src/pages/Routing.tsx` — otvori prvo.

1. **Tabovi:** potvrdi da `routing-page.tsx` ima tačno 4 taba istim redoslijedom kao referenca: Matrica pokrivanja → Test rezolucije → Pravila → Change log (4. tab iz Faze 1, sada se ugrađuje u glavnu navigaciju umjesto da bude privremeno odvojen).
2. **Matrica pokrivanja:** potvrdi vizuelni paritet sa referencom (E/N/× ćelije, hover tooltip sa grupom i OU putanjom, legend). Ako je Faza 2 dodala coverage-warning koncept, razmotri da li matrica treba dodatnu vizuelnu oznaku za "servis nema routing coverage uopšte" (ako je to smisleno razlikovati od pojedinačne ćelije — objasni odluku).
3. **Test rezolucije:** potvrdi paritet (fallback path chips, JSON blok odgovora, audit polja).
4. **Pravila:** ugradi edit/delete akcije iz Faze 1 u tabelu (referenca ih nema, mi ih moramo imati — "full funkcionalan" nadilazi referencu ovdje, eksplicitno po zahtjevu).
5. **Change log:** ugradi `routing-change-log-panel.tsx` iz Faze 1 kao 4. tab, vizuelno usklađen sa referencom (badge entitet, ko/kad, reason italic, before/after tabela).
6. Svi select-ovi na formama (create + novi edit iz Faze 1) — potvrdi da koriste `Select` komponentu dosljedno (create formu smo već potvrdili da je ispravna — samo potvrdi da edit forma iz Faze 1 prati isti pattern).
7. Settings ključevi iz Faze 3 — ako je bilo šta od njih ostalo kao aktivan, vidljiv koncept (nije deprecirano), potvrdi da UI to negdje odražava (npr. coverage upozorenje iz Faze 2 vidljivo na Matrici ili u service-onboarding wizardu, ne samo u API odgovoru).
8. BS + EN i18n za sve novo iz Faza 1-3 koje još nije dobilo tekst.

**Ograničenja:**
- Ne diraj backend — sve što treba već je izgrađeno u Fazama 1-3.
- Fajlovi ≤150 linija gdje god je razumno.

**Verifikacija:**
- Vizuelno poređenje sa `referenca-dizajn/src/pages/Routing.tsx`, uz eksplicitnu napomenu gdje se svjesno odstupa (edit/delete akcije — nadilazi referencu po zahtjevu).
- Sve funkcionalnosti iz Faza 1-3 vidljive i upotrebljive u finalnom UI-ju.
- Desktop 1440 + mobile 390.
- `npm run test`, `npm run build`.

**Obavezno:** čekiraj (`- [x]`) Faza 4 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ovo je posljednja faza — na kraju potvrdi da li je cijeli plan (Faze 1-4) zatvoren, i naznači `PriorityMatrixRule` nalaz (van scope-a, ostaje orphan — config-versioning apply mu je jedini pisac, nema admin CRUD/UI nigdje) kao otvorenu tačku za buduću, posebnu odluku van ovog plana.
