# MATRIX — workflow-required-fields

## Cilj
Backend ne dozvoljava ručni `RESOLVED`/`CLOSED` bez required polja. Pravila su settings-driven: global CSV + per-service JSON overlay (union) + schema required fields kad je `private.ticket.forms.requireStructuredFields` true.

## Settings
| Setting | Default |
|---|---|
| `private.workflow.requiredFields.enabled` | `true` |
| `private.workflow.requiredFields.globalRequiredOnResolveCsv` | `close_code,resolution_note` |
| `private.workflow.requiredFields.byServiceJson` | prazno (secret) |

Posebni keyevi: `close_code`, `resolution_note`. Ostali keyevi se čitaju iz `formData`. Schema `required` polja se dodaju kad je forms `requireStructuredFields` uključen.

## Ishod
Nedostajuća polja ⇒ `REQUIRED_FIELDS_MISSING` sa `details.fields`. Nema status no-op. System waiting auto-close i approval reject zaobilaze ovaj guard.

Close code se preskače ako je `private.ticket.closeCodes.enabled=false`. `requireOnResolve` i dalje traži code na `RESOLVED` kad su close codes uključeni.

## Namjerno NIJE
Create-time form validation izvan resolve/close, CSAT, archive, policy pack assignment UI.
