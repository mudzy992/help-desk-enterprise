# Backend implementacijski master plan

**Status:** odobren — Valovi 0–6 su završeni; implementacijski Val 7 je u toku<br>
**Datum ažuriranja:** 2026-10-29<br>
**Ulaz:** 44 završene audit jedinice, 692 ukupna nalaza (588 otvorenih / 104 zatvorena)<br>
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
- W3.1 je tada bio sljedeći paket; njegov closeout i kasniji valovi dokumentovani su niže. Aktuelna implementacija je na Valu 7 (W7.1 završen).

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
- **W5.13 bounded archive/waiting worker obrada — završen** na SHA `cb3f945`, CI `40329391858`.
- Shared keyset scanner sa batch/run budget granicom, DB due filtrima, continuation semantikom i per-ticket error isolation zatvorio je `BA-tickets-13`; 10.000-candidate/poison test dokaz je u [40-ticket-bounded-automation-workers.md](implementation/40-ticket-bounded-automation-workers.md).
- Registar je sada **643 otvorena / 49 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.14 bounded/distributed duplicate guardrail — završen** na SHA `bfcc328`, CI `40331048262`.
- DB-window/root filter i limit 100 ograničavaju similarity rad, dok PostgreSQL transaction advisory lock atomizuje repeat count+claim i create duplicate preflight među replikama. Stvarni 20-way concurrency dokaz zatvorio je `BA-tickets-14` i dokumentovan je u [41-ticket-bounded-distributed-guardrails.md](implementation/41-ticket-bounded-distributed-guardrails.md).
- Registar je sada **642 otvorena / 50 zatvorenih / 692 ukupno**; paket nema novu migraciju. Korisnik je potvrdio uspješnu primjenu W5.12 migracije `20271026120000_ticket_side_effect_outbox`.
- **W5.15 saved-view concurrency invarijante — završen** na SHA `f87da63`, CI `40336570823`.
- Per-user PostgreSQL transaction lock atomizuje max count/create i default clear/set, dok partial unique indeks garantuje jedan default; stvarni 20-way create i parallel-default dokaz zatvorio je `BA-tickets-15` i dokumentovan je u [42-ticket-saved-view-concurrency-invariants.md](implementation/42-ticket-saved-view-concurrency-invariants.md).
- Registar je sada **641 otvoren / 51 zatvoren / 692 ukupno**; migracija `20271026130000_saved_view_concurrency_invariants` je obavezna ručna release-migrator radnja.
- **W5.16 attachment streaming/backpressure — završen** na SHA `7f09966`, CI `40340858766`.
- Disk-backed multipart, bounded signature read, streaming ClamAV/storage/download i shared concurrency/queue timeout limiter uklonili su per-request 100 MB heap buffering; 32 MiB stream i 20-way limiter test zatvorili su `BA-tickets-16`. Dokaz je u [43-ticket-attachment-streaming-backpressure.md](implementation/43-ticket-attachment-streaming-backpressure.md).
- Registar je sada **640 otvorenih / 52 zatvorena / 692 ukupno**; paket nema novu migraciju. W5.15 migracija `20271026130000_saved_view_concurrency_invariants` ostaje obavezna release-migrator radnja dok korisnik ne potvrdi primjenu.
- **W5.17 saved-view `sort:null` clear semantika — završen** na SHA `943286d`, CI `40344015280`.
- Omitted/object/explicit-null update stanja sada imaju odvojenu Prisma semantiku, a stvarni PostgreSQL dokaz potvrđuje persisted SQL NULL; time je zatvoren `BA-tickets-17`. Dokaz je u [44-ticket-saved-view-sort-clear-semantics.md](implementation/44-ticket-saved-view-sort-clear-semantics.md).
- Registar je sada **639 otvorenih / 53 zatvorena / 692 ukupno**; paket nema novu migraciju. W5.15 migracija `20271026130000_saved_view_concurrency_invariants` ostaje obavezna release-migrator radnja dok korisnik ne potvrdi primjenu.
- **W5.18 shared visibility parity contract — završen** na SHA `58b55f1`, CI `40362428376`.
- Jedan capability/predicate entrypoint formalizira detail/list/count/summary/search, group-inbox narrowing i audit-export scope; generativna actor/config matrica zatvorila je `BA-tickets-18`. Dokaz je u [45-ticket-shared-visibility-parity-contract.md](implementation/45-ticket-shared-visibility-parity-contract.md).
- Registar je sada **638 otvorenih / 54 zatvorena / 692 ukupno**; paket nema novu migraciju. Korisnik je potvrdio uspješnu primjenu W5.15 migracije `20271026130000_saved_view_concurrency_invariants`.
- **W5.19 executable race/fault evidence completion — završen** na SHA `dcf94f9`, CI `40367476585`.
- Izolovani PostgreSQL manifest sada obavezno izvršava svih 13 ticket race/fault suiteova; manifest guard sprječava tiho ispadanje. Kompletni shard otkrio je i ispravio Prisma `void` advisory-lock runtime kvarove u W5.14/W5.15, a ponovljeni run je potpuno zelen. Time je zatvoren `BA-tickets-19`; dokaz je u [46-ticket-executable-race-fault-evidence.md](implementation/46-ticket-executable-race-fault-evidence.md).
- **Tickets modul `BA-tickets-01`–`BA-tickets-19` je potpuno zatvoren.** Registar je sada **637 otvorenih / 55 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.20 scoped routing target authorization — završen** na SHA `2575e47`, CI `40371361442`.
- Jedinstveni OU/service target eligibility ugovor sada štiti create/update i filtrira `/routing/groups`; globalni routing admin i superadmin zadržavaju eksplicitnu cross-OU mogućnost. Time je zatvoren `BA-routing-01`; dokaz je u [47-routing-scoped-target-authorization.md](implementation/47-routing-scoped-target-authorization.md).
- Registar je sada **636 otvorenih / 56 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.21 service activation routing coverage — završen** na SHA `da66f2c`, CI `40374063956`.
- Aktivacijski gate sada zahtijeva exact/ancestor resolution za svaki OU, uključujući nezavisna OU stabla, i izlaže determinističan missing skup. Time je zatvoren `BA-routing-02`; dokaz je u [48-routing-service-activation-coverage.md](implementation/48-routing-service-activation-coverage.md).
- Registar je sada **635 otvorenih / 57 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.22 scoped routing coverage pagination — završen** na SHA `93ead93`, CI `40375898079`.
- Authorization scope sada se primjenjuje prije DB count/cursor/page operacija, a OU/service assignment parovi ostaju povezani bez scope cross-producta. Time je zatvoren `BA-routing-03`; dokaz je u [49-routing-scoped-coverage-pagination.md](implementation/49-routing-scoped-coverage-pagination.md).
- Registar je sada **634 otvorena / 58 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.23 exact scoped coverage total — završen** na SHA `568141a`, CI `40377931686`.
- Scope-aware DB count dijeli predicate sa cursor stranicom, a 75 dozvoljenih i 75 isprepletenih zabranjenih servisa dokazuju tačan total iznad ranijeg capa 50. Time je zatvoren `BA-routing-04`; dokaz je u [50-routing-exact-scoped-coverage-total.md](implementation/50-routing-exact-scoped-coverage-total.md).
- Registar je sada **633 otvorena / 59 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.24 paginated routing rules and change logs — završen** na SHA `567f9a4`, CI `40380455353`.
- Rules i change-log endpointi sada imaju bounded typed cursore, stabilne keyset redoslijede, scope-aware DB upite te pouzdane `total`/`hasMore` vrijednosti; frontend je usklađen sa page ugovorom. Time je zatvoren `BA-routing-05`; dokaz je u [51-routing-rules-change-log-pagination.md](implementation/51-routing-rules-change-log-pagination.md).
- Registar je sada **632 otvorena / 60 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.25 bounded OU ancestor resolution — završen** na SHA `4a2dce0`, CI `40381960475`.
- Pojedinačni resolve/preview više ne skenira cijelu OU tabelu nego slijedi samo parent lanac uz fail-closed depth budget 256; 10.000 unrelated-OU test dokazuje trošak proporcionalan dubini. Time je zatvoren `BA-routing-06`; dokaz je u [52-routing-bounded-ancestor-resolution.md](implementation/52-routing-bounded-ancestor-resolution.md).
- Registar je sada **631 otvoren / 61 zatvoren / 692 ukupno**; paket nema novu migraciju.
- **W5.26 deleted scoped routing history — završen** na SHA `5daf251`, CI `40384827667`.
- Routing change log sada trajno čuva OU/service authorization scope; scoped reader zadržava vlastitu create/delete historiju nakon brisanja, dok foreign obrisano pravilo ostaje 403. Time je zatvoren `BA-routing-07`; dokaz je u [53-routing-deleted-scoped-history.md](implementation/53-routing-deleted-scoped-history.md).
- Registar je sada **630 otvorenih / 62 zatvorena / 692 ukupno**. Migracija `20271026140000_routing_change_log_scope` je obavezna ručna release-migrator radnja.
- **W5.27 optimistic routing update concurrency — završen** na SHA `3a88b2b`, CI `40398241803`.
- Obavezni `expectedUpdatedAt` i atomski conditional update uklanjaju silent last-write-wins; stale writer dobija stabilni HTTP 409, a samo pobjednik piše ChangeLog. Time je zatvoren `BA-routing-08`; dokaz je u [54-routing-optimistic-update-concurrency.md](implementation/54-routing-optimistic-update-concurrency.md).
- Registar je sada **629 otvorenih / 63 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W5.28 routing coverage resource budget — završen** na SHA `ca6f6fe`, CI `40401904911`.
- Coverage sada primjenjuje item/byte/time budget, nastavlja cursor samo iza kompletnog servisa, zahtijeva OU filter kada jedan servis prelazi limit i emituje strukturirane metrike. Time je zatvoren `BA-routing-09`; dokaz je u [55-routing-coverage-resource-budget.md](implementation/55-routing-coverage-resource-budget.md).
- Registar je sada **628 otvorenih / 64 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W5.29 fail-closed OU ancestor integrity — završen** na SHA `361c52e`, CI `40521917956`.
- DB-backed resolution i in-memory coverage walker više ne skraćuju oštećen OU ancestor lanac: cycle, missing parent i depth overflow vraćaju stabilan fail-closed integrity signal. Time je zatvoren `BA-routing-10`; dokaz je u [56-routing-ou-ancestor-integrity.md](implementation/56-routing-ou-ancestor-integrity.md).
- Registar je sada **627 otvorenih / 65 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.30 izvršiva routing kritična matrica — završen** na SHA `6457460`, CI `40524653649`.
- Obavezni izolovani generated-Prisma/PostgreSQL shard sada dokazuje scoped page/total bez foreign redova, parent fallback na velikom OU datasetu i concurrent optimistic update sa tačno jednim pobjednikom i ChangeLog zapisom. Time je zatvoren `BA-routing-11`; dokaz je u [57-routing-critical-postgresql-matrix.md](implementation/57-routing-critical-postgresql-matrix.md).
- Registar je sada **626 otvorenih / 66 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.31 SLA durable breach/escalation signal — završen** na SHA `9d00bb0`, CI `40547086540`.
- SLA state i deterministički runtime intent sada se zapisuju u istoj PostgreSQL transakciji; zasebni reconciler pruža lease/retry/dead-letter delivery, a stabilni ticket/clock/transition/rule ključ i idempotentni system-event uklanjaju trajni gubitak i logičke duplikate. Time je zatvoren `BA-sla-01`; dokaz je u [58-sla-durable-runtime-signal.md](implementation/58-sla-durable-runtime-signal.md).
- Registar je sada **625 otvorenih / 67 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.32 SLA concurrent scan/lifecycle coordination — završen** na SHA `9181872`, CI `40552249815`.
- PostgreSQL transaction-scoped ticket lock sada serijalizuje cijeli scanner/request read-evaluate-write ciklus, state i outbox intent ostaju u istoj transakciji, a first-response timestamp koristi monotoni conditional write. Obavezni two-client PostgreSQL shard dokazuje per-ticket serijalizaciju bez globalnog blokiranja. Time je zatvoren `BA-sla-02`; dokaz je u [59-sla-concurrent-write-coordination.md](implementation/59-sla-concurrent-write-coordination.md).
- Registar je sada **624 otvorena / 68 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.33 SLA resource-scope authorization — završen** na SHA `fc1936f`, CI `40554752106`.
- SLA konfiguracija je formalizovana kao globalna administracijska granica: svih pet config kontrolera zahtijeva globalni assignment sa `sla.write`, bez cross-assignment scope kombinovanja; scoped administratori ne mogu mutirati niti čitati globalne resurse, historiju ili foreign escalation targete. Time je zatvoren `BA-sla-03`; dokaz je u [60-sla-global-administration-scope.md](implementation/60-sla-global-administration-scope.md).
- Registar je sada **623 otvorena / 69 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.34 SLA DST-safe civil-time deadline engine — završen** na SHA `1b1749b`, CI `40557025171`.
- Civil-time konverzija sada enumerira IANA offset kandidate i potvrđuje round-trip; fold bira raniji instant, gap prvi naredni reprezentabilni minut, a add/count koriste stvarno protekle minute otvorenog lokalnog intervala. Sarajevo, New York i Lord Howe gap/fold matrica dokazuje monotonicity i add/count round-trip. Time je zatvoren `BA-sla-04`; dokaz je u [61-sla-dst-safe-civil-time.md](implementation/61-sla-dst-safe-civil-time.md).
- Registar je sada **622 otvorena / 70 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.35 race-safe first SLA timer creation — završen** na SHA `e7efb10`, CI `40559964964`.
- Prvi timer koristi first-writer-wins upsert bez update overwritea; Prisma adapter `P2002` race reloaduje winner, dok druge greške ostaju vidljive. Two-client PostgreSQL test dokazuje jedan red, isti winner ID i kompletno neprepisano pobjedničko stanje. Time je zatvoren `BA-sla-05`; dokaz je u [62-sla-race-safe-first-timer.md](implementation/62-sla-race-safe-first-timer.md).
- Registar je sada **621 otvoren / 71 zatvoren / 692 ukupno**; paket nema novu migraciju.
- **W5.36 self-healing SLA scheduler registration — završen** na SHA `e588462`, CI `40561511177`.
- Scheduler sada ostaje živ nakon prolaznog registration kvara, retrya sa bounded eksponencijalnim backoffom, periodično idempotentno vraća uklonjeni schedule i izlaže strukturirani readiness snapshot; shutdown uredno prekida timer. Time je zatvoren `BA-sla-06`; dokaz je u [63-sla-self-healing-scheduler-registration.md](implementation/63-sla-self-healing-scheduler-registration.md).
- Registar je sada **620 otvorenih / 72 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W5.37 poison-isolated SLA scan/backfill batches — završen** na SHA `3935807`, CI `40564945465`.
- Scan i backfill imaju per-ticket failure isolation, durable retry/quarantine zapis, exponential retry, treći-kvar quarantine, success cleanup i DB-level izostavljanje blocked ticketa prije batch limita. Time je zatvoren `BA-sla-07`; dokaz je u [64-sla-poison-isolated-batches.md](implementation/64-sla-poison-isolated-batches.md).
- Registar je sada **619 otvorenih / 73 zatvorena / 692 ukupno**. Migracija `20271027180000_sla_scan_failure_quarantine` je obavezna ručna release-migrator radnja.
- **W5.38 concurrency-safe SLA rule/escalation invariants — završen** na SHA `4357ba3`, CI `40568593132`.
- Profile-scoped transaction lock obuhvata invariant read/write i ChangeLog; DB unique indeksi garantuju null-safe rule effective key i escalation offset, dok zaključani count/create čuva max-level. Two-client PostgreSQL test dokazuje sve tri race granice. Time je zatvoren `BA-sla-08`; dokaz je u [65-sla-concurrent-rule-invariants.md](implementation/65-sla-concurrent-rule-invariants.md).
- Registar je sada **618 otvorenih / 74 zatvorena / 692 ukupno**. Migracija `20271027190000_sla_rule_invariants` je obavezna ručna release-migrator radnja.
- **W5.39 bounded SLA compliance aggregation — završen** na SHA `6e22b2d`, CI `40570437083`.
- PostgreSQL sada agregira profile/unit/service/group bez ticket-row materializacije u Nodeu, uz 365-day, 1.000-profile, 15.000-row, 4 MiB i 10 s budžete. Obavezni real-DB shard potvrđuje aggregate/procent ugovor. Time je zatvoren `BA-sla-09`; dokaz je u [66-sla-bounded-compliance-aggregation.md](implementation/66-sla-bounded-compliance-aggregation.md).
- Registar je sada **617 otvorenih / 75 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.40 atomic and repairable SLA startup seed — završen** na SHA `e47a774`, CI `40572931191`.
- Starting profile seed sada atomično upisuje profil/rules/escalations/audit pod key-based advisory lockom, a parcijalne laddere reparira po offsetu; konkurentni startup i repair dokazani su na stvarnom PostgreSQL-u. Time je zatvoren `BA-sla-10`; dokaz je u [67-sla-atomic-repairable-startup-seed.md](implementation/67-sla-atomic-repairable-startup-seed.md).
- Registar je sada **616 otvorenih / 76 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.41 versioned SLA timer configuration and deterministic recompute — završen** na SHA rasponu `b7bb1db`–`e7222be`, CI `40580180368`.
- Timeri sada nose immutable rule/calendar snapshot i verziju; grandfather runtime ne čita naknadno izmijenjen kalendar, a globalno autorizovani preview/apply workflow radi cursor batcheve do 100 redova uz stale-token zaštitu, ticket lock, reason/actor audit i determinističan recompute. Migracija `20271027200000_sla_timer_configuration_snapshot` je korisnički potvrđena kao primijenjena. Time je zatvoren `BA-sla-11`; dokaz je u [68-sla-versioned-timer-configuration.md](implementation/68-sla-versioned-timer-configuration.md).
- Registar je sada **615 otvorenih / 77 zatvorenih / 692 ukupno**.
- **W5.42 active and scope-eligible SLA escalation recipients — završen** na SHA `7fced76`, `bf956b2` i `5499a2c`, CI `40584535451`.
- Explicit user, role, group i on-call publike sada filtriraju active/anonymized status, membership te OU/service scope; prazna publika koristi scope-eligible handler fallback ili kanonski audit alarm. PostgreSQL test potvrđuje inactive i sibling-OU odbijanje i empty-audience audit. Time je zatvoren `BA-sla-12`; dokaz je u [69-sla-active-scoped-escalation-recipients.md](implementation/69-sla-active-scoped-escalation-recipients.md).
- Registar je sada **614 otvorenih / 78 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.43 scope-aware and paginated SLA administration reads — završen** na SHA rasponu `33a3f09`–`dc72754`, CI `40697181339`.
- `sla.read`, principal-derived OU/service scope, DB-level filtering, fail-closed single-resource/change-log odluke i bounded cursor page envelope sada pokrivaju profile, kalendare, pravila i escalation pravila. PostgreSQL test potvrđuje globalni i dozvoljeni OU/service rezultat, sibling/cross-service odbijanje i cursor granice. Time je zatvoren `BA-sla-13`; dokaz je u [70-sla-scoped-paginated-administration-reads.md](implementation/70-sla-scoped-paginated-administration-reads.md).
- Registar je sada **613 otvorenih / 79 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.44 scope-aware descendant/profile lookup optimization — završen** na SHA `97a5b45`, CI `40699122969`.
- Compliance sada radi DB-level exact/subtree OU query umjesto globalnog direktorijskog loada, a profile metadata učitava samo za profile prisutne u scoped aggregate/row rezultatu. Globalni zero-sample profili više se ne vraćaju bez policy osnove. Time je zatvoren `BA-sla-14`; dokaz je u [71-sla-scoped-descendant-profile-lookups.md](implementation/71-sla-scoped-descendant-profile-lookups.md).
- Registar je sada **612 otvorenih / 80 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.45 SLA delivery and integrity observability — završen** na SHA `c1ae4d1` i `faee216`, CI `40702205171`.
- System Health snapshot sada izlaže SLA transition outbox backlog/latency/dead-letter, empty fan-out, due scan age/backlog/retry/quarantine, scheduler registration, configuration drift i due-before-start integrity metrike. PostgreSQL dokaz potvrđuje pending outbox, drift i invalid due detekciju. Time je zatvoren `BA-sla-15`; dokaz je u [72-sla-delivery-integrity-observability.md](implementation/72-sla-delivery-integrity-observability.md).
- Registar je sada **611 otvorenih / 81 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W5.46 executable SLA failure/concurrency/scope/DST test matrix — završen** na SHA `9ba00dd`, CI `40704810126`.
- Verzionarni matrix inventariše 20 kritičnih specova u failure, concurrency, scope, DST, fake-clock i PostgreSQL kategorijama, fail-closed provjerava fajlove i CI preduvjete te ima zaseban generated-Prisma unit gate i real-DB shard. Time je zatvoren `BA-sla-16`; dokaz je u [73-sla-executable-critical-test-matrix.md](implementation/73-sla-executable-critical-test-matrix.md).
- Registar je sada **610 otvorenih / 82 zatvorenih / 692 ukupno**; SLA audit jedinica nema otvorenih nalaza, a paket nema novu migraciju.
- **W6.1 status-page resource-aware STAFF_ONLY read granica — završen** na SHA `e60e997`, CI `40732153002`.
- Service-scoped staff odluka sada fail-closed pokriva overview, incident, service i ticket-linked read, autore i counters; public sanitizer koristi eksplicitnu allowlist projekciju. Time je zatvoren `BA-status-page-01`; dokaz je u [74-status-page-resource-aware-staff-reads.md](implementation/74-status-page-resource-aware-staff-reads.md).
- Registar je sada **609 otvorenih / 83 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W6.2 status-page resource-scoped mutation authorization — završen** na SHA `55a5de0` + `d51ecb6`, finalni CI `40735765271`.
- Centralni resource policy sada provjerava svaki trenutni i ciljni servis za create/edit/update/resolve-preview, uz foreign not-found granicu i stvarni PostgreSQL cross-service dokaz. Time su zatvoreni `BA-status-page-02` i preklopljeni `BA-status-page-09`; dokaz je u [75-status-page-resource-scoped-mutations.md](implementation/75-status-page-resource-scoped-mutations.md).
- Registar je sada **607 otvorenih / 85 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W6.3 status-page visibility-transition subscriber revocation — završen** na SHA `77c6662` + `6fedf3a` + `deb23bd`, finalni CI `40760712472`.
- `ALL_USERS → STAFF_ONLY` atomski opoziva subscriptione; edit, resource-aware subscribe i resolve dijele per-incident advisory lock. Time je zatvoren `BA-status-page-03`; dokaz je u [76-status-page-visibility-transition-subscription-revocation.md](implementation/76-status-page-visibility-transition-subscription-revocation.md).
- Registar je sada **606 otvorenih / 86 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W6.4 durable paginated status-incident start delivery — završen** na SHA `4ea6fad` + `7575f0b` + `cab7d18` + `e97b685`, finalni CI `40766102694`.
- Create atomski upisuje outbox intent; worker keyset-paginira bez ukupnog capa uz retry/dead-letter/replay, dedupe i visibility recheck. Time je zatvoren `BA-status-page-04`; dokaz je u [77-status-page-durable-paginated-start-delivery.md](implementation/77-status-page-durable-paginated-start-delivery.md).
- Registar je sada **605 otvorenih / 87 zatvorenih / 692 ukupno**; koristi se postojeći outbox i nema nove migracije.
- **W6.5 durable bounded status-incident resolution delivery — završen** na SHA `88d7050` + `2ef9877`, finalni CI `40770312995`.
- Resolution status, update, ticket eventi, audit i delivery intent sada se atomarno commitaju; worker keyset-paginira subscribere i linked requestere u batchu 250, koristi deterministički recipient dedupe i postavlja `notifiedAt` samo poslije uspješne ili policy-terminalne obrade. Time je zatvoren `BA-status-page-05`; dokaz je u [78-status-page-durable-resolution-delivery.md](implementation/78-status-page-durable-resolution-delivery.md).
- Registar je sada **604 otvorena / 88 zatvorenih / 692 ukupno**; koristi se postojeći outbox i nema nove migracije.
- **W6.6 bounded status-incident timeline reads — završen** na SHA `73dfa9d` + `f7944af`, finalni CI `40773764675`.
- Incident list readovi sada ugrađuju latest-20 timeline sa pagination metadata, dok novi visibility-scoped endpoint stabilno keyset-paginira kompletnu historiju u validiranim stranicama do 100. Time je zatvoren `BA-status-page-06`; dokaz je u [79-status-page-bounded-timeline-reads.md](implementation/79-status-page-bounded-timeline-reads.md).
- Registar je sada **603 otvorena / 89 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W6.7 incident/ticket dual-resource link authorization — završen** na SHA `aa92ed9`, finalni CI `40775040580`.
- Link/unlink sada zahtijeva resource-scoped manage odluku nad svim incident servisima i postojeći staff ticket pristup; foreign incident je concealed prije sadržaja i bilo kojeg side effecta. Time je zatvoren `BA-status-page-07`; dokaz je u [80-status-page-dual-resource-ticket-link-authorization.md](implementation/80-status-page-dual-resource-ticket-link-authorization.md).
- Registar je sada **602 otvorena / 90 zatvorenih / 692 ukupno**; paket nema novu migraciju.
- **W6.8 optimistic incident edit/link lifecycle concurrency — završen** na SHA `92ec430`, finalni CI `40777527352`.
- Postojeći `updatedAt` je izložen kao revision; edit/link/unlink zahtijevaju `If-Match`, koriste zajednički advisory lock i CAS, a frontend propagira učitani token. Time je zatvoren `BA-status-page-08`; dokaz je u [81-status-page-optimistic-lifecycle-concurrency.md](implementation/81-status-page-optimistic-lifecycle-concurrency.md).
- Registar je sada **601 otvoren / 91 zatvoren / 692 ukupno**; paket nema novu migraciju.
- **W6.9 bounded SQL uptime aggregation i catalog/window resource budžeti — završen** na SHA `b0cb593`, finalni CI `40832485277`.
- Catalog i downtime windows koriste determinističke probe limite i `hasMore` ugovor sa UI upozorenjem; uptime overlap union se agregira u PostgreSQL-u i vraća najviše jedan red po bounded servisu. Time je zatvoren `BA-status-page-10`; dokaz je u [82-status-page-bounded-sql-uptime-and-catalog.md](implementation/82-status-page-bounded-sql-uptime-and-catalog.md).
- Registar je sada **600 otvorenih / 92 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W6.10 durable bounded incident-resolution ticket event delivery — završen** na SHA `0900d97` uz supply-chain korekcije `cb52204` + `e98ecab`, finalni CI `40836850142`.
- Resolution transakcija upisuje poseban event outbox intent; worker keyset-paginira ticket linkove po 250 bez ukupnog capa, a postojeći per-ticket idempotency ugovor čini retry/replay sigurnim. Time je zatvoren `BA-status-page-11`; dokaz je u [83-status-page-durable-bounded-resolution-ticket-events.md](implementation/83-status-page-durable-bounded-resolution-ticket-events.md).
- Registar je sada **598 otvorenih / 94 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W6.11 transaction-safe batched ticket authorization za status incident create/link (`BA-status-page-12`) — završen** na SHA `c0865e01cc08c034470f2a457264a924756a45e2`, finalni CI `40838417016`.
- Ticket autorizacija se sada izvršava unutar incident transakcije: per-incident advisory lock, deterministic `FOR SHARE` batch nad ticket redovima, jedna policy snapshot i `staff` verification za svaki ticket; nedostajući ticket baca 404 bez commitovanja. Time je zatvoren `BA-status-page-12`; dokaz je u [84-status-page-transactional-batched-ticket-authorization.md](implementation/84-status-page-transactional-batched-ticket-authorization.md).
- Registar je sada **595 otvorenih / 97 zatvorena / 692 ukupno**; paket nema novu migraciju.
- **W6.12 public status page endpoint hardening (`BA-status-page-13`, `BA-status-page-14`) — završen** na SHA `6a719b9`, finalni CI `40843156212`.
- Javni status endpoint koristi trust-proxy-aware IP za rate limiting sa fail-closed ponašanjem kada Redis nije dostupan, a shared Redis cache sa verzijom ključa invalidira se na svakoj incident mutaciji. Time su zatvoreni `BA-status-page-13` i `BA-status-page-14`; dokaz je u [85-status-page-public-endpoint-hardening.md](implementation/85-status-page-public-endpoint-hardening.md).
- Paket nema nove migracije.
- **W6.13 status-page retention and anonymization (`BA-status-page-15`) — implementiran** na SHA `171f17e`, backend build + test zelen, frontend build + test zelen.
- Nova `statusIncidents` retention kategorija u noćnom sweepu; RESOLVED incidenti stariji od konfiguranog perioda (min 180 dana, default onemogućeno) se arhiviraju sa redaktovanim naslovom/autorom; povezani updateovi, ticket linkovi i subscriptione se brišu/redaktuju. Time je zatvoren `BA-status-page-15`; dokaz je u [86-status-page-retention-and-anonymization.md](implementation/86-status-page-retention-and-anonymization.md).
- ⚠️ Paket carries **novu DB migraciju** `20271027210000_status_page_retention` (`retentionArchivedAt` na `ServiceIncident`, `contentRedactedAt` na `ServiceIncidentUpdate`) koju treba **ručno pokrenuti pri releaseu/redeployu**.
- ℹ️ Backend PostgreSQL + Redis integration job ima pre-existujući poremećaj (nepovezan sa W6.13 kodom), 사태 se prati.
- **W6.14 cursor pagination for open/history lists (`BA-status-page-16`) — implementiran** na SHA `882aceb`, backend build + test zelen, frontend build + test zelen.
- Open i history incidentne liste na status stranici sada imaju keyset paginaciju (`cursor`/`take`, `hasMore`/`nextCursor`) sa stabilnim ID tie-breakerom (`startedAt DESC, id DESC`), kao i `activeHasMore`/`activeNextCursor`/`historyHasMore`/`historyNextCursor` u odgovoru. Time je zatvoren `BA-status-page-16`; dokaz je u kodu (specovi + integration scenariji u toku).
- **W6.15 edit audit reconstruction (`BA-status-page-17`) — implementiran** na SHA `ebd937a`, backend build + test zelen, frontend build + test zelen.
- Incident `edit` transakcija zabilježi u audit zapisu rekonstrukciju promjena: `title` i `titleEn` sa `from`/`to` parovima, kao i `services` sa `added`/`removed` listama. Time je zatvoren `BA-status-page-17`; dokaz je u kodu (unit specovi + integration scenariji).
- **W6.16 backdating guard (`BA-status-page-18`) — implementiran** na SHA `f8a76f9`, backend build + test zelen, frontend build + test zelen.
- Incident `create` ograničava `startedAt` backdating: stariji od `maxStartedAtBackdateDays` (30 dana) bez `startedAtReason` baca `INCIDENT_BACKDATE_REQUIRES_REASON` (400). Audit beleži `backdated`, `backdatedDays`, `backdatedReason`. Time je zatvoren `BA-status-page-18`; dokaz je u kodu (unit specovi + integration scenariji).
- **W6.17 BA-status-page-19 — zatvoren** na SHA `8c7344e`, finalni CI `40895868319` zelen. Dodana failure matrica, paralelni create na istom servisu i 100-incident bounded-read dokaz; nema nove DB migracije.
- Val 6 je zaključen: svi početni nalazi `BA-status-page-01`–`BA-status-page-19` su zatvoreni. W6.18 nije planiran bez novog, dokazivog follow-up nalaza; aktivni rad je prešao na Val 7.

## 8. Val 7 — domain workflows

**Status:** u toku; audit plan svrstava jedinice 22–27 (`assets`, `problems`, `changes`, `knowledge-base`, `reports`, `search`) u WS-F / wave 7.<br>
**Početno stanje:** 25 P1 nalaza u ovih šest jedinica; W7.1 je zatvorio tri zajednička scope nalaza. Svaki sljedeći paket mora imati vlastiti zeleni CI dokaz prije nastavka.

### W7.1 — očuvanje assignment scopea kroz domain viewere — završeno

- Na SHA `49c6559949606ebd87c867f37fe2ce9f0363d1c0`, CI [`40911525016`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40911525016) je zelen.
- Zatvoreni nalazi: `BA-assets-01`, `BA-problems-01`, `BA-changes-01`.
- Zajednički principal-to-domain viewer više ne pretvara `ADMIN`, `PROBLEM_MANAGER` ili `CHANGE_MANAGER` role name u globalni OU bypass; globalno ponašanje zahtijeva installation-wide assignment. Scoped `SUPER_ADMIN`/nedosljedan scope ne daje SuperAdmin/global authority.
- Assets permission scope, problem-group authority i CAB membership su regresijski testirani; nema DB migracije.
- Detaljni acceptance, lokalna environment blokada i CI matrica su u [87-domain-assignment-scope.md](implementation/87-domain-assignment-scope.md).

### Sljedeći paket — W7.2

Prvo nastaviti sa `BA-assets-02` (P1): scope-filterovati i redaktovati foreign asset identitet u relation/contract prikazima. Ovaj rez slijedi W7.1 u assets fazi 1 i ima zaseban acceptance/test/CI gate; ne započinje prije nego što W7.1 kodni CI ostane zelen.

Ostali početni P1 paketi ostaju otvoreni: `BA-assets-03/04`, `BA-problems-02`–`07`, `BA-changes-02`–`07`, `BA-knowledge-base-01`–`04`, `BA-reports-01/02` i `BA-search-01`. W7 redoslijed ostaje dependency-first; ne zatvara se nalaz bez direktnog acceptance dokaza, a novi DB ugovori zahtijevaju zaseban migration/rollback plan.
