# Package closeout — W7.39

**Paket:** W7.39 — vidljivi `hasMore` ugovor za ograničene liste problema<br>
**Nalaz:** `BA-problems-17` (P3) — **zatvoren**<br>
**Kodni commit:** `6033b9c` (ugovor + UI), `5b3d3d2` (tip testa), `202153c` (defanzivno čitanje flagova)<br>
**Finalni testani SHA:** `202153c`<br>
**CI:** [`44315048317`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44315048317) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Problem je nudio pet „prozora“ i nijedan nije rekao da je prozor: događaji 200, povezani ticketi 500,
linkovi 200 po sekciji, reverse kartica asseta/incidenta 50 i svaki birač 2.000. Najgore od svega,
`listForProblem.total` je bio **dužina skraćenog niza**, pa je mogao tvrditi ukupno 500.

Acceptance: (1) svaka lista kaže da li je skraćena, (2) brojevi uz listu su stvarni ili ih nema,
(3) UI to kaže na svakom mjestu gdje se lista prikazuje, (4) nema tihog gubitka zapisa.

## Implementacija

- **Dokazano, ne pretpostavljeno:** svaka lista se čita sa `limit + 1` redom i vraća `hasMore`; skraćivanje
  je činjenica iz podataka, ne nagađanje iz dužine niza. Limiti su imenovani u `problemLimits`
  (`eventListMax`, `linkedTicketListMax`, `linkListMax`, `reverseListMax`, `optionsMax`).
- **Ticketi:** `total` i `open` se **broje** (`count` sa istim `where`, uključujući ticket-visibility
  predikat), pa `total` više nije dužina prozora; `hasMore` je `total > limit`.
- **Događaji:** skeniranje ide dalje od prozora dok ne nađe **jedan vidljivi** događaj više (nevidljivi ne
  smiju trošiti prozor) ili ne dokaže da su redovi potrošeni; rad je ograničen sa `eventScanMax` (5.000
  redova). Ako se skeniranje zaustavi na tom limitu, flag ostaje konzervativan — radije „možda ima još“
  nego skriven zapis.
- **Linkovi i birači:** `hasMore` je **po kolekciji** (`assets/services/incidents`, `units/services/groups`),
  jer čitaocu treba „koja je lista skraćena“, ne jedan zbirni flag. Rani izlazi (nema pristupa, nema
  modula) vraćaju isti oblik sa `hasMore: false`.
- **UI:** jedan zajednički `ListTruncationNote` ispod vremenske linije, tabele tiketa (sa stvarnim
  ukupnim brojem), svake skraćene sekcije taba „Veze“, kartice asseta i incidenta, te u formi
  create/edit kada je birač skraćen. Copy je u bs/en (`problems.lists.*`).
- **Nije obuhvaćeno:** kandidati notifikacija (`take: 2000`) nisu lista koju korisnik čita; to je interni
  skup primalaca i ostaje ograničen po dizajnu. Pretrage (`asset-search`, `incident-search`) vraćaju 10
  rezultata po namjeri i nisu dio ovog nalaza.
- **Kompatibilnost:** promjena je aditivna (nova polja), pa stari klijent radi sa novim serverom. Novi
  klijent na starom serveru čita flagove defanzivno (`?.` → „ništa nije skraćeno“), da staggered deploy ne
  može srušiti tab.

## Direktni testni dokaz

- `problem-events-visibility.spec.ts` (+2) — 200 vidljivih + još jedan ⇒ `hasMore: true` i tačno 200 u
  odgovoru; kada redovi presuše unutar prozora ⇒ `hasMore: false`.
- `problem-tickets.service.spec.ts` (+1, ažuriran 1) — 501 red u prozoru, `count` 620 ⇒ 500 stavki,
  `total`/`open` 620, `hasMore: true`; `take` je 501, `total` dolazi iz `count`.
- `problem-links.service.spec.ts` (+3, ažurirana 2) — 201 asset ⇒ 200 stavki i `hasMore.assets`;
  sekcije koje stanu ⇒ svi flagovi `false`; reverse 51 ⇒ 50 i `hasMore: true`.
- `problem-service-visibility.spec.ts` (+1) — 2.001 jedinica ⇒ 2.000 u biraču i `hasMore.units`.
- `list-truncation-note.spec.tsx` (5) — oba copy oblika note, skraćena i neskraćena vremenska linija,
  tabela tiketa sa stvarnim `total`.
- `problem-form-sheet.spec.tsx` (+2) — skraćen birač prikazuje napomenu, neskaćen ne prikazuje ništa.
- Integracijski ugovori ažurirani: `problem-asset-scope.integration.spec.ts`,
  `problem-ticket-unlink.integration.spec.ts` (oblik odgovora).

## CI i testni dokaz

CI run [`44315048317`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44315048317) na `202153c`:

- **Backend:** generisani Prisma, build, lint, safety-net, wiring, SLA matrica i pun Jest — uspješno.
- **PostgreSQL/Redis integration:** uspješno, uključujući izmijenjene problem integracijske ugovore.
- **Frontend:** lint, format, pun suite (459 fajlova / 1.809 testova) i build — uspješno.
- **Docs/CI gate/container:** Docs guard, container + supply chain i CI gate uspješni.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory`.
- **Neuspjeli pokušaji:** run [`44310320654`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44310320654)
  na `6033b9c` pao je na **vlastitoj** grešci u testnom dublu (`TS2345`: `problemAsset.findMany` je iz
  praznog inicijalnog niza inferirao `never[]`, pa 201 red nije bio dodjeljiv) — popravljeno u `5b3d3d2`,
  bez promjene ponašanja. Zatim je `202153c` dodao defanzivno čitanje flagova; taj run je zelen.

Lokalno: backend ciljano `jest` `src/modules/problems` (26 suiteova / 213 testova; šest suiteova se ne može
pokrenuti u sandboxu jer je Prisma klijent ručni stub bez runtime klase — u CI-ju se generiše pravi),
`eslint` čist; frontend `tsc -b`, `prettier --check`, `eslint`, pun `vitest` (459/1.809) i
`check-pulse-design-system.mjs` (9.134 ključa, bs/en parity). Integration suiteovi lokalno `skipped`
(nema `PRIVACY_IT_DATABASE_URL`); dokaz je CI.

**Module size:** `services/problems-api.ts` je rastom ugovora prešao baseline (588 > 578). Limit **nije**
podignut: događaji i target podsjetnici izdvojeni su u `services/problems-api/events.ts` i
`reminders.ts` (re-export iz istog ulaza), pa je fajl 547 linija.

## Registar nalaza

- Zatvoreni: `BA-problems-17` (P3).
- Ostaju otvoreni u ovom auditu: `BA-problems-18` i `BA-problems-19` (P3) te `BA-problems-21` (P3).
- Kontrolni zbir (prebrojan iz `backend-findings-plan.json` i redova registra): source/plan
  **437 otvorenih / 259 zatvorenih / 696**; ovaj registar **447/249**; Val 7 **38/111** (73 otvorena:
  13/40/20); `problems` **18/21**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Deploy je aditivan u oba smjera: stari klijent ignoriše nova polja,
novi klijent na starom serveru čita flagove defanzivno i ne prikazuje napomenu. Rollback je vraćanje
prethodne slike; podaci nisu dirani.

## Sljedeći paket

**W7.40 — `BA-problems-18` (P3):** bulk/sweep postavke i sekvencijalni rad nemaju potpune
resource/health granice (lokalni clamp u loaderu, starvation metrika). Nije započet prije zelenog gatea za
ovaj paket.
