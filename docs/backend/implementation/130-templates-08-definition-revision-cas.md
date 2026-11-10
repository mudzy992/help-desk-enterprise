# BA-templates-08 — optimistic concurrency za definicije templatea i playbooka

**Datum:** 2026-11-05<br>
**Status:** zatvoren na nivou izvornog nalaza nakon zelenih automatskih CI/Perf gateova; templates E2E 16 i puni Val-5/BA-15 acceptance ostaju pending<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Implementation commit:** [`da54dd096cfcb0589d2b810105640752741e7344`](https://github.com/mudzy992/help-desk-enterprise/commit/da54dd096cfcb0589d2b810105640752741e7344)<br>
**Finalni testani SHA:** [`d386244031e0d284fbcf66197f67eea93bdcc175`](https://github.com/mudzy992/help-desk-enterprise/commit/d386244031e0d284fbcf66197f67eea93bdcc175)

## Obuhvat

Ovaj closeout zatvara samo `BA-templates-08` iz odobrenog P2 scopea `BA-templates-04`–`10`. Ne obuhvata `BA-templates-09`, `BA-templates-11`–`13`, routing/status-page razlike, BA-15 full-flow acceptance niti izmjene Perf pragova.

## Implementacija

- Playbook update zadržava postojeći `expectedUpdatedAt` ugovor i compare-and-set (CAS); playbook delete sada zahtijeva isti precondition. Conditional `updateMany` nad učitanim `updatedAt` izvršava se kao prva mutacija transakcije, prije soft-delete ili change loga.
- Response-template update i delete za shared i personal ownership sada traže `expectedUpdatedAt`. Servis odbija nedostajući/nevažeći token kao `TEMPLATE_PRECONDITION_REQUIRED` (HTTP 400), poredi ga sa aktuelnim redom, a zatim u transakciji claim-a revision preko `updateMany`. Update tek nakon uspješnog CAS-a zamjenjuje scope joinove i piše change log; delete tek nakon CAS-a tombstone-a red i piše change log. CAS gubitnik vraća `TEMPLATE_VERSION_CONFLICT` (HTTP 409); cijela transakcija se rollbacka i ne ostavlja djelimične relacije, korake, tombstone ili audit.
- `updatedAt` se pomjera monotono pri claim-u (`max(now, current + 1 ms)`), tako da je sljedeća revizija različita i kada dvije izmjene upadnu u isti millisecond.
- Frontend update/delete requesti šalju `updatedAt` učitanog reda. Editor nakon konflikta preuzima najnoviji server zapis, ali čuva nacrt dok korisnik izričito ne izabere **Učitaj najnoviju verziju**; delete konflikt zatvara zastarjeli dialog i ponovo učitava listu.
- Response-template PostgreSQL concurrency suite registrovana je u isolated CI runneru; postojeća playbook-update CAS regresija sačuvana je, a suite je proširena playbook-delete raceom. Nema schema promjene niti nove migracije.

## Acceptance i dokazi

| Kriterij | Dokaz | Ishod |
| --- | --- | --- |
| Missing revision na response-template shared/personal update/delete i playbook delete; HTTP 400 bez mutacije | `response-templates.service.spec.ts`, `playbooks.service.spec.ts`, HTTP error mapper | passed; unit testovi potvrđuju da missing token ne otvara mutacijsku transakciju |
| Stale revision na update/delete; HTTP 409 bez relacija, koraka, tombstonea ili audit zapisa | Ciljani service testovi za shared/personal templatee i playbook delete; `PLAYBOOK_VERSION_CONFLICT` regresija | passed |
| CAS-loser nema sporednih izmjena | Mocked zero-count CAS unit testovi | passed |
| Playbook update zadržava prethodnu BA-03 CAS semantiku | Postojeći playbook update service regression i PostgreSQL race test | passed |
| Dva writer-a nad istim revisionom daju jednog pobjednika, jednog conflict-writera i tačno jedan change log | Response-template update + relation snapshot; playbook update regression; dodatni playbook soft-delete race; svi registrovani u CI runneru | passed u CI `42001490513` na finalnom SHA-u |
| Frontend šalje učitani revision, čuva nacrt na conflict i eksplicitno učitava novu verziju; delete lista se osvježava | API/editor/list Vitest testovi | passed |
| Full backend/frontend, generated Prisma i izolovani PostgreSQL/Redis CI | Finalni automatski CI [`42001490513`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42001490513), SHA `d386244` | passed |
| Performance smoke bez promjene pragova | [`41999692780`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41999692780), implementation SHA `da54dd0` | passed; frontend-only follow-up nema novi Perf run po path filteru |
| Templates E2E 16, puni Val-5 i BA-15 acceptance | Push E2E critical/install poslovi su `skipped`; nije pokrenut ručni full E2E | pending; `skipped` nije `passed` |

Lokalno su prošli ciljani backend Jest service suites **67/67** uz `ts-jest diagnostics:false` (zato rezultat nije lokalni TypeScript typecheck), backend ESLint i `node --test scripts/run-isolated-integration.test.mjs` **11/11**. Frontend fokusirani Vitest set je prošao **11/11**, `npm run build` i `npm run i18n:check` prošli su, kao i ciljano ESLint/Prettier provjere. Generated Prisma typecheck i stvarna PostgreSQL/Redis suite izvršeni su u CI-u, ne lokalno.

Prvi automatski CI [`41999692838`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41999692838) na implementation SHA `da54dd0` pao je samo na guardu veličine frontend modula: `response-template-editor-page.tsx` je bio 546 redova naspram limita 520. Editor mapping/save transform izdvojen je u `response-template-editor-model.ts`; finalni CI `42001490513` na `d386244` prošao je frontend full test/build/module-budget. Backend, PostgreSQL/Redis integration i Perf su već prošli na implementation SHA-u. Follow-up `d386244` mijenja samo frontend kod, zato Perf workflow path filter nije pokrenuo dodatni run. Niti jedan neuspjeli CI nije prikazan kao passed.

Nije korištena ciljna baza niti lokalno pokretana migracija. PostgreSQL testovi su koristili samo CI disposable bazu. Nije dispatchan ručni full CI/E2E, otvoren PR, urađen merge ili deploy.

## Zaključak

`BA-templates-08` je zatvoren na nivou izvornog nalaza nakon green finalnog CI-ja na `d386244` i Perf smoke-a na performance-relevant implementation SHA `da54dd0`. Ovo ne zatvara templates E2E 16, puni Val-5 segment niti BA-15 critical-flow acceptance. Sljedeći odobreni nalaz je `BA-templates-09`; `BA-templates-11`–`13` ostaju izvan trenutnog scopea.
