# Closeout — `BA-service-catalog-14` (incident read fail-closed)

**Status:** zatvoreno owner-directed 2026-11-03 nakon zelenog kodnog CI-ja.<br>
**Nalaz:** `BA-service-catalog-14` (P3) — DB/missing-delegate greška pri čitanju incident impacta ne smije se prikazati kao potvrđeno odsustvo incidenta.<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Finalni kodni SHA:** `7dd9c05c1655f1c5ce0dee881cfbee037b9c5028`<br>
**CI:** [`41728680530`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41728680530) — **success**.<br>
**Schema / ciljna baza:** nema schema promjene; ciljnoj bazi nije pristupljeno. CI integration koristi disposable test okruženje.

## Nalaz i ugovor

`listServices` i `getService` pozivaju `loadOpenIncidentImpacts` prije izgradnje odgovora. Loader je ranije vraćao praznu mapu kada bi `serviceIncidentService` delegate nedostajao ili bi incident query pao. `toServiceResponse` je nedostajući impact tumačio kao `incidentImpact: null`, što znači „uspješno potvrđeno da nema javno vidljivog otvorenog incidenta“. Kvar čitanja je zato mogao pogrešno ostaviti servis `OPERATIONAL` bez vidljivog health signala.

Dogovoreni API/UI ugovor je:

- incident query/delegate greška vraća `INCIDENT_STATUS_UNAVAILABLE`, mapiran u HTTP **503**;
- frontend prikazuje postojeći `errors.server` tekst;
- `incidentImpact: null` i dalje znači samo uspješno potvrđeno odsustvo javno vidljivog otvorenog incidenta;
- nema `UNKNOWN` availability statusa, API response-union promjene ni promjene availability ponašanja.

Status-page incident read je zaseban put koji već ne guta DB grešku; nije mijenjan.

## Implementacija

- `loadOpenIncidentImpacts` vraća praznu mapu bez queryja samo kada nema service ID-jeva; missing delegate ili query/processing failure baca `INCIDENT_STATUS_UNAVAILABLE`.
- `ServiceCatalogError` mapper daje stabilan HTTP 503 kod; existing open `ALL_USERS` incident filter ostaje nepromijenjen.
- Service-level list/get regresije potvrđuju propagaciju greške umjesto payload-a sa lažno zdravim servisom.
- Frontend API error mapper veže novi API kod za postojeći server-error tekst; response types i i18n ključevi nisu mijenjani.
- Follow-up tipna korekcija u onboarding in-memory Prisma fixtureu izvodi tip iz `ReturnType<typeof createInMemoryServiceCatalogPrisma>['prisma']`, tako da fixture prati novi incident delegate bez ručnog nepotpunog Prisma tipa.

## CI pokušaji i konačna acceptance odluka

Prvi CI run [`41727639882`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41727639882) na SHA `69b55985574928a6a1d5ff166209c5fd8c1ece51` bio je **failure**, pa BA-14 tada nije bio prihvaćen. Frontend i Docs guard su prošli; backend build pao je na `TS2322` jer je eksplicitni onboarding fixture tip izostavio `serviceIncidentService`. Container image build i PostgreSQL/Redis integration connection-budget korak također su prijavili failure; budget korak pokreće backend build, pa nema potvrđenog budget rezultata. Sirovi logovi nisu mogli biti preuzeti (`EOF`), zato se ne tvrdi uzrok izvan vidljivih annotations. Follow-up commit `7dd9c05` popravio je fixture tip i dopunio ovaj checkpoint.

Finalni CI [`41728680530`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41728680530) na finalnom SHA `7dd9c05c1655f1c5ce0dee881cfbee037b9c5028` završio je **success**:

| Job / provjera | Rezultat |
| --- | --- |
| Frontend build + test | **passed** |
| Backend generated-Prisma build, lint i full Jest (uključujući BA-14 regressions) | **passed** |
| PostgreSQL + Redis integration, uključujući migration replay i connection budget | **passed** |
| Backend container + supply-chain | **passed** |
| Docs guard | **passed** |
| CI gate | **passed** |
| Read-only service-form inventory | **skipped** |
| E2E critical flows / install wizard | **skipped** |
| Conditional zero high/critical image-vulnerability enforcement | **skipped** |

`skipped` nije označen kao `passed`. Ovaj run ne daje browser/spec 56 sign-off niti deployment potvrdu.

## Perf, lokalna provjera i ograničenja

**Lokalno passed:** backend incident-loader/error-mapper testovi **2 suitea / 5 testova**; targeted backend ESLint; frontend `npx tsc -b --pretty false`; frontend `map-api-error.spec.ts` **1 fajl / 4 testa**; targeted frontend ESLint/Prettier; findings traceability prije closeouta **692/692** i guard tests **13/13**; Docs guard **32 stranice / 8 prevoda / 10 provjera** i tests **9/9**; `git diff --check`.

ServiceCatalogService regression nije lokalno kompajlirao zbog nedostajućeg generated Prisma Clienta. Lokalni pokušaj `prisma generate` bio je blokiran TLS pristupom `binaries.prisma.sh`; mrežno zavisan pokušaj nije ponavljan. Finalni CI generisao je klijenta i prošao full backend build/Jest, čime je taj lokalni nedostatak prevaziđen za acceptance.

Perf run [`41727639876`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41727639876) na početnom BA-14 SHA bio je **failure prije k6-a** zbog API builda. Na finalnom SHA `7dd9c05` nije pokrenut Perf run; zato nema finalnog BA-14 Perf rezultata/mjerenja i Perf se ne navodi kao passed. Ovaj P3 acceptance se oslanja na kodni CI, ne na Perf gate.

**Dokumentacijska provjera nakon closeouta:** `node scripts/check-backend-findings.mjs` — **692/692**; findings plan tests **13/13 passed**; Docs guard — **32 stranice / 8 prevoda / 10 provjera passed** (uz postojeću shallow-clone `updatedAt` napomenu); docs guard tests **9/9 passed**; `git diff --check` — **passed**.

## Statusni closeout i scope granice

Korisnik je odobrio zatvaranje BA-14 nakon zelenog CI-ja. BA-14 je **zatvoren owner-directed** na osnovu finalnog CI-ja `41728680530` na `7dd9c05`; BA-service-catalog-15 ostaje **otvoren** i započinje kroz [checkpoint 121](121-service-catalog-15-executable-test-matrix.md). Trenutni service-catalog zbir je **1 otvoren / 14 zatvorenih**. Globalni deklarisani zbir je **556 otvoren / 136 zatvoren / 692 ukupno**; machine-readable source nakon regeneracije je očekivano **559 otvoren / 122 zatvoren / 11 historijskih**. Ranija razlika od tri statusa ostaje zasebna reconciliation obaveza.

BA-routing-02, BA-changes-08/13 i svi drugi nalazi nisu mijenjani. Nema target-DB pristupa, lokalne migracije, deploymenta, PR-a prema `master` niti mergea. Zadnje provjereni `origin/master` je `8cfd54c1a28b04b150424691b113420b89730c58`; BA-14 commits su ostali na Arena grani.
