# W5.33 — SLA resource-scope autorizacija

**Finding:** `BA-sla-03`  
**Implementacija:** `fc1936f`  
**CI:** `40554752106` — zelen

## Sigurnosna odluka

SLA konfiguracija je deployment-wide policy boundary. Kalendari, profili, priority matrica, SLA pravila, escalation pravila/targeti i njihova konfiguracijska historija administriraju se isključivo kroz **globalni** assignment koji nosi `sla.write`. OU/service-scoped administratori mogu koristiti izračunate SLA rezultate u svojim operativnim tokovima, ali ne mogu administrirati SLA konfiguraciju — čak ni kada rule DTO sadrži njihov OU ili servis.

Ova fail-closed odluka uklanja nejasnoću između globalnih profila/kalendara i scoped ruleova te onemogućava da scoped administrator odabere foreign OU/service, globalnog korisnika/rolu/grupu kao escalation target ili čita globalne liste i change-logove.

## Implementacija

Dodan je `SlaGlobalAdministrationGuard` na svih pet konfiguracijskih kontrolera:

- calendars;
- profiles;
- rules;
- escalation rules;
- priority matrix.

Guard koristi principal context koji je već učitao session/authorization sloj. Standardni administrator mora imati isti assignment sa `organizationalUnitId = null`, `serviceId = null` i `sla.write`. Miješanje globalne dozvole jednog assignmenta sa scopeom drugog nije dozvoljeno. Eksplicitni SuperAdmin bypass ostaje očuvan kroz postojeću canonical role granicu.

Compliance endpoint nije pretvoren u globalnu administraciju; njegova postojeća operativna OU scope pravila ostaju odvojena.

## Negativna matrica

Fokusirani test dokazuje odbijanje:

1. OU-scoped create pokušaja;
2. service-scoped update pokušaja globalnog resursa;
3. OU-scoped list/change-log čitanja;
4. globalnog assignmenta bez `sla.write`.

Pozitivno su dokazana globalna administracija i eksplicitni SuperAdmin put. Wiring manifest potvrđuje guard na svih pet konfiguracijskih kontrolera.

## Validacija

- fokusirani guard suite: **6/6**;
- backend ESLint i wiring manifest — zeleni;
- CI `40554752106` — potpuno zelen: generated Prisma/build, kompletni backend testovi, PostgreSQL/Redis integracije, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema DB migraciju niti ručnu release DB radnju.

## Ishod

Scoped `sla.write` više ne daje globalnu SLA administraciju niti pristup foreign targetima/resursima. `BA-sla-03` je zatvoren; registar prelazi na **623 otvorena / 69 zatvorenih / 692 ukupno**.
