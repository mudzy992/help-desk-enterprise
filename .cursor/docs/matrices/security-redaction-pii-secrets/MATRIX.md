# MATRIX — security-redaction-pii-secrets

## Cilj
Detekcija tajni/PII u `ticket_title`, `ticket_description`, `chat_message`. Default **warn-only**: persist + UI warning + SYSTEM_EVENT + ChangeLog snapshot sa `[REDACTED]`. `soft_block` odbija **high-risk** match (`REDACTION_BLOCKED`).

## Settings
| Setting | Default |
|---|---|
| `private.security.redaction.enabled` | `true` |
| `private.security.redaction.mode` | `warn_only` |
| `private.security.redaction.patternsJson` | secret; prazno = ugrađeni minimalni set |
| `private.security.redaction.applyToFieldsCsv` | `ticket_title,ticket_description,chat_message` |

Ugrađeni high-risk: password/lozinka assignment, api_key/secret_key/access_token assignment, bearer token, private key block, AWS AKIA.

## Prikaz vs log
Autorizovani viewer i dalje vidi original na tiketu/chatu. ChangeLog snapshot redacta title/description. SYSTEM_EVENT `ticket_redaction_warned:<patternIds>` ne sadrži matched plaintext.

## Namjerno NIJE
Confidential/RESTRICTED safe logging: `security-safe-logging`. Break-glass, Edge redacted toasts, custom admin pattern UI.
