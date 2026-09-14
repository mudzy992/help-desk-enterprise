# MATRIX — observability-support-bundle

## Cilj
Korelacioni `requestId` na svakom HTTP requestu (i Socket.IO handshakeu) u logovima i error response-ima. SuperAdmin download support bundle zip-a (config snapshot + audit export + recent logs) prema settings flagovima.

## requestId
- Express middleware u `main.ts` čita `x-request-id` / `x-requestid` ili generiše UUID, upisuje nazad u request header i `X-Request-Id` response header, te stavlja ID u `AsyncLocalStorage`.
- Custom logger prefixa stdout sa `requestId=` i snima red u in-memory ring (API proces).
- Worker proces nema ovaj buffer; bundle ne uključuje worker logove.
- Socket.IO: ID iz handshake headera ili novi UUID na `socket.data.requestId`; gateway logovi idu kroz isti ALS.

## Error format
Globalni `ExceptionFilter` (samo HTTP) vraća `{ code, message, details, requestId }`. Postojeći `code` / `message` se ne mijenjaju. `requestId` je top-level (FE `ApiError`). `details` je objekat (validation `messages` ili `{}`). Nepoznate greške: `INTERNAL_ERROR` bez stack-a.

## Support bundle
`GET /support-bundle` — `SessionAuthenticationGuard` + `RoleGuard` + `SUPER_ADMIN` + `supportBundle.export`. Nije OU-scoped (isti obrazac kao `/config-versions`).

Zip dijelovi (samo ako je flag true): `manifest.json`, `config-snapshot.json` (`collectConfigSnapshot` F8-1, bez secreta), `audit-export.json` (F8-2 serialize, bez `audit.export` writer-a), `recent-logs.jsonl` (zadnjih `recentLogsMinutes`). `enabled=false` → `SUPPORT_BUNDLE_DISABLED`. Audit writer `support_bundle.export` ide **nakon** snapshot-a.

## Request log buffer
In-memory, API proces. Prune po `requestLogRetentionDays` + cap 50_000 redova. Nema Prisma `RequestLog` modela. `auditRetentionDays` je settings vrijednost; nema purge-a AuditLog lanca.

## Settings
| Key | Default |
|---|---|
| `private.observability.auditRetentionDays` | 90 |
| `private.observability.requestLogRetentionDays` | 14 |
| `private.observability.supportBundle.enabled` | true |
| `private.observability.supportBundle.includeConfigSnapshot` | true |
| `private.observability.supportBundle.includeRecentLogs` | true |
| `private.observability.supportBundle.includeAuditExport` | true |
| `private.observability.supportBundle.recentLogsMinutes` | 60 |

Brojevi: pozitivni integeri.

## Namjerno NIJE
Frontend download UI, AuditLog/RequestLog purge, Prisma request-log tabela, worker logovi u bundleu, izmjena ADMIN default permission seta, CORS expose headera, novi WS kanali.
