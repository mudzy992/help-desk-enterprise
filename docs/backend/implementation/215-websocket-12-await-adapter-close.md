# Paket 215 — BA-websocket-12: shutdown čeka zatvaranje Redis adaptera

**Status:** implementirano; CI i vlasnička potvrda AB1 u toku.
**Nalaz:** audit 18 §3.12 (P3) — `WebsocketGateway.onModuleDestroy` je bio sinhron i zatvaranje Redis adapter konekcija bacao kao nečekani `void promise`, pa proces može izaći prije nego Pub/Sub klijenti uredno zatvore (quit) konekcije.

## Promjene

| Fajl | Promjena |
| --- | --- |
| `websocket.gateway.ts` | `onModuleDestroy` je sada `async` i awaita `realtimeAdapter.close()` (handle se prvo odvoji, pa zatvori). Nest awaita async destroy hookove tokom `app.close()`, pa se oba adapter Redis klijenta (publish/subscribe) zatvore prije izlaza procesa. Instalacijska putanja greške (`void handle.close()` kad `server.adapter()` baci) namjerno ostaje fire-and-forget jer se tada radi o već neuspjelom handleu izvan životnog ciklusa. |
| `websocket.gateway.spec.ts` | Novi test: destroy se ne završava dok se odgođeni adapter `close()` ne riješi; drugi destroy je no-op. |

## Dokaz

- Lokalno (stub harness): `websocket.gateway.spec` **19/19**. CI (generated Prisma, build/lint/full test + integration) je autoritativan.
- Bez migracije; ponašanje prema klijentima se ne mijenja, samo redoslijed gašenja.
