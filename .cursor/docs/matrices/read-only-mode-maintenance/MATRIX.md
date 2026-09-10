# MATRIX — read-only-mode-maintenance

## Cilj
Centralni backend read-only mode za admin modul. Kad je zaključan, admin read operacije ostaju dostupne, a mutacije (create, update, delete, assign, sync, apply policy) se blokiraju. Enforcement je serverside; frontend nije dio ovog taska.

## Settings
| Key | Tip | Default | Uloga |
|---|---|---|---|
| `private.readOnlyMode.enabled` | boolean | `true` | Master switch. `false` ⇒ nijedan modul nije zaključan. |
| `private.readOnlyMode.modulesCsv` | string | `admin,settings,routing,service_catalog,service_forms,sla` | Moduli koje je moguće zaključati. |
| `private.readOnlyMode.activeModulesCsv` | string | `""` | Trenutno zaključani moduli. Prazno ⇒ ništa nije zaključano. |
| `private.readOnlyMode.bypassRolesCsv` | string | `SUPER_ADMIN` | Role keyevi koji smiju mutirati zaključani modul. |

Modul je zaključan samo ako je `enabled` i key je u `activeModulesCsv` ∩ `modulesCsv`. `admin` u active listi zaključava cijeli admin HTTP surface.

## Admin rute
| Prefix | Module key | Read | Mutation |
|---|---|---|---|
| `/organizational-units` | `admin` | GET tree/detail/users | POST create, PATCH, DELETE, PUT assign |
| `/policy-packs` | `settings` | GET list, POST validate | POST apply |
| `/directory-sync` | `admin` | POST read | bilo koji drugi write/sync POST |

GET/HEAD/OPTIONS su read. POST/PUT/PATCH/DELETE su mutacije osim `POST /directory-sync/read` i `POST /policy-packs/validate` (`@AdminReadOperation`). Ticket/auth rute nisu admin.

## Enforcement
Jedan tok: `classifyAdminReadOnlyRequest` → `evaluateAdminReadOnlyAccess` → `enforceAdminReadOnlyMode`.
`AdminReadOnlyInterceptor` (`APP_INTERCEPTOR`) zove taj tok nakon guardova. `RoleGuard` / `OuAccessGuard` i dalje zovu samo `AuthorizationService.authorize`. Shadow ALLOW nije grant i ne zaobilazi read-only.

Bypass: `AuthorizationContextLoader` (isti SuperAdmin invariant). `SUPER_ADMIN` bypass samo ako je `isSuperAdmin && isLocalOnly`. Nema JWT/provider claimova, `NODE_ENV` grana, ili drugog RBAC evaluatora.

Fail closed: nečitljiv settings snapshot ⇒ admin mutacija `403 READ_ONLY_MODE`.

## Namjerno NIJE implementirano
Frontend UI, config versioning/rollback, HTTP settings CRUD, vezivanje RoleGuard na OU/directory-sync, ticket create lock.
