# Predložak odgovora za zatvaranje paketa

Ovaj predložak je obavezan za ponovljive W7 package-closeout odgovore. Zadržati isti redoslijed i ne izostavljati CI `skipped` poslove, neuspjele pokušaje, lokalna ograničenja, migracije ili otvorene susjedne nalaze.

**Pravilo gatea:** paket se ne označava zatvorenim i naredni paket se ne započinje dok CI za paket nije zelen. Ako CI padne zbog koda, popraviti i ponoviti gate; ne klasifikovati vlastitu grešku kao preegzistentnu. Preegzistentne/env greške dokumentovati sa jasnim dokazom i odvojiti ih od novih regresija.

## Obavezna struktura

1. **Paket i nalaz:** Val/paket, ID i severity, closure status, scope/acceptance kriterij.
2. **Implementacija:** izmjene po komponenti/API-ju, ključni invarianti, error contract i šta nije obuhvaćeno.
3. **Direktni testni dokaz:** test fajlovi i šta su dokazali; navesti DB/integration testove, stale/concurrent slučajeve i side effecte.
4. **Commit i CI:** commit SHA, testani SHA, tačan run ID/link, rezultat ključnih poslova. Navesti `skipped` jobs/steps i svaki neuspjeli raniji pokušaj sa uzrokom i korekcijom.
5. **Registar:** tačno koji nalazi se zatvaraju, koji ostaju otvoreni i ažurirani zbir otvorenih/zatvorenih/ukupnih te severity broj ako je dostupan.
6. **DB/migracija/rollout:** schema promjena, naziv i način primjene migracije ili eksplicitno „nema migracije“, manual koraci, kompatibilnost API-ja i rollback.
7. **Lokalna provjera i ograničenja:** komande i ishodi; lokalno blokirane provjere označiti kao sandbox/infra blokadu samo ako to dokazi podržavaju.
8. **Sljedeći paket:** tačan ID i acceptance cilj. Navesti da nije započet prije zelenog CI-ja.

## Kopiraj/zalijepi format

```markdown
# Package closeout — W{VAL}.{PAKET}

**Paket:** W{VAL}.{PAKET} — {kratak naziv}<br>
**Nalaz:** `{FINDING-ID}` ({P1/P2/P3}) — {zatvoren / ostaje otvoren}<br>
**Kodni commit:** `{COMMIT-SHA}`<br>
**Finalni testani SHA:** `{TESTED-SHA}`<br>
**CI:** [`{RUN-ID}`]({RUN-URL}) — {zelen / nije zelen}<br>
**DB migracije:** {nema / naziv + manual apply korak}

## Nalaz i acceptance

{Root cause, šta tačno treba dokazati i odluka o susjednim audit napomenama.}

## Implementacija

- {API/servis/DTO/UI promjena i invariant.}
- {Conflict/error/status ponašanje.}
- {Šta nije promijenjeno i ostaje van scopea.}

## Direktni testni dokaz

- `{TEST-FILE}` — {stale/parallel/failure/scope slučaj i provjereni state/event/outbox rezultat.}
- {Ostali acceptance testovi.}

## CI i testni dokaz

CI run [`{RUN-ID}`]({RUN-URL}) na `{TESTED-SHA}`:

- **Backend:** {schema/client, build, lint, unit/safety-net rezultat}.
- **PostgreSQL/Redis integration:** {isolated suite/harness rezultat; navedite novododani suite}.
- **Frontend:** {lint, format, tests, build, budget}.
- **Docs/CI gate/container:** {ishod po poslu}.
- **Skipped:** {tačni jobovi/koraci; razlog iz workflowa, ne “passed”}.
- **Neuspjeli pokušaji:** {run/SHA, uzrok, vlastita greška ili dokazana preegzistentna/env blokada, korekcija i finalni zeleni run; “nema” ako ih nema}.

Dodatne lokalne provjere i ograničenja: {komande i rezultat; razdvojiti lokalne/environment probleme od CI rezultata}.

## Registar nalaza

- Zatvoreni: `{ID}` {samo uz acceptance dokaz i zeleni CI}.
- Ostaju otvoreni: `{IDs / scope}`.
- Kontrolni zbir: `{OPEN}` otvorenih / `{CLOSED}` zatvorenih / `{TOTAL}` ukupno; {P1 open ako je poznat}.

## Migracija, rollout i rollback

{Schema promjena / eksplicitno nema migracije, potrebni deployment koraci, API kompatibilnost, manual apply i rollback putanja.}

## Sljedeći paket

**W{NEXT} — `{NEXT-FINDING-ID}` ({severity}):** {sljedeći acceptance cilj}. Nije započet prije zelenog gatea za ovaj paket.
```

## Pravila kvaliteta izvještaja

- CI run ID/SHA mora odgovarati tačno kodu koji se navodi kao testan; docs-only closeout commit može imati zaseban SHA.
- `skipped` nije `passed`; navesti ga eksplicitno uz razlog iz workflowa.
- „Nema migracije” izričito napisati čak i kada je verzijska kolona već postojala.
- Ne zatvarati grupu nalaza samo zato što dijele fajl ili feature; svaki ID traži svoj acceptance.
- Ako API contract postaje strožiji, navesti koji klijenti su ažurirani i kakav request sada zahtijeva verziju/token.
