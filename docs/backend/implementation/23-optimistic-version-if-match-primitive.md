# W4.3 — Optimistic version / If-Match primitive

**Status:** završen 25.10.2026.  
**Implementacija:** `1581815`.  
**Zeleni CI dokaz:** `40213980280`.

## 1. Kanonski HTTP ugovor

`OptimisticConcurrencyService` uvodi jedan repository-wide ugovor za versionirani write:

- mutation zahtijeva tačno jedan strong `If-Match: "vN"` header;
- odsutan header vraća `OPTIMISTIC_PRECONDITION_REQUIRED` / HTTP 428;
- weak ETag, wildcard, lista, nula, leading-zero i malformed vrijednosti vraćaju `OPTIMISTIC_IF_MATCH_INVALID` / HTTP 400;
- verzija je pozitivan PostgreSQL `Int` kompatibilan broj i ostavlja prostor za atomski `+1`;
- uspješan CAS mora preći isključivo `N -> N+1` i vraća novi strong ETag;
- CAS gubitnik rereadom klasifikuje ishod kao missing resource ili stale write;
- stale write vraća `OPTIMISTIC_STALE_WRITE` / HTTP 412, sa `currentEtag` u standardnom bodyju i `ETag` response headeru;
- autorizovani missing resource vraća `OPTIMISTIC_RESOURCE_NOT_FOUND` / HTTP 404;
- callback koji tvrdi preskočenu ili neinkrementiranu verziju fail-closed pada sa `OPTIMISTIC_VERSION_TRANSITION_INVALID` / HTTP 500.

Wildcard i multi-value semantika su namjerno odbijene: mutacije moraju potvrditi konkretnu prethodno pročitanu verziju, ne samo postojanje resursa.

## 2. CAS granica

Caller daje dvije jasno odvojene operacije:

1. `mutate(expectedVersion)` mora biti jedan atomski DB write oblika `UPDATE ... WHERE id = ? AND version = expected`, uz `version = version + 1`; vraća `null` ako nije pobijedio;
2. `readCurrentVersion()` je autorizovani reread koji se koristi samo nakon izgubljenog CAS-a za stabilnu klasifikaciju.

Primitive ne koristi read-before-write za correctness. Prvi read klijenta služi za ETag, dok pobjednika određuje isključivo conditional write u bazi. Caller i dalje mora izvršiti authorization/scope provjeru prije rereada kako stale konflikt ne bi postao existence oracle.

## 3. HTTP integracija

`OptimisticConcurrencyError` je Nest `HttpException`, pa prolazi kroz postojeći standardizovani error envelope i request ID. Globalni `HttpRequestExceptionFilter` za HTTP 412 dodatno postavlja aktuelni strong `ETag` header.

Ovim je ugovor direktno upotrebljiv u controllerima bez domenskih varijanti statusa i error kodova.

## 4. Dokaz

Unit testovi potvrđuju:

- parsiranje i formatiranje bounded strong ETaga;
- odbijanje absent/weak/wildcard/list/malformed headera;
- uspješan `N -> N+1` rezultat;
- stale 412 sa aktuelnim ETagom;
- missing 404 i fail-closed invalid version transition;
- globalni HTTP filter emituje `ETag` na stale odgovoru.

Stvarni PostgreSQL integration test pokreće dva paralelna writea sa istim `"v1"`: tačno jedan CAS pobjeđuje i prelazi na v2, drugi dobija stabilan HTTP 412 sa `"v2"`, a persisted counter se povećava samo jednom.

CI `40213980280` potvrđuje Prisma validate/generate, migration replay, stvarne PostgreSQL suiteove, backend build, lint, pune testove, frontend, container i supply-chain gateove.

## 5. Migracije i findings

W4.3 je reusable code/API primitive i **nema novu DB migraciju**. Postojeće domenske tabele dobijaju/versioniraju vlastite kolone tek u njihovim paketima.

Platformski paket ne prebacuje automatski postojeće domenske mutation handlere. Zato nijedan domenski finding nije umjetno zatvoren i registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**.

## 6. Sljedeći paket

Sljedeći paket je **Backend Val 4 / W4.4 — advisory/row-lock helper za sequence, approval i singleton workflow**.
