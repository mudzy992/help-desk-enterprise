# Backend implementacijski master plan

**Status:** odobren — implementacijski Val 0 je u toku
**Datum:** 2026-10-23  
**Ulaz:** 44 završene audit jedinice, 692 otvoren nalaz  
**Cilj:** sigurno, dokazivo i fazno zatvaranje 174 P1, 368 P2 i 150 P3 nalaza

## 1. Izvršna pravila

Ovaj dokument je jedinstveni redoslijed implementacije. Lokalni planovi iz 44 audita ostaju izvor detalja, ali se rad ne smije voditi samo rednim brojem modula: zajedničke sigurnosne i podatkovne osnove moraju prethoditi domenima koji ih koriste.

Obavezna pravila za svaki paket:

1. prvo reprodukcija ili executable safety net, zatim korekcija;
2. jedan primarni owner po cross-module invarijanti;
3. nema schema contract reza bez expand/backfill/verify/contract plana;
4. business mutation, audit/change log, outbox i invalidacija moraju imati eksplicitnu atomarnost;
5. javne, webhook, worker i CLI granice moraju biti fail-closed;
6. svaki zatvoreni BA ID dobija link na kod, test, migration i CI dokaz;
7. P1 se ne zatvara samo unit testom ako nalaz zavisi od PostgreSQL/Redis/filesystem/multi-replica ponašanja;
8. rollback nije “revert commit” kada je migracija već promijenila podatke;
9. nakon svakog vala preračunava se baseline samo iz aktuelnog koda i izvršenih testova;
10. finalnih 9,90+ nije moguće bez nula otvorenih P0/P1, formalno riješenih P2/P3 obaveza i zvaničnog CI/integracijskog dokaza.

## 2. Primarni workstreamovi i owneri

| Workstream | Primarni owner | Glavni audit izvori | Odgovornost |
|---|---|---|---|
| WS-A Identity boundary | authentication/authorization/rbac | 01–06, 09, 31, 42, 44 | session, step-up, permission/scope, principal cache, public route manifest |
| WS-B Data integrity | platform data/Prisma | 07–16, 22–35, 43–44 | transakcije, constraints, locking, migracije, runtime DB privilegije |
| WS-C Audit/config trust | audit-log/settings/config-versioning | 07–10, 30, 33, 43 | immutable audit, redaction, signed/versioned config, change semantics |
| WS-D Async delivery | worker/integration platform | 14, 17–21, 28–29, 36, 39–41, 44 | outbox, queue claims, retry, scheduler readiness, graceful drain |
| WS-E Privacy/security | security/privacy | 09–11, 20, 25–26, 37 | keys, token lifecycle, export/erase, webhook/inbound trust, extension boundary |
| WS-F Domain workflows | domain owners | 12–16, 21–29, 33–36 | state machines, optimistic concurrency, idempotency, scoped reads |
| WS-G Runtime platform | platform/SRE | 39–44 | health, logs, metrics, TLS, image, secrets, dependency/build reproducibility |
| WS-H Evidence/quality | backend QA + platform | svi | generated Prisma, integration harness, contract/E2E, traceability i score |

Owner znači odgovornost za canonical primitive i rollout, ne isključivo autorstvo svih izmjena.

## 3. Dependency mapa

```text
W0 reproducible evidence + generated Prisma
 ├─> W1 runtime/secret/DB privilege safety
 │    ├─> W2 identity + authorization fail-closed
 │    ├─> W3 audit/config/change-log trust
 │    └─> W4 transaction/outbox/concurrency primitives
 │          ├─> W5 core tickets/routing/SLA/catalog/templates
 │          ├─> W6 notifications/websocket/queues/email/on-call
 │          ├─> W7 assets/problems/changes/knowledge/reports/search
 │          └─> W8 install/config/integrations/directory/Teams/extension
 ├─> W9 health/observability/ops and scale hardening
 └─> W10 documentation, full regression, score and release gate
```

Cross-cutting zabrane:

- domain ne smije izmisliti vlastiti outbox, idempotency, audit-redaction ili authorization primitive ako canonical workstream još nije završen;
- contract migration ne smije u isti rollout sa starim readerom/writerom koji ne razumije novu obaveznu semantiku;
- cache/Redis optimizacija ne smije biti authority za sigurnosnu odluku bez durable revocation/version dokaza;
- worker readiness ne smije postati zelena prije registracije obaveznih schedulera i queue capability probea.

## 4. Val 0 — reprodukcija i audit safety net

**Status:** završeno 2026-10-23; konsolidovani dokaz je CI run [`40024951273`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40024951273) na SHA `cefda62f5731549a7d63560fb100eb0ad101ad45`, a detaljni dnevnik je u [`implementation/00-safety-net.md`](implementation/00-safety-net.md).

**Cilj:** ukloniti dokazne blokade prije behavior izmjena.

### Paketi

- W0.1: reproducibilan `npm ci`, pinovan Node/Prisma toolchain i CI cache bez lock fallbacka;
- W0.2: generated Prisma client/enums kao obavezni CI korak; build nikad nije “zelen” bez generatora;
- W0.3: disposable PostgreSQL i Redis integration harness sa migracijom od prazne baze i upgrade fixtureom;
- W0.4: route/guard manifest, provider wiring snapshot i API/worker scheduled-job separation test;
- W0.5: globalni BA traceability checker — svaki ID mapiran na paket, test i status;
- W0.6: baseline container testovi za UID, filesystem, signal, health i writable storage;
- W0.7: dependency/SBOM snapshot i production/full-tree audit odvojeni.

### Acceptance

- clean checkout radi generate, lint, build i ciljane testove jednom zaključanom komandom;
- svih trenutno compile-blokiranih suiteova se izvršava ili otkriva stvarnu code grešku;
- migration-from-zero i upgrade-from-fixture prolaze u CI-u;
- 692/692 BA ID-eva postoji tačno jednom u registru i ima plan ownera;
- nema produkcijske tajne niti produkcijske konekcije u testovima.

### Rollback

Nema schema promjene. Harness i checker se mogu vratiti bez runtime uticaja; build gate se privremeno može označiti infrastructure-failed, ali ne pretvoriti u pass.

## 5. Val 1 — production safety perimeter

**Prioritet:** svi cross-cutting P1 koji povećavaju blast radius svake naredne faze.

### W1.1 Container i supply chain

**Status:** završeno 2026-10-24; izvršni dokaz je CI run [`40073544355`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40073544355) na SHA `f7615c7196cae623aa50376869ddea771e2f38cc`, uz detaljni dnevnik u [`implementation/01-production-safety-perimeter.md`](implementation/01-production-safety-perimeter.md).

- non-root runtime UID/GID, minimalni production dependency sloj, digest-pinned base;
- strict `npm ci`; ukloniti install fallback;
- read-only root filesystem, dropped capabilities, no-new-privileges i eksplicitni writable mountovi;
- SBOM, image scan, provenance/signature i dependency remediation za poznate advisories.

**Acceptance:** runtime UID nije 0; image nema dev CLI/toolchain osim eksplicitno odobrenog ops imagea; lock drift prekida build; container radi sa read-only rootom; high/critical production CVE je 0.

### W1.2 DB/migration privilege separation

**Status:** završeno 2026-10-24; izvršni dokaz je CI run [`40075479663`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40075479663) na SHA `97e78ab7e1d1b61e4812723d570b1bc20337a173`, uz detaljni dnevnik u [`implementation/01-production-safety-perimeter.md`](implementation/01-production-safety-perimeter.md).

- zaseban release migrator credential i restricted API/worker role;
- migracije izvući iz start komande replike u single-owner release job;
- TLS verification, `lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout` i globalni connection budget;
- schema compatibility sentinel u readinessu;
- backup/restore rehearsal i operator approval za destruktivne migracije.

**Acceptance:** API/worker ne mogu `CREATE/DROP/ALTER`; release job je jedini DDL owner; dvije replike se mogu rolloutati bez konkurentnog migratora; restore drill mjeri RPO/RTO.

### W1.3 Redis i secret transport

- `rediss`/TLS, CA/server identity, auth i environment namespace;
- centralna typed startup validacija svih tajni i dependency URL-ova;
- pin/rotation ugovor po secret purposeu i zabrana nesigurnog fallbacka u productionu.

**Acceptance:** plaintext production Redis config fatalno pada; pogrešan CA/hostname ne prolazi; staging i production ključevi/queueovi ne kolidiraju; secret vrijednosti nisu u logovima.

### W1.4 Worker lifecycle

- mandatory scheduler registration/reconcile sa startup deadlineom;
- worker readiness/liveness, queue capability i draining stanje;
- bounded graceful shutdown, drugi signal kao force path, telemetry flush;
- unfinished/stalled job metrika i recovery test.

**Acceptance:** nedostupan Redis drži readiness crvenom; djelimična registracija nije “started”; SIGTERM pod aktivnim jobom deterministički drainuje ili ostavlja retry-safe stanje.

## 6. Val 2 — identity, scope i authorization

### Status

- **W2.1 canonical principal/assignment/scope temelj — završen** na SHA `10ffd27758c766112fc67161a35489c3bcaa29e9`, CI `40118964278`.
- Uvedeni su report-only inventar, deterministični repair manifest, fail-closed canonical scope mapiranje i real-PostgreSQL dokaz bez mutacije.
- U granicama W2.1 `BA-users-04` i `BA-users-05` ostali su otvoreni jer pripremni paket nije izvršio repair niti dodao DB constrainte; naknadno su zatvoreni u W2.5.
- **W2.2 durable session revocation i authz-version authority — završeno** na SHA `10e8fd6ea1c328d647b6f2bc77960567f8bc8af5`, CI `40119814862`.
- PostgreSQL sada fencea svaki cached principal i svaki moderni `sid`; Redis revocation greška je fail-closed, sa stvarnim multi-replica PostgreSQL dokazom.
- `BA-xcut-05` je zatvoren; `BA-authentication-02` ostaje otvoren zbog legacy no-`sid` durable cutoff granice.
- **W2.3 centralni permission + OU/service/ownership policy — završeno** na SHA `201678ac5b77d65bc4b2fc70b18132e0bbbadb74`, CI `40121407427`.
- Centralni resource-policy entry point nema role-key input; persisted cross-user, sibling-OU i foreign-service scenariji dokazani su na stvarnom PostgreSQL-u.
- Route/decorator migracija ostaje eksplicitni modul-po-modul rollout, ne prećutno zatvoren nalaz.
- **W2.4 fail-closed step-up i emergency/recovery tokovi — završeno** na SHA `8206056d810e4cab0ab629cd96831309c11b66d0`, CI `40122665418`.
- Rate-limit i bulk emergency tokovi koriste centralni proof boundary; no-MFA, replay/expiry, non-local SuperAdmin i degraded marker-store scenariji su fail-closed.
- `BA-security-01` je zatvoren; durable bulk operation, login MFA atomic claim i authorization-epoch nalazi ostaju otvoreni.
- **W2.5 role/permission mutation constraints i last-admin zaštite — završeno** na SHA `21f1caa`, CI `40126212216`.
- Odobreni deterministički repair, scope CHECK, tri scoped unique indeksa i global-only SuperAdmin trigger dokazani su izvršavanjem stvarne migracije na PostgreSQL-u, uključujući concurrency i rollback.
- `BA-rbac-04`, `BA-users-04` i `BA-users-05` su zatvoreni; dokaz je u [06-role-assignment-and-permission-invariants.md](implementation/06-role-assignment-and-permission-invariants.md).
- **W2.6 iscrpan route policy manifest — završen** na SHA `52b5f1af95e7c650cfecef91a88a602edd5279e8`, CI `40127087672`.
- Svih 610 HTTP ruta i worker composition root pripadaju tačno jednoj klasi (`authenticated`, `public`, `webhook`, `worker`); CI odbija novu guardless/nekatalogizovanu rutu, policy guard bez auth granice i stale override.
- `BA-authorization-02` je zatvoren; dokaz je u [07-exhaustive-route-policy-manifest.md](implementation/07-exhaustive-route-policy-manifest.md).
- **W2.7 globalne docs/settings/config permission granice — završen** na SHA `c78c445`, CI `40128598505`.
- Docs koristi samo permissione globalnih assignmenta; settings registry zahtijeva `settings.read`, a config list/get/diff `config.version.read`. Scoped grantovi ne zadovoljavaju globalne odluke.
- `BA-docs-01`, `BA-settings-05` i `BA-config-versioning-01/02` su zatvoreni; dokaz je u [08-global-read-permission-boundaries.md](implementation/08-global-read-permission-boundaries.md).
- **W2.8 završna route-level negativna authorization matrica — završena** na SHA `386b206`, CI `40130219620`.
- Stvarni PostgreSQL dokaz pokriva owner/cross-user, child/sibling OU, OU-scoped grant na globalnoj ruti i inactive principal kroz kanonske route/resource entry pointove; registracija suitea je zaključana runner contract testom.
- W2.8 ne zatvara dodatne nalaze nego završno dokazuje zajedničke granice Vala 2; dokaz je u [09-route-authorization-negative-matrix.md](implementation/09-route-authorization-negative-matrix.md).
- Sljedeći paket je **W3.1 canonical append-only audit primitive i inventar**.

### Redoslijed

1. canonical principal/assignment/scope model — **završeno (W2.1)**;
2. session revocation i authz version authority koja ne zavisi od stale cachea — **završeno (W2.2)**;
3. centralni permission + OU/service/ownership policy — **završeno (W2.3 primitive + servisna granica)**;
4. fail-closed step-up i emergency/recovery tokovi — **završeno (W2.4)**;
5. role/permission mutation constraints i last-admin zaštite — **završeno (W2.5)**;
6. route manifest: authenticated, public, webhook ili worker — **završeno (W2.6, bez implicitne pete klase)**;
7. docs/admin/config read granice prebaciti sa role-key stringa na permission + scope decision — **završeno (W2.7)**;
8. negative integration matrica za cross-user, cross-OU, scoped admin i inactive principal — **završeno (W2.8)**.

### Pogođene jedinice

01 authentication, 02 authorization, 03 rbac, 04 users, 05 organizational-units, 06 groups, 09 security, 31 install, 33 policy-packs, 42 docs, 44 infrastructure; zatim svi domain controlleri.

### Migracijski rizik

Role assignment anomalije mogu postojati u aktuelnim podacima. Prvo report-only validator i repair manifest, zatim constraint. Permission rename zahtijeva dual-read/dual-write period i mapu starih ključeva.

### Acceptance matrica

- deaktivacija/revocation vrijedi na narednom zahtjevu i tokom Redis outagea;
- scoped rola ne dobija globalni read/write samo zbog role keya;
- last super-admin/required permission invariant odolijeva dvjema konkurentnim transakcijama;
- svaki controller endpoint pripada manifestovanoj auth klasi;
- javne/webhook rute imaju vlastiti signature/rate/replay dokaz;
- authz negative suite prolazi na realnom PostgreSQL-u i sa dvije API replike.

## 7. Val 3 — audit, config i change trust

### Status

- **W3.1 canonical audit event policy — završen** na SHA `760216c`, CI `40131718141`.
- Centralni runtime action/entity/actor inventar je fail-closed; correlation ID se nasljeđuje iz request konteksta; tajne se centralno rediguju prije hashiranja; metadata ima 16 KiB / depth 8 limite.
- Real-PostgreSQL test dokazuje rollback audit append-a zajedno s neuspjelom business transakcijom. Nalazi `BA-audit-log-07/11` ostaju otvoreni zbog action-specific schema i persisted event-version granica; dokaz je u [10-canonical-audit-event-policy.md](implementation/10-canonical-audit-event-policy.md).
- **W3.2 immutable audit identity i versionirani hash envelope — završen** na SHA `ae9f851`, CI `40132759119`.
- Audit actor/OU identifikatori više nisu mutirani `SetNull` relacijama; v3 red pohranjuje i hashira vlastiti algoritam, a real-PostgreSQL dokaz potvrđuje delete stabilnost i SHA-256→SHA-512 rotaciju.
- `BA-audit-log-01/02` su zatvoreni; dokaz je u [11-immutable-audit-identity-hash-envelope.md](implementation/11-immutable-audit-identity-hash-envelope.md).
- **W3.3 audit v4 envelope i potpisani izvanbazni anchor primitive — završen** na SHA `cde72c7`, CI `40134084046`.
- V4 veže row ID, vrijeme i redaction state; potpisani anchor fail-closed razlikuje missing, signature, head i lag kvarove. Real-PostgreSQL redaction dokaz ostaje zelen nakon determinističkog v4 rechaina.
- `BA-audit-log-08` je zatvoren. `BA-audit-log-03` ostaje otvoren jer filesystem primitive još nije remote/WORM deployment sink; dokaz je u [12-audit-v4-envelope-signed-anchor.md](implementation/12-audit-v4-envelope-signed-anchor.md).
- **W3.4 operativni remote/WORM anchor publisher i verifier — završen** na SHA `3a0dd21`, CI `40135290452`.
- Deployment key provider, create-only remote PUT, read-after-write verifier, periodični publish, startup/readiness fail-closed granica i lag/failure metrike dokazani su fault/recovery testom.
- `BA-audit-log-03` je zatvoren; dokaz je u [13-operational-worm-audit-anchor.md](implementation/13-operational-worm-audit-anchor.md).
- **W3.5 atomska privacy redakcija i authenticated redaction transition — završen** na SHA `89e0480`, CI `40136626790`.
- Metadata updatei, v4 rechain i završni `audit.redacted` događaj sada su jedna advisory-lockovana PostgreSQL transakcija; realni mid-batch kvar rollbackuje prvi već izvršeni update i ne ostavlja summary događaj.
- `BA-audit-log-04` je zatvoren; dokaz je u [14-atomic-audit-redaction-transition.md](implementation/14-atomic-audit-redaction-transition.md).
- **W3.6 bounded streaming audit export i incremental verify — završen** na SHA `403fbf9`, CI `40140062168`.
- Export koristi Node stream i stabilne `(createdAt,id)` keyset stranice od najviše 500 redova; verify je inkrementalan, support snapshot je capped na 5.000, a anchor čita samo head red.
- `BA-audit-log-05` je zatvoren; dokaz je u [15-bounded-audit-export-incremental-verify.md](implementation/15-bounded-audit-export-incremental-verify.md).
- **W3.7 partitioned audit append concurrency — završen** na SHA `12d5876`, CI `40180285554`.
- V5 hash-bound particije, shared maintenance/exclusive partition lockovi, partition-aware verifier/checkpoint/redaction i aggregate multi-head WORM anchor uklanjaju deployment-wide append bottleneck uz očuvan no-fork ugovor.
- `BA-audit-log-06` je zatvoren; dokaz je u [16-partitioned-audit-append-concurrency.md](implementation/16-partitioned-audit-append-concurrency.md).
- **W3.8 versionirani audit action-schema registry i metadata granice — završen** na SHA `b8df27b`, CI `40187527565`.
- Svih 145 akcija ima eksplicitan versionirani allowlist/sensitivity schema zapis; centralna politika fail-closed sanitizuje secret/PII sadržaj i nameće 16 KiB, depth 8 i 128-key granice, a v6 hash-bound veže schema verziju.
- `BA-audit-log-07` je zatvoren; dokaz je u [17-versioned-audit-action-schema-registry.md](implementation/17-versioned-audit-action-schema-registry.md).
- **W3.9 audit OU scope provenance — završen** na SHA `aad1dd0`, CI `40188416889`.
- Svih 145 akcija ima scope policy; kritični ticket/group/OU/problem/change/asset događaji prolaze PostgreSQL trigger provjeru protiv kanonskog entity scopea, a globalne akcije fail-closed odbijaju OU.
- `BA-audit-log-09` je zatvoren; dokaz je u [18-audit-ou-scope-provenance.md](implementation/18-audit-ou-scope-provenance.md).
- **W3.10 bounded audit query identifikatori i stabilan cursor envelope — završen** na SHA `65fa04b`, CI `40189888596`.
- OU/user query identifikatori imaju format i 128-char granicu; javni cursor je canonical bounded base64url v1 envelope, dekodira se prije repositoryja i vraća stabilan `AUDIT_INVALID_CURSOR` ugovor.
- `BA-audit-log-10` je zatvoren; dokaz je u [19-bounded-audit-query-cursor-envelope.md](implementation/19-bounded-audit-query-cursor-envelope.md).
- **W3.11 typed action/entity/schema compatibility i extension namespace — završen** na SHA `b4e04d7`, CI `40191639867`.
- Svih 145 core akcija ima zatvoren action→entity→schema ugovor; mismatch pada prije writea, a `ext.<provider>.<event>` ostaje fail-closed bez statičke pune definicije.
- `BA-audit-log-11` je zatvoren; audit-log modul je zatvorio svih 11 nalaza. Dokaz je u [20-closed-audit-action-entity-contract.md](implementation/20-closed-audit-action-entity-contract.md).
- **W4.1 persisted request-idempotency claim/result primitive — završen** na SHA `f475adc`, CI `40211114841`.
- Centralni servis daje atomic insert/CAS claim, canonical request hash conflict, owner-token lease recovery te isti-transaction business effect + persisted rezultat; response je capped na 64 KiB, retention je 24 sata i cleanup je bounded.
- Platformski paket ne zatvara domenske nalaze prije integracije njihovih command handlera; dokaz je u [21-persisted-request-idempotency-primitive.md](implementation/21-persisted-request-idempotency-primitive.md).
- **W4.2 transactional outbox primitive — završen** na SHA `40664e4`, CI `40213179907`.
- Transaction-bound enqueue, canonical payload dedupe, PostgreSQL SKIP LOCKED claim, owner-token lease/heartbeat, bounded exponential retry, terminal dead letter, operator-provenance replay i terminal-only retention cleanup sada čine centralni reusable ugovor.
- Platformski paket ne zatvara domenske nalaze prije integracije konkretnih producera/consumera; dokaz je u [22-transactional-outbox-primitive.md](implementation/22-transactional-outbox-primitive.md).
- **W4.3 optimistic version/If-Match primitive — završen** na SHA `1581815`, CI `40213980280`.
- Centralni strong `"vN"` ETag parser/formatter, atomic CAS callback ugovor, obavezni 428 precondition, stabilni 412 stale response sa aktuelnim ETagom, 404 missing klasifikacija i fail-closed `N -> N+1` provjera sada su reusable platform API.
- Paket nema migraciju i ne zatvara domenske nalaze prije integracije konkretnih mutation handlera; dokaz je u [23-optimistic-version-if-match-primitive.md](implementation/23-optimistic-version-if-match-primitive.md).
- **W4.4 advisory/row-lock helper za sequence, approval i singleton workflow — završen** na SHA `e974365`, CI `40218285525`.
- Centralni transaction-scoped PostgreSQL helper daje canonical bounded advisory identity, blocking timeout, try-lock, automatski commit/rollback release i fail-closed row-lock callback bez raw identifier API-ja.
- Paket nema migraciju i ne zatvara domenske nalaze prije integracije njihovih writera; dokaz je u [24-transaction-scoped-database-lock-primitive.md](implementation/24-transaction-scoped-database-lock-primitive.md).
- **W4.5 bounded bulk-command framework — završen** na SHA `7b5ea04`, CI `40219266489`.
- Centralni servis zahtijeva eksplicitan atomic/best-effort mode, 1–100 unique bounded itema, per-item rezultat, atomic rollback/skip klasifikaciju, sekvencijalne zasebne best-effort transakcije i redakciju nepoznatih grešaka.
- Paket nema migraciju i ne zatvara domenske nalaze prije integracije konkretnih bulk handlera; dokaz je u [25-bounded-bulk-command-framework.md](implementation/25-bounded-bulk-command-framework.md).
- **W4.6 storage write protocol — završen** na SHA `02aa0b4`, CI `40220137718`.
- Centralni stage→transactional intent→atomic promote tok ima content hash dedupe, pending/processing/ready/failed/compensated state, lease/backoff reconciler, rollback cleanup i durable compensation zapis kada cleanup zakaže.
- Paket uvodi migraciju `20271025230000_storage_write_protocol`, ali ne zatvara domenske storage nalaze prije integracije konkretnih callera; dokaz je u [26-staged-storage-write-protocol.md](implementation/26-staged-storage-write-protocol.md).
- **W4.7 durable post-commit cache invalidation — završen** na SHA `bf57489`, CI `40221177051`.
- Transactional outbox invalidation intent, cross-replica retry delivery i DB-revision-validated read-through ugovor osiguravaju da cache/realtime ostane izvedena optimizacija, nikad source of truth.
- Paket nema migraciju i ne zatvara domenske nalaze prije integracije njihovih mutation/read handlera; dokaz je u [27-durable-post-commit-cache-invalidation.md](implementation/27-durable-post-commit-cache-invalidation.md).
- **Val 4 je potpuno završen (W4.1–W4.7).**
- **W5.1 tickets transactional message command boundary — završen** na SHA `15d86c9`, CI `40223728831`.
- Required HTTP idempotency key, persisted result, DB unique message key i jedna transaction granica za message/mention/redaction/waiting/merged-copy/audit/outbox zatvorili su `BA-tickets-01`; dokaz je u [28-ticket-message-transactional-command-boundary.md](implementation/28-ticket-message-transactional-command-boundary.md).
- **W5.2 ticket confidential break-glass atomic audit boundary — završen** na SHA `b842ac0`, CI `40225951703`.
- Required UUID v4 correlation ID, persisted replay/payload-drift zaštita i jedna transakcija za grant/change/audit/system event/outbox/success rezultat zatvorili su `BA-tickets-02`; stvarni PostgreSQL concurrency i rollback dokaz je u [29-ticket-break-glass-atomic-boundary.md](implementation/29-ticket-break-glass-atomic-boundary.md).
- Registar je sada **654 otvorena / 38 zatvorenih / 692 ukupno**; migracija `20271026030000_break_glass_atomic_boundary` je obavezna ručna release-migrator radnja.
- **W5.3 ticket bulk durable operation/item manifest — završen** na SHA `151061e`, CI `40229199458`.
- Required UUID v4 operation ID, eksplicitni atomic/best-effort režim, durable operation/item manifest, canonical payload conflict, terminal replay, atomic rollback i failed-only best-effort resume zatvorili su `BA-tickets-03`; dokaz je u [30-ticket-bulk-durable-operation-manifest.md](implementation/30-ticket-bulk-durable-operation-manifest.md).
- Registar je sada **653 otvorena / 39 zatvorenih / 692 ukupno**; migracija `20271026050000_ticket_bulk_operation_manifest` je obavezna ručna release-migrator radnja.
- **W5.4 ticket split attachment durable copy i reconciliation — završen** na SHA `31f831c`, CI `40231167864`.
- Stvarni child blob, transactional storage intent, deterministic copy idempotency key i worker-only bounded reconciliation zatvorili su `BA-tickets-04`; stvarni PostgreSQL + disk fault/recovery dokaz je u [31-ticket-split-attachment-durable-copy.md](implementation/31-ticket-split-attachment-durable-copy.md).
- Registar je sada **652 otvorena / 40 zatvorenih / 692 ukupno**; paket nema novu migraciju i koristi postojeći `StorageWriteIntent` ugovor.
- **W5.5 ticket split potpuni preflight, operation idempotency i atomic multi-child DB granica — završen** na SHA `b65cffa`, CI `40233520653`.
- Potpuni preflight, required UUID v4 operation ID, persisted replay/payload-drift zaštita, jedna transakcija za parent/children/messages/attachments/events/SLA/assignment/storage intente i post-commit promotion zatvorili su `BA-tickets-05`; stvarni PostgreSQL rollback/replay dokaz je u [32-ticket-split-atomic-idempotent-boundary.md](implementation/32-ticket-split-atomic-idempotent-boundary.md).
- Registar je sada **651 otvoren / 41 zatvoren / 692 ukupno**; paket nema novu migraciju i koristi postojeće `RequestIdempotency` i `StorageWriteIntent` ugovore.
- **W5.6 ticket approval decision/gate concurrency-safe granica — završen** na SHA `e4ab71c`, CI `40235330066`.
- Conditional approval/ticket claim, jedna transakcija za odluku i side effecte te DB unique `(ticketId, stepOrder)` zatvorili su `BA-tickets-06`; stvarni PostgreSQL dokaz sa 20 paralelnih odluka je u [33-ticket-approval-concurrency-boundary.md](implementation/33-ticket-approval-concurrency-boundary.md).
- Registar je sada **650 otvorenih / 42 zatvorena / 692 ukupno**; migracija `20271026100000_ticket_approval_concurrency_boundary` je obavezna ručna release-migrator radnja.
- **W5.7 permission-correct cursor CSV export i truncation manifest — završen** na SHA `21808ca`, CI `40237791891`.
- Confidential i tačan `audit.export` OU/service scope sada ulaze u SQL prije limita; bounded ID cursor i eksplicitni audit/HTTP truncation manifest zatvorili su `BA-tickets-07`. Stvarni PostgreSQL dokaz je u [34-ticket-export-scope-cursor-manifest.md](implementation/34-ticket-export-scope-cursor-manifest.md).
- Registar je sada **649 otvorenih / 43 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W5.8 guardrail claim/effect atomska recovery granica — završen** na SHA `c15bf91`, CI `40285216835`.
- Claim i CSAT/waiting/archive efekti sada commit/rollbackuju u istoj transakciji, uključujući realtime sink rollback; stvarni PostgreSQL fault/retry dokaz zatvorio je `BA-tickets-08` i dokumentovan je u [35-guardrail-effect-atomic-recovery.md](implementation/35-guardrail-effect-atomic-recovery.md).
- Registar je sada **648 otvorenih / 44 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W5.9 attachment atomska kvota i durable deletion lifecycle — završen** na SHA `ad4e930`, CI `40316223173`.
- PostgreSQL parent-row lock i transakcijsko ponovno brojanje atomizuju upload kvotu; transactional durable deletion intent, post-commit remove te lease/backoff/terminal worker reconciliation zatvorili su `BA-tickets-09`. Stvarni PostgreSQL concurrency i storage fault/retry dokaz je u [36-ticket-attachment-atomic-quota-durable-deletion.md](implementation/36-ticket-attachment-atomic-quota-durable-deletion.md).
- Registar je sada **647 otvorenih / 45 zatvorenih / 692 ukupno**; paket nema novu migraciju i koristi postojeću `StorageWriteIntent` shemu.
- **W5.10 same-ticket reopen atomska i idempotentna granica — završen** na SHA `7b63508`, CI `40319657162`.
- Required idempotency key, conditional status claim i jedna transaction granica za parent/children/change/event/SLA outbox zatvorili su `BA-tickets-10`; stvarni PostgreSQL parallel/replay dokaz je u [37-ticket-reopen-atomic-idempotent-boundary.md](implementation/37-ticket-reopen-atomic-idempotent-boundary.md).
- Registar je sada **646 otvorenih / 46 zatvorenih / 692 ukupno**; paket nema novu migraciju i koristi postojeće `IdempotencyRecord` i `OutboxMessage` sheme.
- **W5.11 remote request atomska i bounded rate-limit granica — završen** na SHA `1447ef3`, CI `40322188627`.
- Action-filtered latest-only query i per-ticket PostgreSQL row lock atomizuju window check i event insert; stvarni PostgreSQL test sa 12 paralelnih zahtjeva zatvorio je `BA-tickets-11`. Dokaz je u [38-ticket-remote-atomic-bounded-rate-limit.md](implementation/38-ticket-remote-atomic-bounded-rate-limit.md).
- Registar je sada **645 otvorenih / 47 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.12 durable post-commit side-effect recovery — završen** na SHA `816da4d`, CI `40325366346`.
- Transactional PostgreSQL trigger-intenti za svaki ticket message i status/priority promjenu, idempotentni worker consumeri, lease/backoff/dead-letter/manual replay te lag/failure health snapshot zatvorili su `BA-tickets-12`. Stvarni commit/rollback dokaz je u [39-ticket-durable-post-commit-side-effects.md](implementation/39-ticket-durable-post-commit-side-effects.md).
- Registar je sada **644 otvorena / 48 zatvorenih / 692 ukupno**; migracija `20271026120000_ticket_side_effect_outbox` je obavezna ručna release-migrator radnja.
- Sljedeći paket je **Val 5 / W5.13 bounded archive/waiting worker obrada (`BA-tickets-13`)**.

### Canonical primitive

- append-only audit API sa actor klasom, request/correlation ID-em, reason/action/entity registryjem;
- DB role/trigger ili ekvivalentna tamper boundary, hash/checkpoint verifier i retention/legal-hold ugovor;
- schema-driven centralna redakcija i payload size/depth limit;
- transaction-only write interface ili transactional outbox gdje atomarnost prelazi sistemsku granicu;
- change-log diff kao versionirani add/remove/replace format sa JSON Pointer segmentima;
- signed/versioned config package, optimistic activation i environment-bound vrijednosti;
- durable cross-replica config invalidation/realtime.

### Pogođene jedinice

07 settings, 08 audit-log, 09 security, 10 security-audit-webhook, 30 config-versioning, 31 install, 33 policy-packs, 38 branding, 42 docs, 43 change-log i svi mutation calleri.

### Acceptance

- missing/null/empty container/key escaping diff fixturei su tačni;
- business mutation ne može commitovati bez obaveznog audit/outbox zapisa;
- tajna/PII fixture se nikad ne pojavljuje u audit/change/log payloadu;
- direktna DB izmjena audit reda je odbijena ili verifier je deterministički detektuje;
- concurrent config activation daje jednog pobjednika;
- rollback koristi prethodnu validiranu verziju, ne ad-hoc edit;
- retention i legal hold imaju izvršni test.

## 8. Val 4 — transakcije, idempotency i concurrency platforma

### Shared ugovori

- request idempotency key + persisted result/claim state;
- transactional outbox sa leaseom, attempts, nextAttemptAt, terminal stateom i replay alatom;
- optimistic version/If-Match primitive;
- advisory/row lock helper za sequence, approval i singleton workflow;
- bulk command framework sa max sizeom, per-item rezultatom i atomic/best-effort eksplicitnim modom;
- storage write protocol: stage → DB intent → atomic promote → compensation/reconciler;
- cache invalidation nakon commit-a, nikad kao zamjena za source of truth.

### Acceptance

- retry nakon timeouta ne duplira efekt;
- dva workera ne izvršavaju isti claim efekt;
- crash na svakoj granici ostavlja replayable ili potpuno rollbackovano stanje;
- stale update vraća typed conflict;
- bulk API ne može tiho vratiti parcijalni success;
- file/DB referenca ne pokazuje na nepostojeći artefakt;
- poison item ne blokira cijeli batch bez DLQ/skip politike.

## 9. Val 5 — core service-management domeni

### 5A Tickets (12)

Atomizovati message/event/attachment/audit tok, break-glass audit, bulk/split/merge, approval race, CSV completeness i automation claim. Uvesti storage reconciliation i bounded export.

### 5B Routing i SLA (13–14)

Scope-aware query prije paginacije, bounded history, topology revision/cache, first-start lock, poison isolation, active timer config version i deterministični recompute. Scheduler prelazi na Val 1/4 primitive.

### 5C Service catalog i templates (15–16)

Version/activation locking, dependency preflight, immutable published definition, safe delete/reassign, template/playbook optimistic concurrency i idempotent completion.

### Wave acceptance

- end-to-end create→route→SLA→message→approval→resolve tok je atomski/retry-safe;
- dvije paralelne odluke ne mogu obje pobijediti;
- scoped totals i liste računaju authorization prije page limita;
- config promjena ima eksplicitan grandfather/recompute rezultat;
- load test potvrđuje query/latency budget bez neograničenog skena.

## 10. Val 6 — komunikacija i async integracije

### Jedinice

17 notifications, 18 websocket, 19 integration-queue, 20 inbound-email, 21 on-call, 28 announcements, 29 status-page, 36 teams.

### Redoslijed

1. outbox/claim state iz Vala 4;
2. per-channel idempotency i provider message key;
3. retry taxonomy, timeout, backoff, Retry-After i terminal DLQ;
4. signed inbound replay window i canonical raw body;
5. cross-replica websocket/pubsub delivery i authorization recheck;
6. on-call calculation/version/time-zone/DST safety;
7. announcement/status publish transaction i cache invalidation;
8. Teams OAuth/JWT/Graph egress policy i simulator isolation.

### Acceptance

- at-least-once delivery ne pravi dupli user-visible efekt;
- provider success + local timeout se reconciliše;
- invalid/old/replayed webhook je odbijen;
- websocket user nakon revocationa ne nastavlja primati zabranjene događaje;
- Redis/provider outage je vidljiv, bounded i recoverable;
- DST i cross-midnight on-call fixturei daju determinističan rezultat.

## 11. Val 7 — poslovni domeni i analitika

### 7A Assets (22)

Authorization/scoping, assignment/transfer invariants, import transaction/idempotency, file safety, license uniqueness i bounded history.

### 7B Problems i changes (23–24)

State-machine guards, manager scope, approval/CAB concurrency, blackout/collision semantika, rollback/evidence i atomic ticket links.

### 7C Knowledge, reports i search (25–27)

Publication/classification authorization, immutable revision, feedback uniqueness; report snapshot/as-of, export completeness i scheduler safety; search scope-before-limit, stable cursor i index/query-plan dokaz.

### 7D Announcements/status (28–29)

Publish/ack/dismiss atomarnost, target audience snapshot i public cache/integrity granice.

### Acceptance

Svaki domain dobija state transition tabelu, permission/scope matricu, conflict test, destructive action audit, pagination bounds, real DB constraint test i E2E happy/negative/retry scenario.

## 12. Val 8 — konfiguracija, instalacija i vanjske granice

### Jedinice

30 config-versioning, 31 install, 32 setup-checklist, 33 policy-packs, 34 service-onboarding, 35 directory-sync, 36 teams, 37 edge-extension, 38 branding.

### Kritični redoslijed

1. install bootstrap token/founder/session i one-time completion;
2. config trust primitive iz Vala 3;
3. policy pack immutable role/permission ownership;
4. onboarding workflow lock, expiry, cleanup i compensation;
5. directory sync plan/apply snapshot, LDAP TLS, delete/deactivate guard i resumability;
6. Teams production credential/JWT/Graph ugovor;
7. edge-extension host trust, token storage, origin/message validation i least privilege;
8. branding upload/content/storage/cache granice;
9. checklist izvodi stanje iz authoritative readinessa, ne optimistic UI/admin flagova.

### Acceptance

- install se ne može ponovo otvoriti ili preuzeti raceom;
- unsigned/environment-bound config zahtijeva eksplicitnu policy odluku i audit;
- directory apply radi samo nad istim pregledanim snapshotom i mass-delete guard je fail-closed;
- extension ne prihvata poruku/token sa neodobrenog origin/host konteksta;
- onboarding crash se može nastaviti ili kompenzirati;
- uploaded branding nije executable i storage je persistent/bounded.

## 13. Val 9 — health, observability i operativna pouzdanost

### Jedinice

39 health, 40 observability, 41 ops-health, 42 docs, 44 infrastructure.

### Paketi

- startup/live/ready/draining semantika po API-u i workeru;
- schema, DB write, Redis capability, queue flow i storage probeovi sa jasnim critical/noncritical statusom;
- structured logger, centralna redakcija i bounded request ID;
- OpenTelemetry propagation API→queue→worker i metric cardinality budget;
- durable incident/alert state machine sa dedupe, hysteresis, silence/ack/resolve concurrency;
- operational docs permission/scope i manifest validation;
- runbookovi za migration failure, Redis outage, queue backlog, key rotation, restore i stuck workflow.

### Acceptance

- svaki health status ima dokumentovanu orchestrator akciju;
- budući/korumpirani heartbeat nije healthy;
- API/worker partial dependency failure daje tačno očekivani status;
- secrets/PII redaction corpus prolazi;
- cardinality load ne proizvodi unbounded series;
- alert transitioni su idempotentni pod dvije evaluator replike;
- runbook drill završava mjerljivim recovery dokazom.

## 14. Val 10 — CLI, migracije i data repair closure

Iako počinje osnovama u Valu 1, završni data-ops gate dolazi nakon domain korekcija.

- jedinstveni CLI framework: target fingerprint, environment, operator, reason, dry-run, `--apply`, typed confirmation i audit;
- least-privilege per-command credential;
- resumable batch/checkpoint i before/after manifest;
- katalog svih data backfill/repair migracija iz Valova 2–8;
- expand/backfill verification prije contract migracije;
- restore rehearsal na finalnoj shemi;
- ukloniti future-timestamp praksu i uvesti monotoni release-owned naming policy.

**Acceptance:** destruktivna komanda ne radi bez tačnog target fingerprinta i potvrde; dry-run/applied count se podudaraju ili konflikt eksplicitno objašnjava razliku; sve repair operacije su resumable i auditovane.

## 15. Val 11 — završna verifikacija i release

### Obavezni test slojevi

1. unit i pure contract;
2. Nest module/controller wiring;
3. PostgreSQL/Redis/filesystem integration;
4. migration-from-zero + upgrade + rollback/restore rehearsal;
5. multi-replica race/queue/websocket/scheduler;
6. backend API E2E permission/scope/state/retry matrica;
7. performance/query-plan/cardinality;
8. container/security/dependency scan;
9. full repository CI i postojeća frontend Playwright kolekcija;
10. finalni audit rescore na tačnom SHA-u.

### Finalni gate

- 692 izvornih ID-eva ima status zatvoreno ili formalno odobren exception sa ownerom, rokom i kompenzacijom;
- nema otvorenog P0/P1 za release;
- nema administrativnog zatvaranja bez testa/dokaza;
- production dependency audit nema neodobren high/critical;
- migracije i restore su prošli na release kandidatu;
- lokalni i zvanični CI dokaz su odvojeno navedeni;
- changelog i runbook dokumentuju stvarni rollout i rollback.

## 16. Globalna acceptance/traceability matrica

| Kontrola | Minimalni dokaz | Gate |
|---|---|---|
| Authentication/revocation | Redis-outage i multi-replica integration test | Val 2 |
| Permission/scope | generated route matrix + negative DB-backed suite | Val 2 |
| Audit/change log | transaction/tamper/redaction/integrity verifier | Val 3 |
| Config | signature/version/concurrent activation/rollback | Val 3 |
| Transaction/idempotency | crash-point i duplicate-delivery tests | Val 4 |
| Schema/migration | zero/upgrade/expand-contract/restore | Valovi 1, 10 |
| Queue/scheduler | Redis restart, poison item, duplicate worker, drain | Valovi 1, 6 |
| Upload/storage | MIME/path/size/stage/promote/reconcile/persistence | Valovi 4, 7, 8 |
| Privacy/secret | key rotation, legal hold, erase/export auth, redaction | Valovi 1–3, 8 |
| API contract | producer-consumer fixture, typed errors, pagination bounds | svaki domain val |
| Observability | trace propagation, cardinality load, alert state race | Val 9 |
| Container/supply chain | UID, read-only FS, SBOM, scan, provenance | Val 1 |
| CLI/data repair | target guard, dry-run parity, resume, operator audit | Val 10 |
| Final quality | full CI/E2E/perf/security + rescore | Val 11 |

## 17. Procjena veličine i paralelizacija

Ovo nije jedan linearni PR. Relativna procjena:

| Val | Veličina | Može paralelno nakon zavisnosti |
|---|---:|---|
| 0 | L | harness, route manifest, traceability, container test |
| 1 | XL | image, DB migration role, Redis TLS, worker lifecycle |
| 2 | XL | identity model i route matrix tek nakon W0/W1 |
| 3 | XL | audit i config podtimovi uz zajedničku DB disciplinu |
| 4 | XL | outbox/idempotency/storage primitive |
| 5 | XL | tickets; routing/SLA; catalog/templates kao tri podvala |
| 6 | XL | channeli paralelno nakon outboxa |
| 7 | XL | assets; problem/change; knowledge/report/search paralelno |
| 8 | XL | install/config prvo, zatim integracije |
| 9 | L | health/log/trace/alerts/runbook podvale |
| 10 | L | CLI i data repair po završetku schema rezova |
| 11 | XL | testovi paralelno, release gate sekvencijalno |

Svaki val treba vlastiti početni baseline, acceptance checklistu, rollout/rollback zapis, završni SHA, CI dokaz i parcijalni rescore. Brzina ne opravdava preskakanje dependency reda.

## 18. Presuda plana

Backend ima široku funkcionalnu bazu, ali 692 nalaz i 174 P1 znače da “jedan veliki cleanup” nije siguran pristup. Najkraći siguran put prvo smanjuje sistemski blast radius — reproducibilnost, privilege separation, TLS, revocation, audit i transakcijske primitive — pa tek zatim popravlja domain state machineove. Implementacija treba početi tek nakon korisničkog odobrenja ovog master plana i mora zadržati BA traceability do finalnog release gatea.
