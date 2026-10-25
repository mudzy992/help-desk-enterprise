# Backend Val 3 / W3.9 — audit OU scope provenance

## Status

**Završeno.** Implementacija je na SHA `aad1dd0`, a potpuno zeleni CI dokaz je `40188416889`.

Zatvoren je `BA-audit-log-09`: kritični OU-scoped audit događaji više ne mogu commitovati producer-proslijeđeni scope koji se razlikuje od kanonskog scopea business entiteta.

## Action scope registry

Novi `audit-action-scope-registry.ts` klasificira svih 145 kanonskih akcija kao:

- `global` — događaj mora ostati bez OU scopea;
- `producer` — action ugovor eksplicitno prihvata historijski producer scope;
- `entity` — scope mora postojati i DB ga potvrđuje iz kanonskog entiteta.

Registry completeness test zaključava punu pokrivenost akcijskog kataloga i kritične `entity`/`global` klasifikacije. Centralna prepare politika fail-closed odbija OU na globalnoj akciji i nedostajući OU na entity-scoped akciji.

## Database provenance granica

Migracija `20271025140000_audit_scope_provenance` instalira `BEFORE INSERT` trigger na `AuditLog`. Trigger za kritične akcije čita scope iz kanonskih tabela:

- `Ticket.originUnitId`;
- `Group.organizationalUnitId`;
- `OrganizationalUnit.id`;
- `Problem.organizationalUnitId`;
- `ChangeRequest.organizationalUnitId`;
- `Asset.organizationalUnitId`.

Ako entitet ne postoji ili supplied OU nije jednak kanonskom scopeu, insert pada sa stabilnim `AUDIT_SCOPE_ENTITY_NOT_FOUND` ili `AUDIT_SCOPE_PROVENANCE_MISMATCH` razlogom. Provjera je u istoj poslovnoj transakciji i ne može se zaobići drugim aplikacijskim producerom koji piše kroz isti DB role.

Audit red zadržava immutable historijski `organizationalUnitId`; nema FK koji bi normalnim brisanjem OU-a prepisao forenzički scope.

## Izvršni PostgreSQL dokaz

Novi izolovani integration suite kreira stvarni OU i pokušava zapisati `organizational_unit.updated` sa namjerno falsifikovanim OU identitetom. PostgreSQL trigger odbija transakciju i potvrđuje da nije ostao audit red. Isti događaj sa kanonskim scopeom uspješno commitira.

Drugi acceptance dokaz potvrđuje da eksplicitno globalna `auth.login_failed` akcija odbija producer OU prije DB writea.

## Migracijski/deployment ugovor

Ova faza sadrži novu produkcijsku migraciju `20271025140000_audit_scope_provenance`. API/worker runtime image namjerno nema Prisma CLI ni migration source. Migracija se izvršava odvojenim single-owner release migratorom prije API/worker rollouta:

```bash
docker compose --profile release run --rm migrator
```

Migrator zahtijeva zaseban `MIGRATION_DATABASE_URL`, uz advisory lock i produkcijski `sslmode=verify-full`. Obični Coolify redeploy backend servisa zato namjerno ne pokreće migracije.

## Verifikacija

CI `40188416889` potpuno je zelen: Prisma validate/generate, replay svih 81 migracija, migration-policy guard, backend build/lint/puni Jest, PostgreSQL/Redis integration suiteovi, container/supply-chain, frontend, docs i završni gate.

## Sljedeće

Sljedeći paket je **W3.10 — bounded audit query identifikatori i stabilan cursor envelope: uvesti format/dužinske granice prije repositoryja i zatvoriti `BA-audit-log-10`**.
