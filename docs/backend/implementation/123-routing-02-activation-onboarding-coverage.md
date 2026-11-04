# BA-routing-02 — activation i onboarding coverage follow-up

**Status:** lokalna implementacija u toku; nalaz ostaje otvoren do propisanog acceptance dokaza.
**Val:** 5
**Audit izvor:** [13 — routing, BA-routing-02](../audits/13-routing.md#ba-routing-02--activation-coverage-je-postoji-jedno-pravilo)
**Prethodni zapis:** [W5.21 historical closeout](48-routing-service-activation-coverage.md)

## Uočeni preostali jaz

W5.21 je uveo coverage evaluaciju za service activation i onboarding finalizaciju: svaki obavezni origin OU mora se razriješiti exact pravilom ili pravilom najbližeg ancestor OU-a. Međutim, persisted onboarding `suggest` i `validate` putanje i dalje su koristile `routingRule.count({ serviceId }) > 0`. Jedno pravilo je zato još moglo proizvesti routing referencu kao da je konfiguracija spremna.

Izvorni statusni red `BA-routing-02` ostaje **otvoren**. Ovaj follow-up ne prepisuje historijski W5.21 zapis niti tvrdi da je nalaz zatvoren.

## Ugovor i izmjena

- Mandatory origin skup su svi trenutno upisani `OrganizationalUnit` zapisi. Shema nema `inactive`/`cannot originate ticket` oznaku niti per-service OU allowlist, pa se proizvoljno izostavljanje OU-a ne smatra sigurnim.
- Coverage koristi istu exact-then-ancestor semantiku kao ticket resolution. Missing ID-evi su sortirani deterministično po `ouPath`, uz ID tie-break. Pravila ostaju relacioni zapisi; strani ključevi štite OU/service/group targete, a postojeća BA-routing-01 provjera target eligibility pri mutaciji ostaje nepromijenjena.
- Onboarding suggestion se prikazuje samo kada postoji routing konfiguracija i required coverage nije nepotpuna. Validacija reference koristi istu evaluaciju; `requireCoverage=true` odbija reference s kodom `ROUTING_COVERAGE_MISSING`.
- Blokirajući odgovor sada nosi `details.routingCoverage` sa `hasCoverage`, `requireCoverage`, `requiredOriginUnitCount` i punim `missingOriginUnitIds` skupom. Onboarding step validation isti detalj sačuva u `lastValidationErrors` i vrati kao strukturirani error; parsiranje persisted JSON-a provjerava taj envelope.
- `requireCoverage=false` ostaje eksplicitan override: nepotpuna coverage može proći onboarding/aktivaciju uz `ROUTING_COVERAGE_MISSING` warning; onboarding finalizacija čuva istu missing listu i `overrideApplied: true` u service change-log auditu.
- Nema nove migracije, target-DB pristupa, migration runa, deploya, mergea ni PR-a.

## Izvršivi dokaz u paketu

- Routing evaluator: bez pravila, jedan leaf-rule, ancestor fallback, nezavisno OU stablo i determinističan missing set.
- Onboarding routing provider: partial required coverage ne vraća lažnu suggestion/reference; root ancestor fallback pokriva cijelo stablo; optional policy dopušta nepotpunu konfiguraciju uz structured evaluation.
- Service activation error response sadrži missing set.
- Onboarding step revalidation, nakon što se coverage promijeni, odbija završetak, izbacuje strukturirani missing set i čuva isti detalj u `lastValidationErrors`.
- Onboarding optional override zadržava warning i audit sa `overrideApplied: true`.

## Lokalna validacija i preostali gateovi

- Ciljani ESLint za promijenjene routing, service-catalog i onboarding fajlove: **prošao**.
- Četiri ciljana Jest suite-a (routing activation, routing onboarding reference, catalog activation, onboarding coverage): **15/15 testova prošlo** u transpile-only režimu uz privremeni, ignored dummy Prisma Client shim. Shim je uklonjen nakon testa. Ovo nije generated-Prisma type-check niti PostgreSQL dokaz.
- Backend generated Prisma Client nedostaje; prethodni `db:generate` pokušaj je blokiran nedostupnim `binaries.prisma.sh`. Target DB nije korišten, migracija nije pokrenuta.
- PostgreSQL integration/E2E i GitHub CI na finalnom SHA-u još nisu potvrđeni; čekaju korisnikov merge/run ID prema handoff pravilima.
- Dokumentacijski checker/testovi i `git diff --check` su prošli nakon ove izmjene.

Dok ne prođu zahtijevani gateovi, `BA-routing-02` ostaje otvoren; Val 5 ostaje 58/74 na finding statusu.
