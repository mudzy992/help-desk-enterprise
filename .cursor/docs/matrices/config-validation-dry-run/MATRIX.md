# MATRIX — config-validation-dry-run

## Cilj
Dry-run validacija config snapshot-a prije aktivacije i opcioni shadow diff routing/SLA za uzorak tiketa, bez primjene na live stanje.

## Validate (bez side-effecta na routing/SLA/catalog)
- Routing: `resolveFromAncestorChain` nad snapshot pravilima; `ROUTING_UNCOVERED` ako je UNROUTED i unrouted queue off; dangling OU/service/group.
- SLA: IANA TZ + weekly hours; catch-all pravilo po prioritetu za aktivne profile; `responseMinutes`/`resolutionMinutes`; priority matrix 4×4.
- Forms: `parseFormSchema`; ACTIVE servis treba ACTIVE form ako `requireVersionOnTicket`.
- Settings: registry `validateSettingValue`; SMTP host/from ako je SMTP on; email addon zahtijeva SMTP.

Aktivacija se blokira (`CONFIG_VALIDATION_FAILED` + `details`) kad `validation.enabled` i `blockActivationOnError` (oba default true).

## Shadow
READ-ONLY. Uzorak do 200 recent tiketa. Vraća `sampleSize`, `routingGroupMismatches`, `slaRuleMismatches`. Ne mijenja `ConfigVersion.status` ni live podatke.

## Settings
| Key | Default |
|---|---|
| `private.configVersioning.validation.enabled` | true |
| `private.configVersioning.validation.blockActivationOnError` | true |
| `private.configVersioning.shadowMode.enabled` | true |
