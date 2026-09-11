# MATRIX — routing-rules

## Cilj
Persistirana routing tabela `(originUnit + service) → group`. Nije auto-assignment, SLA, ticket CRUD ili drugi RBAC engine.

## Identitet
| Polje | Uloga |
|---|---|
| `id` | Stabilni identifikator pravila |
| `originUnitId` | OU izvora tiketa (`OrganizationalUnit.id`) |
| `serviceId` | Servis iz kataloga |
| `groupId` | Ciljna handler grupa (`Group.id`) |

Jedno pravilo po `(originUnitId, serviceId)`. Duplikat → `DUPLICATE_RULE`. Parent fallback nije drugi red u tabeli.

## Validacija
Create odbija nepostojeći OU (`ORIGIN_UNIT_NOT_FOUND`), servis (`SERVICE_NOT_FOUND`) i grupu (`GROUP_NOT_FOUND`). FK `onDelete: Restrict`.

## API
| Method | Path | Permission |
|---|---|---|
| POST | `/routing/rules` | `ADMIN` + `routing.write` + OU scope (`originUnitId`) + service scope (`serviceId`) |
| GET | `/routing/rules` | `ADMIN` |
| GET | `/routing/resolve` | `ADMIN` + OU/service scope |

## Namjerno NIJE
Change log / config versioning, SLA, auto-assign, Least Busy / Round Robin, ticket CRUD, Group Inbox, drugi RBAC evaluator.
