# W6.2 — Resource-scoped status-page incident mutations

**Findings:** `BA-status-page-02`, `BA-status-page-09`  
**Implementacija:** `55a5de0`, korekcija dokaza `d51ecb6`  
**Finalni CI:** `40735765271` — zelen

## Problem

HTTP `RoleGuard` je provjeravao samo prisustvo `status.incidents.manage` capabilityja bez mogućnosti da incident sa jednim ili više servisa veže za stvarni assignment scope. Scoped grant je zato imao neispravan ugovor: route-level provjera nije modelirala incident resource, a write servis nije provjeravao service scope ni za postojeće ni za novododane servise.

## Implementacija

- Incident write servis koristi postojeći centralni `AuthorizationService.authorizeResource`; nije uveden paralelan authorization sistem.
- Create zahtijeva `status.incidents.manage` odluku za svaki traženi servis prije transakcije.
- Edit prvo zahtijeva authority nad svim trenutnim servisima incidenta, a pri promjeni servisnog skupa zasebno provjerava svaki ciljni servis. Actor zato ne može premjestiti vlastiti incident u foreign scope niti dodati foreign servis.
- Timeline update i resolve, kao i resolve preview, zahtijevaju authority nad svakim trenutnim servisom incidenta.
- Globalni assignment i lokalni SUPER_ADMIN ostaju podržani preko centralnog resource policyja; service-scoped assignment prolazi samo za identičan servis. OU-only assignment ostaje fail-closed jer incident nema OU resource dimenziju.
- Foreign incident mutation i resolve preview vraćaju not-found granicu, pa mutation endpoint ne postaje existence oracle. Create ili pokušaj dodavanja eksplicitnog foreign servisa vraća kontrolisani forbidden rezultat.
- Route wiring manifest je regenerisan: rute ostaju iza session authentication granice, dok se dinamički multi-service resource scope provjerava u write servisu gdje su svi incident servisi dostupni.
- Ticket link/unlink authorization nije proširen u ovom paketu; njegov zaseban nalaz `BA-status-page-07` ostaje otvoren.

## Testni dokaz

- Direktni service test dokazuje da jedan dozvoljen i jedan foreign servis fail-closed zaustavljaju mutation prije writea.
- Stvarni PostgreSQL scenarij koristi centralni `AuthorizationService` sa service-scoped assignmentom i dokazuje:
  - zabranu createa nad foreign servisom;
  - skrivenu zabranu edit/update/resolve-preview nad foreign incidentom;
  - dozvoljen create i update nad vlastitim servisom;
  - zabranu proširenja vlastitog incidenta na kombinaciju own + foreign servisa.
- Prvi CI `40734864443` legitimno je otkrio dva testna problema: nesinhronizovan wiring manifest i otvoren pomoćni scoped incident koji je mijenjao kasniju availability aserciju. Korekcija `d51ecb6` regenerisala je manifest i završila pomoćni incident unutar istog scenarija.
- Finalni CI `40735765271` potpuno je zelen, uključujući generated-Prisma build/test, kompletni backend suite, stvarni PostgreSQL/Redis shard, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Paket nema novu DB migraciju niti posebnu ručnu release DB radnju.

## Ishod

`BA-status-page-02` i preklopljeni `BA-status-page-09` su zatvoreni. Capability više nije globalna mutation dozvola, a service ID-jevi više nisu provjereni samo po postojanju nego i prema actorovom centralnom resource scopeu. Registar prelazi na **607 otvorenih / 85 zatvorenih / 692 ukupno**.
