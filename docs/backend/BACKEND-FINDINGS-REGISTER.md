# Globalni registar backend nalaza

**Status:** audit baseline — implementacija nije započeta  
**Datum:** 2026-10-23  
**Opseg:** 44 audit jedinice, 692 jedinstvenih nalaza (174 P1, 368 P2, 150 P3)

Ovaj registar je kanonski indeks nalaza iz pojedinačnih audita. Detaljni dokaz, root cause, korekcija i lokalni acceptance ostaju u povezanom izvornom auditu. ID provjera potvrđuje da nema duplikata. Konsolidacija grupiše izvršenje, ali ne briše niti administrativno zatvara izvorne nalaze.

## Pravila statusa

- `otvoreno` znači da audit nije implementirao korekciju;
- severity se ne mijenja bez novog dokaza i formalne revizije izvornog audita;
- jedan implementacijski paket može zatvoriti više nalaza, ali svaki ID mora dobiti zaseban acceptance dokaz;
- cross-module deduplikacija koristi master-plan workstream kao primarnog ownera; izvorni BA ID ostaje traceability obaveza.

## Registar

| Jedinica | Modul | ID | Prioritet | Sažetak | Status | Izvor |
|---:|---|---|:---:|---|---|---|
| 01 | `authentication` | `BA-authentication-01` | P1 | Refresh oživljava session čiji registry red ne postoji | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-02` | P1 | Opoziv sesije fail-open krši logout/password-reset garanciju tokom Redis kvara | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-03` | P1 | MFA enrollment token i potvrda nisu atomski single-use | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-04` | P2 | Endpoint za opoziv jedne sesije očekuje UUID, a schema izdaje CUID | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-05` | P2 | Passkey counter update nema compare-and-set zaštitu | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-06` | P2 | Entra JWKS dohvat nema timeout ni cache | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-07` | P2 | Kritični testni gate zavisi od mrežnog Prisma engine downloada | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 01 | `authentication` | `BA-authentication-08` | P3 | Clone detekcija jednog passkeya briše sve korisnikove passkeye | otvoreno | [01-authentication.md](audits/01-authentication.md) |
| 02 | `authorization` | `BA-authorization-01` | P2 | Best-effort invalidacija može zadržati oduzeta prava do cache TTL-a | zatvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-02` | P2 | Ne postoji potpuni route-to-authorization manifest i CI guard | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-03` | P2 | Read-only zaštita zavisi od ručno održavane liste ruta i trusted izuzetaka | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-04` | P2 | Integracijski testni gate zavisi od mrežnog Prisma engine downloada | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-05` | P3 | Current-session response gubi scope uz permission capabilityje | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-06` | P3 | Dekoratori prihvataju proizvoljne stringove umjesto catalog union tipa | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-07` | P3 | Dupli `RoleGuard` + `OuAccessGuard` izvršavaju istu odluku i dedupeuju audit prve evaluacije | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 02 | `authorization` | `BA-authorization-08` | P3 | Read-only exact-path izuzeci nisu kanonski normalizovani | otvoreno | [02-authorization.md](audits/02-authorization.md) |
| 03 | `rbac` | `BA-rbac-01` | P2 | Preview nije vezan za baseline/revision i može prepisati noviju izmjenu | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-02` | P2 | Preview token je ponovo upotrebljiv tokom cijelog TTL-a | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-03` | P2 | Scoped role impact preview može prikazati pogrešan rezultat | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-04` | P2 | `SUPER_ADMIN` permission matrica je uređiva, ali runtime je ignoriše | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-05` | P2 | Post-commit invalidacija nosilaca nije durable niti fail-closed | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-06` | P3 | Preview broj pogođenih broji assignment redove, ne jedinstvene korisnike | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-07` | P3 | DTO nema eksplicitne limite za broj/dužinu permissiona i preview token | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 03 | `rbac` | `BA-rbac-08` | P3 | Aditivni seeder može vratiti namjerno uklonjena prava bez apply-time baseline potvrde | otvoreno | [03-rbac.md](audits/03-rbac.md) |
| 04 | `users` | `BA-users-01` | P1 | ADMIN users control plane ignoriše OU/service scope | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-02` | P1 | Kreiranje usera/passworda/role nije atomsko i autorizacija role dolazi prekasno | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-03` | P1 | Deactivate i identity transitioni ne opozivaju sesije/MFA lifecycle | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-04` | P2 | Concurrent ordinary role assignment može kreirati duplikate | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-05` | P2 | Role scope model dopušta besmislene dual-scope i lažno scoped SuperAdmin zapise | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-06` | P2 | Post-commit principal invalidacija nije durable ni fail-closed | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-07` | P2 | Security controller koristi UUID pipe iako `User.id` nije UUID ugovor | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-08` | P2 | Hard delete preflight ne pokriva historijske reference i može završiti sirovom FK greškom | otvoreno | [04-users.md](audits/04-users.md) |
| 04 | `users` | `BA-users-09` | P2 | User delete audit trajno kopira e-mail bez eksplicitne privacy/redaction politike | otvoreno | [04-users.md](audits/04-users.md) |
| 05 | `organizational-units` | `BA-organizational-units-01` | P1 | OU control plane ignoriše actor OU/service scope i target hijerarhiju | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-02` | P1 | Cross-instance stale `ouPath` cache privremeno zadržava pogrešan authorization scope | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-03` | P2 | Konkurentni hierarchy updatei nisu serijalizovani niti revision-guarded | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-04` | P2 | Case-insensitive DN identitet nije enforcean u bazi | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-05` | P2 | Principal invalidacija nakon mapping/deletea je optional i best effort | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-06` | P2 | Globalni tree read izlaže internu LDAP/topološku metadata svim korisnicima | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-07` | P2 | DN parser/rewrite ne podržava realni RFC 4514 skup | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-08` | P3 | Tree/detail/user read i descendant rewrite nemaju operativne granice | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 05 | `organizational-units` | `BA-organizational-units-09` | P3 | No-op PATCH piše update i audit bez stvarne promjene | otvoreno | [05-organizational-units.md](audits/05-organizational-units.md) |
| 06 | `groups` | `BA-groups-01` | P1 | Group delete može tiho cascade obrisati/odvezati kritične cross-module resurse | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-02` | P1 | Membership revoke kasni do 30 s za HTTP i do 5 min za WebSocket group room | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-03` | P1 | Fallback invariant dopušta nula ili više fallback grupa u istom OU-u | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-04` | P2 | Inactive/directory-deactivated korisnik može dobiti latentno group članstvo | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-05` | P2 | CAB/problem flagovi se gase bez dependency/lifecycle provjere | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-06` | P2 | Concurrent key/member operacije mogu procuriti kao neobrađen Prisma konflikt | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-07` | P2 | Active-ticket delete provjera ima TOCTOU prozor prema `SetNull` cascadeu | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-08` | P2 | Post-commit invalidacija je optional/best-effort i nema durable revoke intent | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-09` | P3 | Collection/detail membership readovi nemaju paginaciju ni DB-level scope pushdown | otvoreno | [06-groups.md](audits/06-groups.md) |
| 06 | `groups` | `BA-groups-10` | P3 | No-op PATCH i dalje izvršava write i response reload | otvoreno | [06-groups.md](audits/06-groups.md) |
| 07 | `settings` | `BA-settings-01` | P1 | Secret vrijednosti se čuvaju kao plaintext JSON bez envelope encryptiona | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-02` | P1 | Security konfiguracija i realtime događaj nisu cluster-atomic niti distribuirano invalidirani | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-03` | P1 | Concurrent dependency write skew može commitovati nevažeće globalno stanje | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-04` | P2 | `readOnly` je samo UI metadata i API dopušta izmjenu install-owned ključeva | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-05` | P2 | Svaki ADMIN može čitati globalni private registry bez settings-read permissiona | zatvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-06` | P2 | `[REDACTED]` placeholder može biti pohranjen kao stvarni secret | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-07` | P2 | Change log nema request ID korelaciju za configuration mutation | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-08` | P2 | Automatski dependent reset nema zaseban per-key change-log zapis | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-09` | P2 | Last-write-wins nema revision/ETag i može tiho izgubiti administratorsku izmjenu | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-10` | P3 | Key/string/JSON vrijednosti nemaju jedinstvene centralne size granice | otvoreno | [07-settings.md](audits/07-settings.md) |
| 07 | `settings` | `BA-settings-11` | P3 | Realtime key allowlist je ručno održavana i ne prati registry metadata | otvoreno | [07-settings.md](audits/07-settings.md) |
| 08 | `audit-log` | `BA-audit-log-01` | P1 | User/OU `SetNull` mijenja hashirani payload i lomi chain pri normalnom deleteu | završen (W3.2) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-02` | P1 | Hash algoritam nije pohranjen po redu i writeri ignorišu globalnu konfiguraciju | završen (W3.2) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-03` | P1 | Neključani chain i checkpoint u istoj bazi nemaju external tamper anchor | završen (W3.4) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-04` | P2 | Privacy redaction nije atomska, a redaction state nije hashiran/autentificiran | završen (W3.5) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-05` | P2 | Export i verify učitavaju kompletan scope/chain u memoriju bez limita | završen (W3.6) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-06` | P2 | Jedan globalni advisory lock serijalizuje sve auditirane write transakcije | zatvoreno | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-07` | P2 | Metadata nema action-specific schema, sensitivity policy ni size budget | zatvoreno | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-08` | P2 | Hash envelope ne veže row ID, vrijeme, algoritam ni redaction state | završen (W3.3) | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-09` | P2 | OU visibility vjeruje denormalizovanom producer scopeu bez provenance provjere | otvoreno | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-10` | P3 | Cursor/ID/query stringovi nemaju format i dužinske granice | otvoreno | [08-audit-log.md](audits/08-audit-log.md) |
| 08 | `audit-log` | `BA-audit-log-11` | P3 | Action/entityType su otvoreni stringovi bez runtime kataloga/schema versiona | otvoreno | [08-audit-log.md](audits/08-audit-log.md) |
| 09 | `security` | `BA-security-01` | P1 | MFA-disabled SuperAdmin mijenja rate limite bez step-upa | zatvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-02` | P1 | Bulk reset ostavlja aktivne sesije nakon parcijalnog kvara | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-03` | P1 | Privilegovani auth audit je best-effort i može nestati | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-04` | P2 | Klijent sam mintuje capability purpose | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-05` | P2 | Marker nije vezan za credential/authorization epoch | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-06` | P2 | Bulk eligibility ima TOCTOU sa role/identity promjenom | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-07` | P2 | Bulk nema durable operation/retry manifest | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-08` | P2 | Journal identifikatori nemaju maksimalne granice | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-09` | P2 | Kritične concurrency/failure grane nemaju test dokaz | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-10` | P3 | Step-up start nema zaseban abuse limit | otvoreno | [09-security.md](audits/09-security.md) |
| 09 | `security` | `BA-security-11` | P3 | Failure observability nema korelaciju/metrike | otvoreno | [09-security.md](audits/09-security.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-01` | P1 | 24h failure nepovratno odbacuje sigurnosni backlog | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-02` | P1 | Aktivacija preskače događaje nastale prije prvog ticka | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-03` | P1 | Proizvoljan HTTP(S) cilj omogućava SSRF i plaintext izvoz | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-04` | P2 | Settle cursor može preskočiti kasno commitovane redove | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-05` | P2 | State nema CAS/lock za paralelne tickove | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-06` | P2 | Processor skriva infrastrukturni kvar od BullMQ/statusa | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-07` | P2 | Secret nema minimalnu entropy/rotation epoch politiku | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-08` | P2 | Batch nema byte/depth budget niti outbound redaction schema | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-09` | P2 | Nema storage-backed end-to-end/concurrency dokaza | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-10` | P3 | Status/counter model je nedovoljan za reconciliation | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 10 | `security-audit-webhook` | `BA-security-audit-webhook-11` | P3 | `INTEGER` kumulativni brojači mogu overflowati | otvoreno | [10-security-audit-webhook.md](audits/10-security-audit-webhook.md) |
| 11 | `privacy` | `BA-privacy-01` | P1 | Legal hold write koristi `privacy.view` | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-02` | P1 | Anonimizacija je trajno parcijalna pri mid-flight kvaru | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-03` | P1 | Retention Redis lock može isteći i obrisati tuđi lease | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-04` | P1 | Audit redaction nije atomska niti chain-safe | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-05` | P2 | Blob/filesystem i DB lifecycle nisu durable koordinirani | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-06` | P2 | Export download se auditira prije uspješne isporuke | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-07` | P2 | Fresh-session fallback ne dokazuje SSO MFA | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-08` | P2 | Export build nema ukupni row/byte/memory budget | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-09` | P2 | Queue write nema transactional outbox | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-10` | P2 | Erasure ledger nije autentičan ni crash/concurrency-safe | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-11` | P2 | Registar/listing površine nemaju potpunu paginaciju | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-12` | P3 | Processing record sadrži neattestirane sigurnosne tvrdnje | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 11 | `privacy` | `BA-privacy-13` | P3 | Public notice cache nema eksplicitnu invalidaciju/version | otvoreno | [11-privacy.md](audits/11-privacy.md) |
| 12 | `tickets` | `BA-tickets-01` | P1 | Create-message može commitovati poruku uz API grešku i dupli retry | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-02` | P1 | Break-glass grant prethodi kompletnom audit tragu | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-03` | P1 | Bulk execute ostavlja parcijalne promjene bez operation manifesta | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-04` | P1 | Split attachment copy pokazuje na nepostojeći blob | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-05` | P1 | Split kreira parcijalne childove prije pune validacije | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-06` | P1 | Approval decision/gate nisu concurrency-safe | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-07` | P1 | CSV limit prije permission/confidential filtera daje tih nepotpun export | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-08` | P1 | Guardrail claim-before-effect može trajno progutati automation/CSAT | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-09` | P2 | Attachment limit/delete i DB/storage lifecycle nisu konzistentni | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-10` | P2 | Reopen same-ticket nije transakcijski niti idempotentan | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-11` | P2 | Remote rate limit ima race i neograničeno čita system evente | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-12` | P2 | SLA/realtime/notification side effecti nemaju durable outbox/recovery | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-13` | P2 | Archive/waiting workeri nemaju batch/cursor granicu | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-14` | P2 | Duplicate guardrail query i distributed repeat limit nisu bounded/atomic | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-15` | P2 | Saved-view max/default invarijante nisu concurrency-safe | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-16` | P2 | Attachment I/O bufferuje do 100 MB po zahtjevu | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-17` | P3 | Saved-view `sort:null` ne briše prethodni sort | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-18` | P3 | Counts/derived visibility nisu formalno jedan shared parity ugovor | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 12 | `tickets` | `BA-tickets-19` | P3 | Kritične fault/race grane nemaju izvršiv integration dokaz | otvoreno | [12-tickets.md](audits/12-tickets.md) |
| 13 | `routing` | `BA-routing-01` | P1 | Scoped admin može rutirati ticket na grupu izvan svog OU scopea | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-02` | P1 | Service activation “coverage” prihvata bilo koje jedno pravilo | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-03` | P2 | Scoped coverage paginira prije authorization filtera | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-04` | P2 | Scoped coverage `total` računa samo ograničenu prvu stranicu | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-05` | P2 | Rule/change-log liste su neograničene i post-filterirane | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-06` | P2 | Single-ticket resolve učitava kompletno OU stablo | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-07` | P2 | Scoped historija obrisanog pravila postaje nedostupna | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-08` | P2 | Concurrent update je neoznačeni last-write-wins | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-09` | P3 | Coverage matrica nema item/byte/runtime budžet | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-10` | P3 | OU cycle/missing parent se tiho tretira kao kraj lanca | otvoreno | [13-routing.md](audits/13-routing.md) |
| 13 | `routing` | `BA-routing-11` | P3 | Kritične scoped/race/load grane nemaju izvršiv dokaz | otvoreno | [13-routing.md](audits/13-routing.md) |
| 14 | `sla` | `BA-sla-01` | P1 | State marker se persistira prije eventa pa retry trajno gubi breach/escalation signal | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-02` | P1 | Scanner i lifecycle bez concurrency protokola gube/dupliraju state i događaje | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-03` | P1 | Scoped `sla.write` omogućava globalne SLA mutacije i foreign targete | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-04` | P1 | DST civil-time konverzija može dati deadline prije starta ili preskočiti sedmicu | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-05` | P2 | Paralelni prvi timer start vraća unique grešku umjesto idempotentnog uspjeha | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-06` | P2 | Scheduler registration nema retry/reconciliation u živom procesu | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-07` | P2 | Jedan poison state prekida scan/backfill batch i ponavlja već obrađene redove | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-08` | P2 | Rule/escalation uniqueness i max-level invariante nisu concurrency-safe | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-09` | P2 | Compliance neograničeno učitava cijeli OU/time-window skup u memoriju | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-10` | P2 | Startup seed može duplirati/napola kreirati escalation ladder | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-11` | P2 | Aktivni timeri nemaju config verziju, migration ni determinističan recompute policy | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-12` | P2 | Escalation recipienti ne garantuju aktivnog/scope-eligible primaoca | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-13` | P3 | Admin read/change-log liste su globalne, role-only i nepaginirane | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-14` | P3 | Compliance i resolution ponavljano učitavaju široke OU/profile skupove | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-15` | P3 | Observability nema per-failure/outbox lag/recipient-empty/DST integrity metrike | otvoreno | [14-sla.md](audits/14-sla.md) |
| 14 | `sla` | `BA-sla-16` | P3 | Kritična failure/concurrency/scope/DST test matrica nije izvršiva ni kompletna | otvoreno | [14-sla.md](audits/14-sla.md) |
| 15 | `service-catalog` | `BA-service-catalog-01` | P1 | Form schema se može izmijeniti nakon što je ticket veže zbog TOCTOU immutable provjere | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-02` | P1 | Config activation/rollback zaobilazi form/lifecycle invariante i historijsku immutable zaštitu | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-03` | P1 | Admin regex pattern omogućava requester-triggered catastrophic backtracking/ReDoS | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-04` | P1 | ACTIVE lifecycle prihvata parcijalnu routing coverage i ostavlja OU-ove unrouted | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-05` | P2 | Concurrent form activation može ostaviti više ACTIVE verzija | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-06` | P2 | First/version create race vraća provider grešku i nema stabilan idempotency/conflict ugovor | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-07` | P2 | Downtime overlap invariant nije concurrency-safe | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-08` | P2 | Concurrent category parent update može napraviti ciklus | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-09` | P2 | Service/category/lifecycle/availability updatei su silent last-write-wins | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-10` | P2 | Service/list/form/downtime readovi su neograničeni i resource-unbounded | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-11` | P2 | Change-owned downtime sync je best-effort bez durable retry/reconciliationa | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-12` | P2 | Scoped catalog writer može globalno kreirati servise/kategorije i vidjeti sve admin draftove | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-13` | P3 | Category/lifecycle/form mutacije nemaju dosljedan caller-supplied reason ugovor | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-14` | P3 | Incident read fail-open tiho prikazuje zdrav servis na DB grešci | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 15 | `service-catalog` | `BA-service-catalog-15` | P3 | Kritična concurrency/security/config test matrica nije izvršiva ni kompletna | otvoreno | [15-service-catalog.md](audits/15-service-catalog.md) |
| 16 | `templates` | `BA-templates-01` | P1 | Service-scoped manager može čitati sve foreign shared templatee i playbooke | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-02` | P1 | Settings kvar fail-open spušta `block` na `warn` i može uključiti ugašene funkcije | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-03` | P1 | Concurrent playbook update može proizvesti hibrid koraka/scopea i netačnu verziju | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-04` | P2 | Concurrent step/upgrade operacije daju duple ili izostale evente i stale checked redove | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-05` | P2 | Auto-attach je best-effort bez durable retry/reconciliationa | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-06` | P2 | Config snapshot nije potpun i apply zaobilazi domenske invariante/audit | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-07` | P2 | Playbook name uniqueness je read-before-write bez DB zaštite | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-08` | P2 | Definition updatei su silent last-write-wins bez optimistic preconditiona | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-09` | P2 | Management/candidate liste su hard-truncated bez paginacije/truncation ugovora | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-10` | P2 | Aktivna ticket-checklista nema DB partial unique invariant | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-11` | P3 | Realtime publish poslije commita nema retry/delivery signal | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-12` | P3 | Bulk attach do 500 ticketa nema async job/time budget i može biti dug HTTP zahtjev | otvoreno | [16-templates.md](audits/16-templates.md) |
| 16 | `templates` | `BA-templates-13` | P3 | Kritična scope/failure/concurrency matrica nije lokalno izvršiva ni kompletna | otvoreno | [16-templates.md](audits/16-templates.md) |
| 17 | `notifications` | `BA-notifications-01` | P1 | Primarni fan-out je detached in-memory tok bez outboxa, replaya ili recoveryja | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-02` | P1 | Stale membership cache privremeno zadržava pristup group notification sadržaju | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-03` | P1 | Digest šalje aktuelni ticket sadržaj bez ponovne provjere recipient pristupa | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-04` | P2 | Preference/settings kvar fail-open zaobilazi user opt-out i administratorske lockove | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-05` | P2 | Concurrent batch dedupe gubitnik publishuje phantom notification ID i dupli downstream event | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-06` | P2 | `mark-all-read` nema transaction/cutoff i može progutati ili netačno prijaviti novi unread | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-07` | P2 | Stale email claim takeover može duplirati već poslanu poruku | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-08` | P2 | Inbox nema cursor/hasMore i starija historija je nedostupna | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-09` | P2 | Email delivery adresa/status nemaju retention/redaction lifecycle | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-10` | P2 | Delivery state nema attempts/error/dead/retry ugovor ni dokaz stvarnog provider ishoda | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-11` | P2 | Group mark-all učitava i insertuje neograničen skup ID-eva u jednom HTTP zahtjevu | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-12` | P3 | Digest retention grešku guta i izvještava kao nula | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-13` | P3 | Redis fallback test-email limit je per-instance i mapa nema cleanup | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-14` | P3 | Kritični recovery/scope/concurrency scenariji nemaju E2E dokaz | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 17 | `notifications` | `BA-notifications-15` | P3 | Većina DB direktnih suiteova lokalno je compile-blocked generated Prisma klijentom | otvoreno | [17-notifications.md](audits/17-notifications.md) |
| 18 | `websocket` | `BA-websocket-01` | P1 | Aktivni socket ignoriše logout/revoke/expiry/password/authz-version promjene | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-02` | P1 | Ticket staff/public/base sobe se nakon joina nikad ne reautorizuju | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-03` | P1 | Group/admin revocation kasni 5 min i DB kvar ostavlja stare sobe fail-open | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-04` | P1 | Default-on legacy group emit šalje puni payload bez per-ticket authorizationa | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-05` | P2 | Runtime Redis adapter kvar nema pouzdan fallback/effective-health i gubi cross-instance emit | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-06` | P2 | Join/presence limiter je per-socket bez user/IP/connection limita | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-07` | P2 | Private setting key metadata emituje se svim autentifikovanim korisnicima | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-08` | P2 | User/group room join nije awaitan i početni događaj može biti propušten | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-09` | P2 | Reconnect nema sequence/cursor/replay niti formalni catch-up ugovor | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-10` | P2 | Room revalidation je N×sekvencijalna, bez overlap/resource guarda | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-11` | P2 | Socket može akumulirati neograničen broj ticket soba | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-12` | P3 | Shutdown ne awaita zatvaranje Redis adapter konekcija | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-13` | P3 | Admin-room global/scoped semantika nije eksplicitna i sigurna za proširenje payloadova | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 18 | `websocket` | `BA-websocket-14` | P3 | Kritična revocation/cross-instance matrica nema lokalni ni E2E dokaz | otvoreno | [18-websocket.md](audits/18-websocket.md) |
| 19 | `integration-queue` | `BA-integration-queue-01` | P1 | DB/Bull dual-write crash gap trajno orphanira enqueue, retry i admin-retry poslove | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-02` | P1 | Processor nema conditional lease claim pa dupli Bull poslovi paralelno dispatchuju | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-03` | P1 | EDGE_EVENT `PUBLISH=0` postaje COMPLETED bez ijednog primaoca ili replaya | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-04` | P1 | Scoped ADMIN može čitati globalne sirove email/Edge/Teams payloadove | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-05` | P2 | PROCESSING nema lease/stale recovery i može ostati zauvijek | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-06` | P2 | SMTP/Teams send-before-final-state crash može duplirati provider isporuku | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-07` | P2 | Payload parseri nemaju veličinske/dubinske resource granice | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-08` | P2 | COMPLETED i drugi nedovršeni statusi nemaju retention/redaction lifecycle | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-09` | P2 | DLQ retention je neograničen `deleteMany` bez batcha | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-10` | P2 | Heartbeat može biti active dok glavni processing/delivery put ne radi | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-11` | P2 | Admin retry nije auditiran i briše attempts/error forenzički trag | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-12` | P2 | Runtime queue/type disable nema paused/cancelled semantiku i troši pokušaje | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-13` | P3 | Raw error message nema stabilan code/redaction ugovor | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-14` | P3 | Teams skipped/gone/nonretryable završava kao generički COMPLETED | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 19 | `integration-queue` | `BA-integration-queue-15` | P3 | Kritični DB/processor/crash testovi su compile-blocked i E2E je statusno slab | otvoreno | [19-integration-queue.md](audits/19-integration-queue.md) |
| 20 | `inbound-email` | `BA-inbound-email-01` | P1 | PROCESSING crash recovery odbacuje poruku bez sigurnog replaya/reconciliationa | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-02` | P1 | Sender auth vjeruje neprovjerenom prvom Authentication-Results/ARC headeru | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-03` | P1 | Scoped ADMIN čita globalne sender/subject/ticket/error metapodatke | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-04` | P2 | Signed token recipientId se ne poredi sa stvarnim senderom | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-05` | P2 | Test-connection preuzima do deset punih raw poruka | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-06` | P2 | Provider ID lookup/store truncation nije ista i može trajno preskočiti poruku | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-07` | P2 | Message-ID dedupe je read-before-write bez DB unique zaštite | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-08` | P2 | Scheduler nema reconciliation nakon Redis gubitka | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-09` | P2 | Metadata retention je jedan neograničen deleteMany | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-10` | P2 | Case-insensitive duplicate user email daje nedeterminističnog actora | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-11` | P3 | Raw remove greška se guta pa DB link nestaje prije potvrđenog brisanja | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-12` | P3 | Raw/provider greške nemaju stabilan redigovan error-code ugovor | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 20 | `inbound-email` | `BA-inbound-email-13` | P3 | Nema mailbox→ticket E2E ni crash/concurrency/infrastrukturne matrice | otvoreno | [20-inbound-email.md](audits/20-inbound-email.md) |
| 21 | `on-call` | `BA-on-call-01` | P1 | Scoped read/manage assignment daje globalni read i write nad svim grupama | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-02` | P1 | Swap interval nije vezan za requesterovu smjenu i može istisnuti treću osobu | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-03` | P1 | Concurrent schedule save može korumpirati header/member kombinaciju | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-04` | P2 | Bivši active član grupe ostaje resolver/auto-assignment/SLA/quiet-hours kandidat | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-05` | P2 | Swap accept ne revalidira colleague membership/availability ni schedule verziju | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-06` | P2 | Owner može biti foreign staff i primati gap informacije | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-07` | P2 | iCal feed ostaje aktivan nakon oncall.read/scope revokea | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-08` | P2 | Best-effort sweep notification nema durable recovery nakon prozora | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-09` | P2 | Scheduler nema reconciliation nakon Redis gubitka | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-10` | P2 | Retention je unbounded, guta grešku i nema health signal | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-11` | P2 | Override/swap liste su hard-truncated bez pagination/hasMore | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-12` | P3 | Token revoke audit nije atomaran sa deleteom | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-13` | P3 | Pending identični swap zahtjevi nemaju semantic dedupe/rate limit | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 21 | `on-call` | `BA-on-call-14` | P3 | Service/concurrency/revocation integracijska matrica nije pokrivena | otvoreno | [21-on-call.md](audits/21-on-call.md) |
| 22 | `assets` | `BA-assets-01` | P1 | OU-scoped ADMIN assignment daje globalni pristup svim assets površinama | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-02` | P1 | Cross-OU relation/contract prikaz otkriva foreign asset ID/tag/name/status/type | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-03` | P1 | Status/assign/unassign nemaju version/CAS i mogu pregaziti paralelni custody/transfer | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-04` | P1 | Reminder threshold se označi poslanim i bez primaoca ili potvrđene uspješne isporuke | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-05` | P2 | Unique custom JSON atribut je read-before-write bez DB zaštite | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-06` | P2 | Parallel relation cycle/symmetric insert može prekršiti graph invariant | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-07` | P2 | Per-user license assignment nema user OU/scope kompatibilnost | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-08` | P2 | Ticket primary link nema partial unique/locking invariant | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-09` | P2 | Directory single-flight lock je samo in-memory po procesu | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-10` | P2 | Directory i reminder scheduler nemaju Redis-loss reconciliation | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-11` | P2 | Extra reminder email zaobilazi durable delivery i per-recipient dedupe/status | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-12` | P2 | License/contract/transfer i drugi business writeovi nisu atomski sa auditom | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-13` | P2 | Import claim nema eksplicitno APPLYING lease/recovery/idempotency stanje | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-14` | P2 | Transfer snapshot/signed binary nemaju definisan anonymization i retention lifecycle | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-15` | P2 | Hard delete oslanja se na FK za dio zavisnosti i briše asset event history | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-16` | P3 | License/contract/assignment/mine/forAsset liste se tiho hard-trunciraju | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-17` | P3 | Template `latest+1` version race vraća konflikt bez alokacijskog retry ugovora | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-18` | P3 | Nema scheduler/import/reminder/file-orphan i audit-failure health/metric seta | otvoreno | [22-assets.md](audits/22-assets.md) |
| 22 | `assets` | `BA-assets-19` | P3 | Sedam service suiteova je compile-blocked; nema tražene concurrency/failure E2E matrice | otvoreno | [22-assets.md](audits/22-assets.md) |
| 23 | `problems` | `BA-problems-01` | P1 | PROBLEM_MANAGER i scoped ADMIN role-name bypass daju globalni OU read scope | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-02` | P1 | Pristup jednom linked ticketu otkriva puni problem i metapodatke svih drugih ticketa | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-03` | P1 | Asset search/link/get zaobilaze `asset.read` i CMDB OU scope | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-04` | P1 | Ticket unlink ne provjerava aktuelni staff access nad ticketom koji uklanja | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-05` | P1 | `problem.close` bulk resolve preskače per-ticket authorization za sve linked tickete | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-06` | P1 | Problem se commit-a RESOLVED prije bulk ticketa bez durable retry/resume putanje | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-07` | P1 | Target reminder marker se upisuje prije primaoca i potvrđene/persistirane isporuke | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-08` | P2 | Create problem + početni ticket link nije atomski i može ostaviti orphan problem | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-09` | P2 | KB article nastaje prije conditional linka i concurrent/failure put ostavlja orphan draft | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-10` | P2 | Stara grupa može predati problem novoj grupi bez target-group authority/acceptance | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-11` | P2 | Service/incident linkovi nemaju njihov scope policy; više link writeova nije atomsko s eventom | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-12` | P2 | Claim/general update nemaju kanonski globalni audit | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-13` | P2 | Owner/group/status notice occurrence koristi vrijeme i nije stabilno idempotentan | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-14` | P2 | Scheduler nema reconciliation/health nakon Redis gubitka ili registration failurea | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-15` | P2 | Owner eligibility ne veže manage grant za problem OU i ne reconciliuje revoke drift | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-16` | P2 | Privacy/retention ne pokrivaju sva imenovanja, notifier/KB replike i closed-record lifecycle | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-17` | P3 | Events/tickets/links/reverse/options liste se tiho hard-trunciraju; total može biti netačan | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-18` | P3 | Bulk/sweep setting i sekvencijalni rad nemaju potpune resource/health granice | otvoreno | [23-problems.md](audits/23-problems.md) |
| 23 | `problems` | `BA-problems-19` | P3 | Svih osam direktnih suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica | otvoreno | [23-problems.md](audits/23-problems.md) |
| 24 | `changes` | `BA-changes-01` | P1 | CHANGE_MANAGER i scoped ADMIN role-name bypass daju globalni OU read/write scope | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-02` | P1 | Asset search/link/detail zaobilaze `asset.read` i CMDB OU scope | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-03` | P1 | Direct problem link write provjerava samo existence, ne `problem.read` visibility | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-04` | P1 | Conflict preview sa arbitrary referencama otkriva foreign change schedule i identitet | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-05` | P1 | Calendar vraća globalne downtime poruke/service/change ID bez viewer scopea | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-06` | P1 | CAB voter/quorum nije zamrznut, a glasovi neeligible bivših članova i dalje odlučuju round | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-07` | P1 | Reminder/overdue marker se postavlja prije primaoca i potvrđene/persistirane isporuke | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-08` | P2 | Lifecycle commit i downtime sync/release nisu durable; status i availability mogu odstupati | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-09` | P2 | Requester/owner/CAB visibility izuzeci vraćaju puni plan, linkove, events i vote komentare | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-10` | P2 | Owner eligibility ne veže `change.manage` assignment za OU konkretnog changea | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-11` | P2 | Claim/general update nemaju kanonski globalni audit | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-12` | P2 | Conflict acknowledgement nema snapshot/hash i može zastarjeti prije action commita | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-13` | P2 | Scheduler nema Redis-loss reconciliation ni delivery/downtime drift health | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-14` | P2 | CAB eligibility hard-limit 100 tiho izostavlja članove i mijenja quorum | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-15` | P2 | Template update nema optimistic concurrency/before-after audit | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-16` | P2 | Default CAB je alfabetički prvi group, bez OU/service routing politike | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-17` | P2 | Privacy/retention ne pokrivaju sve tekstualne i downtime/notifier/problem replike | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-18` | P3 | Events/approvals/templates/options/conflicts liste se hard-trunciraju bez potpunog cursor ugovora | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-19` | P3 | Servis ne clampuje quorum/lead/reminder configuration integer granice | otvoreno | [24-changes.md](audits/24-changes.md) |
| 24 | `changes` | `BA-changes-20` | P3 | Jedan suite je compile-blocked; nema service/concurrency/failure E2E matrice | otvoreno | [24-changes.md](audits/24-changes.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-01` | P1 | Owner i owner-group član pišu bez knowledge permissiona i aktuelnog OU/service scopea | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-02` | P1 | Reviewer assignment daje read/review bez aktuelnog permission scopea i revoke lifecyclea | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-03` | P1 | Article edit/lifecycle nema version/CAS ni review vezan za content revision | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-04` | P1 | Article list i portal učitavaju neograničen matching/published korpus | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-05` | P2 | INTERNAL default je company-wide read bez OU/service granice | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-06` | P2 | Intercept resolution prihvata foreign scope i hidden/unpublished article ID | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-07` | P2 | Feedback write + aggregate refresh nije atomski i counter može zastarjeti | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-08` | P2 | From-reply article/event/audit nije idempotentan ni atomaran | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-09` | P2 | Placement/category mutation nije atomska sa auditom/change-logom | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-10` | P2 | Category archive guard je TOCTOU prema paralelnom article placementu | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-11` | P2 | Slug alokacija je read-before-create bez conflict retry ugovora | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-12` | P2 | Reminder query je unbounded i recipients ne provjeravaju active/scope eligibility | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-13` | P2 | Scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view flush | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-14` | P2 | Privacy/retention ne pokriva slobodni tekst, source, comments, notifications i change-log | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-15` | P2 | Hard delete kaskadno uklanja feedback/views bez formalne tombstone/retention politike | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-16` | P3 | View flush crash može duplirati totals; DB fallback napuhuje unique viewers | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-17` | P3 | Insights comments hard-limit 50 i category/list API nemaju cursor/hasMore | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-18` | P3 | Comment resolution nema audit, actor ni optimistic state | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 25 | `knowledge-base` | `BA-knowledge-base-19` | P3 | Deset suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica | otvoreno | [25-knowledge-base.md](audits/25-knowledge-base.md) |
| 26 | `reports` | `BA-reports-01` | P1 | Pack preview/export/attachment gradi neograničen scoped korpus prije row/size limita | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-02` | P1 | Scheduled CSV attachmenti ignorišu service/group/priority filtere i šalju OU-wide podatke | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-03` | P2 | Schedule service/group reference nije vezana za izabrani OU/service scope | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-04` | P2 | `maxSchedules` count-then-create je TOCTOU i limit se može prekoračiti | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-05` | P2 | Schedule mutation nema version/CAS; paralelni update/enable/delete je last-write-wins | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-06` | P2 | Schedule mutation/run finalizacija i globalni audit nisu atomarni | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-07` | P2 | Brisanje schedulea kaskadno briše run historiju prije 180 dana | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-08` | P2 | BullMQ repeat scheduler nema reconciliation nakon Redis gubitka | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-09` | P2 | SMTP accepted → DB mark crash prozor može duplirati scheduled e-mail | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-10` | P2 | Summary/dashboard cache nema scope-revoke/mutation invalidaciju; stale authorization prozor | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-11` | P2 | KB/ticket loaderi čitaju nekorištene osjetljive kolone i šire privacy blast radius | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-12` | P2 | Packovi nemaju formalno usklađenu event-time/snapshot-time window semantiku | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-13` | P2 | Privacy/anonymization matrica ne pokriva run JSON, recipients, mail kopije i replike | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-14` | P2 | Run retention prune je best-effort i zavisi od aktivnog sweepa | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-15` | P3 | Redis cache parseri validiraju samo plitki shape bez schema/version/size granice | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-16` | P3 | `runNow` nema command idempotency i ponovljen zahtjev šalje novi manual report | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-17` | P3 | PDF endpoint evidentira client intent kao export bez potvrde generisanog artefakta | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-18` | P3 | Preview osjetljivih redova nema formalnu read-audit odluku | otvoreno | [26-reports.md](audits/26-reports.md) |
| 26 | `reports` | `BA-reports-19` | P3 | Dvanaest suiteova je compile-blocked; failure/concurrency/Redis/SMTP matrica nedostaje | otvoreno | [26-reports.md](audits/26-reports.md) |
| 27 | `search` | `BA-search-01` | P1 | Bilo koji scoped ADMIN može globalno pretraživati ID/ime/e-mail svih aktivnih korisnika | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-02` | P2 | MinLength se provjerava prije trimovanja pa whitespace bypassa minimalni effective query | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-03` | P2 | KB global top-75 kandidati prije scope filtera mogu sakriti postojeće vidljive rezultate | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-04` | P2 | KB query učitava cijeli red i hidden body prije visibility odluke | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-05` | P2 | Endpoint nema server-side rate limit ni anti-enumeration zaštitu | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-06` | P2 | Modul nasljeđuje KB owner/reviewer scope bypass iz audita 25 | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-07` | P2 | Nema query-plan/perf dokaza za contains nad user email/name i KB title | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-08` | P2 | Jedan dependency kvar ruši sve grupe bez definisanog partial/fail-closed ugovora | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-09` | P3 | User ordering nema ID tie-breaker pa capped rezultat nije stabilan | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-10` | P3 | `types` nema ArrayUnique i ugovor prihvata duplikate | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-11` | P3 | Nema privacy-safe search telemetry, per-group latency/SLO ni incomplete indikator | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-12` | P3 | Confidential/archive/revoke semantika nema direktan search test | otvoreno | [27-search.md](audits/27-search.md) |
| 27 | `search` | `BA-search-13` | P3 | Glavni service suite je compile-blocked i nema direktnog `/search` E2E | otvoreno | [27-search.md](audits/27-search.md) |
| 28 | `announcements` | `BA-announcements-01` | P1 | Scoped manage/report permission postaje globalna i omogućava cross-OU mutation/PII export | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-02` | P1 | Active/archive cap se primjenjuje prije audience filtera i može sakriti kritičnu najavu | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-03` | P1 | In-app/reminder fan-out terminalno odsijeca publiku nakon 20.000 korisnika | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-04` | P1 | Report/CSV neograničeno učitava current audience, e-mailove i acknowledgement redove | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-05` | P2 | Agent scope ne validira group/service reference prema vlastitom OU podstablu | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-06` | P2 | Mutation nema version/CAS; draft/published/lifecycle race može pregaziti stanje | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-07` | P2 | Published revision ne čuva severity/display/end/service/channel promjene | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-08` | P2 | Notify/reminder claim i email-run queue nisu atomarni ni pouzdano obnovljivi | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-09` | P2 | SMTP accepted → DB mark crash može duplirati e-mail; failed recipient nema retry state | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-10` | P2 | Teams claim prije webhooka čini transient failure terminalnim | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-11` | P2 | Scheduler nema Redis-loss reconciliation; završena missed najava se trajno gubi | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-12` | P2 | Report miješa publish count sa live membershipom i historijskim acknowledgementima | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-13` | P2 | Audience size nije immutable membership snapshot niti transakcijski publish presjek | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-14` | P2 | Manage list cap prije agent scope filtera daje nepotpunu vlastitu listu | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-15` | P2 | Retention/anonymization ne pokriva revisions, runs, delivery, Teams i audit replike | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-16` | P3 | Preview audience za global manager ne validira unknown IDs i može dati zavodljiv count | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-17` | P3 | Retention je best-effort, guta grešku i zavisi od aktivnog sweepa | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-18` | P3 | Nema cursor/hasMore za archive/manage/pending niti stabilan tie-break order | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 28 | `announcements` | `BA-announcements-19` | P3 | Delivery suite je compile-blocked; nema concurrency/Redis/SMTP/large-audience testa | otvoreno | [28-announcements.md](audits/28-announcements.md) |
| 29 | `status-page` | `BA-status-page-01` | P1 | Scoped AGENT/ADMIN role globalno otkriva STAFF_ONLY incidente, autore i counters | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-02` | P1 | Scoped manage permission postaje globalna mutation dozvola nad svim service incidentima | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-03` | P1 | ALL_USERS→STAFF_ONLY ne revokea subscribera; resolution mu otkriva interni title/message | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-04` | P1 | Start notification terminalno odsijeca primatelje nakon 2.000 bez cursora/backloga | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-05` | P1 | Resolution fan-out je unbounded i sve subscriptione označi notified i nakon pojedinačnog pada | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-06` | P2 | Incident timeline nested read nema limit; do 300 incidenata može učitati sve updateove | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-07` | P2 | Link/unlink ne provjerava incident visibility/manage scope, samo ticket staff access | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-08` | P2 | Edit/link lifecycle nema opšti version/CAS i može raceati sa resolveom | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-09` | P2 | Service IDs se validiraju samo po existenceu, bez actor OU/service scopea | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-10` | P2 | Uptime spans, active services i downtime windows su neograničeno učitani | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-11` | P2 | Resolve transakcija piše event za neograničen broj naknadno linkanih tiketa | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-12` | P2 | Ticket authorization je N+1 pre-check izvan transakcije i može zastarjeti prije link writea | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-13` | P2 | Public rate limit zavisi od trust-proxy/IP ispravnosti i fail-open je pri Redis grešci | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-14` | P2 | Process-local public cache nema mutation invalidation ni multi-instance koherenciju | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-15` | P2 | Incident/update/link/subscription retention i anonymization nisu formalizovani | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-16` | P3 | Open/history capped liste nemaju cursor/hasMore ni stabilan ID tie-breaker | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-17` | P3 | Edit audit/revision ne omogućava rekonstrukciju title/service promjena | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-18` | P3 | Neograničeno backdating incidenta mijenja uptime historiju bez posebne kontrole | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 29 | `status-page` | `BA-status-page-19` | P3 | Tri od pet suiteova su compile-blockirana; failure/concurrency/large-volume matrica nedostaje | otvoreno | [29-status-page.md](audits/29-status-page.md) |
| 30 | `config-versioning` | `BA-config-versioning-01` | P1 | ADMIN bez read permissiona dobija puni globalni privatni snapshot kroz list/get/diff | zatvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-02` | P1 | Scoped settings/import permission postaje globalna activate/rollback/import moć | zatvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-03` | P1 | Isključena validacija označava DRAFT validnim i dopušta neprovjeren destructive apply | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-04` | P1 | Paralelna aktivacija nema lock/CAS ni DB invariant jednog ACTIVE reda | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-05` | P1 | Apply/rollback je nedokumentovan replace/upsert/skip hibrid i ACTIVE nije dokaz parityja | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-06` | P1 | Konfigurisani scopes ne ograničavaju collect/apply; sve domene se i dalje primjenjuju | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-07` | P1 | Export sa settings.write može iznijeti privatne/environment-bound vrijednosti bez step-upa | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-08` | P2 | nextVersionNumber je read-max race za create/import/rollback | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-09` | P2 | Validate/status transition nema CAS i može vratiti stale status | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-10` | P2 | Rollback DRAFT nastaje van apply transakcije i ostaje orphan nakon failurea | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-11` | P2 | Catalog/forms/templates missing red se tiho preskače | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-12` | P2 | Shadow ne zapisuje SHADOW status, actor, rezultat ni acceptance threshold | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-13` | P2 | Unsigned package potvrđuje isti operator; nema key ID/rotation/source allowlist/anti-replay | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-14` | P2 | Package parser nema granularne nested count/depth/size budžete | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-15` | P2 | List/get/diff su nepaginirani i snapshotovi nemaju size/hash/corruption budget | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-16` | P2 | Privatni snapshot se duplicira u ConfigVersion/change-log/importMeta bez retention matrice | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-17` | P2 | Cache invalidation tokom apply transakcije nema dokaz cross-instance post-commit koherencije | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-18` | P3 | Shadow sample zadnjih 200 tiketa nije stratifikovan ni coverage-mjeren | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-19` | P3 | Create/validate/shadow/failure i read/export audit politika nije potpuna | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 30 | `config-versioning` | `BA-config-versioning-20` | P3 | Tri od četiri suitea compile-blockirana; nema concurrency/fault/parity test matrice | otvoreno | [30-config-versioning.md](audits/30-config-versioning.md) |
| 31 | `install` | `BA-install-01` | P1 | Statični bearer token daje anonimni puni bootstrap/SUPER_ADMIN control plane bez TTL/limita | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-02` | P1 | Rerun sa tokenom+env bez sesije/MFA može otvoriti wizard i oboriti završenu produkciju | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-03` | P1 | Founder create nema DB singleton/serializable lock; paralelno mogu nastati dva SUPER_ADMIN-a | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-04` | P1 | Login-provider i SMTP sigurnosno povezane postavke pišu se neatomarno | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-05` | P1 | Team batch nije idempotentan/atomaran; account/credential može ostati bez membershipa | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-06` | P1 | Minimum seed commit-a prije RBAC permission seeda i može ostaviti djelimično spreman sistem | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-07` | P2 | Provider/mode promjena i SMTP disable ostavljaju dormant bind/SMTP secret-e | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-08` | P2 | Completion readiness i marker commit nemaju globalni wizard lock/version; TOCTOU je moguć | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-09` | P2 | Parallel seed/blueprint ensure putevi nemaju dokazanu conflict/retry semantiku | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-10` | P2 | Marker/content atomarnost nije konzistentna kroz profile/policy-pack/SLA/add-on korake | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-11` | P2 | SMTP test rate limit je process-local i reset/multi-instance ga zaobilazi | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-12` | P2 | SMTP test može reflektovati raw provider poruku bez formalne secret-redaction garancije | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-13` | P2 | Setup status je anoniman i otkriva fazu/profil; nema abuse/cache budžet | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-14` | P2 | Temporary password response nema dokazanu end-to-end no-store/no-log politiku | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-15` | P2 | Unknown DB/client greška završenu produkciju prikazuje kao setup-required umjesto jasnog kvara | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-16` | P2 | Bootstrap/rerun/token/dormant-secret privacy, audit i retention matrica nije potpuna | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-17` | P2 | Token nema obaveznu rotaciju/uklanjanje nakon completiona niti per-attempt security audit | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-18` | P3 | Anonimni post-completion add-on read otkriva interni feature state | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-19` | P3 | Readiness koristi više odvojenih queryja i nema completion evidence hash | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-20` | P3 | Nema setup-open duration/failed-token/rerun health metrike i alarma | otvoreno | [31-install.md](audits/31-install.md) |
| 31 | `install` | `BA-install-21` | P3 | 39/54 suiteova je compile-blockirano; ključna concurrency/failure matrica nedostaje | otvoreno | [31-install.md](audits/31-install.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-01` | P2 | Jedan admin globalno i trajno skriva widget svim administratorima, uključujući buduće otvorene stavke | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-02` | P2 | Nema per-user/item-version acknowledgementa, expiryja, undismissa ni automatske reaktivacije | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-03` | P2 | Čisti GET traži `settings.write`; read/write capability i frontend admin gate nisu usklađeni | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-04` | P2 | Derived items nasljeđuju stale/coarse install markere i mogu lažno nestati | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-05` | P2 | Captcha se smatra primijenjenom samo po provider stringu, bez ključeva/runtime health dokaza | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-06` | P2 | Dashboard GET pokreće širok install/domain fan-out bez query/latency budžeta ili ciljanog cachea | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-07` | P2 | Dependency greška ruši cijeli status; nema partial/unknown/freshness semantike | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-08` | P3 | Dismiss audit nema item hash, otvorene stavke, policy version ni korisnički reason | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-09` | P3 | Ponovljeni/paralelni dismiss nije idempotentan i pravi last-write-wins timestamp/audit spam | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-10` | P3 | DismissedAt i items nisu konzistentan snapshot; nema evaluatedAt/version/ETag | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 32 | `setup-checklist` | `BA-setup-checklist-11` | P3 | Oba direktna suitea su compile-blockirana, a security/concurrency/failure E2E matrica nedostaje | otvoreno | [32-setup-checklist.md](audits/32-setup-checklist.md) |
| 33 | `policy-packs` | `BA-policy-packs-01` | P1 | Paket dodaje permissione globalnim ADMIN/AGENT rolama i širi capability svim njihovim assignmentima | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-02` | P1 | UserRole nema provenance; unapply briše manualni/drugi same-tuple assignment | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-03` | P1 | Apply drugog paketa prepisuje link bez uklanjanja/reconciliationa starih grantova | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-04` | P1 | Unapply starog paketa briše grantove i kada je target već vezan za drugi paket | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-05` | P1 | Unapply ne vraća classification/approval/SLA koje je apply overwriteovao | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-06` | P1 | OU i service target nisu relacijski validirani; cross-domain scoped assignment je moguć | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-07` | P1 | Disabled-pack settings/read greška fail-open omogućava apply zabranjenog paketa | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-08` | P2 | UserRole nema DB unique; paralelni apply može kreirati duplikate | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-09` | P2 | OU scope cache se invalidira prije commita, bez pouzdane post-commit/cross-instance invalidacije | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-10` | P2 | Post-commit principal invalidation failure vraća grešku nakon uspješnog commita | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-11` | P2 | Missing SLA profile dopušta djelimično primijenjen restrictive service bundle | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-12` | P2 | Validate/apply nema plan hash, version, CAS ni protection od TOCTOU | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-13` | P2 | `userIds` je neograničen; serijski N×grant query/invalidation omogućava skupu dugu transakciju | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-14` | P2 | Disable lifecycle ne definiše/revokuje postojeće primjene i daje samo presentation flag | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-15` | P2 | Privilege mutacije koriste generički settings.write bez step-upa, zasebne capability ili reasona | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-16` | P2 | Audit nema assignment provenance, user-set hash, pack version/hash ni obavezni change reason | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-17` | P3 | Read endpointi imaju nekonzistentne permissions i nisu oba označena kao admin read | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-18` | P3 | Persisted list nema eksplicitni limit/pagination za legacy/custom katalog | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 33 | `policy-packs` | `BA-policy-packs-19` | P3 | 11/12 suiteova compile-blockirano; real DB concurrency/fault/security E2E matrica nedostaje | otvoreno | [33-policy-packs.md](audits/33-policy-packs.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-01` | P1 | Service create, onboarding row i audit nisu jedna transakcija; orphan DRAFT je moguć | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-02` | P1 | Save/complete/abandon/resume state i audit nisu atomarni | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-03` | P1 | Final validation je izvan commit transakcije; stale evidence može aktivirati service | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-04` | P1 | Nema lock/CAS/version; paralelni finalize/save/abandon daje lost update i dupli activation audit | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-05` | P1 | Nepostojeći/neaktivni SLA se smatra validnim i finalize tiho zadržava stari/null profil | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-06` | P1 | Arbitrary approvals reference se prihvata bez persisted workflow/evidence provjere | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-07` | P1 | Missing routing coverage je samo warning; neupotrebljiv service može postati ACTIVE | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-08` | P2 | requireValidationBeforeActivate i autoFillRoutingRequireConfirm postavke se učitavaju, ali ignorišu | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-09` | P2 | Completed raniji korak se može izmijeniti bez invalidacije downstream completiona | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-10` | P2 | Validation failure trajno mijenja errors bez audit događaja | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-11` | P2 | Nepoznata DB/provider greška collapsea u poslovni 400 prerequisite error | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-12` | P2 | Response read može pasti poslije commita; nema idempotency key ni commit outcome ugovor | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-13` | P2 | Finalize nema posebnu capability, MFA/step-up ni obavezni change reason | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-14` | P2 | GET nema eksplicitnu read permission/AdminReadOperation metadata | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-15` | P2 | Audit je bez requestIda, before diffova, config/evidence versiona i korisničkog reasona | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-16` | P2 | Config može promijeniti semantiku usred workflowa bez snapshot/migration politike | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-17` | P2 | Nema lifecycle/cleanup/retention politike za abandoned i orphan DRAFT workflowe | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-18` | P3 | LastValidationErrors nema evaluatedAt/evidence version i može ostati stale | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-19` | P3 | Nema list/metrics/alert/repair operativne površine za stuck ili inconsistent workflowe | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 34 | `service-onboarding` | `BA-service-onboarding-20` | P3 | 6/7 suiteova compile-blockirano i nema direktnog onboarding E2E/concurrency/fault dokaza | otvoreno | [34-service-onboarding.md](audits/34-service-onboarding.md) |
| 35 | `directory-sync` | `BA-directory-sync-01` | P1 | Read-only označen `/read` zapravo mutira OU/users/groups bez mutation guarda, transakcije i audita | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-02` | P1 | Full apply je row-by-row partial, ali run može biti označen SUCCEEDED | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-03` | P1 | Dry-run apply nema DB/config/directory version hash ili CAS; stale plan overwriteuje novije stanje | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-04` | P1 | AD role revoke nema provenance i može obrisati ručni/drugi ADMIN/AGENT assignment | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-05` | P1 | Deactivation commit prethodi optional session revokeu; aktivna sesija može preživjeti | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-06` | P1 | Kritični apply/deactivation/role audit je best-effort i može izostati | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-07` | P1 | Exclusive run lock je read-then-create bez DB locka/fencinga; paralelni sync je moguć | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-08` | P1 | Plan se claimuje prije applyja; parcijalni failure trajno blokira siguran retry/resume | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-09` | P2 | Rate limit, backoff, cache i status su process-local i zaobilaze se u više replika | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-10` | P2 | Policy settings greške fail-soft vraćaju default role/deactivation/filter/cooldown semantiku | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-11` | P2 | LDAP host nema egress/DNS/IP allowlist; custom CA dopušta povjerenje proizvoljnom LDAPS endpointu | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-12` | P2 | On-demand email upsert nema GUID provenance/tombstone audit i može preuzeti non-local account | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-13` | P2 | UserRole grant nema provenance/unique invariant; duplikati i pogrešan revoke su mogući | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-14` | P2 | Scope/principal invalidacija nije durable/cross-instance i ima refill race | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-15` | P2 | Deactivation safeguard koristi plan-time denominator bez commit-time rechecka | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-16` | P2 | Full LDAP/DB state i plan su neograničeni; memory/plan-size/timeout DoS je moguć | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-17` | P2 | `listDirectoryUsersForLinking` zaobilazi cache/throttle i vraća cijelu PII listu | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-18` | P2 | Plan čuva bogat PII 30 dana; pruning je best-effort i zavisi od scheduled toka | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-19` | P2 | Nema fine permissions, step-up/dual control ni required reason za mass identity operacije | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-20` | P3 | Status izlaže interne DC URL/base DN/schedule/mapping detalje i nije durable | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-21` | P3 | Manual katalog planira van transakcije bez version/lock zaštite za paralelne subtree izmjene | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-22` | P3 | Row failures nemaju stabilan root-cause kod; observability i reconciliation su slabi | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 35 | `directory-sync` | `BA-directory-sync-23` | P3 | 12/21 suiteova compile-blockirano i nema real LDAP/DB/distributed/E2E matrice | otvoreno | [35-directory-sync.md](audits/35-directory-sync.md) |
| 36 | `teams` | `BA-teams-01` | P1 | Activity se claimuje prije routinga; transient failure se ACK-uje i retry je trajno blokiran | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-02` | P1 | Simulator manage korisnik može izvršavati domain akcije kao bilo koji aktivni korisnik | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-03` | P1 | Confidential channel card i dalje iznosi broj/service/priority/status/assignee/SLA metapodatke | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-04` | P1 | Channel link/rebind/update/remove mijenja vanjski data target bez durable audita/reasona | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-05` | P1 | Settings greška može fail-soft ponovo uključiti actions/ticket creation/personal/channel capability | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-06` | P1 | External send prethodi DB card commitu; retry nakon DB kvara duplira poruku | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-07` | P2 | Teams action audit je post-commit best-effort i može izgubiti channel/activity dokaz | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-08` | P2 | JWKS URI nije Microsoft-host pinan; fetch redirect/timeout/size policy nije ograničen | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-09` | P2 | Conversation upsert može prevezati tenant/mode/kind/user/serviceUrl bez immutable/CAS invarianta | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-10` | P2 | Nema dokaza da svi channel članovi imaju aplikacijski pristup linked grupi/entityju | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-11` | P2 | Inline delivery i fire-and-forget refresh nisu durable i mogu se trajno izgubiti | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-12` | P2 | Inbound i outbound limiter su process-local; multi-instance bypass/burst ostaje | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-13` | P2 | OAuth/Bot/JWKS pozivi nemaju dosljedan timeout i response-size limit | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-14` | P2 | Readiness GET prema APP_PUBLIC_URL je configuration SSRF/side-effect površina | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-15` | P2 | Access-token/JWKS/config cache nema credential/config version invalidaciju | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-16` | P2 | Inbound/simulator/card/conversation PII retention i erasure lifecycle nisu provedeni | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-17` | P3 | Global activity ID nije namespaciran tenant/appom; promjena konfiguracije može kolidirati | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-18` | P3 | Simulator arbitrary `data` nema depth/property schema i čuva se kao payload | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-19` | P3 | Readiness može vratiti raw skraćenu transport/token error poruku | otvoreno | [36-teams.md](audits/36-teams.md) |
| 36 | `teams` | `BA-teams-20` | P3 | 5/6 suiteova compile-blockirano i nema real Bot/queue/distributed/E2E matrice | otvoreno | [36-teams.md](audits/36-teams.md) |
| 37 | `edge-extension` | `BA-edge-01` | P1 | Receipt, pending i acknowledge zaobilaze puni addon/module/kill-switch/domain/version access gate | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-02` | P1 | Remote lifecycle je slobodni TicketMessage tekst bez request ID-a, recipienta, expiryja i CAS stanja | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-03` | P1 | Acknowledge prihvata bilo koji historijski request, ne aktivni/latest pending request | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-04` | P1 | `auditAcknowledge=false` gasi idempotency; svaki retry dodaje novi acknowledge system event | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-05` | P1 | Acknowledge auth koristi historijski participant row umjesto aktuelnog centralnog ticket policyja | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-06` | P1 | Receipt koristi AuditLog kao business/idempotency storage bez unique invarianta i atomskog upserta | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-07` | P1 | Remote event i audit su neatomarni; audit failure/retry može duplirati security-sensitive događaj | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-08` | P2 | Konfiguracija se čita kroz nezavisne settings readove i može biti torn unutar jednog requesta | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-09` | P2 | Većina missing/neočekivanih capability settinga fail-open postaje enabled | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-10` | P2 | Pending query/response nema limit/paginaciju i skenira lifecycle historiju svih otvorenih ticketa | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-11` | P2 | Remote request nema explicit recipient/consent/cancel/revoke/expiry model | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-12` | P2 | Concurrent receipt/ack read-before-write race proizvodi duplikate | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-13` | P2 | Version parser nije strict i minimum version se može zaobići direktnim endpoint pozivom | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-14` | P2 | Endpointi nemaju operation/user rate limit; polling može amplificirati skupe DB/settings upite | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-15` | P2 | Receipt `eventId` nije server-bound na realtime event i nema format/length ograničenje | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-16` | P2 | Nema dedicated retentiona za receipt audit i remote system-event rast | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-17` | P2 | Bootstrap `allowed` nije server-enforced capability/device/release attestation | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-18` | P3 | Bootstrap vraća internu domain/audit/capability politiku i kada je pristup odbijen | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-19` | P3 | Single-domain fallback bira samo prvi internal domain i ne podržava jasnu multi-domain politiku | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-20` | P3 | Ticket/notification/event/version parametri nemaju konzistentne MaxLength/ID format validatore | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 37 | `edge-extension` | `BA-edge-21` | P3 | 1/2 suitea compile-blockiran; nema controller, lifecycle, concurrency ni E2E protokol dokaza | otvoreno | [37-edge-extension.md](audits/37-edge-extension.md) |
| 38 | `branding` | `BA-brand-01` | P2 | Šest nezavisnih settings readova nema atomarni revision snapshot i može vratiti torn branding | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-02` | P2 | Redis greška potpuno gasi public rate limiter umjesto bounded memory/edge fallbacka | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-03` | P2 | Logo validator provjerava headere, ne puni decode/RIFF/chunk/CRC/stream integritet | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-04` | P2 | Branding read path ne revalidira legacy/import/direct-DB vrijednosti prije javnog vraćanja | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-05` | P2 | Support URL regex dopušta credentials, obmanjujuće/private hostove i nema canonical URL policy | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-06` | P2 | Public response nosi veliki inline base64 logo bez ETag/hash asseta i jasnog bandwidth budžeta | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-07` | P2 | Limiter je proxy/deployment-sensitive, fixed-window i per-process kada nema Redis | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-08` | P2 | Nema revision/event ugovora za konzistentnost login/email/Teams/template/MFA branding potrošača | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-09` | P3 | Parcijalne settings greške se tiho pretvaraju u prazna polja bez last-known-good/health signala | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-10` | P3 | Redis INCR/EXPIRE nije atomski, a memory map global clear resetuje sve limite | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-11` | P3 | Cache nema ETag/conditional GET/stale policy niti invalidaciju; “odmah” propagation tvrdnja netačna | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-12` | P3 | Public exposure klasifikacija/support contact scraping nema modulsku telemetry/administrativni hint | otvoreno | [38-branding.md](audits/38-branding.md) |
| 38 | `branding` | `BA-brand-13` | P3 | Jedini suite pokriva parser; controller, service, limiter, cache i cross-channel contract nisu testirani | otvoreno | [38-branding.md](audits/38-branding.md) |
| 39 | `health` | `BA-health-01` | P1 | `withTimeout` ne otkazuje DB/Redis work; javni periodični probe može akumulirati hung operacije | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-02` | P2 | CachedProbe pokreće novi work nakon TTL-a i kada je prethodni underlying probe još pending | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-03` | P2 | Budući heartbeat timestamp clampuje se na age 0 i može prikriti mrtav worker | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-04` | P2 | Worker endpoint/CLI hardkodira 120 s i može proturječiti konfigurisanom ops heartbeat pragu | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-05` | P2 | `/health/worker` nije setup-gate exempt i tokom setup/DB outagea ne daje nezavisan worker signal | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-06` | P2 | Readiness `SELECT 1` ne dokazuje schema/migration kompatibilnost ni aplikacijski query | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-07` | P2 | Redis `PING` ne dokazuje write/TTL/pubsub/BullMQ capability potreban aplikaciji | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-08` | P2 | Nema startup-complete/draining readiness statea za siguran rolling deploy | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-09` | P2 | Anonimne health rute nemaju edge/rate abuse ugovor ni hard HTTP resource budget | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-10` | P2 | Nema controller/deployment/cancellation/resource-leak integration dokaza | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-11` | P3 | Health odgovori ne postavljaju eksplicitni `Cache-Control: no-store` | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-12` | P3 | CachedProbe koristi wall clock; rollback može produžiti cache, a replike nemaju jitter | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-13` | P3 | Public worker ruta otkriva tačnu heartbeat starost i ne razdvaja Redis failure od missing heartbeata | otvoreno | [39-health.md](audits/39-health.md) |
| 39 | `health` | `BA-health-14` | P3 | Probe failure category/duration/cache/cancel metrike i lokalni transition logovi nedostaju | otvoreno | [39-health.md](audits/39-health.md) |
| 40 | `observability` | `BA-obs-01` | P1 | Globalni config/audit/log dataset se učitava, serializuje i ZIP-kompresuje u memoriji API procesa | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-02` | P1 | Nema concurrency/rate/byte/time limita; paralelni exporti mogu izazvati memory/CPU/event-loop DoS | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-03` | P1 | Recent logs i audit metadata izvoze se bez centralne PII/credential redakcije | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-04` | P1 | Default-on globalni sensitive export nema MFA/re-auth, reason, approval ni scoped/time-bounded command | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-05` | P2 | Config snapshot nema dedicated allowlist/registry secret invariant i uključuje širok poslovni sadržaj | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-06` | P2 | Audit export je cijeli chain bez scope/date/record/byte limita i integrity summaryja | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-07` | P2 | Export audit nastaje tek poslije generacije; failed/aborted attempt i download lifecycle nisu evidentirani | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-08` | P2 | GET pokreće skupu auditiranu operaciju i izložen je prefetch/CSRF-style resource triggeru | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-09` | P2 | Retention/recent-minutes nemaju maksimum; audit retention je neuvezan, request retention kasno primijenjen | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-10` | P2 | Configuration read nije atomarni revision snapshot | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-11` | P2 | ZIP nema per-part hash/signature/encryption/size manifest ni managed expiry/revocation | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-12` | P2 | Event-loop i WS “metrics” su best-effort log linije, ne pouzdan typed/exported metric ugovor | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-13` | P2 | Event-loop monitor nije dokazano aktivan u workeru; WS reporter se trajno gasi ako engine kasni | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-14` | P2 | Nema service/controller/load/concurrency/redaction/export-failure integration testova | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-15` | P3 | Recent log entry nema per-message size/depth limit i buffer retention nije stvarno day-guaranteed | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-16` | P3 | Reporter callbackovi ne izoluju logger exception i option vrijednosti nisu validirane | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-17` | P3 | WS client count je per-instance/debug-level i nema unavailable/cluster-total semantiku | otvoreno | [40-observability.md](audits/40-observability.md) |
| 40 | `observability` | `BA-obs-18` | P3 | 1/5 suiteova compile-blockiran zbog generated Prisma/authorization tipova | otvoreno | [40-observability.md](audits/40-observability.md) |
| 41 | `ops-health` | `BA-ops-01` | P1 | Periodični probe timeoutovi ne otkazuju DB/Redis/BullMQ work i mogu akumulirati hung operacije | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-02` | P1 | Notification se claimuje prije send-a; crash poslije claima može trajno izgubiti početni alarm | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-03` | P1 | Uspjeh jednog kanala zatvara događaj; neuspjeli email/Teams kanal nema vlastiti retry | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-04` | P1 | Recipient query tiho ograničava primaoce na prvih 50 i preskače ostale ovlaštene primaoce | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-05` | P1 | Fallback alarm lifecycle/dedupe je samo u memory Mapama i gubi se/duplira pri restartu/replikama | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-06` | P1 | Teams/uptime outbound URL nema host/IP allowlist; operativni payload/requests imaju SSRF egress rizik | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-07` | P1 | Silence/DLQ baseline mijenjaju Redis prije audita; audit failure ostavlja neauditiranu globalnu promjenu | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-08` | P2 | Silence je Redis-only i može nestati/ignorirati se tokom outagea, restorea ili flush-a | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-09` | P2 | Extra email i Teams deliveries nemaju durable per-recipient/channel ledger | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-10` | P2 | Prvi nonzero DLQ baseline se prihvata bez alarma; manual baseline koristi vremenski torn snapshot | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-11` | P2 | HTTP/WS metric batch se trajno odbacuje na Redis grešci; pipeline partial errors se ne provjeravaju | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-12` | P2 | Redis keyPrefix handling za WS heartbeat SCAN/MGET je nedosljedan i može proizvesti lažni unknown | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-13` | P2 | SCAN failure se tretira kao heartbeat seen, pa metrics outage može izgledati kao nula | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-14` | P2 | Ručna queue lista i parcijalni probe failure ne izlažu kompletan expected-vs-observed coverage | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-15` | P2 | OpsAlert nema enum/check/details schema-size invariant; state/Redis/delivery nisu atomski | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-16` | P2 | Unknown signal često postaje inactive bez posebnog collector-degraded alarma | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-17` | P2 | Dashboard vraća raw inbound `lastError`/mailbox detalje view permission holderima | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-18` | P2 | History purge je best-effort, neauditiran i nema legal-hold/export checkpoint | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-19` | P2 | 7/12 suiteova compile-blockirano; nema crash/failover/multi-replica/outage-drill dokaza | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-20` | P3 | Event-loop koristi mean umjesto p95/max i aborted HTTP responses nisu brojani | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-21` | P3 | Acknowledge mutacija koristi view permission umjesto zasebne explicit capability | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-22` | P3 | Alert settings se čitaju bez atomarne revision granice; invalid values padaju na default | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-23` | P3 | Extra recipienti nemaju domain/ownership verifikaciju ni truncation/coverage indikator | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 41 | `ops-health` | `BA-ops-24` | P3 | `sendTest` vanjski side-effect nastaje prije audita i nema idempotency key iz requesta | otvoreno | [41-ops-health.md](audits/41-ops-health.md) |
| 42 | `docs` | `BA-docs-01` | P1 | Bilo koja scoped role assignment postaje globalni docs role key; scope/permission se gube | zatvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-02` | P1 | Manifest nema unique/schema invariant; duplicate slug može spojiti unrestricted metadata i restricted body | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-03` | P2 | Runtime manifest validation provjerava samo `pages` array, ne shape/role/part/slug/file integritet | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-04` | P2 | Missing BS/EN fajlovi se tiho preskaču i partial mirror ostaje “loaded” | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-05` | P2 | Artifact nema schemaVersion/build SHA/per-file hash/signature ni revision u API-ju | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-06` | P2 | Manifest slug nije validiran prije filesystem join/read; root selection ima više implicit fallbacka | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-07` | P2 | Manifest/page/translation/total bytes i startup work nemaju hard limite | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-08` | P2 | Search score/excerpt obrađuje restricted sadržaj prije authorization filtera | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-09` | P2 | Search je linearni full-corpus scan bez rate limita ili permission-aware indeksa | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-10` | P2 | Raw markdown sigurnost zavisi od neversioniranog frontend sanitization/CSP ugovora | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-11` | P3 | Search nema locale indeks; EN navigation/page i BS search nisu konzistentni | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-12` | P3 | `englishTitle` se koristi i kada translation file nije učitan | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-13` | P3 | Search `total` je broj nakon slice-a, ne ukupan broj pogodaka | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-14` | P3 | Ručni `parseInt` prihvata djelimične vrijednosti poput `10junk`; nema search DTO-a | otvoreno | [42-docs.md](audits/42-docs.md) |
| 42 | `docs` | `BA-docs-15` | P3 | 1/4 suitea compile-blockiran; nema scoped-role/manifest-security/load/E2E dokaza | otvoreno | [42-docs.md](audits/42-docs.md) |
| 43 | `change-log` | `BA-clog-01` | P1 | Missing path se predstavlja kao null; add/remove null promjene potpuno nestaju | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-02` | P1 | Prazni objekti/nizovi nemaju path; create/delete/replace može imati netačan ili prazan diff | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-03` | P1 | Recorder ne provodi reason/action/entity/resource invariants i dopušta međusobno kontradiktoran red | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-04` | P1 | Nema centralne redakcije/allowliste; before/after/changes mogu trajno duplicirati secret/PII | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-05` | P1 | Transaction atomarnost nije dio API ugovora; mutation i log mogu commitati odvojeno | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-06` | P2 | Dot path bez escaping-a kolidira sa literal dotted keyem i array/numeric segmentima | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-07` | P2 | Array indeks diff pretvara insert/reorder u netačnu/noisy seriju replace promjena | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-08` | P2 | Nema append-only DB zaštite, hash chain/checkpoint ni integrity verifier | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-09` | P2 | Actor SetNull i live displayName gube/stvaraju retroaktivnu attribution semantiku | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-10` | P2 | List helper nema pagination/limit/date/scope/authorization i može učitati cijelu historiju | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-11` | P2 | Persisted JSON se castuje bez version/schema validacije | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-12` | P2 | Nema retention/legal-hold/partitioning/createdAt index ni storage-growth budžeta | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-13` | P2 | Before+after+changes višestruko dupliraju velike/confidential vrijednosti | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-14` | P2 | Nema request/transaction/causation/idempotency ID-a ni total order sequence | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-15` | P2 | Nema repository-wide entity/action → mutation coverage dokaza | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-16` | P3 | Runtime ne ograničava JSON tip, dubinu, node count, string/serialized bytes ili cikluse | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-17` | P3 | Unicode `localeCompare` nije eksplicitni canonical byte/codepoint comparator | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-18` | P3 | Unknown/system/deleted actor nisu eksplicitno različiti | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-19` | P3 | Read ordering nema ID tie-break za jednake createdAt vrijednosti | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 43 | `change-log` | `BA-clog-20` | P3 | Samo 2 testa; recorder/list/schema/redaction/transaction/tamper tokovi nisu direktno testirani | otvoreno | [43-change-log.md](audits/43-change-log.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-01` | P1 | Runtime container nema `USER` i radi kao root | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-02` | P1 | Isti DB credential pokreće migracije i aplikaciju; nema runtime/migration privilege separation | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-03` | P1 | Redis TLS/CA contract ne postoji, a DB TLS nije production-obavezan | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-04` | P1 | Build fallback `npm ci \|\| npm install`, mutable images i devDependencies u runtimeu ruše reproducibility/supply-chain granicu | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-05` | P1 | Authz cache može služiti ukinuta prava/deaktiviranog usera do TTL-a nakon invalidation failure/omissiona | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-06` | P1 | Scheduler registration fail-open označava worker started bez obaveznih rasporeda | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-07` | P1 | Migracije na startu svake API replike bez release gatea, compatibility/backup/rollback ugovora | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-08` | P1 | Destruktivni/demo CLI ima write-by-default i hard-delete bez production target guarda, potvrde i audita | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-09` | P2 | Nema jedinstvene typed/fatal production env validacije | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-10` | P2 | Pool nema deployment-wide connection budget ni admission check | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-11` | P2 | DB timeout/instrumentation ne pokriva kompletno lock/transaction/dedicated-client ponašanje | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-12` | P2 | Readiness ne dokazuje schema kompatibilnost, write capability ni queue flow | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-13` | P2 | Migracije nemaju expand/backfill/contract linter i destruction approval manifest | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-14` | P2 | Budući migration timestampi do 2027-10 ruše pouzdanu chronology disciplinu | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-15` | P2 | Redis reconnect/offline queue/circuit-breaker i namespace contract nisu potpuni | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-16` | P2 | Admin realtime je process-local i gubi cross-replica događaje | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-17` | P2 | Worker nema readiness/drain/deadline/forced shutdown i telemetry flush ugovor | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-18` | P2 | Request ID je neograničen untrusted input u logovima/envelopeu | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-19` | P2 | Globalni guard/filter/interceptor wiring zavisi od feature modula bez centralnog manifest testa | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-20` | P2 | Nema centralnog structured log redaction i exception sanitizer ugovora | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-21` | P2 | Metric cardinality i distributed trace propagation nisu dokazani | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-22` | P2 | Nema globalnog/distribuiranog inbound rate limit ugovora | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-23` | P2 | Runtime image nema read-only FS/capability/no-new-privileges hardening ni storage permission preflight | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-24` | P2 | Production dependency audit ima 4 moderate advisories | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-25` | P2 | CLI-ji nemaju zajednički target fingerprint/operator audit/transaction safety framework | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-26` | P3 | Raw body se kopira za svaki JSON request umjesto samo potpisanih webhook ruta | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-27` | P3 | Shutdown hooks se uključuju dvaput u API bootstrapu | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-28` | P3 | Recent request log je samo process-local volatilni buffer | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-29` | P3 | Nema SBOM/provenance/signing dokaza u deploy ugovoru | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-30` | P3 | Secret minimum od 16 bajtova i fallback derivacije nisu centralno klasifikovani po purposeu | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-31` | P3 | 6/31 direktnih suiteova compile-blokirano je bez generated Prisma artefakta | zatvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |
| 44 | `cross-cutting-infrastructure` | `BA-xcut-32` | P3 | Seed koristi zaseban client mimo common pool/metrics/startup konfiguracije | otvoreno | [44-cross-cutting-infrastructure.md](audits/44-cross-cutting-infrastructure.md) |

## Implementacijska napomena — Backend Val 2 / W2.1

Na SHA `10ffd27758c766112fc67161a35489c3bcaa29e9`, CI `40118964278`, završen je report-only inventory i canonical principal/scope temelj za `BA-users-04` i `BA-users-05`. Nalazi su tada ostali otvoreni jer sigurni pripremni paket namjerno nije radio repair ni DB constraint; naknadno su zatvoreni u W2.5. Pripremni dokaz je u [02-canonical-principal-assignment-scope.md](implementation/02-canonical-principal-assignment-scope.md).

## Implementacijska napomena — Backend Val 2 / W2.2–W2.3

W2.2 je zatvorio `BA-authorization-01` i `BA-xcut-05` durable PostgreSQL authority fenceom. W2.3 je na SHA `201678ac5b77d65bc4b2fc70b18132e0bbbadb74`, CI `40121407427`, završio centralni permission + OU/service/ownership primitive i real-PostgreSQL negativnu matricu. Route/decorator rollout nalazi ostaju otvoreni; dokaz je u [04-central-resource-policy.md](implementation/04-central-resource-policy.md).

W2.4 je na SHA `8206056d810e4cab0ab629cd96831309c11b66d0`, CI `40122665418`, zatvorio `BA-security-01` centralnim fail-closed step-up policyjem. Login MFA atomic claim i durable emergency-operation nalazi ostaju otvoreni; dokaz je u [05-fail-closed-step-up-policy.md](implementation/05-fail-closed-step-up-policy.md).

W2.5 je na SHA `21f1caa`, CI `40126212216`, zatvorio `BA-rbac-04`, `BA-users-04` i `BA-users-05`. Odobreni deterministički repair, DB scope/identity constrainti, global-only SuperAdmin trigger i zajednička mutation serializacija dokazani su na stvarnom PostgreSQL-u; detalji su u [06-role-assignment-and-permission-invariants.md](implementation/06-role-assignment-and-permission-invariants.md).

W2.6 je na SHA `52b5f1af95e7c650cfecef91a88a602edd5279e8`, CI `40127087672`, zatvorio `BA-authorization-02`. Svih 610 HTTP ruta i worker root imaju četveroklasni policy zapis, owner i dokaz; CI odbija implicitnu petu klasu. Detalji su u [07-exhaustive-route-policy-manifest.md](implementation/07-exhaustive-route-policy-manifest.md).

W2.7 je na SHA `c78c445`, CI `40128598505`, zatvorio `BA-docs-01`, `BA-settings-05` i `BA-config-versioning-01/02`. Globalni docs/settings/config readovi sada koriste katalogizovane permission capabilityje i odbijaju OU/service scoped grantove; detalji su u [08-global-read-permission-boundaries.md](implementation/08-global-read-permission-boundaries.md).

## Kontrolni zbir

- Ukupno: **692**
- P1: **174**
- P2: **368**
- P3: **150**
- Otvoreno: **659**
- Zatvoreno: **33** (`BA-audit-log-07`, `BA-audit-log-06`, `BA-authorization-01/02`, `BA-config-versioning-01/02`, `BA-docs-01`, `BA-rbac-04`, `BA-security-01`, `BA-settings-05`, `BA-users-04/05`, `BA-xcut-01/02/03/04/05/06/07/09/10/17/23/24/29/30/31`)
- Duplicirani ID-evi: **0**
- P0: **0**
