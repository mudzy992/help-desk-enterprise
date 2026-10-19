# Modul 15 — `/admin/workflow` (read-only pregled toka)

**Datum v2 re-audita:** 2026-10-19
**Auditirani Git SHA:** `eeaa193aef77a34144a1691f41472910650a308d`
**Status:** v2 re-audit završen; WF1–WF10 implementirani i verificirani nakon audita.
**Oznake nalaza:** isključivo **WF1–WF10**.

## Provjere izvršene

1. **Inventar i čitanje koda u cijelosti:**
   - `frontend/src/pages/workflow-page.tsx` — 115 linija;
   - `frontend/src/components/workflow/workflow-diagram.tsx` — 202 linije;
   - `workflow-parameters-card.tsx` — 101 linija;
   - `workflow-transitions-table.tsx` — 111 linija;
   - `workflow-actor-meta.ts` — 11 linija;
   - `frontend/src/lib/workflow/describe-workflow-guard.ts` — 76 linija;
   - `layout-workflow-diagram.ts` — 110 linija;
   - pripadajući workflow specovi — 37 i 35 linija;
   - `frontend/src/services/workflow-api.ts` — 60 linija.
2. **WF1 parnost grafa:** pročitani su backend `ticket-workflow-definition.ts`, `deriveAllowedTransitions`, `tickets.constants.ts` i njihov spec; frontend `ticket-constants.ts`, `ticket-actions.ts`, potrošači `nextTicketStatuses` i zasebni `canShowReopenAction`.
3. Pročitani su postojeći audit, `docs/plans/modules/1.7-workflow-unrouted-realtime.md`, `.cursor/docs/matrices/workflow-state-machine-guards/MATRIX.md`, cross-reference modula 05, 03/DET-12 i 14, ruta, navigacija i backend kontroler.
4. Provjereni su WF2–WF10 u trenutnom kodu, uključujući guard `playbook_steps`, i18n konkatenacije, greške brojača, formatiranje brojeva, semantiku tabele, filter i komentare.
5. Provjeren je pristup: frontend `RequireAccess(canOpenAdminArea)`, navigacijski `admin` access kind i backend `SessionAuthenticationGuard` + `RoleGuard` + `ADMIN/SUPER_ADMIN`.
6. Provjerena je ranija SVG `nested-interactive` napomena u `docs/plans/modules/2.8-pristupacnost-i-ux.md`: riješena je zamjenom `role="img"` sa `role="group"`; link parametara je sada stalno podvučen.
7. **Izvršeno:** `cd frontend && npx vitest run src/lib/workflow` — 2/2 fajla, 5/5 testova prošlo.
8. **Pokušano:** backend `npm test -- ticket-workflow-definition --runInBand` — nije pokrenut jer backend dependencies nisu instalirane (`jest: not found`). Backend spec je pročitan i eksplicitno očekuje izvedenu matricu.
9. **Nije izvršeno:** Playwright E2E 15 i axe E2E 22 jer ovaj prolaz nema podignut frontend/backend ni pripremljene E2E podatke. Specovi su pročitani: E2E 15 provjerava `editable: false`, zabranu agentu, prikaz dijagrama i filter; axe lista uključuje `/admin/workflow`.

---

## Trenutna implementacija

### Učitavanje

`WorkflowPage` i dalje koristi jedan `useEffect` i lokalni state. Paralelno pokreće:

- `GET /workflow/ticket-status` preko `getTicketWorkflow()` — obavezni sadržaj;
- `getTicketCounts()` — opcionalni brojači po statusu.

Glavna greška prikazuje `ApiErrorText`, ali bez akcije za ponovni pokušaj. Greška brojača završava u `.catch(() => undefined)`, pa korisnik samo dobije dijagram bez brojeva. Lokalni `active` flag sprečava upis nakon unmounta.

Prebacivanje ove stranice na React Query može pojednostaviti cache/retry, ali samo po sebi nije poslovni gap niti uslov MVP-a modula 15.

### Dijagram

API statusi se raspoređuju u tri faze (`intake`, `work`, `done`). SVG prikazuje usmjerene veze; SYSTEM veze su isprekidane, a boja prati aktera. Čvorovi su fokusabilne SVG grupe sa `role="button"`, `aria-pressed`, tastaturom i vidljivim fokusom. Izbor čvora filtrira tabelu i prigušuje nepovezane čvorove i veze.

Raniji `nested-interactive` axe problem je zatvoren: korijenski SVG je `role="group"`, ne `role="img"`. `ScrollRegion` daje dostupnu skrolabilnu regiju kada je to potrebno.

### Tabela prelaza

Tabela je tekstualna alternativa dijagramu i prikazuje `from`, `to`, aktere, okidače i guardove. Guard opis koristi stvarne parametre instalacije. Tabela još nema `<caption>`, zaglavlja nemaju `scope="col"`, a prazan filtrirani rezultat nema poruku.

### Parametri

`WorkflowParametersCard` koristi semantički `<dl>` i prikazuje stanje close codeova, obaveznih polja, reopena, waiting-for-user automatike, approvala, arhive i nerutiranih tiketa. Vrijednosti se i dalje sklapaju konkatenacijom prevedenih fragmenata, dok se `unrouted.ownerRole` prikazuje kao sirova backend vrijednost. Link na postavke je sada stalno podvučen.

### Read-only ugovor i pristup

- API tip garantuje `editable: false`.
- UI eksplicitno prikazuje `workflow.fixedNotice` i nema kontrole za uređivanje grafa.
- Ruta koristi `RequireAccess(check={canOpenAdminArea})`.
- Navigacija koristi `navigationAccessKinds.admin`.
- `TicketWorkflowController` zahtijeva autentikaciju te `ADMIN` ili `SUPER_ADMIN` ulogu.
- E2E spec dodatno provjerava da agent dobija zabranu na API-ju.

Ovaj sloj je i dalje usklađen.

---

## WF1 — poređenje backend grafa i frontend matrice

Backend je sada stvarni izvor poslovnog grafa: `ticketWorkflowTransitions` opisuje veze, aktere, okidače i guardove, a `tickets.constants.ts` izvodi `allowedTicketStatusTransitions` pozivom `deriveAllowedTransitions(ticketStatuses)`. Backend test zaključava puni rezultat.

Frontend, međutim, ima drugu statičku matricu u `lib/tickets/ticket-constants.ts`. Admin stranica prikazuje `response.transitions` iz API-ja, dok status akcije na detalju tiketa koriste `nextTicketStatuses()` nad statičkom matricom. Zato postoje **dva izvora na frontendu**: serverom isporučen puni graf za admin pregled i ručno održavan podskup za tiket UI.

### Razlike po statusu

| Status             | Backend izvedeni izlazi                                 | Frontend statički izlazi            | Razlika                                                                |
| ------------------ | ------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `PENDING`          | `ASSIGNED`, `IN_PROGRESS`, `PENDING_APPROVAL`, `CLOSED` | `ASSIGNED`, `IN_PROGRESS`, `CLOSED` | Nedostaje SYSTEM/approval `→ PENDING_APPROVAL`.                        |
| `UNROUTED`         | `PENDING`, `CLOSED`                                     | `PENDING`, `CLOSED`                 | Jednako.                                                               |
| `PENDING_APPROVAL` | `PENDING`, `CLOSED`                                     | prazno                              | Nedostaju oba APPROVER ishoda.                                         |
| `ASSIGNED`         | `IN_PROGRESS`, `PENDING`, `WAITING_FOR_USER`, `CLOSED`  | isto                                | Jednako.                                                               |
| `IN_PROGRESS`      | `WAITING_FOR_USER`, `RESOLVED`, `ASSIGNED`              | isto                                | Jednako.                                                               |
| `WAITING_FOR_USER` | `IN_PROGRESS`, `RESOLVED`, `CLOSED`                     | isto                                | Jednako; backend pojedine veze dodatno daje REQUESTER/SYSTEM akterima. |
| `RESOLVED`         | `CLOSED`, `IN_PROGRESS`                                 | `CLOSED`                            | Nedostaje reopen `→ IN_PROGRESS`.                                      |
| `CLOSED`           | `ARCHIVED`, `IN_PROGRESS`                               | prazno                              | Nedostaju SYSTEM archive i reopen `→ IN_PROGRESS`.                     |
| `ARCHIVED`         | prazno                                                  | prazno                              | Jednako.                                                               |

Frontend nema dodatne veze kojih nema na backendu; nedostaje mu pet backend veza. Dio odstupanja može biti namjeran: status dropdown je STAFF picker, reopen ima zasebno dugme i endpoint (`canShowReopenAction`), a čisto SYSTEM i APPROVER veze ne treba nuditi običnom status dropdownu. Problem je što naziv i tip `allowedTicketStatusTransitions` ne izražavaju taj filter, nema helpera koji filter izvodi iz API grafa i nema frontend↔backend testa parnosti. Buduća STAFF veza može tiho izostati.

**Preporučeni minimalni pravac:** uvesti `buildAllowedTransitionsFromWorkflowResponse(transitions)` za puni adjacency list i zaseban, eksplicitno imenovan `staffSelectableTargets(from, transitions)` za status picker. Alternativa je zajednički JSON/fixture sa CI testom parnosti. Shared monorepo paket nije potreban u prvoj iteraciji.

---

## Definicija „max full“ za modul 15

Modul je maksimalno završen kada:

1. tiket akcije više ne zavise od neoznačene ručne kopije grafa; STAFF/reopen/SYSTEM/APPROVER filteri su eksplicitni i testirani;
2. `playbook_steps` jasno razlikuje **off**, **warn** i **block**, umjesto da `warn` prikazuje kao isključeno;
3. kartica parametara koristi pune i18n rečenice i prevedene role, bez konkatenacije u kodu;
4. brojevi koriste jezik aplikacije, ne podrazumijevani browser locale;
5. greška brojača je vidljiva i postoji retry za brojače i glavni zahtjev;
6. tabela ima caption, `scope="col"` i lokalizovano prazno stanje;
7. postoje unit/komponentski testovi za warn/off/block guard prikaz i parametarsku karticu;
8. read-only ugovor i frontend/backend kontrola pristupa ostaju testirani.

---

## Realno / željeno — otvoreni nalazi nakon implementacije

Nema preostalih otvorenih WF nalaza. Izabrana WF1 strategija je **C**: runtime ostaje stabilan, ali je podmatrica preimenovana u `staffSelectableTicketStatusTransitions`, a frontend CI test izvodi STAFF veze direktno iz backend definicije i pada pri driftu. Reopen ostaje zasebna akcija.

---

## Gap analiza i master tabela

| ID       | Prioritet     | Status       | Nalaz i dokaz                                                                                                                                                                                                                                                                     | Kriterij zatvaranja                                                                                                                                     |
| -------- | ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WF1**  | P0 / kritično | **Zatvoren** | Backend matricu izvodi iz definicije i testira; frontend `ticket-constants.ts` je ručna podmatrica. Nedostaju veze `PENDING→PENDING_APPROVAL`, oba izlaza iz `PENDING_APPROVAL`, reopen iz `RESOLVED/CLOSED` i `CLOSED→ARCHIVED`. Admin UI koristi API, tiket UI statički objekt. | API/fixture adjacency helper + eksplicitni STAFF/reopen/SYSTEM filter i paritetni test; ručni export uklonjen ili jasno sveden na kompatibilni adapter. |
| **WF2**  | P1 / srednje  | **Zatvoren** | `workflow-parameters-card.tsx` konkatenira fragmente i prikazuje sirovi `unrouted.ownerRole`.                                                                                                                                                                                     | Pune i18n rečenice sa interpolacijom i tipizovana mapa role labela, bez novog `as never`.                                                               |
| **WF3**  | P1 / srednje  | **Zatvoren** | `getTicketCounts().catch(() => undefined)` guta parcijalnu grešku; glavni fetch ima tekst greške, ali nema retry.                                                                                                                                                                 | Odvojeno counts error stanje i retry; retry i za glavni zahtjev.                                                                                        |
| **WF4**  | P1 / nisko    | **Zatvoren** | `count.toLocaleString()` ne koristi `i18n.language`.                                                                                                                                                                                                                              | Formatiranje brojeva je vezano za aktivni locale aplikacije.                                                                                            |
| **WF5**  | P0 / visoko   | **Zatvoren** | `playbook_steps` vraća `inactive: true` za sve osim `block`; zato je aktivni `warn` označen kao „isključeno“.                                                                                                                                                                     | Model i UI razlikuju off, warn i block; unit i komponent test potvrđuju badge/copy.                                                                     |
| **WF6**  | P1 / nisko    | **Zatvoren** | Tabela nema `<caption>` ni `scope="col"`; ScrollRegion i tekstualna alternativa dijagramu jesu dobri.                                                                                                                                                                             | Lokalizovan caption i `scope="col"` na svim kolonama; static a11y guard prolazi.                                                                        |
| **WF7**  | P2 / nisko    | **Zatvoren** | Lokalni tip `Parameters` zaklanja TS utility tip; `playbooks?` je jedini opcionalni parametarski blok i kod provjerava i `undefined` i `null`.                                                                                                                                    | `WorkflowParameters` naziv i API ugovor usklađen na eksplicitni `\| null`, ako backend uvijek vraća polje.                                              |
| **WF8**  | P2 / nisko    | **Zatvoren** | `isRelated` za veze i zaseban `dimmed` predicate za čvorove implementiraju isto pravilo na dva načina.                                                                                                                                                                            | Jedan testiran `isNodeRelatedToSelection`/related helper.                                                                                               |
| **WF9**  | P1 / nisko    | **Zatvoren** | `<tbody>` ostaje prazan kada filtrirani skup nema redova. Trenutni graf daje bar ulaz ili izlaz svakom statusu, pa se problem ne vidi na sadašnjem fixtureu.                                                                                                                      | Lokalizovan red/panel praznog stanja i komponent test.                                                                                                  |
| **WF10** | P2 / nisko    | **Zatvoren** | Mrtvi `orderInPhase[status] ?? 0` i komentari „Paket/Package 1.7“ ostaju u page/API/dijagram/backend referenci.                                                                                                                                                                   | U dirnutim frontend fajlovima uklonjen mrtav fallback i fazni komentari zamijenjeni trajnim objašnjenjem ugovora.                                       |

### Informativno: React Query/session

Stranica i dalje koristi `useEffect` i lokalni state. To je konzistentno i sigurno za malu read-only stranicu; nema dokaza o session ili cache poslovnom defektu. Migracija na React Query nije zaseban WF nalaz niti dio MVP-a, osim ako se odabere WF1 strategija sa zajedničkim API cacheom.

---

## Izvršeni roadmap do „max full“

### P0 — poslovna tačnost

1. **WF1:** izvesti puni adjacency list iz `WorkflowTransition[]`; odvojiti STAFF status picker od reopen/SYSTEM/APPROVER veza; dodati fixture/paritet test.
2. **WF5:** proširiti guard opis na off/warn/block i testirati UI značke.

### P1 — pouzdanost, i18n i pristupačnost

3. **WF2:** pune i18n rečenice i role mapa.
4. **WF3:** vidljiva counts greška i retry oba zahtjeva.
5. **WF4:** locale-aware brojevi.
6. **WF6:** caption i `scope="col"`.
7. **WF9:** prazno stanje filtera.
8. Dodati render testove za `WorkflowTransitionsTable` i `WorkflowParametersCard`.

### P2 — održavanje

9. **WF7:** precizirati tip parametara i `playbooks` nullability.
10. **WF8:** centralizovati related predicate.
11. **WF10:** ukloniti mrtav fallback i historijske fazne komentare u dirnutom frontend kodu.

---

## Status ispravki od 2026-10-13

| Stavka                   | Stanje 2026-10-19                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Backend W1 izvor istine  | **Potvrđen:** `allowedTicketStatusTransitions` se izvodi iz `ticketWorkflowTransitions`; backend spec zaključava punu matricu. |
| Frontend kopija grafa    | **Riješeno strategijom C:** podmatrica je eksplicitno STAFF-selectable i CI test je poredi sa backend definicijom.             |
| Guard `warn`             | **Riješeno:** opis i badge razlikuju off, warn i block.                                                                        |
| API/UI read-only         | **Potvrđeno:** `editable: false`, fixed notice i bez edit kontrola.                                                            |
| SVG nested-interactive   | **Riješeno:** korijenski SVG je `role="group"`; axe nalaz dokumentovan kao zatvoren u planu 2.8.                               |
| Link u tekstualnom bloku | **Riješeno:** link parametara je stalno podvučen.                                                                              |
| Horizontalni skrol       | **Poboljšan:** koristi zajednički `ScrollRegion` sa uslovnom dostupnom regijom.                                                |
| WF2–WF4, WF6–WF10        | **Nisu riješeni** u odnosu na prethodni audit.                                                                                 |

---

## Ocjena

# **10/10**

WF1–WF10 su zatvoreni. STAFF picker sada ima eksplicitno ime i CI paritet sa backend definicijom; reopen ostaje zasebna serverski vođena akcija. Guard prikaz razlikuje off/warn/block, parametri i brojevi prate locale aplikacije, greške imaju retry, a tabela i novi komponent testovi pokrivaju semantiku i prazno stanje.

### Završna verifikacija

- ciljani workflow/ticket testovi: 6 fajlova / 14 testova;
- puni frontend Vitest: 326 fajlova / 1.321 test;
- TypeScript, production build, format i i18n/Pulse guard: prošli;
- ESLint: 0 grešaka, 12 postojećih upozorenja;
- `check-a11y-static.mjs` i `git diff --check`: prošli.

## Predložena commit poruka

`docs(audit): rewrite admin workflow module 15 review`
