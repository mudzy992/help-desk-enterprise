# W4.5 — Bounded bulk-command framework

**Status:** završen 25.10.2026.  
**Implementacija:** `7b5ea04`.  
**Zeleni CI dokaz:** `40219266489`.

## 1. Kanonski zahtjev

`BulkCommandService.execute` zahtijeva eksplicitan `mode`; default ne postoji:

- `atomic` — svi itemi dijele jednu Prisma transakciju;
- `best-effort` — svaki item dobija vlastitu transakciju.

Zahtjev mora imati 1–100 itema. Svaki item ima bounded key 1–160 znakova, a keyevi unutar jednog zahtjeva moraju biti jedinstveni. Nepoznat mode, prazan/prevelik batch, nevalidan ili dupli key padaju prije DB rada sa `BULK_COMMAND_INVALID_REQUEST`.

Framework namjerno ne pokušava ograničiti generički payload po serijalizovanoj veličini: konkretni DTO/controller i domenska schema moraju nametnuti vlastitu byte/field granicu prije poziva. Centralna granica garantuje maksimalan broj DB operacija.

## 2. Atomic mode

Handler prima item i isti `Prisma.TransactionClient`. Prvi item failure prekida obradu i rollbackuje cijelu transakciju. Rezultat eksplicitno razlikuje:

- prethodno izvršene iteme kao `ROLLED_BACK`;
- item koji je pao kao `FAILED`;
- neizvršene naredne iteme kao `SKIPPED`;
- `committed=false` i ukupni `outcome=FAILED`.

Uspješan atomic batch vraća samo `SUCCEEDED` rezultate i `committed=true`. Transaction timeout je bounded na 30 sekundi.

## 3. Best-effort mode

Svaki item radi u zasebnoj transakciji, pa kvar jednog itema ne rollbackuje prethodne ili naredne uspjehe. Obrada je namjerno sekvencijalna: batch od 100 itema ne smije postati nekontrolisan burst od 100 DB konekcija.

Mješoviti ishod je eksplicitni `outcome=PARTIAL`, nikada tihi HTTP-style success bez per-item stanja. Summary sadrži `total`, `succeeded`, `failed`, `rolledBack` i `skipped`, a svaki rezultat nosi originalni key.

## 4. Error ugovor

Domenski handler koristi `BulkCommandItemError(code, message, retryable)` za bounded per-item grešku. Code mora biti uppercase machine code, message se reže na 500 znakova.

Nepoznat exception, uključujući infrastrukturne detalje, ne izlazi u rezultat. Mapira se na stabilni `BULK_COMMAND_INTERNAL_FAILURE`; time se sprječava curenje SQL-a, credentiala ili provider detalja kroz bulk response.

## 5. Dokaz

Unit testovi potvrđuju:

- mode/count/key/duplicate validaciju;
- potpuno uspješan atomic rezultat;
- `ROLLED_BACK` / `FAILED` / `SKIPPED` klasifikaciju;
- eksplicitni best-effort partial rezultat;
- redakciju nepoznate greške.

Stvarni PostgreSQL integration testovi potvrđuju:

1. prvi atomic write se fizički rollbackuje kada drugi item padne;
2. treći atomic item se ne izvršava;
3. best-effort uspjesi prije i poslije neuspješnog itema ostaju commitovani;
4. persisted broj redova odgovara per-item rezultatu.

CI `40219266489` potvrđuje backend build/lint/pune testove, stvarne PostgreSQL suiteove, frontend, container i supply-chain gateove.

## 6. Migracije i findings

W4.5 nema novu DB migraciju. Framework sam ne prebacuje postojeće domenske bulk handlere, pa nijedan domenski finding nije umjetno zatvoren. Registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**.

## 7. Sljedeći paket

Sljedeći paket je **Backend Val 4 / W4.6 — storage write protocol: stage → DB intent → atomic promote → compensation/reconciler**.
