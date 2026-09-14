# MATRIX — config-versioning-rollback

## Cilj
Grupisati settings/routing/SLA/catalog/forms u `ConfigVersion` zapise (snapshot + release notes), aktivirati ih kao tagged release i vratiti prethodni snapshot auditovanim rollbackom.

## Statusi
`DRAFT` → (validate OK) `VALIDATED` → `ACTIVE`. Prethodna `ACTIVE` pri novoj aktivaciji postaje `VALIDATED`. Rollback: current `ACTIVE` → `ROLLED_BACK`; nova verzija kopira prethodni snapshot (`rollbackOfVersion`) i postaje `ACTIVE`.

## Settings
| Key | Default |
|---|---|
| `private.configVersioning.enabled` | true |
| `private.configVersioning.allowRollback` | true |
| `private.configVersioning.scopesCsv` | `settings,routing,sla,service_catalog,service_forms` |

Secrets se ne snimaju i ne restore-aju. Diff reuse `change-log` `buildDeterministicDiff`.

## HTTP
`/config-versions` — Admin + `settings.write` na mutacije. Nije OU-scoped.

## Restore
Apply u transakciji ovog modula (routing nema update/delete API). Ne briše Service/FormVersion sa Ticket FK.

## Namjerno NIJE
Frontend UI, audit export, WS event, `storeDiffDays`. Validate/shadow: `config-validation-dry-run`.
