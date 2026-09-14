# Faza 1 — Settings + matrice

## Settings (`backend/src/modules/settings/`)

Novi `definitions/config-versioning-settings.ts`, keys u `setting-keys.ts`, registracija u `application-settings.ts`.

| Key | Type | Default |
|---|---|---|
| `private.configVersioning.enabled` | boolean | true |
| `private.configVersioning.allowRollback` | boolean | true |
| `private.configVersioning.validation.enabled` | boolean | true |
| `private.configVersioning.validation.blockActivationOnError` | boolean | true |
| `private.configVersioning.shadowMode.enabled` | boolean | true |
| `private.configVersioning.scopesCsv` | string | `settings,routing,sla,service_catalog,service_forms` |

`scopesCsv` treba snapshotu. `blockActivationOnError` treba acceptance-u. Bez `sampleRate`/`storeDiffDays` (nema persist tabele; sample je fiksan limit u kodu, npr. 200 recent tiketa).

## Read-only mode

`/config-versions` → `adminReadOnlyModuleKeys.settings`. POST `validate` i `shadow` = `@AdminReadOperation()`. Test u `classify-admin-read-only-request.spec.ts`.

## Matrice

- `.cursor/docs/matrices/config-versioning-rollback/`
- `.cursor/docs/matrices/config-validation-dry-run/` (validate + shadow)

Format: `redis-bullmq/MATRIX.md`.
