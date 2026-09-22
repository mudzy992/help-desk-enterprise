# CHANGELOG — service-catalog-lifecycle

## 2026-09-10
- Inicijalna matrica: `Service` / `ServiceCategory` CRUD, stabilni `id`+`slug`, lifecycle `DRAFT`/`ACTIVE`/`DEPRECATED` sa dozvoljenim prijelazima, settings-driven allow-list, postojeći RBAC/service scope i `ChangeLog`.

## 2026-09-21 (F1 sloj 6)
- `ServiceResponse.approvalSteps` (0 | 1, zadatak 10): `GET /services` i `GET /services/:id` sada nose stvarnu approvals konfiguraciju (novi `TicketApprovalsConfigurationLoader` proviđen i u `ServiceCatalogModule`, bez kružne zavisnosti prema `TicketsModule`). Mutacije, kreiranje, prelazak lifecycle-a, availability i downtime-window odgovori i dalje računaju `approvalSteps` samo iz `requiresApproval` (bez trenutnog overlay-a) — namjerno ograničenje obima, dovoljno tačno jer je per-servis overlay rijetka admin postavka; proširiti ako se pokaže potreba.
