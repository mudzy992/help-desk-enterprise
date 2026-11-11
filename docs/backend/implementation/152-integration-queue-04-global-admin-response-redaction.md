# Paket 152 — W6.37 / `BA-integration-queue-04` global auth i response redaction

**Datum:** 2026-11-08<br>
**Status:** nalaz zatvoren na finding nivou; širi Val 6 i release/CI sign-off nisu završeni<br>
**Kod/test SHA:** [`f0fe7e3`](https://github.com/mudzy992/help-desk-enterprise/commit/f0fe7e38f0d56b40be0a09809872ef16919a5e8b)<br>
**Scope:** samo `BA-integration-queue-04` iz audita 19. `BA-integration-queue-05`, `BA-notifications-14`, `BA-websocket-14` i BA-15 full critical-flow acceptance nisu uključeni.

## Nalaz i acceptance

`integration-queue` list/retry rute izlagale su queue zapise globalno na osnovu `ADMIN` role i permissiona, uključujući principal-e čiji je role assignment bio OU- ili service-scoped. Podrazumijevani odgovor serijalizirao je cijeli `payload` i raw `lastError`.

Acceptance za ovaj nalaz:

1. Queue operacije moraju imati stvarno globalno ovlaštenje ili validno autorizovan scope prije cursora i obrade zapisa.
2. Default list/retry response ne vraća payload niti sirovu poruku greške; izlaže samo sigurne operativne metapodatke i stabilan error code.
3. Full payload inspection nije uveden; za budući break-glass pristup i dalje bi trebali zasebno pravo, razlog i audit.

## Implementacija

- Sačuvan je kanonski `RoleGuard` i authorization evaluator; nije uveden drugi, ad hoc permission sistem. Controller-scoped guard pokriva queue rute.
- `integration-queue.controller.authorization.spec.ts` izvršava pravi `RoleGuard` i canonical evaluator nad kontrolisanim authorization contextom. Testovi dokazuju da OU-scoped i service-scoped `ADMIN` assignmenti sa `integrations.queue.manage` budu odbijeni; globalni `ADMIN` assignment sa istom permission se prihvata. Testovi također čuvaju obaveznu `ADMIN` role provjeru i postojeći audited local-only `SUPER_ADMIN` bypass.
- `IntegrationJobRepository.listByStatusPage` bira eksplicitno samo `id`, `type`, `status`, `lastError`, `attempts`, `nextRetryAt`, `createdAt` i `updatedAt`; `payload` se ne čita u list queryju.
- `toIntegrationJobResponse` i `IntegrationJobResponse` izostavljaju `payload` i raw `lastError`. Output sadrži samo tip/status i operativne metapodatke uz `lastErrorCode`.
- `EDGE_EVENT_NO_SUBSCRIBERS` se prikazuje samo za `EDGE_EVENT` zapis sa tačno tom stabilnom internom porukom. Druga neprazna poruka mapira se na `INTEGRATION_JOB_FAILED`; `null` ostaje `null`. Provider/SMTP/Teams poruke zato ne izlaze u podrazumijevanom API-ju.
- List i retry koriste isti redigovani serializer. Frontend response tipovi ne dozvoljavaju payload/raw error; UI prikazuje preveden BS/EN error-code label ili siguran generički fallback.
- Nema full-payload inspect endpointa, posebne inspect permission, reason field ili audit eventa, jer je taj dodatni feature van odabranog BA-04 acceptancea. Raw `lastError` ostaje interna DB vrijednost za obradu/support; BA-04 ne mijenja storage/retention.

## Provjere

### Lokalno

- Frontend Vitest: **3 fajla / 8 testova prošlo**.
- Frontend production build, ciljano ESLint i `i18n:check` prošli; `bs/en` parity je 8.952 ključa.
- Backend ciljano Jest: **4 suite / 31 test prošlo** uz privremene Prisma enum/client stubove i `ts-jest diagnostics:false`, jer generated Prisma Client nije bio prisutan u lokalnom checkoutu. Ovo nije lokalni generated-client type-check. Privremeni stubovi i config su uklonjeni.
- Backend ciljano ESLint, Prettier provjera za nove fajlove i `git diff --check` prošli.

### Automatski GitHub CI na kodnom SHA-u

CI run [`42427621411`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42427621411) na `f0fe7e3` potvrdio je **passed**:

- generated-Prisma backend build, lint i puni Jest;
- frontend lint, format, puni testovi, production build i bundle/cold-route budžeti;
- Docs guard;
- real PostgreSQL+Redis integration, uključujući disposable migration replay.

Ukupni CI **nije zelen**: `Backend container + supply chain` zero-high/critical gate i CI gate **failed** zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]`; anotacija navodi popravnu verziju `1.4-r0`. E2E critical flows, E2E install wizard i read-only service-form inventory bili su `skipped`, ne passed.

Odvojeni Perf smoke [`42427621434`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42427621434) **failed**: `db_queries_per_request` prosjek `2.125` prelazi nepromijenjeni budžet `2.1`, preko 50.759 zahtjeva; p95 `3`, max `34`. Run ne utvrđuje da je BA-04 uzrok. Pragovi nisu mijenjani.

## Migracije, rollout i granice

Ovaj paket ne mijenja Prisma schema niti dodaje migration. GitHub CI je izvršio migration replay samo nad disposable CI bazom; target database nije korištena. Korisnik je naveo da su sve postojeće migracije primijenjene, ali target status nije nezavisno provjeren. `be1c79db` nije mijenjana niti je njen ID nagađan. Nema deploymenta, PR-a ili mergea.

## Status nakon closeouta

- `BA-integration-queue-04`: **zatvoreno** na finding nivou.
- Audit 19: **4/15 zatvorena**; `BA-integration-queue-05` ostaje otvoren.
- Val 6: **41/109 zatvorenih, 68 otvorenih** (10 P1 / 41 P2 / 17 P3); Val 6 nije završen.
- Source audit / generisani plan: **520 otvorenih / 172 zatvorena**.
- Globalni findings register: **530 otvorenih / 162 zatvorena**. Deset ranije poznatih razlika između globalnog registra i source/plan redova ostaje netaknuto.
- `BA-notifications-14`, `BA-websocket-14` i BA-15 full critical-flow acceptance ostaju otvoreni/pending. Naredni paket nije odabran ovim closeoutom.

Detalji su i u [auditu 19, §21](../audits/19-integration-queue.md#21-w637-closeout--ba-integration-queue-04-2026-11-08).
