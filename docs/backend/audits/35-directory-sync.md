# Backend audit 35 — `directory-sync`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **3,40/10**  
**Nalazi:** 8 P1, 11 P2, 4 P3

## 1. Executive summary

`directory-sync` je identity control plane za manual katalog i LDAPS: scoped read, materijalizacija OU/user/group podataka, test konekcije, dry-run plan, apply, scheduled worker, deactivation safeguard, AD-group role grant/revoke, session revocation, cache invalidation, run history i manual OU administracija. Pozitivno: sve HTTP rute traže SUPER_ADMIN sesiju; LDAP koristi isključivo `ldaps://`, TLS 1.2+, certificate verification, bind secret redaction, escaped/filter-bounded čitanje i zabranjuje forest-root user base; dry-run ima TTL i single-claim; local-only računi se štite; deactivation threshold postoji; manual OU destructive tokovi su uglavnom transakcijski i auditirani.

Baseline je **3,40/10**. Osam P1 nalaza ostavljaju identity i authorization state bez pouzdanog ownershipa i atomiciteta. Endpoint označen kao read (`POST /directory-sync/read`, dozvoljen u read-only modu) zapravo upsertuje OU/users/groups bez poslovnog audita ili transakcije. Full apply namjerno radi row-by-row best-effort; partial identity/role/deactivation state može biti označen kao uspješan. Dry-run plan nema DB/config version/hash/CAS i može overwriteovati promjene nastale tokom jednog sata. AD role reconciliation nema provenance: učitava sve service-null ADMIN/AGENT assignmente i može ukloniti ručno ili drugim workflowom dodijeljene role. Deactivation se commit-a prije vanjskog session revoke/invalidation hooka; kvar može ostaviti aktivnu sesiju deaktiviranog korisnika. Apply audit je best-effort i njegov kvar ne utiče na privilege/deactivation commit. Exclusive run lease je read-then-create bez DB singleton locka. Dry-run se claimuje prije applyja i ostaje trajno potrošen kada parcijalni apply padne.

Dodatno, rate limit/backoff/cache/status su process-local; LDAP konfiguracija široko fail-soft defaultuje nakon settings grešaka; plan i run history čuvaju PII 30 dana; status vraća interne DC URL/base DN detalje; input/output volumeni i LDAP response nisu ukupno bounded; materialization i full apply imaju N+1 obrasce; nema direktnog E2E. Pokretanje 21 suitea: 9 prošlo, 12 compile-blockirano, svih 46 izvršenih testova zeleno. Popravke nisu implementirane.

## 2. Scope i inventar

- 73 produkcijska TypeScript fajla;
- 21 direktni spec;
- 5.214 direktno izmjerenih produkcijskih LOC (registar: 5.287);
- 2 controllera i više API/worker/provider/cache komponenti;
- Prisma: manual directory katalog, OU, users, groups, roles, userRoles, DirectorySyncRun, audit/notifications;
- vanjske zavisnosti: LDAP/LDAPS, Redis/BullMQ, settings/secrets, session revocation i principal cache;
- nema direktnog directory-sync E2E scenarija.

## 3. Trust boundary i API

Sve rute koriste session + SUPER_ADMIN role, što je primjerena minimalna granica za masovne identity operacije. DTO whitelist, scope parser i DN normalization sprečavaju unrestricted read, a apply zahtijeva recentni dry-run ID. Međutim nema zasebnih permissions za status/read/test/dry-run/apply/manual-catalog, nema MFA/step-upa, required reasona ili dual controla za masovnu deaktivaciju/role promjene.

`POST /read`, test i dry-run nose `AdminReadOperation`. Test/dry-run zaista ne mijenjaju korisnike, ali kreiraju run/audit/backoff state. Kritično, `read` poziva `materializeDirectoryRead`: upsertuje produkcijske OU/users/groups i mijenja korisnikov OU/display identity. Time mutacija prolazi kao read u read-only modu i nema mutation permission/audit.

Manual catalog GET nije označen kao admin read. Status izlaže domain controller URL-ove, users/groups base DN, cron, mapping/role mode i safeguard postotak. SUPER_ADMIN boundary smanjuje exposure, ali payload treba minimizirati i auditirati pristup operativnim detaljima.

## 4. LDAPS i SSRF/TLS

URL parser prihvata samo jednostavne `ldaps://host[:port]`, ldapts koristi `rejectUnauthorized=true`, TLS minimum 1.2 i opcionalni CA PEM. Bind password se čita secret accessorom, ne vraća se u status i LDAP greške se klasifikuju u stabilne kodove. Base DN mora sadržati OU, a result DN se ponovo filtrira unutar basea. To su snažne zaštite.

Ipak hostname nije vezan za allowlist/private-network policy; SUPER_ADMIN koji može mijenjati settings može usmjeriti konekciju na proizvoljan TLS LDAP host. Custom CA povećava mogućnost povjerenja internom attacker-controlled endpointu. Potrebni su egress policy, DNS/IP revalidation, scheme/port/host allowlist i connection telemetry bez secreta.

Configuration loader hvata grešku za gotovo svaki setting i pretvara je u default/prazno. Obavezna polja kasnije blokiraju konekciju, ali policy polja (roleSource, deactivation threshold, filter, cooldown, schedule) mogu se tiho vratiti na default tokom settings incidenta. Full sync mora koristiti atomarni versionirani config snapshot i fail-closed na nečitljiv policy.

## 5. Read materialization

On-demand scoped read nakon LDAP/manual rezultata serijski upsertuje OU, users ili groups. Nema `$transaction`, row-level outcome registra ni audit loga. Kvar nakon nekoliko redova ostavlja parcijalnu materijalizaciju. `organizational_units` invalidira scope cache poslije svakog reda; users invalidira principal cache tek poslije cijelog loopa, pa raniji commitovi mogu ostati cache-stale ako kasniji red baci grešku.

User match je po emailu u ovom putu, bez GUID provenancea koji full sync koristi. Directory osoba može preuzeti postojeći non-local account istog emaila i promijeniti displayName/DN/OU. Local-only se štiti, ali nema tombstone/privacy provjere niti change audit. Group key se derivira sanitizacijom externalIda, pa različiti external ID-jevi mogu kolidirati.

Ovaj endpoint mora biti ili čisti preview ili eksplicitni audited mutation command sa transactional batchom, provenanceom, version/CAS-om i post-commit invalidacijom.

## 6. Dry-run plan i stale apply

Dry-run čita LDAPS i cijeli lokalni identity/OU state, zatim čuva konkretne row ID-jeve, emailove, paths i role IDs u JSON planu. Apply do sat vremena kasnije ne radi novi directory read — poželjno za operator confirmation — ali ne provjerava hash/verziju lokalnog statea, konfiguracije ili directory snapshota. U međuvremenu admin može promijeniti email/OU/role/active state, privacy može anonimizirati korisnika, a drugi sync može mijenjati iste redove.

Apply zato može overwriteovati novije admin promjene, deaktivirati pogrešan stale target ili ukloniti role koja je naknadno legitimno dodijeljena. Plan treba sadržati per-row expected version/hash i config/directory snapshot ID, a apply treba CAS i vratiti conflict prije destruktivne promjene.

Deactivation safeguard računa plan-time procenat. Bez CAS-a broj aktivnih managed korisnika može se promijeniti prije applyja, pa guard više ne predstavlja commit-time blast radius.

## 7. Apply atomicity i recovery

`applyDirectorySyncPlan` namjerno izvršava svaku OU/user/role promjenu posebno, hvata većinu grešaka i nastavlja. Nema transakcije po korisniku ni globalnog all-or-nothing moda. Service zatim run označava `SUCCEEDED` čak kada `result.failures` sadrži redove. Moguće je kreirati OU bez usera, promijeniti user bez role, deaktivirati dio populacije ili grantovati dio privilegija.

Dry-run se claimuje (`appliedByRunId`) prije izvršenja. Ako apply baci nakon dijela commitova ili hooka, isti plan se ne može ponoviti. Nema resume/compensation ledger po stavci. Potreban je durable item state machine, transakcija po konzistentnoj aggregate jedinici, status `PARTIAL`, siguran resume i eksplicitni reconciliation run.

Audit write je svjesno best-effort: failure se samo loguje. Kritična masovna identity/role/deactivation mutacija može završiti bez obaveznog audita. Audit/outbox mora biti dio commit ugovora ili run ne smije biti finalno uspješan.

## 8. Role ownership i privilege integrity

Kada je `roleSource=ad_groups`, plan učitava sve service-null ADMIN/AGENT `UserRole` assignmente korisnika, bez oznake da ih je directory sync kreirao. Ako AD membership više ne odgovara, revoke plan briše row po ID-u. Ručno, policy-pack ili drugim workflowom dodijeljena OU-scoped ADMIN/AGENT rola može biti uklonjena.

Grant također nema provenance ni unique tuple invariant; paralelni/ponovljeni tokovi mogu kreirati duplikate. Directory-owned role assignment mora imati source/application ID, unique invariant i ownership-aware revoke/reference counting. SUPER_ADMIN je eksplicitno izuzet, što je pozitivno, ali ADMIN je i dalje visokorizičan.

## 9. Deactivation i session/cache sigurnost

Local accounts su zaštićeni `isLocalOnly:false`, administrativno deaktiviran korisnik se ne reaktivira osim kada ima `directoryDeactivatedAt`, a mass-deactivation safeguard postoji. Nakon DB deactivationa session revocation se izvršava kao vanjski hook. Ako optional `SessionRevocationStore` nije injektovan, optional chaining čini revoke no-op. Ako Redis revoke padne, DB je već deaktiviran; apply baci/ostane parcijalan, ali postojeća sesija može nastaviti do regularnog auth checka/TTL-a.

Principal invalidation ima isti post-write problem. Za security promjene DB authzVersion bump/outbox mora biti u istoj transakciji, a request guard mora na svakom zahtjevu dokazati active/version state. Session revoke mora biti durable retry job, ne optional best-effort dependency.

Scope cache invalidacije su process-local. Full apply invalidira nakon OU loopa, ali cross-instance cache i refill race nisu riješeni.

## 10. Run locking, scheduler i distributed state

`startRun` radi `findFirst RUNNING` pa `create`; nema DB partial unique/advisory lock. Dva API/worker procesa mogu oba proći read i pokrenuti ekskluzivni dry-run/apply/scheduled sync. Bull worker concurrency 1 vrijedi samo po workeru/queue semantics, ne štiti API full sync utrku.

Backoff, read throttle, read cache i last-success status su in-memory po procesu. Više API replika zaobilazi query rate, prikazuje različit status i može istovremeno opteretiti DC. Backoff između API i workera također nije dijeljen. Potreban je Redis/DB distributed limiter, lease/fencing token i durable status.

Lease je samo timestamp; nema heartbeat/fencing. Run duži od 30 minuta može biti proglašen mrtvim dok još piše, pa drugi run počinje.

## 11. PII, retention i observability

Dry-run plan sadrži imena, emailove, DN, company/department, GUID, OU i role promjene. Čuva se do 30 dana u običnom JSON DB polju, a SUPER_ADMIN ga može dohvatiti. Nema encryption-at-rest na field nivou, purpose access audit, redaction ili configurable retention. `pruneOldPlans` je best-effort raw SQL samo u scheduled finally; ako scheduled sync nije aktivan, planovi mogu ostati duže od 30 dana.

Run summary/status su korisni, safeguard abort šalje in-app notifikaciju, greške ne vraćaju raw LDAP message i bind secret se ne loguje. Ipak row failures ne sadrže stabilan error code, samo step/email/path; root cause se gubi. Audit ne sadrži config/snapshot hash, approval reason, per-item outcome/provenance ni requestId.

## 12. Performance i resource bounds

LDAP koristi pagination i timeout, ali `sizeLimit` za full reads je 0 (server unlimited). Cijeli directory se učitava u memoriju, cijeli DB state se učitava, plan se čuva kao JSON i apply radi N+1 serijske queryje. Nema maksimalnih users/units/plan bytes, memory budgeta, streaminga ili chunk checkpointa. Maliciozan/neočekivano velik direktorij može iscrpiti memoriju, produžiti lease i proizvesti ogroman PII plan.

On-demand `listDirectoryUsersForLinking` zaobilazi DirectoryReadCache i DirectoryReadThrottle te može svaki poziv pokrenuti puni LDAP users read. SUPER_ADMIN guard smanjuje abuse, ali endpoint treba distributed rate/size limit.

## 13. Manual katalog

Manual OU create/update/delete koriste strogu validaciju path/cycle/type pravila, transakcije i audit; delete vraća warnings i pokušava principal invalidation. Pozitivno je i cache clear poslije uspjeha.

Rizici: parent pre-read je izvan transakcije; update planira subtree iz pre-transaction kataloga; nema row version/locka, pa paralelni move/create/delete može proizvesti conflict ili stale subtree rewrite. Principal invalidation poslije deletea je best-effort i greška se guta. Manual GET nema read-only annotation, a sve operacije koriste samo SUPER_ADMIN role bez fine permissions/reasona.

## 14. Test dokaz

Pokrenuto svih 21 direktnih suiteova:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/directory-sync -name '*.spec.ts' -print | sort)
```

Rezultat: **9/21 suiteova prošlo, 12/21 compile-blockirano; 46/46 izvršenih testova prošlo**. Blokade dolaze od nepotpunog generated Prisma clienta/enuma i delegata (`directorySyncRun`, manualDirectory*, user, userRole, role, `$transaction`, appSetting, group).

Zeleni pure testovi pokrivaju planiranje, DN/filter/TLS helper, cache/throttle/scope/config parser. In-memory/full service suiteovi ne daju real DB isolation, distributed Redis ili LDAP integration dokaz. Nedostaju read-only mutation E2E, stale plan CAS, concurrent run lease, partial apply/resume, manual-role provenance, session revoke failure, multi-instance limiter/backoff, huge directory i PII retention testovi. Nema direktnog E2E scenarija.

## 15. Pozitivni nalazi

1. Sve API rute su SUPER_ADMIN-only i session-protected.
2. LDAPS-only URL, TLS verification i TLS 1.2 minimum.
3. Bind secret se ne vraća/loguje; error kodovi su redigovani.
4. Forest-root user base je zabranjen.
5. DN/filter mapping i scope provjere su konzervativne.
6. Local-only računi se ne mijenjaju/deaktiviraju.
7. Admin-deactivated račun se automatski ne reaktivira.
8. Mass-deactivation safeguard i dry-run postoje.
9. Dry-run je single-claim i vremenski ograničen.
10. SUPER_ADMIN role se nikad ne revokeuje iz AD plana.
11. Manual OU operacije imaju transakcijski audit.
12. Worker ima retry/backoff/retention wiring i safeguard notifikaciju.
13. 46 izvršenih testova je zeleno.

## 16. Registar nalaza

| ID                    | Severity | Nalaz                                                                                              | Status   |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-directory-sync-01  | P1       | Read-only označen `/read` zapravo mutira OU/users/groups bez mutation guarda, transakcije i audita | otvoreno |
| BA-directory-sync-02  | P1       | Full apply je row-by-row partial, ali run može biti označen SUCCEEDED                              | otvoreno |
| BA-directory-sync-03  | P1       | Dry-run apply nema DB/config/directory version hash ili CAS; stale plan overwriteuje novije stanje | otvoreno |
| BA-directory-sync-04  | P1       | AD role revoke nema provenance i može obrisati ručni/drugi ADMIN/AGENT assignment                  | otvoreno |
| BA-directory-sync-05  | P1       | Deactivation commit prethodi optional session revokeu; aktivna sesija može preživjeti              | otvoreno |
| BA-directory-sync-06  | P1       | Kritični apply/deactivation/role audit je best-effort i može izostati                              | otvoreno |
| BA-directory-sync-07  | P1       | Exclusive run lock je read-then-create bez DB locka/fencinga; paralelni sync je moguć              | otvoreno |
| BA-directory-sync-08  | P1       | Plan se claimuje prije applyja; parcijalni failure trajno blokira siguran retry/resume              | otvoreno |
| BA-directory-sync-09  | P2       | Rate limit, backoff, cache i status su process-local i zaobilaze se u više replika                  | otvoreno |
| BA-directory-sync-10  | P2       | Policy settings greške fail-soft vraćaju default role/deactivation/filter/cooldown semantiku       | otvoreno |
| BA-directory-sync-11  | P2       | LDAP host nema egress/DNS/IP allowlist; custom CA dopušta povjerenje proizvoljnom LDAPS endpointu   | otvoreno |
| BA-directory-sync-12  | P2       | On-demand email upsert nema GUID provenance/tombstone audit i može preuzeti non-local account      | otvoreno |
| BA-directory-sync-13  | P2       | UserRole grant nema provenance/unique invariant; duplikati i pogrešan revoke su mogući             | otvoreno |
| BA-directory-sync-14  | P2       | Scope/principal invalidacija nije durable/cross-instance i ima refill race                         | otvoreno |
| BA-directory-sync-15  | P2       | Deactivation safeguard koristi plan-time denominator bez commit-time rechecka                      | otvoreno |
| BA-directory-sync-16  | P2       | Full LDAP/DB state i plan su neograničeni; memory/plan-size/timeout DoS je moguć                    | otvoreno |
| BA-directory-sync-17  | P2       | `listDirectoryUsersForLinking` zaobilazi cache/throttle i vraća cijelu PII listu                   | otvoreno |
| BA-directory-sync-18  | P2       | Plan čuva bogat PII 30 dana; pruning je best-effort i zavisi od scheduled toka                     | otvoreno |
| BA-directory-sync-19  | P2       | Nema fine permissions, step-up/dual control ni required reason za mass identity operacije          | otvoreno |
| BA-directory-sync-20  | P3       | Status izlaže interne DC URL/base DN/schedule/mapping detalje i nije durable                        | otvoreno |
| BA-directory-sync-21  | P3       | Manual katalog planira van transakcije bez version/lock zaštite za paralelne subtree izmjene       | otvoreno |
| BA-directory-sync-22  | P3       | Row failures nemaju stabilan root-cause kod; observability i reconciliation su slabi               | otvoreno |
| BA-directory-sync-23  | P3       | 12/21 suiteova compile-blockirano i nema real LDAP/DB/distributed/E2E matrice                       | otvoreno |

## 17. Ključne korekcije

- **01,12:** razdvojiti pure read od eksplicitne audited materialize mutacije sa GUID provenanceom.
- **02,08,22:** durable per-item apply ledger, aggregate transakcije, PARTIAL status, resume/compensation.
- **03,15:** config/directory/DB snapshot hash, per-row expected version i commit-time safeguard CAS.
- **04,13:** directory-owned role provenance, tuple unique i ownership-aware revoke.
- **05–06,14:** DB authz/session version + transactional outbox, obavezni audit i durable cross-instance invalidacija/revoke.
- **07,09:** DB advisory/distributed lease sa heartbeat/fencingom; Redis limiter/backoff/status.
- **10–11:** fail-closed policy snapshot i LDAPS egress/host/IP allowlist.
- **16–18:** size/memory/chunk limiti, streaming/checkpoints, encrypted/minimal plan i nezavisni retention job.
- **19–23:** fine permissions, MFA/dual control/reason, redigovan status, stable error codes i real integration testovi.

## 18. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,30 |
| B. API i ugovori             |    12% |   3,60 |
| C. Auth/authz/scope          |    15% |   3,60 |
| D. Poslovna pravila/stanje   |    13% |   3,10 |
| E. Podaci/Prisma/transakcije |    13% |   2,60 |
| F. Sigurnost/privatnost      |    12% |   3,30 |
| G. Async/integracije         |     8% |   3,50 |
| H. Testovi/dokazivost        |    10% |   3,30 |
| I. Operativnost/perf.        |     7% |   3,60 |
| **Ukupno**                   | **100%** | **3,40/10** |

Ponderisani zbir je 3,401, zaokružen na **3,40/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 19. Fazni plan

### Faza 0 — safety net

Real PostgreSQL+Redis+LDAP testbed: read-only mutation, stale plan, parallel lease, partial apply, role ownership, revoke failure, multi-instance limiter, huge dataset i audit failure.

### Faza 1 — trust i ownership

Razdvojiti read/materialize; GUID identity provenance; directory-owned role grants; fine permissions, step-up/dual control i reason.

### Faza 2 — durable sync state machine

Distributed fenced lease, versioned plan, CAS/safeguard recheck, item ledger, PARTIAL/resume/compensation i idempotency.

### Faza 3 — security side effects

Transactional audit/outbox, authzVersion/session revoke, cross-instance cache invalidation i fail-closed config snapshot.

### Faza 4 — LDAPS/PII/scale

Egress allowlist, streaming/chunks, size limits, encrypted/minimal plan, independent retention i durable observability.

### Faza 5 — finalni gate

Svih 21 suite zelen; real LDAP failover/TLS, Postgres concurrency, Redis multi-instance i end-to-end dry-run/apply/scheduled/manual-catalog testovi na finalnom SHA-u.

## 20. Acceptance i presuda

1. Read endpoint ne mijenja produkcijski identity state.
2. Svaka apply stavka ima provenance, CAS, durable outcome i siguran resume.
3. Role revoke uklanja isključivo directory-owned assignment.
4. Deactivation, authz version, session revoke intent i audit nastaju atomarno.
5. Samo jedan fenced run može pisati u bilo kojem trenutku.
6. Safeguard se provjerava nad commit-time stateom.
7. Config read je fail-closed; LDAPS egress je allowlistan.
8. Directory/plan veličine i PII retention su strogo bounded i auditirani.
9. Multi-instance limiter/backoff/cache/status su konzistentni.
10. Svih 21 suite i proširena integration/E2E matrica prolaze.

Modul ima vrijedne TLS, dry-run, local-account i safeguard zaštite, ali masovne identity/authorization promjene nemaju potrebnu atomarnost, provenance i distributed fencing. Iskren baseline je **3,40/10**.
