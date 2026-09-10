# MATRIX — organizational units

## Cilj
Hijerarhijski OU model nezavisan od auth providera. Isti `User → OrganizationalUnit` mapping važi za `local` i `entra_ad`. Nema AD sync, Graph, MSAL, ili RBAC/OuAccessGuard u ovom modulu.

## Identitet
| Polje | Uloga |
|---|---|
| `id` | Stabilni aplikacijski identifikator |
| `name` | Display name / path segment |
| `distinguishedName` | Directory DN (LDAP). Unique, normaliziran. Source-of-truth za directory membership. |
| `ouPath` | Kanonska aplikacijska putanja `/Ancestor/.../Name`. Unique, izvedena iz parent lanca + `name`. |
| `parentId` | Nullable parent. Arbitrary depth. |

Child DN mora biti descendant parent DN (`endsWith(',' + parentDn)`). `Company/Department` su sekundarni atributi, nisu OU identitet.

## Hijerarhija
- Tree query: jedan `findMany`, zatim in-memory nested tree od rootova naniže. Nema N+1.
- Create child: parent mora postojati; DN mora sjediti pod parent DN; path se izračuna.
- Update name/parent: `ouPath` (i descendant paths) se prepisuju. Ako se DN ancestors-a mijenja, descendant DN-ovi se prepisuju zamjenom ancestor sufiksa.
- Self-parent i circular parent → `SELF_PARENT` / `CIRCULAR_HIERARCHY` (400).
- Reparent sa djecom: subtree se pomjera (nije silent drop). Delete sa djecom → `HAS_CHILDREN` (409). Nema cascade delete drveta.

## User mapping
- User ima najviše jedan primary OU (`User.organizationalUnitId`).
- Assign/reassign/unassign kroz isti use case; ne dira auth polja.
- Delete OU sa mapped users → `HAS_MAPPED_USERS` (409). FK `onDelete: Restrict`. Nema silent SetNull.
- OU → users i user → OU query vraćaju samo `id`, `email`, `displayName`, `organizationalUnitId`.

## API
| Method | Path | Use case |
|---|---|---|
| POST | `/organizational-units` | create |
| GET | `/organizational-units/tree` | nested tree |
| GET | `/organizational-units/:id` | retrieve + direct children + users |
| PATCH | `/organizational-units/:id` | update / reparent |
| DELETE | `/organizational-units/:id` | delete leaf without users |
| GET | `/organizational-units/:id/users` | users in OU |
| PUT | `/organizational-units/user-mappings` | assign / reassign / unassign |

Nema authorization guardova (OuAccessGuard je kasniji task).

## Namjerno NIJE implementirano
AD sync, Microsoft Graph, Entra/MSAL, granular permissions/scopes, RoleGuard, OuAccessGuard, policy packs, frontend OU administration UI.
