# MATRIX — security-safe-logging

## Cilj
Aplikacijski logovi i ChangeLog snapshoti za `CONFIDENTIAL`/`RESTRICTED` (i `isConfidential` tikete) ne smiju sadržavati title, description, chat body, formData, ni secrets/tokene.

## Settings
| Setting | Default |
|---|---|
| `private.security.safeLogging.enabled` | `true` |
| `private.security.safeLogging.levelsCsv` | `CONFIDENTIAL,RESTRICTED` |
| `private.security.safeLogging.redactFieldsCsv` | `ticket_title,ticket_description,chat_message` |

## Pravila
- `formatSafeTicketLog` uvijek redacta password/token/secret ključeve.
- Kad je nivo pogođen: izostavlja title/description/body iz app log objekta.
- ChangeLog snapshot za pogođene tikete zamjenjuje ta polja sa `[REDACTED]`.
- Audit evidencija ostaje: actor, entity id, action/result, vrijeme, razlog (break-glass) — bez povjerljivog sadržaja.

## Namjerno NIJE
PII pattern redaction (zasebna matrica), Edge redacted toasts, support bundle.
