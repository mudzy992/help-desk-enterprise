# W4.4 — Transaction-scoped advisory/row-lock primitive

**Status:** završen 25.10.2026.  
**Implementacija:** `92297d7`; PostgreSQL korekcije `b105c60`, `dac00e2`, `e974365`.  
**Zeleni CI dokaz:** `40218285525`.

## 1. Kanonski advisory-lock ugovor

`DatabaseLockService` daje dva transaction-scoped PostgreSQL API-ja:

- `withAdvisoryLock(transaction, identity, operation, timeoutMs)` čeka najviše bounded 50–30.000 ms;
- `tryWithAdvisoryLock(transaction, identity, operation)` ne čeka i vraća stabilan unavailable ishod.

Identity ima bounded namespace 3–80 i key 1–160 znakova. Kanonski length-prefixed identitet hashira se PostgreSQL `hashtextextended` funkcijom sa fiksnim seedem, pa sequence/singleton calleri na svim replikama računaju isti 64-bit lock ID bez process-local mape. Length prefix uklanja separator-kolizije.

Lock je `pg_advisory_xact_lock`: PostgreSQL ga automatski oslobađa na commit i rollback, uključujući exception put. Caller mora proslijediti postojeći Prisma `TransactionClient`; helper namjerno ne otvara skrivenu drugu transakciju.

Stabilni ishodi su:

- `DATABASE_LOCK_IDENTITY_INVALID` za nebounded/nevalidan identitet ili timeout;
- `DATABASE_LOCK_TIMEOUT` za PostgreSQL `55P03` poslije bounded čekanja;
- `DATABASE_LOCK_UNAVAILABLE` za neuspješan try-lock.

## 2. Row-lock ugovor

`withRowLock` zahtijeva callback koji u callerovoj istoj transakciji izvršava autorizovani `SELECT ... FOR UPDATE`. Tek zaključani snapshot ulazi u operation callback. Missing red pada sa `DATABASE_LOCK_ROW_NOT_FOUND`, a operation se ne izvršava.

Helper namjerno ne prima raw ime tabele ili raw SQL string: time izbjegava repository-wide SQL identifier injection API. Domenski repository zadržava typed/autorizovani query, a centralna primitiva nameće redoslijed lock → operation.

## 3. Namjena i granice

- **Sequence:** svi writeri koriste isti `(namespace, aggregate-key)` prije read-modify-write dodjele.
- **Approval/race odluka:** preferira se row lock nad konkretnim decision redom; advisory lock se koristi kada red još ne postoji.
- **Singleton workflow:** try-lock je za skip-if-running, bounded blocking lock za kratku serializaciju.

Advisory lock nije zamjena za unique/check/FK DB invariante. Lock operacija mora ostati kratka; mrežni pozivi se ne drže pod DB lockom. Svi writeri istog invarianta moraju koristiti isti kanonski identity.

## 4. Dokaz

Unit testovi potvrđuju identity/timeout granice, missing-row fail-closed ponašanje i prosljeđivanje zaključanog snapshota.

Stvarni PostgreSQL integration testovi potvrđuju:

1. drugi try-lock ne može ući dok prva transakcija drži identitet;
2. blocking lock daje stabilan timeout;
3. commit automatski oslobađa lock i naredna transakcija ulazi;
4. dva paralelna read-modify-write sequence writera završavaju sa vrijednošću 2, bez lost updatea;
5. row-lock callback se izvršava prije zaštićene operacije.

Prvi CI pokušaji su pronašli i zatvorili tri realna adapter problema: NUL nije validan PostgreSQL text (`40217172751`), Prisma ne deserijalizuje `void` rezultat advisory funkcije (`40217560736`) i `55P03` je umotan u Prisma `P2010` (`40217950556`). Finalni kod koristi length-prefixed text, supported integer projection i stabilnu PostgreSQL error normalizaciju. CI `40218285525` je potpuno zelen.

## 5. Migracije i findings

W4.4 nema novu DB migraciju. Platformski helper sam ne mijenja postojeće domenske write putanje, pa nijedan domenski finding nije umjetno zatvoren. Registar ostaje **656 otvorenih / 36 zatvorenih / 692 ukupno**.

## 6. Sljedeći paket

Sljedeći paket je **Backend Val 4 / W4.5 — bounded bulk-command framework sa per-item rezultatom i eksplicitnim atomic/best-effort modom**.
