# W6.46 — `BA-announcements-03`: fan-out cijele publike kroz keyset stranice

**Status:** `BA-announcements-03` zatvoren na finding nivou nakon push-triggered CI-ja [`42535212761`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42535212761) (**success**).
**Kod i testani SHA:** [`aa036595f9ec15bcf1389b98cd48a3d023b1a42f`](https://github.com/mudzy992/help-desk-enterprise/commit/aa036595f9ec15bcf1389b98cd48a3d023b1a42f)
**Scope:** samo audit-order Val 6 P1 `BA-announcements-03`; `BA-announcements-04`, svi P2/P3 i BA-15 full critical-flow acceptance nisu uključeni.
**Datum:** 2026-10-29

## Korekcija

Publish fan-out i reminder koristili su `take: 20_000`, pa je publika veća od capa bila terminalno odsječena. `audienceNotifiedAt` i `lastReminderAt` mogli su biti postavljeni prije nego što je fan-out završio, čime bi truncation ili page-level greška spriječila retry.

`announcementLimits.notifyMaxRecipients` zamijenjen je `notifyBatchSize: 1_000`. Nova `fanOutAudienceInPages()` metoda:

- sastavlja bazni audience predicate jednom i dodaje reminderov acknowledgement uslov kada je primjenjiv;
- čita samo korisničke ID-jeve uz `orderBy: id ASC`, `id > cursor` i `take: 1_000`;
- obrađuje stranice sekvencijalno i nastavlja do kraja matching skupa, bez ukupnog recipient capa ili OFFSET-a;
- vraća ukupan broj novokreiranih in-app obavještenja, uz očuvanje postojećeg per-user dedupe keyja.

`notifyStarted()` zapisuje `audienceNotifiedAt` tek nakon prolaska svih stranica. `remind()` provjerava postojeći reminder eligibility prije fan-outa i zapisuje `lastReminderAt` tek nakon stranica; neacknowledged-only predicate ostaje nepromijenjen. Propagirana query/page greška zato ne troši completion/reminder marker i ostavlja mogućnost ponovnog prolaza. Pojedinačni notification-persist kvarovi se i dalje loguju i ne prekidaju traversal — durable per-recipient retry nije dio ovog nalaza.

Ovo je sinhroni keyset traversal, ne durable fan-out run/cursor/outbox. Email-run create i recipient-level recovery ostaju best-effort; P2 `BA-announcements-08` nije zatvoren. Nijedan susjedni nalaz nije promijenjen.

## Regresije i provjere

`announcement-fanout.spec.ts` pokriva:

- kompletnu publish publiku od 20.005 korisnika kroz višestruke stranice;
- nepostavljanje `audienceNotifiedAt` ako publication page baci grešku;
- neclaimanje reminder intervala ako fan-out page baci grešku;
- reminder fan-out kroz stranice uz očuvani acknowledgement filter.

Lokalno su prošli targeted ESLint, `git diff --check` i fokusirani Jest **4 suitea / 23 testa**. Zbog nedostajućeg lokalnog generated Prisma Clienta, Jest je pokrenut privremenim `ts-jest diagnostics:false` configom; lokalni prolaz nije type-check. Prvi push CI [`42534858528`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42534858528) na `007dd55` otkrio je `TS7022` implicit-any inference na Prisma query rezultatu. Follow-up commit `aa03659` eksplicitno je tipizirao recipient ID redove kao `{ readonly id: string }[]`.

Finalni CI [`42535212761`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42535212761) na kodnom/testanom SHA-u je **success**: generated-Prisma backend build, lint i full Jest; PostgreSQL+Redis integration; frontend build/test; Docs guard; production-image build/supply chain; i CI gate. E2E install/critical, read-only inventory i conditional high/critical image enforcement su `skipped`, ne passed. E2E nije ručno pokretan. Perf nije pokrenut na ovom SHA-u. Posljednji raspoloživi Perf [`42530385320`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42530385320) ostaje **failed** na globalnom query budgetu `2.123 > 2.1`; nema BA-03 uzročne atribucije, threshold nije mijenjan i Perf nije prijavljen kao green.

Nema Prisma schema izmjene ni migracije; target baza nije korištena. Nema PR-a, mergea ili deploymenta. Nakon W6.46 Val 6 je **50/109 zatvorenih, 59 otvorenih (1 P1 / 41 P2 / 17 P3)**; source audit/plan **511/181**, globalni registar **521/171**. Deset ranijih statusnih razlika ostaje netaknuto. Preostali Val 6 P1 je `BA-announcements-04`; P2/P3, `BA-announcements-08` i BA-15 full critical-flow acceptance ostaju pending/izvan scopea.
