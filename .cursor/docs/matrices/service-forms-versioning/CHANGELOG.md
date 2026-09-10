# CHANGELOG — service-forms-versioning

## 2026-09-10
- Inicijalna matrica: `FormVersion` kao verzionirani form model na Service Catalog-u, provider-neutral schema validacija, immutability nakon ACTIVE/RETIRED ili ticket reference, `Ticket.formVersionId` kao persistirani `formVersionRef` (nikad latest), `service.forms.write` na postojećem RoleGuard/service scope.
