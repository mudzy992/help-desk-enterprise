# W6.8 — Optimistic status-incident edit/link lifecycle concurrency

**Finding:** `BA-status-page-08`  
**Implementacija:** `92ec430`  
**Finalni CI:** `40777527352` — zelen

## Problem

Edit je radio read-check pa obični update bez caller revision tokena, tako da su dva paralelna editora mogla jedan drugome prepisati title/impact/visibility/services. Link je provjeravao status prije transakcije i bez lifecycle koordinacije mogao završiti poslije paralelnog resolvea. Model već ima `updatedAt`, ali taj token nije bio izložen niti korišten kao CAS granica.

## Implementacija

- Incident read ugovor sada izlaže `revision`, kanonski ISO zapis postojećeg `ServiceIncident.updatedAt` polja.
- HTTP edit, link i unlink zahtijevaju validan `If-Match` revision header; izostavljen ili nevalidan token vraća `INCIDENT_REVISION_REQUIRED` prije mutationa.
- Frontend edit forma i ticket incident link/unlink tokovi šalju revision objekta koji je korisnik stvarno učitao.
- Edit pod postojećim per-incident advisory lockom ponovo čita status/revision, poredi caller token i radi `updateMany` CAS nad `id + non-RESOLVED status + updatedAt`.
- Svaki uspješan edit, uključujući services-only edit, eksplicitno rotira `updatedAt`; CAS gubitnik dobija `INCIDENT_CHANGED` i transakcija nema parcijalne service/subscription/audit side effecte.
- Link i unlink sada također koriste isti per-incident advisory lock, ponovo provjeravaju revision unutar transakcije i CAS-om rotiraju incident revision prije relation/event/audit side effecta.
- Link unutar locka ponovo provjerava da incident nije `RESOLVED`; zato link koji dođe poslije resolutiona ne može ostaviti novi ticket link na zatvorenom incidentu.
- Resolution već koristi isti advisory lock i guarded status update, koji rotira `updatedAt`; stale edit/link token zato fail-closed vidi novu revision/status granicu.
- Public sanitizer eksplicitno projektuje revision, a author/counter redakcija ostaje nepromijenjena.

## Testni dokaz

- Stvarni PostgreSQL concurrency test šalje dva paralelna edita sa istom revision vrijednošću: tačno jedan uspijeva, a drugi dobija 409 `INCIDENT_CHANGED`.
- Isti scenario učitava revision, resolvea incident i zatim pokušava link sa stale tokenom; link je odbijen sa 409 i broj linkova ostaje nepromijenjen.
- Postojeći PostgreSQL visibility-transition, dual-resource authorization, link/idempotency, resolution i audit scenariji ostaju zeleni.
- Frontend TypeScript/Vite build je lokalno prošao sa obaveznim revision propagiranjem kroz edit/link/unlink callsiteove.
- Finalni CI `40777527352` potpuno je zelen: backend build/lint/kompletni testovi, stvarni PostgreSQL/Redis shard, frontend build/test/format, docs, wiring, container/supply-chain i završni gate.

## Migracije i release

Paket koristi postojeće `updatedAt` polje. **Nema nove DB migracije** niti ručne release DB radnje.

## Ishod

`BA-status-page-08` je zatvoren. Edit i link lifecycle mutationi više ne mogu tiho pregaziti novije stanje niti naknadno povezati ticket poslije resolutiona; stale klijent mora reloadati incident. Registar prelazi na **601 otvoren / 91 zatvoren / 692 ukupno**.
