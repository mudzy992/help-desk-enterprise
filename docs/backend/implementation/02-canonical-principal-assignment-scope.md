# Backend Val 2 — canonical principal/assignment/scope temelj

## 1. Status i dokaz

- Status paketa: **završen**.
- Implementacijski raspon: `a11808a5ff0f643e406f59c9a58570ae42c43f52`–`10ffd27758c766112fc67161a35489c3bcaa29e9`.
- Kanonski CI dokaz: run **40118964278**, potpuno zelen na SHA `10ffd27758c766112fc67161a35489c3bcaa29e9`.
- Backend build, lint, puni Jest, safety-net compile suite, wiring, PostgreSQL/Redis integration i container/supply-chain jobovi su prošli.
- Paket ne sadrži migraciju, constraint niti automatsku promjenu postojećih podataka.

## 2. Cilj i granica paketa

Paket uvodi minimalni sigurni temelj za daljnju sanaciju identity/scope nalaza:

1. read-only inventar postojećih role assignmenta;
2. determinističan repair manifest koji zahtijeva ljudsko odobrenje;
3. kanonski scope primitive `global | organizational-unit | service`;
4. fail-closed mapiranje nekonzistentnog assignmenta u principal context;
5. pozitivan i negativan dokaz nad stvarnim PostgreSQL-om.

Ovo nije bio završetak `BA-users-04` ili `BA-users-05`: schema je tada još dopuštala duplikate i nekonzistentne scope kombinacije. Nalazi su naknadno zatvoreni odobrenim repairom i DB constraintima u W2.5.

## 3. Report-only inventar

`authz:assignments:report` zahtijeva eksplicitan `--output`, `DATABASE_URL` i Prisma PostgreSQL adapter. Izlazna datoteka se kreira ekskluzivno (`wx`) sa modeom `0600`; postojeći fajl se ne prepisuje.

Analyzer prijavljuje:

- `AMBIGUOUS_SCOPE` — istovremeni OU i service scope;
- `DUPLICATE_ASSIGNMENT` — isti user/role/scope identitet u više redova;
- `INACTIVE_USER_ASSIGNMENT` — grant vezan za neaktivnog usera;
- `SUPER_ADMIN_SCOPED` — SuperAdmin koji nije globalan;
- `SUPER_ADMIN_NOT_LOCAL` — SuperAdmin na identitetu koji nije local-only.

Manifest ima `schemaVersion: 1`, `mode: report-only`, determinističan redoslijed, broj ulaznih redova, SHA-256 source fingerprint i preporuku koja eksplicitno traži owner/operator pregled. CLI završava kodom 2 kada anomalije postoje; nijedan analyzer/CLI put nema write operaciju nad bazom.

## 4. Canonical scope i principal mapiranje

`resolveCanonicalScope` proizvodi tačno jednu varijantu:

- `{ kind: 'global' }`;
- `{ kind: 'organizational-unit', organizationalUnitId, organizationalUnitPath }`;
- `{ kind: 'service', serviceId }`.

OU ID bez patha, path bez ID-a i OU+service kombinacija vraćaju `null`. Database-backed principal assignment dobija stabilni `assignmentId` i kanonski `scope`; nekonzistentan red se fail-closed izostavlja iz effective assignmenta. Legacy scope polja privremeno ostaju radi kompatibilnosti postojećih authorization callera i sintetičkih test contexta.

## 5. Test matrica

- Unit: globalni, OU-only i service-only resolver scenariji.
- Negativni unit: nepotpun OU i dual-scope daju `null`.
- Principal mapping: globalni, OU i service assignment ulaze u context; dual-scope ne ulazi.
- Analyzer: determinističnost, nepromjenjiv ulaz, duplikati, dual-scope, SuperAdmin i inactive-user anomalije.
- Real PostgreSQL: persisted duplikat i OU+service red se prijavljuju, a prije/poslije snapshot potvrđuje da analyzer nije mutirao podatke.
- Isolated integration runner eksplicitno registruje novi PostgreSQL suite.

## 6. Preostali rizici

- `UserRole` još nema check/unique constraint koji garantuje kanonsku formu.
- Repair manifest nije apply alat i ne smije se koristiti kao automatska naredba za brisanje.
- Canonical `scope` je obavezan za database-backed principal, ali privremeno optional u zajedničkom tipu dok se svi sintetički/domain context builderi ne migriraju.
- Durable revocation/authz version authority, centralna policy odluka i route manifest pripadaju narednim paketima Vala 2.

## 7. Sljedeći paket

**W2.2 — durable session revocation i authz-version authority:** ukloniti stale-privilege prozor pri Redis grešci i dokazati deaktivaciju/revocation na narednom zahtjevu, uključujući multi-replica i real-PostgreSQL/Redis negativne scenarije.
