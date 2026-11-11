# W6.43 — `BA-on-call-03`: optimistic concurrency rasporeda

**Status:** `BA-on-call-03` zatvoren na finding nivou nakon push-triggered CI-ja `42522885254` (**success**).
**Scope:** samo Val 6 P1 `BA-on-call-03`; bez P2/P3, announcements P1, BA-15 full acceptance ili pune on-call §15/module acceptance.
**Datum:** 2026-10-29

## Korekcija

Schedule detail sada vraća postojeći `OnCallSchedule.updatedAt` kao revision token. Editor ga šalje kroz `expectedUpdatedAt`; kreiranje šalje `null`. Izmjena postojećeg rasporeda bez revisiona ili sa zastarjelim revisionom završava stabilnim `ON_CALL_SCHEDULE_CONFLICT` / HTTP 409, a UI traži osvježavanje prije ponovnog snimanja.

Service provjerava revision prije validacije promjenjivih članova, a u istoj transakciji radi conditional `updateMany` nad `{ groupId, updatedAt }`. Uspješan CAS monotono pomjeri `updatedAt`; zatim se rotation članovi brišu i ponovo upisuju, a audit zapis dodaje prije commit-a. Zastarjeli konkurentni writer ne dođe do member replacementa ni audita. Dva prva kreiranja koja su oba pročitala „nema schedulea” razriješena su unique `groupId` ključem; gubitnik dobija isti 409 conflict. Time header, member set i audit ostaju jedna atomska promjena.

Korekcija koristi postojeći `updatedAt`; nema Prisma schema izmjene ni migracije. Ne uvodi se novi serializable schedule-edit protokol.

## Testovi i CI

Novi service spec pokriva odbijanje missing revisiona prije transakcije, dva paralelna savea sa istim revisionom (tačno jedan uspijeva, a pobjednički header i member set pripadaju istom zahtjevu) i unique-key race pri prvom kreiranju. Frontend šalje revision za edit i prikazuje prevedenu refresh poruku na 409.

Lokalno: ciljane on-call suite **8/8 suitea, 40/40 testova** uz ts-jest dijagnostiku isključenu zbog nedostajućeg lokalnog generated Prisma clienta; backend ESLint; frontend TypeScript check, ESLint, Prettier, targeted Vitest **22/22** i `i18n:check` (8961 ključeva, bs/en paritet) prošli. Nije pokretan puni CI/E2E ručno.

Prvi push CI [`42522111519`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42522111519) pao je samo na frontend Prettier provjeri; format je ispravljen u [`49f2b91`](https://github.com/mudzy992/help-desk-enterprise/commit/49f2b91e0f910cd070835e635388be649b064a5c). Finalni kodni commit [`0922c18`](https://github.com/mudzy992/help-desk-enterprise/commit/0922c18acc6b76fa1feb8a1eecdfb2c2ab922271) i format follow-up na SHA [`49f2b91`](https://github.com/mudzy992/help-desk-enterprise/commit/49f2b91e0f910cd070835e635388be649b064a5c) prošli su push-triggered CI [`42522885254`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42522885254) (**success**): generated-Prisma backend build/full Jest, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain posao i CI gate. Read-only inventory, E2E install/critical i conditional high/critical image enforcement bili su `skipped`, ne `passed`. Nakon tog koda, W6.43 dokumentacijski diff prošao je lokalni findings/docs checker i njihove testove (14/14 i 9/9); repo `paths-ignore` ne pokreće push CI za docs-only commit, pa se zaseban CI rezultat za ovaj posljednji docs commit ne tvrdi.

## Granice i status

- Nije dodana migracija ni korištena ciljna baza; PostgreSQL/Redis integration i migration replay u CI-u rade nad disposable okruženjem.
- Nije otvoren PR, izvršen merge ili deployment.
- Nakon W6.43 Val 6 je **47/109 zatvorenih, 62 otvorena (4 P1 / 41 P2 / 17 P3)**. Izvorni auditi/generisani plan: **514 otvorenih / 178 zatvorenih**; globalni registar: **524 otvorena / 168 zatvorenih**. Deset ranijih statusnih razlika ostaje netaknuto.
- Preostali Val 6 P1 su `BA-announcements-01/02/03/04`. On-call P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending i izvan ovog closeouta.
