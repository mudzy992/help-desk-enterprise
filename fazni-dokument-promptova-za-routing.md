# fazni-dokument-promptova-za-routing.md

Svaki blok ispod je samostalan prompt za jednu fazu iz `ROUTING_PHASE_PLAN.md`. Isti princip kao za SLA: pošalješ agentu "Postupi po promptu za Fazu N iz dokumenta @fazni-dokument-promptova-za-routing.md".

---

## Faza 1

Radiš na `help-desk-enterprise-master` projektu. Postupi po **Fazi 1** iz `ROUTING_PHASE_PLAN.md`. Scope: isključivo puni CRUD za routing pravila + change log — backend `modules/routing`, frontend `pages/routing-page.tsx` + `components/routing/*`. Ne diraj Faze 2-4.

## Kontekst — potvrđen kritičan nalaz

`RoutingController`/`RoutingService` trenutno podržavaju **samo kreiranje** pravila (`POST /routing/rules`). Nema update, nema delete. `RoutingRule` ima `@@unique([originUnitId, serviceId])` — jednom kreirano pravilo za taj par se ne može nikad izmijeniti ni ukloniti kroz aplikaciju. Potvrđeno da hard delete ne ugrožava integritet (ništa drugo ne referencira `RoutingRule.id` kao FK).

Drugi nalaz: `persist-routing-rule-change.ts` **već piše** change-log zapis pri kreiranju — elegantno, before/after je puna `RoutingResolution` prije/poslije (ne sirovi field diff) — ali ne postoji nijedan `GET` endpoint da se ti zapisi pročitaju. Frontend nema "Change log" tab uopšte (referenca ima 4 taba, trenutno postoje 3).

## Zadaci

1. **Backend — update/delete:**
   - `routing.service.ts` — nova `updateRule(ruleId, input, context)`: mijenja `groupId` postojećeg pravila (originUnit+service se ne mijenjaju — to bi bilo novo pravilo). Isti before/after `RoutingResolution` diff pattern kao create — reuse `buildRoutingChangeSnapshot`/`persistRoutingRuleChange` strukturu (napravi analogni `persistRoutingRuleUpdate` ili proširi postojeću funkciju, tvoj izbor, objasni u handoff-u).
   - `routing.service.ts` — nova `deleteRule(ruleId, context)`: hard delete. Before/after diff: before = trenutna EXACT rezolucija preko ovog pravila, after = rezolucija nakon brisanja (parent fallback ili UNROUTED).
   - Oba: `reason` obavezan (reuse `requireChangeReason`), isti guard nivo kao create (`admin` rola + `routingWrite` permission + `RequireOrganizationalUnitScope`/`RequireServiceScope`).
   - `routing.controller.ts`: `PATCH /routing/rules/:ruleId`, `DELETE /routing/rules/:ruleId`.
   - Test: update mijenja grupu sa ispravnim diff-om; delete uklanja pravilo, naredna rezolucija pada na parent fallback/UNROUTED, ispravan diff.

2. **Backend — change log GET:**
   - Otvori prvo SLA-ov ekvivalentni endpoint (`/sla/rules/:ruleId/changes` u `sla-rules.controller.ts`/servisu) kao referencu za pattern — reuse isti pristup umjesto duple implementacije čitanja `changeLogEntityTypes.routingRule` zapisa ako je moguće (npr. zajednička generic funkcija u `change-log` modulu za "listaj po entityType+entityId").
   - Novi endpoint `GET /routing/rules/:ruleId/changes`.
   - Dodatno: `GET /routing/changes` (svi routing change-log zapisi globalno) — provjeri kako referentni dizajn (`referenca-dizajn/src/pages/Routing.tsx`, `ChangeLogView`) prikazuje podatke (globalna lista, ne po pravilu) i uskladi endpoint dizajn s tim.
   - Test: endpoint vraća reason + before/after diff, sortirano najnovije prvo.

3. **Frontend:**
   - `services/routing-api.ts` — `updateRoutingRule`, `deleteRoutingRule`, `listRoutingChanges`.
   - `routing-rules-table.tsx` — edit/delete akcije po redu, isti vizuelni jezik kao ekvivalentne akcije na Groups/Users admin tabelama (ne izmišljaj novi stil).
   - Edit forma: reuse `CreateRoutingRuleForm` strukturu u edit-mode-u (originUnit/servis vjerovatno disabled, grupa editable preko `Select`, reason obavezan `Textarea`) — mod na postojeću formu ako staje pod 150 linija, inače novi fajl.
   - Delete: potvrda dijalog koji **prije** potvrde prikazuje kuda će tiketi pasti nakon brisanja (backend to već računa u before/after diff-u — iskoristi taj podatak, ne izmišljaj novi poziv).
   - Novi 4. tab "Change log" u `routing-page.tsx` (`History` ikona, kao referenca) — nova `routing-change-log-panel.tsx`, vizuelni pattern kao SLA-ov `sla-change-log-panel.tsx` i referentni `ChangeLogView` (entity badge, ko/kad, reason italic, before/after tabela po polju).
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija gdje god je razumno.
- Ne diraj Faze 2-4.
- Bez mock podataka.

**Verifikacija (obavezno prijavi rezultate):**
- Kreiraj → izmijeni grupu → obriši pravilo, sve kroz UI, sve upisuje change-log sa tačnim before/after diff-om.
- Delete potvrda jasno pokazuje ishod prije klika.
- Change log tab prikazuje kompletnu istoriju (create+update+delete), najnovije prvo.
- `npm run test`, `npm run build` (frontend); backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 1 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 2 dok se ne potvrdi.

---

## Faza 2

Radiš na `help-desk-enterprise-master` projektu. Prethodna faza (1 — CRUD + change log) je završena. Postupi po **Fazi 2** iz `ROUTING_PHASE_PLAN.md`. Scope: `requireCoverage` enforcement — backend `modules/routing` + `service-catalog`/`service-onboarding` (samo tačka aktivacije servisa), frontend onboarding wizard warning. Ne diraj Faze 1/3/4.

## Problem (potvrđen)

`private.ticket.routing.requireCoverage` je definisan settings ključ ("blokiraj aktivaciju servisa/OU ako nema routing pravila") ali se **nigdje ne koristi**. RAW eksplicitno traži ovu provjeru (routing coverage check pri aktivaciji servisa, upozorenje u onboarding wizardu ako nema pokrivenosti ili fallback-a). Trenutno servis može postati `ACTIVE` bez ijednog routing pravila, bez ikakvog upozorenja.

## Zadatak

1. **Backend:**
   - Učitaj `requireCoverage` u routing konfiguraciju (`routing-configuration.loader.ts`/`routing.types.ts`) ako već nije.
   - Pronađi tačnu tačku gdje servis prelazi u `ACTIVE` lifecycle status (`service-catalog`/`service-onboarding` finalize korak iz ranije R8 faze) i pozovi routing coverage provjeru (reuse `routingService.coverage()` ili sličnu, ne piši duplu logiku) prije potvrde aktivacije.
   - Ako `requireCoverage=true` i servis nema nijedno routing pravilo (ni exact ni naslijeđeno preko OU koje ga koriste) → blokiraj aktivaciju, jasna greška (npr. `ROUTING_COVERAGE_MISSING`).
   - Ako `requireCoverage=false` → dozvoli, ali vrati upozorenje u odgovoru (ne grešku) da frontend može prikazati non-blocking banner.
   - Test: oba scenarija (`true` blokira, `false` upozorava i prolazi).

2. **Frontend:**
   - `components/services/onboarding/onboarding-routing-step.tsx` (ili finalize korak wizarda, provjeri tačno mjesto) — prikaži blokirajuću grešku ili non-blocking upozorenje zavisno od backend odgovora.
   - BS + EN i18n.

**Ograničenja:**
- Fajlovi ≤150 linija.
- Ne diraj Faze 1/3/4, ne diraj ostatak service-onboarding logike van ove jedne provjere.
- Bez mock podataka.

**Verifikacija (obavezno prijavi rezultate):**
- `requireCoverage=true` blokira aktivaciju servisa bez pokrivenosti, jasna poruka.
- `requireCoverage=false` dozvoljava uz vidljivo upozorenje u wizardu.
- `npm run test`, `npm run build`; backend testovi.

**Obavezno:** čekiraj (`- [x]`) Faza 2 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 3 dok se ne potvrdi.

---

## Faza 3

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1-2) su završene. Postupi po **Fazi 3** iz `ROUTING_PHASE_PLAN.md`. Scope: housekeeping dva mrtva settings ključa (`fallbackGroupId`, `strictOuIsolation`). Mali zadatak. Ne diraj Faze 1/2/4.

## Problem (potvrđen)

- `private.ticket.routing.fallbackGroupId` — koristi se **samo** u `ensure-install-seed-service.ts` (install-time seed), **nikad** u `resolve-ticket-routing.ts`. I referenca i stvarna logika namjerno tretiraju "bez pogotka" kao first-class `UNROUTED`, nikad proizvoljnu grupu.
- `private.routing.strictOuIsolation` — nigdje se ne koristi. `RequireOrganizationalUnitScope`/`RequireServiceScope` decoratori na routing endpointima su bezuslovni.

## Zadatak

1. **`fallbackGroupId` — odluka i implementacija:**
   - Preporuka: deprecirati ključ. Razlog: sakrio bi rupe u pokrivenosti umjesto da ih pokaže (suprotno referenci: "rupe su vidljive, ne skrivene", i suprotno Fazi 2 koja upravo gradi vidljivu coverage provjeru).
   - **Prije brisanja**, provjeri `ensure-install-seed-service.ts` — da li se install-time potreba za ovim ključem može zadovoljiti drugačije (npr. direktno kreiranje prvog routing pravila u seed skripti, ne preko settings-ključa). Ako da, prebaci na taj pristup pa ukloni ključ. Ako install-seed zavisnost nije trivijalno uklonjiva bez šireg zahvata, **ne briši ključ** — umjesto toga jasno dokumentuj u kodu (komentar uz definiciju ključa) da je ovo install-time-only koncept, nikad korišten u runtime rezoluciji, i prijavi to kao otvorenu tačku u handoff-u.

2. **`strictOuIsolation` — odluka i implementacija:**
   - Pregledaj implementaciju `RequireOrganizationalUnitScope`/`RequireServiceScope` decoratora — potvrdi da li zaista uvijek enforce-uju OU izolaciju za sve role osim super admina (ne pretpostavljaj iz imena decoratora).
   - Ako je enforcement već uvijek aktivan → ukloni settings ključ kao redundantan (ista provjera prije brisanja kao za `fallbackGroupId` — potvrdi da ništa drugo na njega ne referencira).
   - Ako NIJE uvijek aktivan i ključ treba da ga stvarno uslovljava → implementiraj uslovnu logiku u decorator/guard.

3. Test za odabrano ponašanje u oba slučaja.

**Ograničenja:**
- Fajlovi ≤150 linija.
- Ne diraj Faze 1/2/4.
- Ne briši nijedan ključ ako nešto drugo na njega još oslanja bez zamjene — prijavi kao blokirajuće pitanje.

**Verifikacija (obavezno prijavi rezultate):**
- Odluke za oba ključa implementirane, testirane, obrazložene.
- `npm run test`.

**Obavezno:** čekiraj (`- [x]`) Faza 3 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ne prelazi na Fazu 4 dok se ne potvrdi.

---

## Faza 4

Radiš na `help-desk-enterprise-master` projektu. Prethodne faze (1-3) su završene — sve funkcionalnosti koje ova faza treba da prikaže (CRUD, change log, coverage upozorenje) su izgrađene. Postupi po **Fazi 4** iz `ROUTING_PHASE_PLAN.md`. Scope: isključivo frontend, `pages/routing-page.tsx` + `components/routing/*`. Ovo je posljednja faza Routing plana.

## Zadatak — finalno usklađivanje sa referencom

Otvori prvo `referenca-dizajn/src/pages/Routing.tsx`.

1. **Tabovi:** `routing-page.tsx` mora imati tačno 4 taba, istim redoslijedom kao referenca: Matrica pokrivanja → Test rezolucije → Pravila → Change log (4. tab iz Faze 1 sada ulazi u glavnu navigaciju, uklanja se privremeni/odvojeni pristup ako je postojao).
2. **Matrica pokrivanja:** potvrdi vizuelni paritet (E/N/× ćelije, hover tooltip sa grupom i OU putanjom, legenda). Ako smatraš da matrica treba dodatnu vizuelnu oznaku za "servis bez ijednog routing pravila uopšte" (povezano sa Faza 2 coverage konceptom) — razmotri i objasni odluku u handoff-u, ne mijenjaj bez obrazloženja.
3. **Test rezolucije:** potvrdi paritet (fallback path chips, JSON blok odgovora, audit polja) — ovo je već blizu kompletno, samo provjeri sitne detalje (npr. tačan format JSON prikaza).
4. **Pravila:** ugradi edit/delete akcije iz Faze 1 u tabelu — referenca ih nema (mock je pojednostavljen), ali "full funkcionalan routing" to eksplicitno zahtijeva, ovo je namjerno odstupanje od reference, ne greška.
5. **Change log:** ugradi `routing-change-log-panel.tsx` iz Faze 1 kao 4. tab, vizuelno usklađen sa referentnim `ChangeLogView` (entity badge, ko/kad, reason italic, before/after tabela po polju).
6. Potvrdi da svi select-ovi na formama (create + edit) koriste `Select` komponentu dosljedno.
7. Ako je iz Faze 3 bilo koji settings koncept ostao aktivan (nije deprecirano), potvrdi da se to negdje vidljivo odražava u UI-ju (npr. coverage upozorenje iz Faze 2 na Matrici ili u onboarding wizardu).
8. BS + EN i18n za sve iz Faza 1-3 što još nije dobilo tekst.

**Ograničenja:**
- Ne diraj backend — sve što treba je izgrađeno u Fazama 1-3.
- Fajlovi ≤150 linija gdje god je razumno.

**Verifikacija (obavezno prijavi rezultate):**
- Vizuelno poređenje sa `referenca-dizajn/src/pages/Routing.tsx`, eksplicitna napomena gdje se svjesno odstupa (edit/delete akcije).
- Sve funkcionalnosti iz Faza 1-3 vidljive i upotrebljive u finalnom UI-ju.
- Desktop 1440 + mobile 390.
- `npm run test`, `npm run build`.

**Obavezno:** čekiraj (`- [x]`) Faza 4 stavku u `ROUTING_PHASE_PLAN.md` i pošalji ažuriranu sekciju nazad. Ovo je posljednja faza — na kraju potvrdi da li je cijeli plan (Faze 1-4) zatvoren, i eksplicitno navedi `PriorityMatrixRule` nalaz (van scope-a ovog plana — orphan model, jedini pisac je config-versioning apply, nema admin CRUD/UI nigdje) kao otvorenu tačku za buduću, posebnu odluku.
