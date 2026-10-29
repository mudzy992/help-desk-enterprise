# W7.1 — Očuvanje scopea role assignmenta u domain viewerima

**Val:** 7 / W7 — domain workflows (`assets`, `problems`, `changes`, `knowledge-base`, `reports`, `search`)  
**Paket:** W7.1 — zajednička assignment-scope granica za `assets` / `problems` / `changes`  
**Nalazi:** `BA-assets-01`, `BA-problems-01`, `BA-changes-01`  
**SHA:** `49c6559949606ebd87c867f37fe2ce9f0363d1c0`  
**CI:** [40911525016](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40911525016) — zelen  
**DB migracije:** nema

## Problem i odabir paketa

Audit wave plan u `backend-findings-plan.json` svrstava jedinice 22–27 u WS-F / Val 7. Prvi P1 rez je zajednički: `assetViewerFromContext` je širio `ADMIN`, `PROBLEM_MANAGER` i `CHANGE_MANAGER` grantove na cijelu instalaciju samo na osnovu role keya, iako je isti principal već nosio canonical `scope` (`global`, OU ili service). Zbog toga su assignmenti vezani za OU dobivali širi read/write scope kroz CMDB, problems i changes.

W7.1 je izabran kao jedan zajednički korektivni paket jer isti authority mapper uzrokuje `BA-assets-01`, `BA-problems-01` i `BA-changes-01`. Ne mijenja pravila članstva u problem grupi ili CAB-u; popravlja granicu između assignmenta i OU scopea.

## Implementacija

U `backend/src/modules/assets/asset-viewer.ts`:

- globalni scope se priznaje samo kada su OU ID, OU path i service ID svi `null`, a prisutni canonical scope je `global`;
- stariji sintetički context bez `scope` polja prihvata se kao globalan samo uz sva tri raw scope polja `null`; nedosljedan ili scoped zapis ne može postati globalan;
- `ADMIN`, `SUPER_ADMIN`, `PROBLEM_MANAGER` i `CHANGE_MANAGER` dobijaju cross-unit ponašanje samo na takvom globalnom assignmentu;
- `SUPER_ADMIN` više nije izveden samo iz `context.roleKeys`; potreban je globalni `SUPER_ADMIN` assignment, pa ni scoped ili nedosljedan zapis ne zaobilazi scope;
- OU-scoped grant zadržava svoj assignment path za svaku permission grupu. Problem-group authority i CAB membership ostaju zasebne provjere.

## Regresijski dokazi

- `assets-rules.spec.ts`: instalacijski ADMIN ostaje globalan; OU-scoped ADMIN ostaje u svom OU za svih sedam assets permissiona (`read`, `manage`, `import`, `report`, `type`, `license`, `contract`); nedosljedan global scope i scoped SUPER_ADMIN fail-closed; validan globalni SUPER_ADMIN ostaje globalan.
- `problem-access.service.spec.ts`: `ProblemAccessService.require()` vraća assignment OU za scoped ADMIN i PROBLEM_MANAGER; cross-unit manager scope zahtijeva globalni assignment.
- `change-access.service.spec.ts`: `ChangeAccessService.require()` vraća assignment OU za scoped CHANGE_MANAGER; scoped ADMIN ostaje ograničen, a globalni CHANGE_MANAGER ostaje podržan samo uz globalni assignment. Postojeći CAB membership testovi ostaju.
- `git diff --check` je prošao.
- Lokalni targeted Jest pokušaj nije mogao početi jer sandbox nema instalirane `backend/node_modules` (`jest: not found`). Ovo je environment blokada, ne assertion rezultat.

## CI dokaz

CI run `40911525016` na ovom SHA-u je potpuno zelen:

- Backend build + test: Prisma schema/client, build, lint, suiteovi sa generisanim Prisma tipovima, wiring, SLA matrica i kompletni backend test run prošli;
- Backend PostgreSQL + Redis integration: migracije, role/privilege checks, rollback/cleanup i real integration suites prošli;
- Frontend build + test: prošao;
- Backend container + supply chain: prošao;
- Docs guard i CI gate: prošli.

Push CI režim je preskočio E2E jobove; ovaj paket nema frontend izmjene niti novu baznu shemu.

## Zatvaranje i rollout

`BA-assets-01`, `BA-problems-01` i `BA-changes-01` su zatvoreni na navedenom SHA-u i CI dokazu. Nema nove DB migracije ni operator rollout koraka. Povratak je običan code revert; validni installation-wide role assignmenti zadržavaju postojeće ponašanje, dok scoped assignmenti više nemaju globalni doseg.

**Sljedeći paket:** W7.2 — `BA-assets-02`, cross-OU relation/contract projekcija i redakcija foreign asset identiteta. Ostali W7 P1 nalazi ostaju otvoreni dok njihov vlastiti testni i CI dokaz ne prođe.

## Docs i traceability gate

Nakon ažuriranja audit tabela i registra, lokalne provjere su prošle:

- `node scripts/check-docs-content.mjs` — 32 stranice, 8 prevoda, 10 provjera;
- `node --test scripts/check-docs-content.test.mjs` — 9/9;
- `node scripts/check-backend-findings.mjs` — 692/692 nalaza, P1=174, P2=368, P3=150;
- `node --test scripts/check-backend-findings.test.mjs` — 5/5;
- `git diff --check` — prolazi.
