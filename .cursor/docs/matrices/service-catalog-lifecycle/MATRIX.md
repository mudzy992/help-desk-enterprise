# MATRIX — service-catalog-lifecycle

## Cilj
Admin service catalog (kategorija → servis) sa lifecycle statusom `DRAFT` | `ACTIVE` | `DEPRECATED`. Identitet servisa je stabilan; lifecycle nije identifikator. Nema drugog authorization ili service-management engine-a.

## Identitet i metadata
| Polje | Uloga |
|---|---|
| `id` | Stabilni aplikacijski identifikator (`cuid`). Nikad se ne mijenja, uključujući lifecycle prijelaze. |
| `slug` | Stabilni jedinstveni ključ. Postavlja se pri create; update i lifecycle ga ne smiju mijenjati. |
| `name` | Display name. |
| `categoryId` | Obavezna kategorija (`ServiceCategory`). |
| `lifecycle` | Stanje kataloga. Default iz settings (`DRAFT`). |
| `classification` | `INTERNAL` / `CONFIDENTIAL` / `RESTRICTED`. |
| `requiresApproval` | Approval flag (metadata; approval tok je kasnija faza). |
| `approvalSteps` (odgovor, ne polje na modelu) | 0 ili 1, izvedeno preko `resolveTicketApprovalRequirement` (isto što `POST /tickets` i routing preview koriste): `requiresApproval` uz eventualni overlay iz approvals konfiguracije (`requiredByService`, globalni `enabled`). `GET /services` i `GET /services/:id` koriste stvarnu konfiguraciju; create/update/transition/availability/downtime-window odgovori koriste konfiguraciju bez overlay-a (poznato ograničenje — vidi CHANGELOG). Zadatak 10. |
| `isConfidentialDefault` | Default confidential za buduće tikete. |
| `autoAssignStrategy` | `NONE` / `LEAST_BUSY` / `ROUND_ROBIN` (metadata; assignment engine nije ovaj task). |
| `policyPackId` | Opciona veza na postojeći `PolicyPack` (bez apply-a). |

`availability`, forme, downtime, routing i SLA se čitaju ako postoje u šemi, ali se ovdje ne mijenjaju.

## Lifecycle
Settings:

| Key | Default |
|---|---|
| `private.services.lifecycle.enabled` | `true` |
| `private.services.lifecycle.allowedStatesCsv` | `DRAFT,ACTIVE,DEPRECATED` |
| `private.services.lifecycle.defaultStateOnCreate` | `DRAFT` |

Create uvijek upisuje `defaultStateOnCreate` (mora biti u allow-list). Klijent ne bira početni lifecycle.

Vidljivost prema requesterima: samo `ACTIVE` (`offeredToRequesters`). `DRAFT` i `DEPRECATED` ostaju u admin katalogu. Historijski tiketi nisu dio ovog taska; `DEPRECATED` se ne nudi za novi odabir.

### Dozvoljeni prijelazi
| From | To | |
|---|---|---|
| `DRAFT` | `ACTIVE` | publish |
| `ACTIVE` | `DEPRECATED` | retire |
| `DEPRECATED` | `ACTIVE` | reactivate |

Sve ostalo, uključujući isti status i `DRAFT ↔ DEPRECATED`, je `INVALID_LIFECYCLE_TRANSITION` (400). Cilj van `allowedStatesCsv` je `INVALID_LIFECYCLE_STATE`. `enabled=false` ⇒ `LIFECYCLE_DISABLED`. Prijelaz ne smije dirati `id` / `slug`.

## Delete
- Servis: samo `DRAFT` bez zavisnosti (tiketi / forme / routing / user-role scope). `ACTIVE` / `DEPRECATED` → `NOT_DELETABLE`.
- Kategorija: samo bez djece i servisa.

## Authorization
Postojeći `SessionAuthenticationGuard` + `RoleGuard`. Write: `ADMIN` + `service.catalog.write`. Get/update/transition/delete servisa: `RequireServiceScope({ field: 'serviceId' })` na param. Create/list nemaju service scope (assignment mora biti `serviceId = null`, osim SuperAdmin). Authorization i dalje lookup-uje servis samo po `{ id }`.

Read-only: `/services` i `/service-categories` su `service_catalog` u `AdminReadOnlyInterceptor`.

## Change log
Postojeći `ChangeLog` (`entityType` + `entityId` + `reason` + `diff` + `actorUserId`). Create/update/delete i lifecycle prijelaz upisuju red. Nije config-versioning.

## API
| Method | Path |
|---|---|
| POST/GET | `/service-categories` |
| GET/PATCH/DELETE | `/service-categories/:serviceCategoryId` |
| POST/GET | `/services` |
| GET/PATCH/DELETE | `/services/:serviceId` |
| POST | `/services/:serviceId/lifecycle` |

## Namjerno NIJE implementirano
Availability/downtime, schema-driven forme, form versioning, onboarding wizard, routing, SLA engine, frontend, ticket create, drugi RBAC evaluator.
