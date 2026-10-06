# MATRIX — directory-sync

## Cilj
Provider-neutral granica za directory **read** operacije plus **materializacija** u live `OrganizationalUnit` / `User` / `Group` nakon uspješnog read-a. Autentikacija `local | entra_ad` ostaje zaseban provider.

## Strategy
Izvor: `private.auth.adRead.strategy` (`manual_only` | `scheduled`, default `manual_only`).
Samo `manual_only` je implementiran. `scheduled` → fail closed (`DIRECTORY_SYNC_UNAVAILABLE`).

## Manual-only katalog
Izvor istine za `manual_only`: DB tabele `ManualDirectoryOrganizationalUnit` / `ManualDirectoryUser` / `ManualDirectoryGroup` (seed iz `defaultManualDirectoryCatalog`).
Admin CRUD: `GET/POST/PATCH/DELETE /directory-sync/manual-catalog/organizational-units` — guard `SUPER_ADMIN`.
GET/POST/PATCH mijenjaju katalog i invalidiraju `DirectoryReadCache`; POST/PATCH **ne** mutiraju live `OrganizationalUnit`.
DELETE atomarno uklanja ručni kataloški zapis i, ako postoji, materijalizovanu live `OrganizationalUnit`.
Brisanje vraća `409` s tipom/brojem za djecu ili katalog korisnike/grupe i za sve žive OU veze; nalozi se nikad ne brišu.
OJ-scoped `UserRole` dodjele se uklanjaju uz audit i warning, a principal cache pogođenih korisnika se best-effort invalidira.
Ne šalje se brisanje stvarnom Active Directoryju.

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

## Audit i sigurnost
Create/update/delete ručnog kataloga evidentiraju se kao OJ audit događaji; brisanje live OU i kataloškog zapisa
je jedna transakcija. Metapodaci nemaju autentikacijske tajne. Nema Graph/MSAL/LDAP brisanja i nema secreta u git.
SUPER_ADMIN za sync/katalog.
