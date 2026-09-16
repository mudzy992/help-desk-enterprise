# CHANGELOG — directory-sync

## 2026-09-16
- DB-backed manual-only katalog (`ManualDirectory*`), SUPER_ADMIN CRUD, cache invalidacija.
- `POST /directory-sync/read` materializuje OU/User/Group; `forceRefresh` bypass cache; `GET /directory-sync/status`.

## 2026-09-10
- `POST /directory-sync/read` ostaje admin read pod read-only mode-om; write/sync rute (kad postoje) su mutacije.
- Inicijalna matrica: provider-neutral directory read port, `manual_only` stub, eksplicitni scope, in-process throttle + bounded cache, nezavisnost od `local | entra_ad`. Nema stvarnog AD/LDAP/Graph sync-a.
