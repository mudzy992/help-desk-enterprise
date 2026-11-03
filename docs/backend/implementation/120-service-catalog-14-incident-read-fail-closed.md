# Implementacijski checkpoint — `BA-service-catalog-14` (u toku)

**Nalaz:** `BA-service-catalog-14` (P3) — **otvoren; implementacija lokalno u toku, CI acceptance još nije potvrđen**.<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**Početak:** 2026-11-03, nakon owner-directed zatvaranja BA-13; prethodni dokaz je u [119 closeoutu](119-service-catalog-13-caller-supplied-change-reasons.md).<br>
**Schema / migracija / ciljna baza:** nema schema promjene ni migracije; ciljnoj bazi nije pristupljeno.

## Nalaz i potvrđeni read path

`listServices` i `getService` pozivaju `loadOpenIncidentImpacts` prije izgradnje odgovora. Loader je ranije vraćao praznu mapu kad bi `serviceIncidentService` delegate nedostajao ili bi query bacio grešku. `toServiceResponse` tumači nedostajući impact kao `incidentImpact: null` — “nema incidenta” — pa bi response mogao zadržati `OPERATIONAL` i tiho sakriti nepoznato stanje.

Read path je potvrđen u `backend/src/modules/service-catalog/list-services.ts`, `get-service.ts`, `load-open-incident-impacts.ts`, `to-service-response.ts` i `ServiceCatalogService.execute`. Status page ima zaseban incident read path; on ne koristi ovaj loader niti guta DB grešku, pa nije mijenjan.

## Postojeći API/UI ugovor i odluka

- Backend `ServiceResponse.incidentImpact` je obavezan i nullable: `null` znači uspješno potvrđeno odsustvo javno vidljivog otvorenog incidenta. `runtimeAvailability` nema `UNKNOWN` vrijednost.
- Frontend `ServiceResponse.incidentImpact` je opcionalan zbog create/update responsea; postojeći catalog/ticket UI tumači `null` kao odsustvo incidenta. Zato se DB kvar ne smije predstavljati kao `null`, niti je dodan novi availability status.
- Izabrano ponašanje je eksplicitan fail-closed API odgovor: `ServiceCatalogError('INCIDENT_STATUS_UNAVAILABLE')`, mapiran u HTTP **503** sa stabilnim kodom. `mapApiError` za taj kod prikazuje postojeću server-error poruku.
- Pri prvom catalog učitavanju 503 vodi u postojeći blocking error state. Na neuspjelom osvježavanju UI zadržava posljednje uspješne redove, ali prikazuje vidljivo upozorenje o grešci. Ticket-create loader vraća prazan services skup uz vidljiv `tickets.errorCatalog`, ne lažno zdrav servis.

## Implementacija

- `loadOpenIncidentImpacts` vraća praznu mapu bez queryja samo kad nema service ID-jeva. Nedostajući delegate ili bilo koji incident read/processing failure sada baca `INCIDENT_STATUS_UNAVAILABLE`; uspješan prazan rezultat i dalje znači da nema incidenta.
- `ServiceCatalogError` i `mapServiceCatalogError` dodaju stabilan HTTP 503 ugovor. Query ograničenje na open `ALL_USERS` incidente ostaje nepromijenjeno.
- Backend regresije pokrivaju worst-impact agregaciju, empty input, missing delegate, DB failure i 503 mapping. Dodatni `ServiceCatalogService` regression test provjerava da list i single reads propagiraju 503 umjesto payload-a sa zdravim servisom.
- Frontend error mapper veže `INCIDENT_STATUS_UNAVAILABLE` za postojeći `errors.server`; response data types i i18n ključevi nisu mijenjani.

## Lokalna provjera

**Passed:**

- `load-open-incident-impacts.spec.ts` + `map-service-catalog-error.spec.ts`: **2 suitea / 5 testova passed**.
- Ciljani backend ESLint za izmijenjene module/testove: **passed**.
- Frontend `npx tsc -b --pretty false`: **passed**.
- Frontend `map-api-error.spec.ts`: **1 fajl / 4 testa passed**; ciljani ESLint i Prettier check za izmijenjene mapper fajlove: **passed**.
- Backend findings traceability: **692/692**, severity `P1=174, P2=368, P3=150`; traceability guard testovi: **13/13 passed**.
- Docs content guard: **passed** (`32 stranice, 8 prevoda, 10 provjera`); docs guard testovi **9/9 passed**. Guard je prijavio shallow-clone napomenu: `updatedAt` se preuzima iz postojećeg `manifest.json`, a ne računa iz Git istorije (§3.3); sadržaj/provjera su prošli.
- `git diff --check`: **passed**.

**Nije passed / nije izvršeno:**

- `service-catalog.service.spec.ts` — **nije izvršen lokalno**: generated Prisma Client/enums nisu prisutni (`TS2307`, `../../generated/prisma/enums`). `npm run db:generate -- --no-engine` nije mogao preuzeti Prisma schema-engine zbog TLS veze do `binaries.prisma.sh`; zato se ovaj ServiceCatalogService 503 regression i backend build/full Jest ne označavaju kao passed. Test je dodan i mora se izvršiti u CI okruženju sa generisanim klijentom.
- BA-14 CI/full build i Perf: **pending / nisu pokrenuti za ove izmjene**. Ne preuzimati BA-13 run kao BA-14 CI dokaz.

Nije korištena ciljna DB, nije pokrenuta migracija niti deployment. Generisanje Prisma Clienta nije uspjelo prije DB interakcije. Nema PR-a/mergea.

## Status i granice

BA-14 ostaje **otvoren** dok ServiceCatalogService list/get regression, generated-Prisma backend build/full Jest i CI acceptance ne budu potvrđeni. Nakon izmjena status registra je `service-catalog`: **2 otvorena / 13 zatvorenih** (`BA-service-catalog-14` i `15` ostaju otvoreni); deklarisani globalni zbir je **557 otvoren / 135 zatvoren / 692 ukupno**, machine-readable izvor **560 otvoren / 121 zatvoren / 11 historijskih**. Ranija razlika od tri statusa ostaje vidljiva.

BA-routing-02, BA-15, Perf search failure `41697055530` i drugi nalazi nisu mijenjani niti pripisani BA-14. Nema target-DB pristupa, migracije, deploya, PR-a prema `master` ni mergea. Sljedeći acceptance korak je pokretanje novih ServiceCatalogService testova i punog CI-ja na aktivnoj Arena grani; tek zatim odlučiti o zasebnom owner-directed closeoutu.
