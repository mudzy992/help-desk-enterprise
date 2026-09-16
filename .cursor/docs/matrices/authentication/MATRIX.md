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
- Admin `POST /users` (lokalni nalog): generiše privremenu lozinku, postavlja `localPasswordHash`, `isLocalOnly=true`, `mustChangePassword=true`. Plaintext se vraća **samo** u create odgovoru (`temporaryPassword`) kad SMTP addon nije aktivan; inače ide e-mail template `user.temporary_password` i API vraća `temporaryPassword: null`.
- Login kad `mustChangePassword=true`: **ne** izdaje session JWT. Vraća `{ status: "MUST_CHANGE_PASSWORD", passwordChangeToken, expiresInSeconds }` (JWT claim `purpose: password_change`, TTL 15 min).
- `POST /auth/change-password` (Bearer = passwordChangeToken): validira novu lozinku (min 12), postavlja hash, `mustChangePassword=false`, izdaje normalnu sesiju.
- Session guard odbija token ako `mustChangePassword` još stoji ili ako JWT ima `purpose` claim.

## Session / JWT
- Secret: `private.auth.jwtSigningSecret` (Settings secret). Install complete provisionira secret ako nedostaje ili je < 32 znaka. Login i dalje fail-closed ako secret nije upotrebljiv.
- Session claims: samo `{ sub }`. Expiry: 8h. Nema password/email/provider/secret u tokenu. Claim `purpose` je zabranjen na session tokenu.
- Password-change claims: `{ sub, purpose: "password_change" }` — nije validan session token.
- HTTP: `POST /auth/login` → session odgovor **ili** `MUST_CHANGE_PASSWORD`.
- Socket.IO: postojeći `SocketAuthenticationVerifier` verifikuje isti JWT (`JwtSocketAuthenticationVerifier`). Handshake i dalje prima samo `handshake.auth.token`.

## Namjerno NIJE implementirano
AD/Graph sync, install wizard, break-glass audit tok, frontend MSAL login UI. Granular permissions / `RoleGuard` / `OuAccessGuard` žive u `authorization` modulu. OU CRUD živi u zasebnom `organizational-units` modulu.
