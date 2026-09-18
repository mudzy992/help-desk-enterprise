# MATRIX — ticket-priority-impact-urgency-matrix

## Cilj
Jedno centralizirano, determinističko pravilo: korisnik bira `impact` i `urgency`; backend upisuje `priority` iz `PriorityMatrixRule`. Klijent **ne** šalje `priority`.

## Enumi
`TicketImpact`, `TicketUrgency`, `TicketPriority`: `LOW | MEDIUM | HIGH | CRITICAL` (matrica **4×4**).

## Izvor istine
`PriorityMatrixRule` (unique `impact`+`urgency`). Admin CRUD: `GET/PATCH /priority-matrix` (`sla.write`, Admin). Config-version apply ostaje alternativni write put.

## Default (seed kad ćelija nedostaje)
`rank(LOW)=1` … `rank(CRITICAL)=4`; `score = rank(impact) + rank(urgency)`:

| score | priority |
|---|---|
| 2 | LOW |
| 3–4 | MEDIUM |
| 5–6 | HIGH |
| 7–8 | CRITICAL |

Kod: `resolveTicketPriority` (lookup + fallback `calculateTicketPriority`). Create/update/bulk zovu resolve.

## Namjerno NIJE
Settings `rulesJson` overlay; agent priority override van bulk set_priority.
