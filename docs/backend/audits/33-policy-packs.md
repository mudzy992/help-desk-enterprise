# Backend audit 33 — `policy-packs`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **3,68/10**  
**Nalazi:** 7 P1, 9 P2, 3 P3

## 1. Executive summary

`policy-packs` primjenjuje tri code-defined permission/configuration paketa na OU, service i eksplicitne korisnike. Paket može kreirati globalni role/permission katalog, dodati scoped `UserRole`, vezati paket za OU/service, promijeniti service classification/approval/SLA i invalidirati principal context. Apply/unapply i audit su transakcijski, endpointi za mutacije traže SUPER_ADMIN + `settings.write`, SuperAdmin grant je zabranjen, definicije se validiraju i response daje plan.

Baseline je **3,68/10**. Sedam P1 nalaza pogađaju autorizacijsku i rollback tačnost. Paket dodaje permissione na globalne ADMIN/AGENT role, pa promjena namijenjena jednom targetu mijenja permission skup svih postojećih assignmenta iste role. `UserRole` nema provenance ni unique constraint; unapply ne zna je li assignment paket kreirao ili je postojao ručno/drugim putem i zato ga može obrisati. Zamjena paketa samo prepiše `policyPackId`, bez reconciliationa ranijih grantova. Unapply starog paketa uklanja planirane grantove čak i kada target sada pripada drugom paketu. Service bundle overwrite nije reverzibilan: unapply ne vraća classification, approval ni SLA. OU i service targeti nisu međusobno validirani. Disabled-pack zaštita hvata svaku settings grešku i fail-open vraća praznu listu.

Dodatno, OU scope cache se invalidira unutar transakcije, a ne pouzdano poslije commita; paralelni apply koristi find-then-create bez DB unique invarianta; ne postoji userIds limit; missing SLA profile ne blokira restrictive pack; cache invalidation poslije commita može vratiti 500 nakon uspješne mutacije. Samo 1/12 suiteova se izvršio: 7/7 testova je zeleno, 11 suiteova je compile-blockirano generated Prisma problemima. Popravke nisu implementirane.

## 2. Scope i inventar

- 32 produkcijska TypeScript fajla, 12 specova, 2.101 direktno izmjereni produkcijski LOC (registar: 2.133);
- 1 controller, 1 injectable service;
- endpointi: list code registryja, list persisted kataloga, validate, apply, unapply;
- modeli: `PolicyPack`, `Role`, `Permission`, `RolePermission`, `UserRole`, OU, Service, SLA profile i AuditLog;
- integracije: authorization/principal context, settings disabled list, scope cache, install wizard i service catalog;
- E2E 52/53 dodiruju IT Standard kroz install wizard, bez direktne destructive/security matrice.

## 3. API, autentikacija i autorizacija

Sve rute traže sesiju. Apply/validate/unapply traže SUPER_ADMIN i `settings.write`; list traži ADMIN+`settings.write`, persisted list ADMIN+`serviceCatalogWrite`. DTO koristi whitelist/forbid/transform, a target existence i pack definition se validiraju.

To je dobra high-risk mutacijska granica, ali permission naming nije precizan: globalni RBAC/service policy mutation koristi generički `settings.write`. Treba zaseban `policy-packs.apply/unapply/validate/read`, step-up/MFA i change reason. `list` i `listPersisted` nisu označeni kao `AdminReadOperation`, pa read-only mode može blokirati čiste readove, dok POST validate jeste označen.

Validate je samo trenutni preview; nema signed plan hash/version koji apply mora potvrditi. Između validate i apply mogu se promijeniti target, assignments, SLA profile, disabled setting ili pack code.

## 4. Globalni role-permission bleed

`ensurePolicyPackCatalog` dodaje `RolePermission` na postojeće globalne role `ADMIN` i `AGENT`. Principal loader zatim svaki assignment te role učitava sa cijelim globalnim permission skupom. Zato Finance paket za jedan OU/service dodavanjem `audit.export`, `routing.write` i `sla.write` na ADMIN proširuje permission set svakog ADMIN assignmenta u sistemu. Scope-aware endpoint može i dalje ograničiti target, ali endpoint bez odgovarajućeg OU/service guarda vidi globalno proširenu capability. Isto vrijedi za AGENT permission uniju iz HR/Finance/IT paketa.

Paket-specifični permissioni moraju pripadati immutable pack role/versionu ili assignment-policy joinu, ne shared canonical roli. Globalne role-permission definicije smije mijenjati samo centralni RBAC migration/seed.

## 5. Assignment ownership i unapply

Apply radi `findFirst` po user/role/OU/service pa postojeći assignment smatra zadovoljenim. Nigdje ne zapisuje da li ga je paket kreirao. Unapply zatim radi `deleteMany` po istom tupleu. Ako je assignment postojao ručno, kroz drugi workflow ili drugi paket, unapply ga briše. Test tvrdi da apply ne uklanja manual role, ali ne testira ključni slučaj manual assignmenta istog tuplea koji unapply uklanja.

`UserRole` schema nema unique `[userId, roleId, organizationalUnitId, serviceId]`. Paralelni apply zahtjevi mogu oba proći `findFirst` i kreirati duplikate; unapply ih sve briše. Potreban je provenance model `PolicyPackApplication` + `PolicyPackGrant`, reference counting/ownership i DB unique/CAS invariant.

## 6. Pack replacement i stale grants

OU/service imaju samo jedan `policyPackId`. Apply novog paketa jednostavno prepisuje link. Grantovi starog paketa, globalni role permissions i ranije promjene service policyja ostaju. Sistem tako tvrdi da target ima Finance pack dok IT/HR assignmenti ostaju aktivni.

Još opasnije, unapply starog paketa prvo briše assignmente prema starom code planu, a tek zatim conditionalno odbija unbind ako target pokazuje na novi paket. Dakle zaštita „leave different pack bound“ čuva samo FK, ne privilege state. Replacement mora biti jedna diff/reconciliation transakcija nad persisted application provenanceom.

## 7. Service bundle i target integritet

Apply prepisuje service `classification`, `requiresApproval` i, ako profil postoji, `slaProfileId`. Audit čuva before vrijednosti, ali unapply ih namjerno ne vraća. Endpoint nazvan unapply zato nije semantički reverse: restricted classification/approval/SLA ostaju poslije uklanjanja pack veze i grantova. Ponovni apply nakon ručnih izmjena također overwriteuje vrijednosti bez optimistic versiona.

Ako deklarisani SLA profile ne postoji, apply ipak uspije, `slaProfileResolved=false`, a service zadrži prethodni SLA. Za HR/Finance to proizvodi djelimično primijenjen security/operations bundle. Restrictive paket mora biti all-or-nothing ili eksplicitno odobren degraded plan.

OU i service se provjeravaju odvojeno, ali se ne provjerava da service pripada odabranom OU-u niti da kombinovani scope ima poslovni smisao. Moguće je vezati HR/Finance paket za OU A i service iz OU B te kreirati assignment sa cross-domain scopeom.

## 8. Disabled-pack fail-open

`readDisabledPolicyPackKeys` prvo pokušava private getter, zatim secret getter, a zatim hvata sve i vraća `undefined`; bez SettingsService također vraća praznu listu. Settings/DB/validation greška zato pretvara administrativno disabled paket u enabled paket i apply prolazi. Security deny list mora biti fail-closed na mutacijama, sa typed razlikovanjem visibility migrationa od stvarnog read kvara. Unapply smije ostati dostupan.

Disabled stanje takođe ne deaktivira već primijenjene pakete niti uklanja grantove; users summary samo označava pack disabled. Potreban je jasan lifecycle: disable-new-apply naspram suspend/revoke-existing, sa impact previewom.

## 9. Transakcije, cache i concurrency

Apply/unapply core i audit jesu u jednoj DB transakciji. Principal invalidation se pravilno odgađa do poslije commita. Međutim `invalidateOrganizationalUnitScopeCache()` se poziva iz `bind/unbind` unutar transakcije. Concurrent request može refillati pre-commit stanje, koje poslije commita više nije invalidirano. Invalidation mora biti post-commit i cross-instance/versionirana.

Ako principal invalidation poslije commita padne, endpoint vraća grešku iako je DB mutacija uspjela. Retry je samo djelimično idempotentan i stvara novi audit; klijent ne može razlikovati commit od failurea. Potreban je transactional outbox/version bump kao dio commita i idempotency key.

Find-then-create za role, permission, rolePermission i userRole je race-prone. Unique constraint spašava neke katalog redove sirovim conflictom, ali UserRole nema unique. Target read/plan se radi prije transakcije, pa target može nestati/promijeniti se prije writea. Nema isolation/CAS/version provjere.

## 10. Input, performance i DoS

`userIds` nema `ArrayMaxSize`, ukupni body/domain limit ni batch size. Jedan SUPER_ADMIN zahtjev može poslati veoma velik niz; resolver radi `IN`, a apply zatim serijski N×grant `findFirst/create`, pa invalidira svakog korisnika serijski poslije commita. Ovo povećava transaction duration, lock contention i timeout rizik. Potrebni su bounded batch, bulk insert/upsert, async job za veće promjene i progress/result ledger.

Registry je mali i bounded. Persisted list nema pagination, ali broj code-defined packova je trenutno mali. Ipak DB može sadržati legacy/custom redove pa treba eksplicitni limit.

## 11. Audit i observability

Audit je transakcijski i bilježi actor/request/OU/pack/service te counts; apply bilježi service policy before/after. Pozitivno je da commit bez audita ne prolazi.

Nedostaju eksplicitni userIds ili njihov hash/count u audit metadata, assignment provenance, disabled-setting decision, pack definition version/hash, validate plan hash, unapply service state i razlog promjene. Fixed action bez required reasona nije dovoljan za privilege promjenu. Post-commit invalidation failure i stale cache nemaju durable remediation status/metriku.

## 12. Testovi

Pokrenuto svih 12 direktnih suiteova:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/policy-packs -name '*.spec.ts' -print | sort)
```

Rezultat: **1/12 suiteova prošao, 11/12 compile-blockirano; 7/7 izvršenih testova prošlo**. Zeleni suite je `read-disabled-policy-pack-keys.spec.ts`. Blokade: nedostajući generated Prisma enums/delegati (`user`, `userRole`, `group`, `$transaction`) i povezane implicit-any greške.

Postoje vrijedni in-memory testovi za registry, provider independence, plan, idempotency, authorization compatibility, disabled pack, service bundle, unapply i invalidation hook. Ali harness nema DB unique/isolation/cache semantiku i čak kodira rizično očekivanje da se stari pack link sačuva dok njegovi grantovi mogu biti uklonjeni. Nedostaju testovi za global role-permission bleed na postojeće assignment-e, manual same-tuple unapply, replacement reconciliation, OU-service mismatch, disabled read failure, parallel apply, missing SLA fail, rollback service fields, invalidation/outbox failure i oversized batch.

E2E 52/53 samo potvrđuju wizard happy path za IT Standard. Nema direktnog API apply/unapply sigurnosnog dokaza.

## 13. Pozitivni nalazi

1. Apply/unapply core i audit su transakcijski.
2. Mutacije traže SUPER_ADMIN i session.
3. SuperAdmin grant je eksplicitno zabranjen.
4. Pack/role/permission definicije imaju registry validaciju.
5. OU/service/user existence se provjerava.
6. DTO whitelist odbija dodatna polja.
7. Validate vraća determinističan plan.
8. Principal invalidation se pokreće nakon commita.
9. Unbind ne briše FK drugog paketa.
10. Audit bilježi service policy before/after.
11. Apply je sekvencijalno idempotentan za isti assignment.
12. Unapply bez targeta se odbija.

## 14. Registar nalaza

| ID                    | Severity | Nalaz                                                                                              | Status   |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-policy-packs-01    | P1       | Paket dodaje permissione globalnim ADMIN/AGENT rolama i širi capability svim njihovim assignmentima | otvoreno |
| BA-policy-packs-02    | P1       | UserRole nema provenance; unapply briše manualni/drugi same-tuple assignment                        | otvoreno |
| BA-policy-packs-03    | P1       | Apply drugog paketa prepisuje link bez uklanjanja/reconciliationa starih grantova                   | otvoreno |
| BA-policy-packs-04    | P1       | Unapply starog paketa briše grantove i kada je target već vezan za drugi paket                      | otvoreno |
| BA-policy-packs-05    | P1       | Unapply ne vraća classification/approval/SLA koje je apply overwriteovao                            | otvoreno |
| BA-policy-packs-06    | P1       | OU i service target nisu relacijski validirani; cross-domain scoped assignment je moguć             | otvoreno |
| BA-policy-packs-07    | P1       | Disabled-pack settings/read greška fail-open omogućava apply zabranjenog paketa                     | otvoreno |
| BA-policy-packs-08    | P2       | UserRole nema DB unique; paralelni apply može kreirati duplikate                                    | otvoreno |
| BA-policy-packs-09    | P2       | OU scope cache se invalidira prije commita, bez pouzdane post-commit/cross-instance invalidacije     | otvoreno |
| BA-policy-packs-10    | P2       | Post-commit principal invalidation failure vraća grešku nakon uspješnog commita                      | otvoreno |
| BA-policy-packs-11    | P2       | Missing SLA profile dopušta djelimično primijenjen restrictive service bundle                       | otvoreno |
| BA-policy-packs-12    | P2       | Validate/apply nema plan hash, version, CAS ni protection od TOCTOU                                 | otvoreno |
| BA-policy-packs-13    | P2       | `userIds` je neograničen; serijski N×grant query/invalidation omogućava skupu dugu transakciju       | otvoreno |
| BA-policy-packs-14    | P2       | Disable lifecycle ne definiše/revokuje postojeće primjene i daje samo presentation flag             | otvoreno |
| BA-policy-packs-15    | P2       | Privilege mutacije koriste generički settings.write bez step-upa, zasebne capability ili reasona    | otvoreno |
| BA-policy-packs-16    | P2       | Audit nema assignment provenance, user-set hash, pack version/hash ni obavezni change reason        | otvoreno |
| BA-policy-packs-17    | P3       | Read endpointi imaju nekonzistentne permissions i nisu oba označena kao admin read                  | otvoreno |
| BA-policy-packs-18    | P3       | Persisted list nema eksplicitni limit/pagination za legacy/custom katalog                           | otvoreno |
| BA-policy-packs-19    | P3       | 11/12 suiteova compile-blockirano; real DB concurrency/fault/security E2E matrica nedostaje          | otvoreno |

## 15. Ključne korekcije

- **01:** immutable pack-specific roles/policies; zabraniti mutaciju shared role-permission kataloga.
- **02–04,08:** persisted application/grant provenance, reference ownership, tuple unique i atomski replacement diff.
- **05,11:** versionirani before snapshot i CAS rollback ili jasno `detach` ime; bundle all-or-nothing.
- **06:** dokazati service→OU relaciju i user eligibility/membership prije plana.
- **07,14:** typed fail-closed disabled read i definisan suspend/revoke lifecycle.
- **09–10:** post-commit cross-instance version invalidation kroz transactional outbox.
- **12:** signed/versioned validate plan i optimistic target/application version.
- **13:** ArrayMaxSize/body cap, bulk operacije i async job za veće batch-eve.
- **15–16:** zasebne permissions, step-up/MFA, obavezni reason i potpuni privilege audit.
- **17–19:** read metadata/permission konsolidacija, bounds i real Prisma/Postgres testovi.

## 16. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   4,50 |
| B. API i ugovori             |    12% |   4,60 |
| C. Auth/authz/scope          |    15% |   3,00 |
| D. Poslovna pravila/stanje   |    13% |   3,20 |
| E. Podaci/Prisma/transakcije |    13% |   3,50 |
| F. Sigurnost/privatnost      |    12% |   3,20 |
| G. Async/integracije         |     8% |   3,80 |
| H. Testovi/dokazivost        |    10% |   3,30 |
| I. Operativnost/perf.        |     7% |   4,80 |
| **Ukupno**                   | **100%** | **3,68/10** |

Ponderisani zbir je 3,677, zaokružen na **3,68/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 17. Fazni plan

### Faza 0 — safety net

Real Postgres testovi za global permission bleed, same-tuple manual ownership, replacement/unapply, cross-OU service, disabled read failure, parallel apply, missing SLA, invalidation failure i oversized input.

### Faza 1 — autorizacijski model i provenance

Pack-specific immutable roles/policy rows; `PolicyPackApplication` i owned grant/bundle snapshot; DB unique/reference invarianti.

### Faza 2 — lifecycle i reversibility

Atomski apply/replace/unapply diff, CAS/version, service before snapshot rollback, all-or-nothing SLA i relacijska target validacija.

### Faza 3 — control plane sigurnost

Fail-closed disable, suspend/revoke semantics, zasebne permissions, MFA/step-up, reason i signed validate plan.

### Faza 4 — cache, skaliranje i audit

Transactional outbox/version invalidation, bounded/bulk batch, idempotency key, potpuni provenance/hash audit i metrike.

### Faza 5 — finalni gate

Svih 12 suiteova, DB concurrency/fault matrica, direktni apply/unapply E2E i wizard 52/53 na finalnom SHA-u.

## 18. Acceptance i presuda

1. Primjena paketa ne mijenja permission skup shared role drugim targetima.
2. Unapply uklanja samo redove dokazivo owned tim applicationom.
3. Replacement atomarno uklanja stari i uvodi novi efektivni state.
4. Unapply vraća ili eksplicitno i dokazivo zadržava svaki service bundle field prema ugovoru.
5. OU/service/user kombinacija je relacijski validna.
6. Disabled policy fail-closed blokira apply i ima definisan existing-application lifecycle.
7. Concurrency ne pravi duplikate, lost update ili stale authorization cache.
8. Batch je bounded, idempotentan i auditiran sa plan/application versionom.
9. Svih 12 suiteova i prošireni real DB/E2E testovi prolaze.

Modul ima dobru transakcijsku osnovu i snažan nominalni SUPER_ADMIN gate, ali trenutni model nema ownership i izolaciju potrebnu za sigurno upravljanje privilegijama. Iskren baseline je **3,68/10**.
