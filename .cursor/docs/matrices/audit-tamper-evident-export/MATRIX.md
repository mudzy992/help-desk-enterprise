# MATRIX — audit-tamper-evident-export

## Cilj
Generalni security `AuditLog` trail sa tamper-evident hash lancem i OU-scoped CSV/JSON exportom. Nije zamjena za `ChangeLog` (settings/routing/SLA/ticket mutacije) ni za ticket `SYSTEM_EVENT`.

## Hash lanac
`hash = sha256(previousHash + "\n" + JSON.stringify(canonicalizeJson(payload)))`.

Canonical payload (sorted keys via `change-log/canonicalize-json`): `action`, `actorUserId`, `entityId`, `entityType`, `metadata`, `previousHash`. `requestId` i `organizationalUnitId` ulaze u payload **samo ako nisu null/prazni** — da postojeći config-versioning redovi ostanu verifikabilni.

Prvi zapis: `previousHash = 64 nule`. Append je u transakciji uz `pg_advisory_xact_lock(871001)`. Algoritam iz `private.audit.tamperEvident.hashAlgorithm` (allow-list `sha256|sha384|sha512`, default `sha256`). Promjena algoritma invalidira verify starih redova.

## Writeri (samo ovo)
| Akcija | `action` | OU |
|---|---|---|
| Policy pack apply | `policy_pack.apply` | apply target OU |
| Confidential view/deny/break-glass | `ticket_confidential_*` | `ticket.originUnitId` |
| Bulk execute (jedan red po batch-u) | `ticket_bulk.execute` | jedinstveni origin OU, inače null |
| Audit export | `audit.export` | query OU |
| Config activate/rollback | `config_version.activate` / `config_version.rollback` | null (global) |

## HTTP
| Method | Path | Access |
|---|---|---|
| GET | `/audit-logs/export?format=csv\|json&organizationalUnitId=` | ADMIN + `audit.export` + `OuAccessGuard` |
| POST | `/audit-logs/verify` | ADMIN + `audit.export` (globalni lanac) |

Export sort: `createdAt, id` ASC. Admin vidi requested OU + descendants. SuperAdmin dodatno vidi `organizationalUnitId = null`. Export piše audit red **nakon** snapshot-a (novi red nije u tom exportu).

Verify: prvi mismatch (`firstMismatchId` / `firstMismatchIndex`). Ako je tamper-evident OFF: `{ enabled: false, status: "disabled" }` — ne `valid: true`.

## Settings
| Key | Default |
|---|---|
| `private.audit.export.enabled` | true |
| `private.audit.export.allowedFormatsCsv` | `csv,json` |
| `private.audit.tamperEvident.enabled` | true |
| `private.audit.tamperEvident.hashAlgorithm` | `sha256` |

## Namjerno NIJE
Change-log logika, ticket CRUD/chat/assignment, reports export, support bundle, requestId middleware, frontend admin UI, retrofit svih endpointa, role-permission CRUD (ne postoji — pack apply je writer).
