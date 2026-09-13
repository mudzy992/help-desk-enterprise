# MATRIX — email-notification-channel

## Cilj
Email kanal za Office 365 / Microsoft 365 SMTP, vezan na postojeći Notification fan-out i Settings registry. Internal-only by default. Nije Socket.IO, nije BullMQ queue, nije Teams.

## Enablement
Isporuka ide samo kad su sva tri true:

1. `private.smtp.enabled`
2. `private.addons.email` (SMTP off i dalje forsira addon off)
3. `private.notifications.email.enabled`

Nema paralelnog feature-flag sistema. SMTP host/from se čitaju iz postojećih `private.smtp.*`; password samo preko `getSecretForInternalUse`.

## Settings
| Key | Tip | Default |
|---|---|---|
| `private.notifications.email.enabled` | boolean | `false` |
| `private.notifications.templates.enabled` | boolean | `true` |
| `private.notifications.email.internalOnly` | boolean | `true` |
| `private.notifications.email.allowedExternalDomainsCsv` | string | `""` |
| `private.notifications.email.allowedExternalEmailsCsv` | string | `""` |
| `private.notifications.templates.registryJson` | string (JSON) | ugrađeni predlošci |

Mutacije: postojeći `PUT /settings` (`ADMIN` + `settings.write`, `reason` + ChangeLog). Secret SMTP password se ne vraća.

Čitanje: `GET /settings/email-channel` (`ADMIN`). Vraća derived `deliveryEnabled` / `hasSmtpTransport`, nikad SMTP password.

## Templates
Ugrađeni predlošci: `ticket.created`, `ticket.assigned`, `ticket.message`, `ticket.resolved`, `ticket.closed`, `ticket.approval`, `ticket.sla`, `remote.requested`.

Allow-list placeholderi: `{{ticketNumber}}`, `{{ticketTitle}}`, `{{ticketId}}`, `{{type}}`, `{{event}}`. Ostali se odbijaju na save (`INVALID_EMAIL_TEMPLATE`). Render je plain text. Confidential tiket: `ticketTitle` = `ticketNumber`.

`templates.enabled=false` → uvijek ugrađeni defaulti.

## Internal-only
Interna domena: `@epbih.ba`. Dok je `internalOnly=true`, eksterne adrese se ne šalju (allow-list se ignorira). Primaoci su isključivo User zapisi iz postojećeg notification fan-out-a, ne ad-hoc adrese.

## Idempotency
`NotificationEmailDelivery` unique `(userId, dedupeKey)` gdje je `dedupeKey` isti kao in-app (`type:messageId`). Claim pa send; send failure briše claim da retry može proći. Dupli ingest istog eventa ne šalje drugi mail.

## Namjerno NIJE
Socket.IO `notification.created`, BullMQ/durable queue, Teams stub, bulk broadcast email wiring, SLA email eskalacije, Graph sendMail.
