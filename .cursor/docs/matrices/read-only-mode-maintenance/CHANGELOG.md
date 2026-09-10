# CHANGELOG — read-only-mode-maintenance

## 2026-09-10
- `/services` i `/service-categories` mapirani na postojeći `service_catalog` modul; interceptor i evaluator se ne mijenjaju.
- Inicijalna matrica: settings-driven admin read-only mode, centralni interceptor, read ostaje, mutacije se blokiraju, SuperAdmin bypass samo uz `isLocalOnly`, RoleGuard/OuAccessGuard/shadow neenforcing ostaju netaknuti.
