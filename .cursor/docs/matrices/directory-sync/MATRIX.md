# MATRIX — directory-sync

## Cilj
Provider-neutral granica za directory **read** operacije. Domen/application zavise od porta, ne od AD/LDAP/Graph/Entra SDK tipova. Autentikacija `local | entra_ad` ostaje zaseban provider; directory sync nije authorization source.

## Strategy
Izvor: `private.auth.adRead.strategy` (`manual_only` | `scheduled`, default `manual_only`).
Samo `manual_only` je implementiran. `scheduled` i nepoznate vrijednosti → fail closed (`DIRECTORY_SYNC_UNAVAILABLE`). Nema `if (authMode === ...)` grananja.

## Enablement
`private.auth.adRead.enabled` (default `false`). Isključeno → `DIRECTORY_READ_DISABLED`. Čitanje se nikad ne uključuje implicitno.

## Provider granica
| Strategy | Mreža | Persistencija | Semantika |
|---|---|---|---|
| `manual_only` | nema (in-memory katalog) | ne dira User/OU/Role | read-only, deterministički stub |
| `scheduled` | nije implementirano | — | fail closed |

Port: `DirectorySyncProvider.read({ operation, scope }) → DirectoryReadResult`.
Normalizirani tipovi: `DirectoryUser`, `DirectoryGroup`, `DirectoryOrganizationalUnit` (externalId, displayName, login/email gdje ima smisla, DN, ouPath). Nema raw SDK objekata van infrastructure.

## Scope
Svaki read mora imati eksplicitan scope. Nije dozvoljen implicitni “cijeli directory”.

Obavezno:
- `operation`: `users` | `groups` | `organizational_units`
- `scope.includeSubtree`: boolean (nema defaulta)
- bar jedno od: `scope.distinguishedName`, `scope.organizationalUnitPath`

Odbija se (`INVALID_SCOPE`):
- nedostaje scope / operation / includeSubtree
- prazan DN/path
- forest-root DN (samo `DC=` komponente)
- path `/` (cijelo stablo)
- DN van konfiguriranog base DN-a za operaciju
- prazan ili forest-root `usersBaseDn` / `groupsBaseDn`

Base DN:
- `users` → `private.auth.adRead.usersBaseDn`
- `groups` → `private.auth.adRead.groupsBaseDn`
- `organizational_units` → jedan od ta dva base DN-a

## Throttle
`private.auth.adRead.maxQueriesPerSecond` (default `0.5`). In-process, deterministički minimalni interval `1000 / qps`. Cache miss ide kroz throttle; cache hit ne. Prekoračenje → `DIRECTORY_READ_THROTTLED`. Nema `NODE_ENV` bypass-a. ≤0 ili ne-finite → `DIRECTORY_SYNC_UNAVAILABLE`.

## Cache
In-memory, bounded (max 64 unosa, LRU). Ne koristi Redis (Redis je queue, ne cache pattern).
Ključ: `strategy + operation + normalized scope` (DN, path, includeSubtree). Rezultati se ne dijele između scope-ova.
TTL:
- users/groups → `private.auth.adRead.cacheTtlMinutes` (default 30)
- organizational_units → `private.auth.adRead.ouTreeCacheTtlHours` (default 12)
Expiry je eksplicitan (`expiresAtMs`). TTL 0 = bez cache-a.

## API
`POST /directory-sync/read` — tanki controller → service → port. Validacija DTO + fail-closed parse scope. Označen kao admin read (`@AdminReadOperation`); ostaje dostupan u read-only mode-u. Nema admin UI, jobova, writova. Budući sync POST bi bio mutacija.

## Sigurnost
Read-only. Nema auto User/OU/role sync. Nema Graph/MSAL/LDAP. Nema secreta u git. Ne loguju se credentials ni puni directory payloadi.

## Namjerno NIJE implementirano
Entra/MSAL, Microsoft Graph, LDAP/AD konekcija, scheduled/BullMQ sync, provisioning, RBAC/RoleGuard/OuAccessGuard, policy packs, install wizard, frontend directory UI.
