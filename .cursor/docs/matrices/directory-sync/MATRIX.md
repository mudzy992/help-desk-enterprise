# MATRIX — directory-sync

## Cilj
Provider-neutral granica za directory **read** operacije plus **materializacija** u live `OrganizationalUnit` / `User` / `Group` nakon uspješnog read-a. Autentikacija `local | entra_ad` ostaje zaseban provider.

## Strategy
Izvor: `private.auth.adRead.strategy` (`manual_only` | `scheduled`, default `manual_only`).
Samo `manual_only` je implementiran. `scheduled` → fail closed (`DIRECTORY_SYNC_UNAVAILABLE`).

## Manual-only katalog
Izvor istine za `manual_only`: DB tabele `ManualDirectoryOrganizationalUnit` / `ManualDirectoryUser` / `ManualDirectoryGroup` (seed iz `defaultManualDirectoryCatalog`).
Admin CRUD: `GET/POST/PATCH/DELETE /directory-sync/manual-catalog/organizational-units` — guard `SUPER_ADMIN`.
CRUD **ne** mutira live `OrganizationalUnit`; samo katalog + invalidacija `DirectoryReadCache`.
Brisanje odbijeno dok postoje djeca u katalogu, katalog useri na path-u, ili materijalizovani OU ima children/mapped users.

## Materializacija
`POST /directory-sync/read` (nakon throttle + provider read, cache miss ili `forceRefresh: true`):
1. upsert OU po `distinguishedName`
2. upsert User po `email` (preskače `isLocalOnly`)
3. upsert Group po stabilnom `manual_*` key-u
4. snima `lastSuccessfulReadAt` (in-memory `DirectorySyncStatusStore`)

Cache hit **bez** `forceRefresh` ne re-materijalizuje. UI dugme šalje `forceRefresh: true`.

## Enablement / Scope / Throttle / Cache
Isti kao prije: `private.auth.adRead.*`, eksplicitni scope, QPS throttle, TTL iz settings (default cache 30 min, OU tree 12 h).

## API
- `POST /directory-sync/read` — read + materialize; `@AdminReadOperation`; body može `forceRefresh`
- `GET /directory-sync/status` — `enabled`, `strategy`, `maxQueriesPerSecond`, `cacheTtlMinutes`, `ouTreeCacheTtlHours`, `lastSuccessfulReadAt`
- Manual catalog CRUD (gore)

## Sigurnost
Nema Graph/MSAL/LDAP. Nema secreta u git. SUPER_ADMIN za sync/katalog.
