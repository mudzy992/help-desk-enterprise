# Backend Val 2 / W2.7 — globalne docs/settings/config permission granice

## Status

**Završeno.** Finalni kod je `c78c445`; potpuno zeleni CI dokaz je `40128598505`.

Zatvoreni nalazi:

- `BA-docs-01` — scoped role assignment više ne postaje globalni docs pristup;
- `BA-settings-05` — role key više nije dovoljan za globalni private settings registry;
- `BA-config-versioning-01` — globalni config list/get/diff zahtijevaju read capability;
- `BA-config-versioning-02` — scoped settings/import capability više ne postaje globalna config mutation moć.

## Permission model

U kanonski katalog dodane su capability granice:

- `settings.read` — globalni private settings registry i konfiguracijske projekcije;
- `config.version.read` — globalne config verzije, snapshotovi i diffovi;
- `docs.agent.read` — interna dokumentacija za agente.

ADMIN default matrica dobija sve tri capability vrijednosti; AGENT dobija samo `docs.agent.read`; SUPER_ADMIN i dalje dobija kompletan katalog. Nazivi i opisi dodani su u BS/EN RBAC prijevode i permission catalog.

## Settings i config-versioning

`SettingsController` više nema class-level `RequireRoles(ADMIN)`. Read metode nasljeđuju `settings.read`, dok write metode eksplicitno overrideuju granicu sa `settings.write`.

`ConfigVersioningController` više nema class-level ADMIN prečicu. List/get/diff koriste `config.version.read`; mutation metode zadržavaju svoje `settings.write` ili `config.version.import` capability zahtjeve.

Centralni authorization evaluator globalnu rutu fail-closed odbija kada capability dolazi samo iz OU ili service scoped assignmenta. Negativni compatibility test direktno dokazuje odbijanje OU-scoped `settings.read`, uz prolaz globalnog granta.

## Dokumentacija

Docs controller više ne skuplja `roleKeys` iz principal contexta. Iz principal assignmenta uzima permissione samo kada je assignment kanonski globalan. OU/service assignmenti se ne koriste za globalni docs corpus.

Postojeće artifact `roles` polje ostaje compatibility metadata, ali se na serveru prevodi u capability zahtjev:

- unrestricted stranica — svaki autentifikovani principal;
- agent sadržaj — `docs.agent.read`;
- problem/change sadržaj — `problem.read` / `change.read`;
- admin sadržaj — `settings.read`;
- SuperAdmin-only sadržaj — `confidential.break_glass`.

Negativni controller test potvrđuje da OU-scoped ADMIN assignment sa `settings.read` ne vidi admin dokumentaciju.

## Verifikacija

CI `40128598505` potpuno je zelen:

- backend build, lint i puni Jest;
- permission katalog i BS/EN i18n coverage;
- settings global/scoped authorization compatibility;
- docs permission i scoped-assignment testovi;
- PostgreSQL/Redis integration;
- frontend, docs guard, container/supply-chain i završni CI gate.

## Granice paketa

W2.7 ne rješava docs manifest schema/duplicate-slug/load/search nalaze, settings encryption/concurrency/readOnly nalaze niti config-versioning CAS/apply/package nalaze. Oni ostaju otvoreni u svojim modulskim paketima.

## Sljedeće

Sljedeći paket je **W2.8 — završna negativna authorization matrica za cross-user, cross-OU, scoped admin i inactive principal scenarije kroz route-level entry pointove**.
