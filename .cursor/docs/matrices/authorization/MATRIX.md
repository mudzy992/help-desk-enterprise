# MATRIX — authorization

## Cilj
Granularni RBAC nezavisan od authentication providera. `local` i `entra_ad` proizvode isti `AuthorizationPrincipal`; dozvole se učitavaju iz lokalnog `User` / `UserRole` / `RolePermission` zapisa, nikad iz Entra/JWT claimova.

## Principal
HTTP: `SessionAuthenticationGuard` verifikuje session JWT (`sub` only), učitava aktivnog usera iz baze, provjerava SuperAdmin invariant, i stavlja `AuthorizationPrincipal` na request. Nema `provider`, `roles`, `oid`, `tid`, ili permission claimova na principalu.

JWT payload sa authorization/provider claimovima (`roles`, `oid`, `tid`, `permissions`, `email`, `provider`, …) se odbija. Guard i evaluator ignorišu Entra polja na requestu.

## Permissions i role
Kanonski role keyevi: `USER`, `AGENT`, `ADMIN`, `SUPER_ADMIN`.
Kanonski permission keyevi: RAW enterprise set (`ticket.*`, `service.*`, `sla.write`, `routing.write`, `settings.write`, `audit.export`, `supportBundle.export`, `confidential.break_glass`).

Default role→permission mapa živi kao konstanta (nije runtime bypass). Evaluator čita samo assignment.permissionKeys iz baze. Prazan `RolePermission` ⇒ nema permissiona (osim SuperAdmin).

## Scope semantika
Evaluacija je **na istom `UserRole` assignmentu** (nema unije permissiona iz jednog OU-a sa pristupom iz drugog).

| Zahtjev | Assignment bez OU | Assignment sa OU path |
|---|---|---|
| Permission bez OU scope | mora biti `organizationalUnitId = null` | deny |
| Permission + OU scope | deny (nije globalno) | assigned path = requested path ili ancestor (`requested.startsWith(assigned + '/')`) |

Nasljeđivanje ide naniže (assigned OU pokriva potomke). Ancestor, sibling, i path prefix collision (`/Korisnici/ED` vs `/Korisnici/ED Zenica`) su deny.

| Zahtjev | Assignment `serviceId = null` | Assignment sa `serviceId` |
|---|---|---|
| Permission bez service scope | grant | deny |
| Permission + service scope | grant (svi servisi) | samo tačan `serviceId` |

Service lookup koristi samo `{ id }`. Nema lifecycle/forms/catalog polja u authorization sloju.

Traženi OU mora postojati (`ouPath` non-empty). Traženi service mora postojati. Nedostaje/prazan/nepoznat scope ⇒ deny, uključujući SuperAdmin.

## SuperAdmin
Role key `SUPER_ADMIN` + `isLocalOnly = true` + `entraObjectId = null` ⇒ globalne permissions, OU i service (nakon što su requested scope vrijednosti validne).
Povreda invarijante ⇒ nema authorization context (fail closed). `isLocalOnly` ostaje obavezan.

## Guardovi
- `RoleGuard` — role i/ili permission metadata; OU scope samo ako je dekorisan.
- `OuAccessGuard` — uvijek zahtijeva OU identitet (default field `organizationalUnitId`, params → body → query).
Oba zovu isti `evaluateAuthorizationAccess` kroz `AuthorizationService.authorize` (nema duplog pravila u kontrolerima).

Nema principal-a ⇒ 401 `INVALID_CREDENTIALS`. Principal postoji, odluka deny ⇒ 403 `FORBIDDEN`. Nema test bypass-a, `NODE_ENV` grana, ili token/credential logovanja.

Service catalog HTTP rute koriste isti `RoleGuard` + `service.catalog.write` + `RequireServiceScope`. Catalog lifecycle nije authorization scope; lookup ostaje `{ id }`.

## Read-only admin mode
`AdminReadOnlyInterceptor` je dodatni sloj nakon `RoleGuard` / `OuAccessGuard`. Ne mijenja `authorize` odluku. Detalji: `.cursor/docs/matrices/read-only-mode-maintenance/MATRIX.md`.

## Shadow permission check
`ShadowAuthorizationService.evaluate` koristi isti `evaluateAuthorizationRequest` + `decideAuthorizationAccess` tok kao `AuthorizationService.authorize`. Vraća ne-enforcing report (`kind: shadow`, `isEnforcing: false`, `ALLOW`/`DENY` + deterministic reason). Shadow ALLOW nije autorizacija. Guardovi ne zovu shadow API. Detalji: `.cursor/docs/matrices/permissions-shadow-check/MATRIX.md`.

## Namjerno NIJE implementirano
Frontend authorization UI, vezivanje guardova na postojeće OU/directory-sync kontrolere, RBAC CI matrica izvan unit testova ovog modula, config versioning/rollback/admin preview UI. Confidential per-ticket ACL: `ticket-confidential-visibility`.

Policy packovi žive u `policy-packs` modulu i samo materijalizuju `UserRole` / `RolePermission` zapise koje ovaj evaluator već čita.
