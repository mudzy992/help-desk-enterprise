# Faza 3 — Validate (dry-run) + shadow

Bez Prisma write osim opcionog `DRAFT → VALIDATED` na uspješan validate (samo `ConfigVersion.status`).

## Validate — lista grešaka `{ code, path, message }`

1. **Routing:** `resolveFromAncestorChain` + snapshot rules (ne zovi live `RoutingService.coverage` jer čita Prisma). Greške: ACTIVE servis bez fallback/unrouted kad je unrouted queue off; dangling group/OU/service ids.
2. **SLA:** aktivni profili imaju kalendar + IANA TZ; svaki profil ima pravilo za sve `TicketPriority`; `responseMinutes < resolutionMinutes`; dangling FK. Reuse `assertValidIanaTimezone` / rule constraint helpers (catch, ne throw kroz HTTP).
3. **Forms:** `parseFormSchema` na svakoj formi; ACTIVE servis treba ACTIVE form version ako `forms.versioning.requireVersionOnTicket`.
4. **Settings/permissions:** `validateSettingValue` po registry; required keys; invalid combo: `private.smtp.enabled=true` bez host/from; email addon ON + smtp OFF.

Ako `validation.enabled` i ima grešaka: activate vraća istu listu, ne mijenja status. Ako `blockActivationOnError=false` (RAW), activate smije proći — default true.

## Shadow

Ako `shadowMode.enabled=false` → disabled error.

Uzorak: recent `Ticket` (`originUnitId`, `serviceId`, `priority`), limit 200, bez status write.

Za svaki tiket: routing group iz ACTIVE snapshot vs candidate snapshot (`resolveFromAncestorChain`); SLA rule id iz `resolveMatchingSlaRule`.

Odgovor: `{ sampleSize, routingGroupMismatches, slaRuleMismatches }` — nula live mutacija.
