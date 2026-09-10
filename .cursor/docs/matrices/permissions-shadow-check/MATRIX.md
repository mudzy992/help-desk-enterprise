# MATRIX — permissions-shadow-check

## Cilj
Provider-neutral shadow authorization: predvidjeti šta bi `authorize` odlučio, bez mijenjanja stvarne odluke, principala, permissiona, scope-ova ili baze.

## API
`ShadowAuthorizationService.evaluate(input)` prima isti input kao `AuthorizationService.authorize` (`principal`, `requirements`, `organizationalUnitId`, `serviceId`) i vraća `ShadowAuthorizationReport`.

Nema HTTP/admin UI u authorization fazi. Policy Packs konzumiraju ovaj servis za preview compatibility (ne-enforcing).

## Reuse
Jedan tok: `evaluateAuthorizationRequest` → `decideAuthorizationAccess` → boolean za `authorize`, report za shadow.
Isti `AuthorizationContextLoader`, OU path lookup (`ouPath` only), service identity lookup (`id` only), SuperAdmin invariant (`createAuthorizationContext`), assignment grant pravila (permission/role/OU/service na istom `UserRole` assignmentu).

Nema drugog permission/role/OU evaluatora. Nema grananja na `local` / `entra_ad`. Principal se koristi samo kao `subjectId` za load context-a.

## Report
Strukturiran, production-safe. Nema email, displayName, tokena, passworda, `provider`, `oid`, `tid`, `entraObjectId`.

| Polje | Sadržaj |
|---|---|
| `kind` | uvijek `shadow` |
| `isEnforcing` | uvijek `false` |
| `decision` | `ALLOW` / `DENY` |
| `reason` | deterministic reason code |
| `requested` | permission/role keys, target OU id/path, target service id, scope flags |
| `considered` | subjectId, isSuperAdmin, isLocalOnly, effective role/permission keys, OU/service scopes, assignment copies |

`decision === ALLOW` ⇔ `authorize()` bi vratio `true` za isti input. Shadow ALLOW se ne smije tretirati kao grant.

## Semantika odluke
Fail closed. SuperAdmin dobija `SUPER_ADMIN_ALLOWED` samo ako je `isLocalOnly` i requested OU/service (ako su traženi) postoje. Nepoznat/prazan scope ⇒ deny i za SuperAdmin.

| Reason | Kada |
|---|---|
| `MISSING_PRINCIPAL` | nema principal / prazan subjectId |
| `MISSING_AUTHORIZATION_CONTEXT` | user neaktivan, nepostoji, ili SuperAdmin invariant broken (loader vraća null) |
| `INVALID_REQUIREMENT_TOKENS` | prazan role/permission token |
| `MISSING_AUTHORIZATION_REQUIREMENT` | nema role, permission, ni OU zahtjeva |
| `MISSING_ORGANIZATIONAL_UNIT_SCOPE` | OU scope tražen, id nedostaje |
| `UNKNOWN_ORGANIZATIONAL_UNIT` | OU id postoji, lookup/path fail |
| `MISSING_SERVICE_SCOPE` | service scope tražen, id nedostaje |
| `UNKNOWN_SERVICE` | service id postoji, lookup fail |
| `SUPER_ADMIN_NOT_LOCAL_ONLY` | `isSuperAdmin` a `isLocalOnly` false |
| `SUPER_ADMIN_ALLOWED` | validan SuperAdmin nakon scope validacije |
| `ASSIGNMENT_ALLOWED` | assignment grant na istom UserRole zapisu |
| `NO_MATCHING_ASSIGNMENT` | nijedan assignment ne pokriva zahtjev |

## Non-enforcing
- Nikad ne grantuje i ne denyuje pristup (ne baca 401/403).
- Ne mutira principal/context.
- Ne piše u bazu (samo `findUnique` lookup).
- `RoleGuard` / `OuAccessGuard` i dalje zovu samo `AuthorizationService.authorize`.

## Namjerno NIJE implementirano
Read-only admin mode, frontend preview UI, `private.security.permissions.shadowCheck.*` settings gating, config versioning/rollback, impacted-users preview limit.
