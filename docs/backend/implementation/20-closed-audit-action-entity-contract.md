# Backend Val 3 / W3.11 — zatvoreni action/entity/schema ugovor

## Status

**Završeno.** Osnovna implementacija je na SHA `d0e61a7`, wrapper/canonical action korekcije na `2e7e72d`, rate-limit compatibility korekcija na `f182c1d`, a puni kontrolisani extension ugovor na `b4e04d7`. Potpuno zeleni CI dokaz je `40191639867`.

Zatvoren je `BA-audit-log-11`: poznata action vrijednost više nije dovoljna za commit. Centralna politika zahtijeva registrovanu kombinaciju akcije, entity tipa i schema verzije.

## Typed compatibility registry

`audit-action-compatibility-registry.ts` ima tačno jedan ugovor za svaku od 145 core audit akcija. Ugovor sadrži:

- dozvoljeni skup entity tipova;
- metadata schema verziju;
- oznaku da li je događaj core ili extension.

Izvezeni `CoreAuditAction`, `AuditExtensionAction`, `AuditAction` i `AuditEntityType` tipovi omogućavaju uskim producer wrapperima compile-time sužavanje, dok centralni runtime boundary ostaje autoritativan za sve JS/dinamičke pozive.

Registry completeness test poredi sve ključeve sa `auditLogActions`, potvrđuje schema verziju, neprazan entity skup i da je svaki entity iz kanonskog `auditLogEntityTypes` kataloga.

## Fail-closed runtime matrica

`prepareAuditEntry` sada zahtijeva da istovremeno postoje:

1. action schema/allowlist;
2. scope policy;
3. action→entity→schema compatibility zapis.

Poznata akcija sa pogrešnim entity tipom pada sa stabilnim `AUDIT_ACTION_ENTITY_SCHEMA_NOT_REGISTERED:<action>:<entity>:<version>` razlogom prije hashiranja i DB writea. Test eksplicitno dokazuje da `audit.export` ne može biti zapisan kao `user` događaj.

## Kontrolisani extension namespace

Extension akcija mora pratiti bounded oblik `ext.<provider>.<event>`, ali sam validan naziv nije dovoljan. Extension može biti prihvaćen samo kroz statički, code-reviewed `auditExtensionDefinitionRegistry` zapis koji u jednom objektu mora dati:

- compatibility/entity skup;
- schema verziju;
- metadata allowlist i sensitivity;
- scope policy.

Registry je trenutno namjerno prazan. Test potvrđuje da sintaksno validan `ext.acme.case_opened` ne može commitovati bez eksplicitne deklaracije. Nema runtime mutable registracije niti environment bypassa.

## Otkrivena latentna greška

Typed/runtime zatvaranje otkrilo je postojeći producer koji je slao neregistrovani literal `asset.export`, a grešku zatim gutao. Producer sada koristi kanonski `asset.exported`, a njegov schema zapis eksplicitno dozvoljava `format` i `fileName`. Time asset export ponovo ostavlja audit trag umjesto tihog no-op-a.

Security rate-limit događaj dodatno je vezan za stvarni `user` entity ugovor, što potvrđuje postojeći puni unit test.

## Verifikacija

CI `40191639867` potpuno je zelen: backend build/lint/puni Jest, Prisma validate/generate, PostgreSQL/Redis integration suiteovi, container/supply-chain, frontend, docs i završni gate.

Testovi zaključavaju kompletnost 145 ugovora, entity katalog, mismatch odbijanje i fail-closed extension namespace.

## Migracija

**Ovaj paket nema novu baznu migraciju i ne zahtijeva ručno pokretanje release migratora.**

## Modul i sljedeći paket

Audit-log modul je ovim paketom zatvorio svih 11 nalaza `BA-audit-log-01`–`BA-audit-log-11`.

Sljedeći paket je **Backend Val 4 / W4.1 — persisted request-idempotency claim/result primitive sa timeout retry i duplicate-delivery dokazima**.
