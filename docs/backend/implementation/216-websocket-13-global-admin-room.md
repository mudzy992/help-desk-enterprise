# Paket 216 — BA-websocket-13: admin soba je eksplicitno globalna

**Status:** implementirano; CI i vlasnička potvrda AB2 u toku.
**Nalaz:** audit 18 §3.13 (P3) — admin-room semantika nije bila eksplicitna: bilo koji ADMIN/SUPER_ADMIN, uključujući OU/service-scoped dodjelu, dobijao je globalne config događaje i privatnu settings metadatu, bez definisanog ugovora za buduća proširenja payloadova.

## Odluka i promjene

Usvojen je **global admin-only** ugovor (audit §13 korekcija 13): sadržaj sobe je globalna konfiguracija (routing/SLA/catalog/groups/templates domeni i private settings metadata), pa scoped dodjela ne smije biti član.

| Fajl | Promjena |
| --- | --- |
| `socket-group-membership.service.ts` | `isAdmin` snapshot sada traži ADMIN/SUPER_ADMIN dodjelu **bez** `organizationalUnitId` i bez `serviceId` (filter u istom autoritativnom upitu, obje varijante — pojedinačna i batch). Scoped admin više ne ulazi u `role:admins`, ni pri handshakeu ni u 30 s revalidaciji. |
| `admin-config-realtime.types.ts` | Ugovor zapisan na definiciji sobe: globalna soba; scoped payloadi ovdje ne idu — budući scoped feed treba svoju sobu i ugovor. |
| `socket-group-membership.service.spec.ts` | Postojeća očekivanja upita ažurirana na scope filter; novi test: scoped dodjela (upit ne vraća nijednu globalnu) → `isAdmin: false`. |

## Dokaz

- Lokalno (stub harness): membership + room-revalidation + gateway specovi **42/42**. CI je autoritativan.
- Bez migracije. Operativno: instalacije bez scoped dodjela (samo globalne uloge) ne vide nikakvu promjenu; scoped admini gube globalni config feed, što je i bila poenta nalaza.
