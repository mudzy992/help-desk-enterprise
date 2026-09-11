# MATRIX — routing-fallback-and-coverage

## Cilj
Deterministička rezolucija rute i coverage pregled. Exact match uvijek pobjedi parent fallback. Nema silent dodjele proizvoljne grupe.

## Rezolucija
Ulaz: `(originUnitId, serviceId)`. Hodanje je po stvarnom `parentId` lancu, nikad po string path nagađanju.

| Korak | Ishod |
|---|---|
| Exact rule na origin OU | `EXACT`, `fallbackDepth = 0` |
| Nema exact, prvo pravilo na ancestoru | `PARENT_FALLBACK`, depth = broj koraka gore |
| Origin je root ili lanac nema pravilo | `UNROUTED`, `groupId = null` |

Audit polja: `matchedRuleId`, `matchedOriginUnitId`, `fallbackDepth`, `fallbackPath` (ouPath od origin do matched), `outcome`.

## UNROUTED
Prvi ishod, nije fake grupa. Queue metadata (enabled, ownerRole) ne mijenja `groupId`. Kasniji Group Inbox čita ovaj ishod.

## Coverage
Jedna ćelija po `(service, origin OU)`:

| Signal | Kada |
|---|---|
| Exact | `outcome = EXACT` |
| Inherited | `outcome = PARENT_FALLBACK` |
| Missing | `hasExactRule = false` |
| Unrouted | `outcome = UNROUTED` |

## Settings
| Key | Default |
|---|---|
| `private.ticket.unroutedQueue.enabled` | `true` |
| `private.ticket.unroutedQueue.ownerRole` | `SUPER_ADMIN` |

## API / UI
`GET /routing/coverage` (`ADMIN`). Frontend: coverage tabela + minimalni WHEN/THEN create. Nije puni routing admin suite.

## Namjerno NIJE
SLA cleanup timer, `fallbackGroupId` silent assign, auto-assign, ticket workspace, config versioning.
