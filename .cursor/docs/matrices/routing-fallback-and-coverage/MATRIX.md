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

## Requester-safe preview (`POST /tickets/routing-preview`)
Isti resolver kao `GET /routing/resolve` (admin-only, `tickets/create-ticket.ts` ga ne poziva direktno nego preko `applyCreateTicketRouting`), izložen na zasebnoj ruti bez `RequireOrganizationalUnitScope`/`RequireServiceScope` dekoratora, jer requester ne konfiguriše routing nego samo šalje tiket. Umjesto toga: `assertCanCreateTicket` (isti gate kao `POST /tickets`) prije poziva resolvera — bez toga bi requester mogao „proviriti" naziv grupe za OU/servis kojem ne bi smio ni podnijeti tiket. `originUnitId` opcion, default je matična OJ pozivaoca (`resolveCreateOriginUnitId`, isto kao create).

Odgovor `{ outcome, groupName, fallbackDepth, autoAssign, approvalSteps, slaProfileName }`, bez internih id-jeva pravila ili jedinica:
- `groupName`: naziv grupe iz `resolution.groupId`, `null` kad `UNROUTED`.
- `autoAssign`: `resolveEffectiveAutoAssignStrategy` (grupa > servis > globalno, isti resolver kao stvarna dodjela); uvijek `NONE` kad `UNROUTED` (nema grupe u koju bi se dodjeljivalo), čak i ako je globalna strategija aktivna.
- `approvalSteps`: 0 ili 1, `resolveTicketApprovalRequirement` (isti izvor kao create), bez zavisnosti o prioritetu.
- `slaProfileName`: `Service.slaProfileId → SlaProfile.name`, samo ako je profil `isActive`; **ne zavisi od prioriteta** — SLA profil je vezan direktno za servis, `SlaRule` (koji prioritet koristi) bira samo vremena unutar profila, ne sam profil.

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
| `private.ticket.routing.requireCoverage` | `true` |

Namjerno **nisu** u registry-ju: `private.ticket.routing.fallbackGroupId` (runtime = UNROUTED, ne silent grupa), `private.routing.strictOuIsolation` (OU/service scope je uvijek aktivan preko decoratora). Install seed koristi lokalni `seedHandlerGroupId` (prva handler grupa + EXACT pravilo), ne settings ključ.

## API / UI
`GET /routing/coverage` (`ADMIN`). Frontend: coverage tabela + minimalni WHEN/THEN create. Nije puni routing admin suite.

## Namjerno NIJE
SLA cleanup timer, `fallbackGroupId` silent assign, auto-assign, ticket workspace, config versioning.
