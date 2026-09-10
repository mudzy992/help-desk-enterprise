# MATRIX — authentication

## Cilj
Provider-neutral autentikacija: `local` | `entra_ad` proizvode isti `AuthenticatedPrincipal` / authorization claims tok. Provider grananje ostaje u authentication infrastrukturi, ne u domenu/RBAC.

## Mode
Izvor: postojeći Settings ključ `private.auth.mode` (`local` | `entra_ad`, default `local`).
Nepoznata/neispravna vrijednost (uključujući `test`) → fail closed (`AUTHENTICATION_UNAVAILABLE`). Nema drugog auth-mode mehanizma.

## Provider granica
| Mode | Password credentials | External identity |
|---|---|---|
| `local` | Aktivni user sa `localPasswordHash` | odbijeno (`entra_id_token`) |
| `entra_ad` | Samo `isLocalOnly` user (SuperAdmin invariant) | MSAL ID token: issuer/tenant/audience/signature + required claims; lookup po `entraObjectId` |

Oba providera vraćaju isti `AuthenticatedPrincipal`: `{ subjectId, email, displayName, isLocalOnly }`. Nema `provider` polja na principalu. Authorization koristi `toAuthorizationPrincipal()` i ne smije pitati koji je provider. Principal se materijalizuje iz lokalnog User zapisa, ne iz Entra profila.

## Entra / MSAL
- Konfiguracija: `private.auth.azureTenantId` i `private.auth.azureClientId` (Settings secrets). Nema hardkodiranog tenanta/clienta.
- Nedostaje/neispravan tenant ili client → `AUTHENTICATION_UNAVAILABLE`.
- HTTP: `POST /auth/entra` `{ idToken }` → isti session odgovor kao `POST /auth/login`.
- Token se verifikuje protiv tenant JWKS (`RS256`). Issuer `https://login.microsoftonline.com/{tenantId}/v2.0`, audience = clientId, `tid` mora odgovarati tenantu.
- Required claims: `oid`, `tid`, `name`, i `email` ili `preferred_username` (email). `sub` nije zamjena za `oid`.
- Nevažeći/nepotpun token → `INVALID_CREDENTIALS`. JWKS nedostupan → `AUTHENTICATION_UNAVAILABLE`.
- Nema provisioninga: user mora već imati matching `entraObjectId`. Nema Graph/directory read, OU mapping, ili upisa identiteta.
- Tokeni, secrets i identity claimovi se ne loguju.

## SuperAdmin invariant
- Role key `SUPER_ADMIN` ⇒ `isLocalOnly = true` i `entraObjectId = null`.
- `applySuperAdminLocalOnlyInvariant()` je jedini način da se te vrijednosti materijalizuju.
- `canBindExternalIdentity()` je false za `isLocalOnly` i za SuperAdmin. Entra ne može pretvoriti vanjski identitet u lokalnog SuperAdmina.
- Povreda invarijante pri loginu → `INVALID_CREDENTIALS` (fail closed, bez enumeracije).

## Local credentials
- Hash: bcrypt, cost 12, polje `User.localPasswordHash`. Nema plaintext storage.
- Verify: `bcrypt.compare` (constant-time). Dummy hash kad user ne postoji ili nije eligible, da se izbjegne enumeracija.
- Lozinka/hash se ne loguju i ne vraćaju u API/JWT.

## Session / JWT
- Secret: `private.auth.jwtSigningSecret` (Settings secret). Nedostaje ili < 32 znaka → fail closed.
- Claims: samo `{ sub }`. Expiry: 8h. Nema password/email/provider/secret u tokenu.
- HTTP: `POST /auth/login` → `{ accessToken, tokenType, expiresInSeconds, principal }`.
- Socket.IO: postojeći `SocketAuthenticationVerifier` verifikuje isti JWT (`JwtSocketAuthenticationVerifier`). Handshake i dalje prima samo `handshake.auth.token`.

## Namjerno NIJE implementirano
AD/Graph sync, install wizard, break-glass audit tok, frontend MSAL login UI. Granular permissions / `RoleGuard` / `OuAccessGuard` žive u `authorization` modulu. OU CRUD živi u zasebnom `organizational-units` modulu.
