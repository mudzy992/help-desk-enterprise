# Package closeout — W7.9

**Paket:** W7.9 — `BA-assets-09` — distribuirani lease za assets directory sync<br>
**Nalaz:** `BA-assets-09` (P2) — zatvoren<br>
**Feature commit:** `0f2e3d3bec3fffb828a651038a571e349352fb3b`<br>
**Završni kodni commit / finalni testani SHA:** `2f53edc1de07669f32fb9e1254ee0916eb584d64`<br>
**CI:** [`41010129252`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41010129252) — zelen<br>
**DB migracije:** nema; nema Prisma schema promjene ni ponovne primjene ranijih migracija

## Nalaz i acceptance

`AssetDirectorySyncService` je prije paketa koristio samo `running` boolean po procesu. Manual/API, scheduled i CLI pozivi na različitim API/worker instancama zato nisu dijelili arbitražu. W7.9 zatvara samo `BA-assets-09`: u svakom trenutku samo jedan proces smije voditi puni directory sync; lease mora dokazivati ownera, imati rok isteka i run ID, periodično produžavati rok, odbijati ne-vlasničko produženje/brisanje i omogućiti oporavak nakon crasha. Gubitak Redis arbitraže mora zaustaviti rad, ne smije se prikazati kao običan neuspjeh pojedinačnog asseta.

`BA-assets-10` — ponovna registracija scheduler poslova nakon Redis gubitka/flush-a i last-success health gate — ostaje otvoren. W7.9 ne mijenja scheduler lifecycle niti dodaje periodični reconcile.

## Implementacija

- Novi `AssetDirectorySyncLease` koristi Redis ključ `assets:directory-sync:full-run` (uz postojeći konfigurirani Redis namespace). Atomarni `SET key value PX 120000 NX` snima JSON sa `runId` i kriptografski nasumičnim `ownerToken`.
- Lease se obnavlja svakih 30 sekundi. Redis Lua skripte produžavaju TTL ili brišu ključ samo kada vrijednost i dalje odgovara owner tokenu; stari owner ne može obnoviti ili obrisati lease nasljednika.
- Svaka Redis komanda ima timeout od 2 sekunde. Redis outage/timeout i gubitak ownershipa su fail-closed; API/CLI vraćaju postojeći `ASSET_DIRECTORY_UNAVAILABLE` ugovor sa sanitizovanim detaljima `lease_unavailable` ili `lease_lost`. Zauzet lease zadržava postojeći `busy` odgovor. Neuspješan release se loguje, a TTL ostaje bounded recovery putanja.
- `AssetDirectorySyncService.run()` uzima lease prije konfiguracije/LDAP/planning/apply dijela. Ista granica obuhvata manual/API, scheduled (`runIfDue`) i CLI putanje. Lokalni `running` guard ostaje samo kao brza zaštita unutar jedne instance; Redis je cross-instance arbitraža.
- Run provjerava ownership nakon LDAP čitanja, nakon planiranja, prije i tokom apply batchova, prije report/audit i nakon audit upisa. Create batch transakcije rollbackaju se ako lease izgubi zdravlje; update loop provjerava lease po 200 asseta i lokalno stanje prije/tokom svake asset transakcije. `AssetDirectorySyncLeaseError` se ponovo baca iz update catcha i ne broji se kao obični `failed` asset.
- `runId` se pojavljuje u logovima i audit metadata radi korelacije. CLI sada kreira Redis klijent iz zajedničke konfiguracije i zatvara ga u `finally`; Redis i dalje koristi postojeći key-prefix/TLS/ACL ugovor.
- API response shape, Prisma schema, DB model, scheduler registracija i interval nisu promijenjeni. Audit transakcijska atomarnost, import lease i scheduler reconciliation ostaju izvan paketa.

## Direktni testni dokaz

- `backend/src/modules/assets/directory/asset-directory-sync-lease.spec.ts` — atomarno preuzimanje sa run ID/owner tokenom, compare-owner renewal/release, ownership loss, Redis acquisition failure i nevažeće timing postavke.
- `backend/src/modules/assets/directory/asset-directory-sync.service.spec.ts` — dvije odvojene service instance dijele single-flight lock; drugi run ne poziva LDAP dok prvi radi; poslije release drugi run uspijeva. Dodatno se dokazuju fail-closed Redis outage, gubitak leasea poslije LDAP čitanja i propagation gubitka leasea iz update transakcije bez brojanja kao asset failure.
- `backend/src/modules/assets/directory/asset-directory-sync-lease.integration.spec.ts` — dva nezavisna ioredis klijenta nad CI Redisom potvrđuju da samo jedan concurrent owner uspijeva, heartbeat održava lease duže od izvornog TTL-a, compare-owner release dopušta nasljednika, a crash/napušten owner se oporavlja nakon isteka TTL-a. Suite je registrovan u `backend/scripts/run-isolated-integration.mjs` i provjerava se u integration-harness testu.

## CI i testni dokaz

Finalni CI [`41010129252`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41010129252) na SHA `2f53edc1de07669f32fb9e1254ee0916eb584d64` je zelen:

- **Backend:** Prisma validate/generate, generated-artifact guard, route/root wiring provjere, build, lint, safety-net compile, SLA matrica i kompletni Jest suite prošli su.
- **PostgreSQL/Redis integration:** migration policy/replay, DB privilege i backup/restore provjere, integration harness, Redis dependency probe i svi izolovani PostgreSQL/Redis suiteovi prošli su; W7.9 lease acceptance suite je uključen.
- **Frontend:** lint, format, testovi, build i budžeti prošli su.
- **Docs/container/supply-chain/CI gate:** docs guard i testovi, container hardening, production dependency audit, supply-chain koraci i CI gate prošli su.
- **Skipped:** `E2E critical flows` i `E2E install wizard` nisu pokretani na pushu prema workflow uslovima. `Enforce zero high/critical image vulnerabilities` je `skipped` jer je actionable scanner count bio nula.
- **Neuspjeli pokušaji:** CI [`41009478021`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41009478021) na početnom SHA `0f2e3d3bec3fffb828a651038a571e349352fb3b` pao je zbog naših testnih tipova: lease opcije su nasljeđivale literalne default tipove, a service fixture je suzio mock Redis metode na samo `Redis` overload. Opcije su promijenjene na numerički ugovor, mock tip je sačuvan u fixtureu; završni CI `41010129252` je zelen. To nije preegzistentna/env greška.

Lokalno je prošao `git diff --check`. Lokalni Jest/build nisu pokretani jer checkout nema `backend/node_modules` ni generisani Prisma client; sandbox je ranije blokirao Prisma engine download TLS-om. CI je generisao Prisma client i izvršio build/testove te real Redis acceptance suite.

## Registar nalaza

- Zatvoren je samo `BA-assets-09` (P2).
- Ostaju otvoreni `BA-assets-10`–`BA-assets-19`; posebno scheduler reconciliation (`BA-assets-10`) nije dio ovog paketa.
- Deklarisani kontrolni zbir: **580 otvorenih / 112 zatvorenih / 692 ukupno**. Machine-readable source redovi nakon status updatea: **583 otvorena / 98 zatvorenih / 11 historijskih**. Preegzistentna razlika od tri statusa ostaje zabilježena i nije prikrivena ovim closeoutom. Početnih 19 P1 nalaza u Valu 7 ostaje otvoreno.
- Audit baseline ocjena ostaje snapshot **4,59/10** i nije retroaktivno preračunata.

## Migracija, rollout i rollback

Nema baze podataka ili Prisma promjene, migracije, backfill-a ni manual DB koraka. Korisnik je potvrdio da su planirane/ranije migracije uspješno apply; W7.9 ih ne ponavlja. Ne treba pokretati `prisma migrate`, `migrate resolve` ni DB rollback zbog ovog paketa.

**Rollout:** prije miješanog starog/novog deploya privremeno quiesce-ati directory sync (scheduler i manual/CLI pokretanja), završiti ili drain-ati aktivni run i zamijeniti sve API/worker instance koje mogu pokretati sync. Zatim provjeriti da API, worker i CLI koriste isti dostupan Redis namespace/key prefix, pustiti kontrolisani dry-run i vratiti normalan schedule/manual pristup. Stari build ne zna za lease, zato ga ne treba ostaviti da prima sync pozive uporedo s novim buildom. Redis nedostupnost prekida sync umjesto da ga nastavi bez locka.

**Rollback:** prvo quiesce-ati schedule/manual/CLI pozive i sačekati aktivni run ili njegov maksimalni 120-sekundni TTL recovery prozor; zatim drain-ati sve lease-aware instance prije vraćanja starog koda. Nema schema rollbacka niti Redis ključa koji treba ručno čistiti; ne brisati ključ dok owner može biti aktivan. U slučaju crasha/prekida proces ne ostavlja trajni lock: TTL omogućava automatski oporavak.

## Sljedeći paket

**W7.10 — `BA-assets-10` (P2):** reconciliation repeatable scheduler registracije nakon Redis restart/flush-a i startup greške, uz dogovoreni last-success health signal. Nije započet; W7.9 closeout i zeleni CI su završeni prije sljedećeg paketa.
