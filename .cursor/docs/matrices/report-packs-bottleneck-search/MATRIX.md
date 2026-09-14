# MATRIX — report-packs-bottleneck-search

## Cilj
Predefinisani OU-scoped report packovi (CSV/JSON), bottleneck dashboard agregacije, i additive search filteri na postojećim `listTickets` / `listKnowledgeArticles` endpointima. Nema unified `/search` endpointa i nema AI/semantičke pretrage.

## Permissions
- Role: `ADMIN` | `SUPER_ADMIN`
- Permission: `reports.export` **ili** `audit.export` (`RequirePermissions` je OR)
- `OuAccessGuard` na `organizationalUnitId` (requested OU + descendants)

## Settings
| Key | Default |
|---|---|
| `private.reports.enabled` | `true` |
| `private.reports.packsJson` (secret) | `["monthly_kpi","overdue_by_service","top_close_codes","kb_helpfulness"]` |
| `private.reports.exportFormatsCsv` | `csv,json` |
| `private.dashboard.bottlenecks.enabled` | `true` |
| `private.dashboard.bottlenecks.defaultWindowDays` | `30` |
| `private.addons.reports` | `true` (postojeći addon) |

Ako je `private.reports.enabled` ili addon `false` → `REPORTS_DISABLED`. Bottleneck dodatno gleda `private.dashboard.bottlenecks.enabled`.

## HTTP
| Method | Path | Format |
|---|---|---|
| GET | `/reports/packs/:packSlug?organizationalUnitId=&format=csv\|json&from=&to=` | CSV/JSON attachment |
| GET | `/reports/bottlenecks?organizationalUnitId=&from=&to=` | JSON |

`packSlug`: `monthly-kpi` \| `overdue-by-service` \| `top-close-codes` \| `kb-helpfulness`.

Window: eksplicitni `from`/`to`; inače KPI = UTC tekući mjesec, bottleneck = rolling `defaultWindowDays`.

## Packovi
| Pack | Izvor | Redovi |
|---|---|---|
| Monthly KPI | tiketi u OU stablu | created/resolved/closed u prozoru; overdue count; CSAT avg na kreiranim u prozoru; wall-clock avg iz `firstResponseAt` / `resolvedAt` (nije pause/BH) |
| Overdue by service | `isOverdue` iz `TicketSlaState` | count po `serviceId` |
| Top close codes | `Ticket.closeCodeId` | count po key za resolved/closed u prozoru |
| KB helpfulness | `KnowledgeArticle` + `KnowledgeFeedback` u OU stablu | helpful / notHelpful / net |

Export piše `AuditLog` action `reports.export` **nakon** snapshot-a.

## Bottleneck
Standing (nije ARCHIVED): `PENDING_APPROVAL`, `WAITING_FOR_USER`, `UNROUTED`, `OVERDUE`. `OVERDUE` je `isOverdue`, nije status — može se preklapati. Breakdown po `originUnitId` / `serviceId` / `priority`. Trend: dnevni `createdCount` u prozoru + standing counts za tikete kreirane tog dana. Nema status time-series.

## Search filteri (additive)
`GET /tickets`: postojeći `originUnitId`/`serviceId`/`status` + `assignedUserId`, `priority`, `q` (ticketNumber + title). Response oblik nepromijenjen.

`GET /knowledge-base/articles`: postojeći `serviceId`/`status` + `organizationalUnitId`, `q` (title + body). Response oblik nepromijenjen.

## Namjerno NIJE
Frontend `/reports` i header-search, unified search, users search, AI/semantic search, pause-aware SLA duration, schema migracije, websocket.
