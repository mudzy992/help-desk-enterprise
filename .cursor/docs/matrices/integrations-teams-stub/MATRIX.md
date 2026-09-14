# MATRIX — integrations-teams-stub

## Cilj
Interni Teams event/webhook interfejs iza feature flag-a. Jobovi idu kroz isti BullMQ + Postgres `IntegrationJob` put kao ostale outgoing integracije. Worker samo loguje namjeru — nema HTTP isporuke ka Teams webhook-u.

## Settings
| Key | Tip | Default |
|---|---|---|
| `private.integrations.teams.stubEnabled` | boolean | `false` |
| `private.integrations.teams.webhookUrl` | secret string | nema default (prazno dok se ne upiše) |
| `private.integrations.teams.eventTypesCsv` | string | `""` |

Gate je samo `stubEnabled`. `private.addons.teamsStub` (install katalog) nije drugi gate. `webhookUrl` se čuva; processor ga ne čita i ne zove.

## Interni event tipovi (interfejs)
Allow-list (isti ključevi kao email/in-app za navedeni skup):

- `ticket.created`
- `ticket.assigned`
- `ticket.message`
- `ticket.resolved`
- `ticket.closed`

Admin bira podskup kroz `eventTypesCsv`. Tip van ove liste se ne enqueue-uje čak i ako je u CSV-u.

## Enqueue
Producent: `TeamsIntegrationService` sluša `TicketRealtimeHub` (isti ticket event tok kao notifikacije). Nema HTTP endpointa.

Job se kreira samo kad su svi uslovi true:

1. `stubEnabled=true`
2. mapirani ticket event je u internom allow-listu
3. isti tip je u `eventTypesCsv`
4. durable queue `enabled` i `typesCsv` sadrži `teams`

Payload: `{ eventType, event, ticketId, messageId }` — bez webhook secreta.

`EnqueueIntegrationJobService` upisuje `PENDING` i dodaje BullMQ job (`type: TEAMS_STUB`). Admin retry radi isto.

## Worker
`ProcessTeamsStubIntegrationJobService`: validira payload, loguje `would send to Teams` + metadata, vraća se. Parent processor označava `COMPLETED`. Nema `HttpService` / `fetch` / `axios` / `undici`. Nema POST-a na `webhookUrl`.

## Namjerno NIJE
Pravi Teams konektor/HTTP delivery (RAW OUT), frontend Teams UI, Prisma šema, novi REST endpointi.
