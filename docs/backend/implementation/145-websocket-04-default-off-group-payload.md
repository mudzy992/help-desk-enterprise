# W6.30 — BA-websocket-04: legacy group payload default-off

**Datum:** 2026-11-07  
**Finding:** `BA-websocket-04` (P1)  
**Opseg:** ukloniti default-on puni ticket/message emit u membership-only group sobe; zadržati samo eksplicitnu, privremenu compatibility iznimku za stare klijente.

## Implementacija

`isLegacyGroupFullEmitEnabled()` sada uključuje legacy putanju samo za eksplicitne vrijednosti `on`, `true` ili `1`. Unset, `off`, `false`, `0`, prazna ili nepoznata vrijednost su fail-closed. U normalnom radu `group:*` sobe dobijaju samo mali `group.feed-changed` signal; puni `ticket.updated` i `ticket.message.created` payload se emituje u group sobu samo uz eksplicitni opt-in.

Ovo je bitno jer je group soba zasnovana na članstvu, a članstvo samo po sebi nije per-ticket authorization. Repo frontend već sluša `group.feed-changed`. Startup notice sada loguje `OFF (default)` ili, ako je compatibility izričito uključen, warning da puni javni payload ide bez per-ticket provjere. `.env.example` i [WebSocket rolling-deploy runbook](../../../ops/ws-rolling-deploy.md#5-group-feed-payload-compatibility) opisuju opt-in, sigurnosni rizik i gašenje nakon potvrde klijentskog rollouta.

Testovi u `broadcast-ticket-realtime.spec.ts` provjeravaju default-off ponašanje za ticket update i message, eksplicitni `on` za oba compatibility puta, eksplicitni `off` i fail-closed nepoznatu vrijednost. `ticket-chat.gateway.spec.ts` potvrđuje da javna poruka u group sobu po defaultu emituje samo laki signal; interne bilješke ostaju staff-only.

Compatibility grana nije uklonjena: dok runtime klijenti nisu nezavisno potvrđeni nakon releasea, zadržana je kao eksplicitna i dokumentovana iznimka. Nije postavljena niti aktivirana na ciljnoj instalaciji.

## Testni dokaz i gate status

Automatski CI [`42374380242`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42374380242) na kodnom SHA-u [`7d47e44`](https://github.com/mudzy992/help-desk-enterprise/commit/7d47e44a4aa7d039b63bdbb82bd51907a6af9cdf) dao je:

- backend build, lint, generated-Prisma safety-net compile i puni Jest — **passed**;
- PostgreSQL+Redis integration — **passed**;
- frontend build/test i Docs guard — **passed**;
- E2E critical flows, E2E install wizard i read-only inventory — **skipped**, ne passed; ništa nije ručno dispatchano;
- backend container/supply-chain enforcement i ukupni CI gate — **failed** zbog image vulnerability nalaza `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (navedeni fix `1.4-r0`). Ovaj run se zato ne opisuje kao zeleni CI. Vulnerability gate je izvan izmijenjenog WebSocket koda i ovdje nije mijenjan.

Perf nije pokrenut za WebSocket putanje po path filteru. Posljednji Perf [`42289613508`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42289613508) ostaje **failed** na globalnom, nepromijenjenom query budgetu `2.128 > 2.1`; nema dokaza da je BA-websocket-04 uzrok i prag nije mijenjan.

## Odluka i preostali scope

Zatvara se samo `BA-websocket-04`: legacy puni emit više nije podrazumijevan i nepoznata konfiguracija ga ne uključuje. Ako operator eksplicitno uključi compatibility iznimku, puni public payload i dalje nosi navedeni rizik; zato mora biti vremenski ograničena i ugašena nakon potvrde rollouta. Nije potvrđen runtime deployment niti je rađen deploy.

`BA-websocket-01`, `BA-websocket-02` i `BA-websocket-03` ostaju otvoreni P1 nalazi; `BA-websocket-14` (šira revocation/cross-instance E2E matrica) također ostaje otvoren. Globalni `BA-15` full critical-flow acceptance ostaje zasebno pending. Perf i ukupni CI gate se ne označavaju kao zeleni.

Nisu korišteni target DB niti pokretana migracija; nema PR-a, mergea ni deploymenta. Baseline websocket ocjena **4,88/10** nije rescoraan.
