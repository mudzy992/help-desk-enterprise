# MATRIX — read-only-mode-maintenance

## Cilj
Centralni backend read-only mode za admin module. Kad je zaključan, admin read operacije ostaju dostupne, a mutacije (create, update, delete, assign, sync, apply policy) se blokiraju. Enforcement je serverside preko `AdminReadOnlyInterceptor`. Katalog usluga ima frontend banner + lock-aware write CTA (Faza 3 catalog plana).

## Settings
| Key | Tip | Default | Uloga |
|---|---|---|---|
| `private.readOnlyMode.enabled` | boolean | `true` | Master switch. `false` ⇒ nijedan modul nije zaključan. |
| `private.readOnlyMode.modulesCsv` | string | `admin,settings,routing,service_catalog,service_forms,sla` | Moduli koje je moguće zaključati. |
| `private.readOnlyMode.activeModulesCsv` | string | `""` | Trenutno zaključani moduli. Prazno ⇒ ništa nije zaključano. |
| `private.readOnlyMode.bypassRolesCsv` | string | `SUPER_ADMIN` | Role keyevi koji smiju mutirati zaključani modul. |

Modul je zaključan samo ako je `enabled` i key je u `activeModulesCsv` ∩ `modulesCsv`. `admin` u active listi zaključava cijeli admin HTTP surface.

Nasljeđivanje: `service_forms` mutacije su locked i kad je aktivan `service_catalog` (forme na katalog stranici). Samo `service_forms` u active i dalje zaključava samo forme.

## Admin rute
| Prefix | Module key | Read | Mutation |
|---|---|---|---|
| `/organizational-units` | `admin` | GET tree/detail/users | POST create, PATCH, DELETE, PUT assign |
| `/policy-packs` | `settings` | GET list, POST validate | POST apply |
| `/settings` | `settings` | — | PUT mutation (`reason` obavezan) |
| `/directory-sync` | `admin` | POST read | bilo koji drugi write/sync POST |
| `/services` | `service_catalog` | GET list/detail | POST create, PATCH, DELETE, POST lifecycle, PATCH availability, downtime CRUD |
| `/services/:id/form*` | `service_forms` | GET form | POST/PATCH form versions (inherits `service_catalog` lock) |
| `/service-categories` | `service_catalog` | GET list/detail | POST create, PATCH, DELETE |
| `/routing` | `routing` | GET | rule writes |
| `/sla` | `sla` | GET | SLA / priority-matrix writes |

GET/HEAD/OPTIONS su read. POST/PUT/PATCH/DELETE su mutacije osim `POST /directory-sync/read` i `POST /policy-packs/validate` (`@AdminReadOperation`). Ticket/auth rute nisu admin.

## Enforcement
Jedan tok: `classifyAdminReadOnlyRequest` → `evaluateAdminReadOnlyAccess` → `enforceAdminReadOnlyMode`.
`AdminReadOnlyInterceptor` (`APP_INTERCEPTOR`) zove taj tok nakon guardova. `RoleGuard` / `OuAccessGuard` i dalje zovu samo `AuthorizationService.authorize`. Shadow ALLOW nije grant i ne zaobilazi read-only.

Bypass: `AuthorizationContextLoader` (isti SuperAdmin invariant). `SUPER_ADMIN` bypass samo ako je `isSuperAdmin && isLocalOnly`. Nema JWT/provider claimova, `NODE_ENV` grana, ili drugog RBAC evaluatora.

Fail closed: nečitljiv settings snapshot ⇒ admin mutacija `403 READ_ONLY_MODE`.

## Frontend (service catalog)
- Banner na Katalog usluga kad je `service_catalog` (ili `admin`) locked.
- Write CTA sakrivene osim bypass (`isSuperAdmin && isLocalOnly`).
- Greška `READ_ONLY_MODE` → `services.errorReadOnly` / `services.categories.errorReadOnly`.
- Toggle lockova ostaje u Settings (Security) — nema novog toggle-a na katalogu.

## Namjerno NIJE implementirano
Frontend banner za routing/sla/settings (samo catalog u ovoj fazi), ticket create lock.
