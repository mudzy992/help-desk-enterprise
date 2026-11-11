# BA-announcements-05: scoped aktori ne mogu referencirati tuđe grupe ni servise

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (A1/A2 = DA) uz CI `42990837191` success; vidi audit 28 §21.

## Izmjena

Bez migracije. Nova `assertManageReferences` provjera (create i update, prije transakcije): globalni manager prolazi bez ograničenja; scoped manager/agent smije referencirati samo grupe čiji OU (`Group.organizationalUnitId` → `ouPath`) leži unutar njegovog manage scopea ili agentovog home podstabla. Servis nema OU sidro, pa ga scoped aktor ne smije referencirati uopće (fail-closed, isti princip kao BA-announcements-01 za service-only grantove) — greška `ANNOUNCEMENT_INVALID_AUDIENCE` s detaljima `group`/`service`. Editor opcije scoped aktoru više ne nude servise (prazna lista), a grupe su i ranije bile filtrirane.

## Testovi i granice

Novi `announcements.references.spec.ts` (4 testa): tuđa grupa odbijena prije transakcije, bilo koji servis odbijen za scoped managera, vlastita grupa prolazi kroz pravi audit writer do kreiranja, options nudi samo vlastitu grupu i nijedan servis. Lokalno announcements suite: 9 suiteova / 56 testova (integracijski se preskače bez baze). CI `42990837191` (success, finalni SHA `498cd55`) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio A1/A2 = DA — nalaz je zatvoren, vidi audit 28 §21.
