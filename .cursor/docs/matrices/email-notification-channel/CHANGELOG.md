# CHANGELOG — email-notification-channel

## 2026-09-16
- R9a: template `user.temporary_password` + placeholderi `displayName` / `email` / `temporaryPassword` za init-password mail pri kreiranju korisnika (SMTP + email addon; mimo ticket fan-out enablement).

## 2026-09-13
- Email kanal (O365 SMTP) kroz postojeći settings registry i notification fan-out. Internal-only `@epbih.ba`, template allow-list, `NotificationEmailDelivery` dedup. Nema WS/queue/Teams.
