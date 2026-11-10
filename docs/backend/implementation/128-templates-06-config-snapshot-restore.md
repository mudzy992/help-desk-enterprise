# BA-templates-06 — potpuni config snapshot i domenski apply

**Datum:** 2026-11-05<br>
**Status:** zatvoren na nivou nalaza nakon automatskog CI/Perf acceptancea<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Commit:** [`a7e1c2d7929a7b3fda4d385ada02c4c527415a30`](https://github.com/mudzy992/help-desk-enterprise/commit/a7e1c2d7929a7b3fda4d385ada02c4c527415a30)

## Obuhvat

BA-templates-06 je dopunio config-versioning snapshot, parser, apply i portable package putanju. Ovaj closeout ne uključuje `BA-templates-07`–`09` ni `BA-templates-11`–`13`.

- Snapshot collection sada uz shared response-template definiciju bilježi service/category/group joinove, a uz playbook header bilježi revision, service/category scope i korake sortirane po `position` pa `stepKey`.
- Parser prihvata postojeće legacy header-only zapise bez scopea/koraka, ali odbija prazne/duplirane ID-jeve, neispravne tipove, nevažeću revision vrijednost, duplirane step ključeve, neispravan redoslijed i duplirana live imena.
- Apply radi unutar postojeće config-activation transakcije. Prije prvog upisa provjerava scope i playbook reference, odbija nepostojeće reference i reference na personal response templatee, ne mijenja personal templatee i snima per-entity change log sa actor/reason kontekstom. Definisani koraci se zamjenjuju atomarno; izmjena koraka povećava **target** playbook verziju monotonim inkrementom, a snapshot verzija se ne upisuje nazad preko target verzije. Legacy snapshot bez scope/steps ostavlja te relacije netaknute.
- Portable export/parse/resolve čuva template i playbook scopeove kao natural keys, playbook source revision, pozicije/step ključeve i knowledge-article/response-template reference. Pri mapiranju lokalni scope ID-jevi se kanonizuju sortiranim redoslijedom.
- Nije dodana Prisma schema promjena ni migracija.

## Acceptance i dokazi

| Kriterij | Dokaz | Ishod |
| --- | --- | --- |
| Collect/parse čuva sve template relacije i uređene playbook korake, uz legacy kompatibilnost i odbijanje malformed definicija | `collect-config-snapshot.spec.ts`, `parse-snapshot-templates.spec.ts`, `parse-config-snapshot.spec.ts` | passed |
| Apply obnavlja shared scope/steps, ne mijenja personal templatee, validira reference i audituje actor/reason | `apply-templates-snapshot.spec.ts` | passed |
| Greška reference ne ostavlja djelimično primijenjene template/playbook izmjene niti audit | `apply-templates-snapshot.spec.ts`; `apply-templates-snapshot.integration.spec.ts` | passed |
| PostgreSQL potvrđuje relacije, ordered steps, audit i monotonu target revision | Registrovani `apply-templates-snapshot.integration.spec.ts` u CI isolated PostgreSQL runneru | passed |
| Portable export → parse → resolve čuva polja bez prenosa izvornih ID-jeva | `package/config-package.spec.ts` | passed |
| Targeted application checks | Jest 34/34, isolated-runner harness 9/9, targeted ESLint i `git diff --check` | passed |
| Finalni automatski CI | [`41989293925`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41989293925), SHA `a7e1c2d7`; generated Prisma, backend build/lint/test, PostgreSQL/Redis integration i CI gate | passed |
| Finalni Perf smoke | [`41989293930`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41989293930), isti SHA; svi definisani pragovi su passed | passed |
| Templates E2E 16 / puni Val-5 i BA-15 critical-flow acceptance | Push workflow je preskočio E2E install/critical jobs; relevantni scheduled/full run nije ručno pokrenut | pending, nije passed |

Lokalni `npx tsc --noEmit` nije mogao završiti jer checkout ne sadrži generated Prisma client/delegate fajlove. Zato su lokalni ciljani Jest testovi izvršeni bez `ts-jest` TypeScript diagnostics; finalni automatski CI je generisao Prisma client i prošao backend build/test i izolovanu PostgreSQL integraciju. Nije pristupano ciljnoj bazi, lokalno pokretana migracija, ručno dispatchan CI/E2E, otvoren PR, mergean kod niti izvršen deploy.

## Zaključak

`BA-templates-06` je zatvoren na nivou izvornog nalaza i registra nakon zelenih CI/Perf runova na istom SHA-u. To **ne** zatvara preostale odobrene `BA-templates-07`–`09`, niti templates E2E 16, puni Val-5 acceptance ili BA-15 critical-flow gate. Sljedeći odobreni nalaz je `BA-templates-07`.
