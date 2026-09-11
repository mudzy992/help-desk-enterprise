# MATRIX — ticket-priority-impact-urgency-matrix

## Cilj
Jedno centralizirano, determinističko pravilo: korisnik bira `impact` i `urgency`; backend upisuje `priority`. Nema duplog računanja u kontroleru ili frontendu. Klijent **ne** šalje `priority`.

## Enumi
`TicketImpact`, `TicketUrgency`, `TicketPriority`: `LOW | MEDIUM | HIGH | CRITICAL`.

## Pravilo
`rank(LOW)=1`, `rank(MEDIUM)=2`, `rank(HIGH)=3`, `rank(CRITICAL)=4`.

`score = rank(impact) + rank(urgency)`

| score | priority |
|---|---|
| 2 | LOW |
| 3–4 | MEDIUM |
| 5–6 | HIGH |
| 7–8 | CRITICAL |

Matrica:

| Impact \ Urgency | LOW | MEDIUM | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | LOW | MEDIUM | MEDIUM | HIGH |
| MEDIUM | MEDIUM | MEDIUM | HIGH | HIGH |
| HIGH | MEDIUM | HIGH | HIGH | CRITICAL |
| CRITICAL | HIGH | HIGH | CRITICAL | CRITICAL |

Kod: samo `calculateTicketPriority`. Create i update (kad se impact ili urgency promijeni) zovu tu funkciju.

`PriorityMatrixRule` tabela ostaje za kasniju admin konfiguraciju; ova faza je ne čita i ne piše (izbjegava drugi izvor istine).

## Namjerno NIJE
Admin UI za matrix rules, settings `rulesJson` overlay, agent priority override.
