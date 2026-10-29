# Backend Val 2 / W2.5 — role assignment i permission invarianti

## Status

**Završeno.** Implementacijski niz završava na `21f1caa`; kanonski potpuno zeleni CI dokaz je `40126212216`.

Zatvoreni nalazi:

- `BA-rbac-04` — `SUPER_ADMIN` permission matrica više nije prividno uređiva;
- `BA-users-04` — konkurentni identični assignmenti više ne mogu oba biti upisana;
- `BA-users-05` — dual-scope i scoped `SUPER_ADMIN` assignmenti odbijaju se na DB granici.

## Invarianti

### Posljednji aktivni local-only SuperAdmin

Sve postojeće mutation putanje koje mogu ukloniti posljednjeg kvalifikovanog administratora koriste zajednički PostgreSQL transaction advisory lock iz `super-admin-invariant.ts`: uklanjanje role, deaktivacija i brisanje korisnika, directory linking te SuperAdmin assignment. Provjera se ponavlja pod lockom prije mutacije. Postojeći concurrency test dokazuje da od dvije paralelne deaktivacije samo jedna može završiti.

Role-permission replacement koristi isti lock prije invariant provjere i upisa. Time admin i permission mutation operacije nemaju dvije paralelne nezaštićene kritične sekcije.

### Obavezna permission semantika

Runtime `SUPER_ADMIN` autoritet je puni permission katalog, pa bi promjena njegove persisted matrice bila obmanjujuća i bez runtime efekta. `replace-role-permissions.ts` sada fail-closed odbija takvu mutaciju kodom `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE`; ostale role zadržavaju eksplicitno upravljivu matricu.

### Assignment scope i identitet

Migracija `20271013140000_user_role_scope_constraints` uvodi:

- `UserRole_single_scope_check` — OU i service scope ne smiju biti istovremeno postavljeni;
- parcijalni unique indeks za globalni identitet `(userId, roleId)`;
- parcijalni unique indeks za OU identitet `(userId, roleId, organizationalUnitId)`;
- parcijalni unique indeks za service identitet `(userId, roleId, serviceId)`;
- trigger `UserRole_super_admin_global_check` — `SUPER_ADMIN` assignment mora biti globalan.

## Odobreni deterministički repair

Repair se izvršava prije constrainta, u istoj atomskoj migraciji:

1. dual-scope red se briše, jer se iz nevažećeg reda ne može pouzdano zaključiti namjeravani scope;
2. scoped `SUPER_ADMIN` red se kanonizuje u globalni assignment;
3. za duplikate nastale ili zatečene nakon kanonizacije zadržava se leksikografski najmanji `id`, a ostali se brišu.

Politika je deterministička i fail-closed za dvosmislene grantove. Ne izmišlja OU/service prioritet.

## PostgreSQL dokaz

`user-role-constraint-migration.integration.spec.ts` na stvarnom PostgreSQL-u:

- kreira prljave dual-scope, duplicate-global i scoped-SuperAdmin fixture redove;
- izvršava stvarni sadržaj migracije;
- potvrđuje tačan deterministički repair rezultat;
- potvrđuje SQLSTATE `23514` za zabranjeni dual-scope red;
- radi migraciju unutar transakcije, zatim rollbackom potvrđuje da schema i DDL/DML efekti nestaju zajedno.

`role-assignment-analyzer.integration.spec.ts` dodatno potvrđuje:

- kod dva konkurentna globalna granta tačno jedan commit prolazi;
- dual-scope pokušaj ne ostavlja parcijalni red;
- scoped `SUPER_ADMIN` pokušaj odbija DB trigger i ne ostavlja assignment.

## Verifikacija

Kanonski CI `40126212216` je potpuno zelen:

- backend build i lint;
- puni backend Jest;
- isolated PostgreSQL/Redis integration, uključujući repair, rollback i concurrency suiteove;
- replay svih migracija i schema readiness sentinel;
- frontend, docs guard, container i supply-chain poslovi;
- završni CI gate.

Lokalno su prije pushanja prošli ESLint, isolated-runner contract i `git diff --check`.

## Granice paketa

W2.5 ne zatvara preview revision/CAS, durable post-commit invalidaciju niti širi users control-plane authorization. Ti nalazi ostaju u svojim kasnijim paketima.

## Sljedeće

Sljedeći paket je **W2.6 — route manifest: svaka ruta mora biti eksplicitno authenticated, public, webhook ili worker, bez implicitne pete klase**.
