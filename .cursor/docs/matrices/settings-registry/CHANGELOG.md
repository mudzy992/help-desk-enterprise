# CHANGELOG — settings-registry

## 2026-09-10
- Dodani `private.services.availability.*` i `private.services.downtimeScheduling.*` ključevi za runtime availability overlay i downtime prozore. Ticket create ostaje non-blocking.
- Dodani `private.services.lifecycle.*` ključevi (`enabled`, `allowedStatesCsv`, `defaultStateOnCreate`) za service catalog. Nema availability/downtime settings u ovom koraku.
- Dodani `private.readOnlyMode.*` ključevi za admin-module maintenance lock. Nema HTTP settings CRUD ni UI.
- Inicijalna matrica: public/private/secret visibility, retrieval granice, AppSetting overlay, secret isolation za Faza 0 skeleton.
- Dodani `private.auth.adRead.*` ključevi za directory-sync stub (`manual_only`, throttle, cache, base DN scope). Nema AD/LDAP/Graph kredencijala.
- Dodani `private.auth.azureTenantId` i `private.auth.azureClientId` (secret) za Entra/MSAL token validaciju. Nema client secret-a ni Graph kredencijala.
