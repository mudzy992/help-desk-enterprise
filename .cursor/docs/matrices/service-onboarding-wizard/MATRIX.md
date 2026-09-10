# MATRIX — service-onboarding-wizard

## Cilj
Orkestracija kreiranja/konfiguracije jednog servisa: **service → form → routing → SLA → approvals**. Wizard nije drugi Service Catalog, Forms, Routing, SLA ili Approvals engine. `Service.lifecycle` ostaje katalog publish stanje; onboarding ima zaseban workflow status.

## Identitet
Jedan `ServiceOnboarding` po `serviceId`. Servis se kreira kroz postojeći catalog (`DRAFT`). Availability/downtime se ne dira.

| Polje | Uloga |
|---|---|
| `status` | Workflow: `IN_PROGRESS` / `READY_FOR_FINALIZATION` / `COMPLETED` / `ABANDONED` |
| `currentStep` | Korak na kojjem je wizard |
| `formVersionRef` | Tačan `FormVersion.id` (iste semantike kao tiket). Nikad “latest/current form”. |
| `routingConfigurationRef` | Opaque ref; kasniji Routing modul ga razrješava |
| `slaConfigurationRef` | Opaque ref; ako se poklopi s `SlaProfile.id`, finalize kopira na `Service.slaProfileId` |
| `approvalsConfigurationRef` | Opaque ref ili `not_required`; finalize ažurira `Service.requiresApproval` |
| `completedSteps` | JSON niz završenih koraka |

## Status prijelazi
| From | To | Kada |
|---|---|---|
| (create) | `IN_PROGRESS` | Create ili start na postojećem `DRAFT` servisu |
| `IN_PROGRESS` | `READY_FOR_FINALIZATION` | Svih 5 koraka complete + valid |
| `IN_PROGRESS` / `READY_FOR_FINALIZATION` | `ABANDONED` | Abandon |
| `READY_FOR_FINALIZATION` | `IN_PROGRESS` | Izmjena koja pokvari complete set |
| `READY_FOR_FINALIZATION` / `IN_PROGRESS` (svi koraci) | `COMPLETED` | Finalize uspije |
| `ABANDONED` | `IN_PROGRESS` | Resume |
| `COMPLETED` | — | Terminalno |

Sve ostalo je `INVALID_STATUS_TRANSITION`.

## Koraci i prerequisite
Redoslijed je fiksan. Complete koraka N zahtijeva complete 1..N-1. Save je dozvoljen na `currentStep` i već complete koracima (resume/edit). Save budućeg koraka = `INVALID_STEP_TRANSITION`.

| Korak | Prerequisite za complete |
|---|---|
| SERVICE | Servis postoji, `lifecycle = DRAFT`, name/slug/category |
| FORM | Exact `formVersionRef` postoji, pripada servisu, status `ACTIVE` |
| ROUTING | Provider prihvata `routingConfigurationRef` |
| SLA | Provider prihvata `slaConfigurationRef` |
| APPROVALS | Provider prihvata `approvalsConfigurationRef`; `not_required` nije dozvoljen ako je `requiresApproval = true` prije finalize |

Save FORM smije vezati i `DRAFT` verziju; complete/finalize zahtijevaju `ACTIVE`.

## Finalizacija
Uvijek re-validira svih 5 koraka. `requireValidationBeforeActivate=true` (default) blokira activate bez te validacije. Uspjeh, u jednoj transakciji: apply SLA/approvals metadata → `DRAFT → ACTIVE` (postojeći lifecycle guard) → `COMPLETED`. Neuspjeh ostavlja servis `DRAFT` i onboarding `IN_PROGRESS`/`READY_FOR_FINALIZATION`. Availability nije uslov.

## Settings
| Key | Default |
|---|---|
| `private.services.onboardingWizard.enabled` | `true` |
| `private.services.onboardingWizard.requireValidationBeforeActivate` | `true` |
| `private.services.onboardingWizard.autoFillRouting.enabled` | `true` |
| `private.services.onboardingWizard.autoFillRouting.requireConfirm` | `true` |

Auto-fill samo predlaže; `requireConfirm` zabranjuje silent persist. Default provider nema routing engine pa je suggestion `null`.

## Authorization
Postojeći `SessionAuthenticationGuard` + `RoleGuard` + `ADMIN`. Nema drugog RBAC engine-a. Create: `service.catalog.write` (bez service scope). Ostalo: `RequireServiceScope({ field: 'serviceId' })`.

| Akcija | Permission |
|---|---|
| Create / service step / finalize / abandon / resume | `service.catalog.write` |
| Form step | `service.forms.write` |
| Routing step | `routing.write` |
| SLA step | `sla.write` |
| Approvals step | `service.catalog.write` |

Read-only: `/services` → `service_catalog`.

## API
| Method | Path |
|---|---|
| POST | `/services/onboarding` |
| POST | `/services/:serviceId/onboarding` |
| GET | `/services/:serviceId/onboarding` |
| PATCH | `/services/:serviceId/onboarding/service` |
| PATCH | `/services/:serviceId/onboarding/form` |
| PATCH | `/services/:serviceId/onboarding/routing` |
| PATCH | `/services/:serviceId/onboarding/sla` |
| PATCH | `/services/:serviceId/onboarding/approvals` |
| POST | `/services/:serviceId/onboarding/steps/service/complete` |
| POST | `/services/:serviceId/onboarding/steps/form/complete` |
| POST | `/services/:serviceId/onboarding/steps/routing/complete` |
| POST | `/services/:serviceId/onboarding/steps/sla/complete` |
| POST | `/services/:serviceId/onboarding/steps/approvals/complete` |
| POST | `/services/:serviceId/onboarding/finalize` |
| POST | `/services/:serviceId/onboarding/abandon` |
| POST | `/services/:serviceId/onboarding/resume` |

## Namjerno NIJE
Frontend wizard, full Routing/SLA/Approvals moduli, routing fallback, SLA timeri, approval execution, ticket CRUD, availability/downtime izmjene, config versioning.
