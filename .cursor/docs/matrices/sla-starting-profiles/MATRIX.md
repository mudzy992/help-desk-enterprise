# MATRIX — sla-starting-profiles

## Cilj
Idempotentan seed startnih SLA profila iz `RAW_PROJECT_EPHELPDESK.md` na postojeće `BusinessHoursCalendar` / `SlaProfile` / `SlaRule`. Nema novog SLA modela, timer/breach/UI mehanizma ni notifikacija.

## Izvor
RAW sekcija *Startni SLA profili (default vrijednosti) — BH_STANDARD*. Kalendar: `BH_STANDARD`, Pon–Pet 08:00–16:00, `Europe/Sarajevo`. `1 BD` = jedan radni dan tog kalendara (8h = 480 min).

## Profili
| Key | P1/CRITICAL | P2/HIGH | P3/MEDIUM | P4/LOW |
|---|---|---|---|---|
| `INCIDENT` | 10 min / 2h | 30 min / 4h | 2h / 1 BD | 4h / 3 BD |
| `ACCESS` | 30 min / 8h | 2h / 2 BD | 1 BD / 5 BD | 2 BD / 10 BD |
| `STANDARD_REQUEST` | 15 min / 4h | 1h / 8h | 4h / 3 BD | 1 BD / 10 BD |
| `FINANCE` | 1h / 1 BD | 4h / 3 BD | 1 BD / 7 BD | 2 BD / 15 BD |
| `HR` | 4h / 2 BD | 1 BD / 5 BD | 2 BD / 10 BD | 5 BD / 20 BD |

Default pravila: `priority` + `serviceId=null` + `organizationalUnitId=null`. Postojeći profili/rules/relacije se ne prepisuju.

## Ulaz
`seedStartingSlaProfiles` (Prisma `db seed` + API `OnModuleInit`). Ponovno pokretanje ne pravi duplikate.

## Checklist
- [x] pronađen i iskorišten postojeći RAW source
- [x] `INCIDENT` seed
- [x] `ACCESS` seed
- [x] `STANDARD_REQUEST` seed
- [x] `FINANCE` seed
- [x] `HR` seed
- [x] seed je idempotentan
- [x] postojeći BH calendar reference pravilno povezane gdje je primjenjivo
- [x] testovi
- [x] build/test provjera
- [x] nema regresija

## Namjerno NIJE
Overdue UI badge/filter, SLA notifications, novi breach/escalation/timer mehanizam.
