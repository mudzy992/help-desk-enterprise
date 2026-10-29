# Jedinstveni standard audita backenda

**Status:** aktuelno  
**Verzija:** 1.0  
**Datum:** 2026-10-22  
**Opseg:** kompletan `backend/`, uključujući cross-layer ugovore, Prisma shemu, workere, integracije i operativne zavisnosti

## 1. Svrha i pravila rada

Ovaj standard zaključava isti postupak za svaki backend modul. Audit i implementacija su odvojene aktivnosti: tokom audit ciklusa dokumentuju se nalazi i fazni planovi, ali se proizvodni kod ne mijenja osim ako je potrebna bezopasna audit automatizacija. Implementacija počinje tek nakon što je kompletan audit odobren.

Obavezna pravila:

1. svaka tvrdnja mora imati putanju, simbol, test ili izlaz komande kao dokaz;
2. aktuelni kod je izvor istine; stari planovi služe samo kao kontekst;
3. odsustvo testa nije automatski kvar, ali kritična nedokazana grana jeste nalaz;
4. kompajliranje bez generisanog Prisma klijenta ne proglašava se zelenim;
5. production i full-tree dependency audit vode se odvojeno;
6. lokalni, integracijski i zvanični CI dokaz ne smiju se međusobno zamijeniti;
7. audit ne mijenja ponašanje sistema i ne „popravlja usput“;
8. svaki nalaz mora biti jedinstveno označen kao `BA-<modul>-NN`;
9. duplicirani cross-module nalaz ima jednog primarnog ownera, a ostali moduli ga referenciraju;
10. ocjena se računa tek nakon popisa svih nalaza modula.

## 2. Jedinica audita

Jedna audit jedinica je tačno jedan direktorij `backend/src/modules/<modul>`. Za svaki modul obavezno se pregledaju i pripadajuće površine izvan direktorija:

- registracija u root/Nest modulima i bootstrapu;
- Prisma modeli, enum-i, indeksi i migracije;
- `src/common/**`, worker i CLI pozivi koje modul koristi;
- frontend API klijent/parser i javni DTO ugovor;
- E2E specifikacije i operativna dokumentacija;
- konfiguracija, environment varijable, queue/cron i vanjske integracije.

Dijeljena infrastruktura iz `src/common/**`, `src/cli/**`, `main.ts`, `worker.ts`, Prisma konfiguracije i globalnih guardova vodi se kao posebna završna **cross-cutting** audit jedinica nakon modula, ali se relevantan rizik odmah bilježi i u pogođenom modulu.

## 3. Obavezni audit presjeci

### A. Granice i arhitektura — 10%

- javna odgovornost modula i zavisnosti;
- ciklične ili skrivene cross-module veze;
- controller/service/repository razdvajanje;
- veličina, kohezija i mrtvi kod;
- korištenje zajedničkih infrastrukturnih ugovora.

### B. API i ugovori — 12%

- rute, metode, statusi, DTO validacija i response mapping;
- stabilnost javnih polja, nullability i enum vrijednosti;
- paginacija, filteri, sortiranje, limit i maksimalne veličine;
- error code/status ugovor;
- shared fixture ili consumer/parser dokaz za kritične odgovore.

### C. Autentikacija, autorizacija i scope — 15%

- autentikacijski i permission guardovi;
- ownership, organizational-unit i tenant scope;
- horizontalni/vertikalni privilege escalation;
- servisni, javni, webhook i worker entrypointi;
- fail-closed ponašanje i negativni testovi.

### D. Poslovna pravila i stanje — 13%

- invarijante i statusne tranzicije;
- optimistic locking i konkurentne izmjene;
- idempotentnost, replay i dupli zahtjevi;
- rubni slučajevi, vremenske zone i granice;
- dosljednost bulk i pojedinačnih operacija.

### E. Podaci, Prisma i transakcije — 13%

- model, relacije, unique/check ograničenja i indeksi;
- transakcijske granice i parcijalni zapis;
- cascade/restrict/set-null semantika;
- migracije, backfill, rollback i kompatibilnost;
- N+1, neograničeni upiti i količina odabranih podataka.

### F. Sigurnost i privatnost — 12%

- validacija i injection/SSRF/path traversal rizici;
- tajne, tokeni, enkripcija i redakcija logova;
- upload/download i content-type/size granice;
- audit trag za privilegovane i destruktivne radnje;
- retention, legal hold, DSAR i anonimizacija gdje su primjenjivi.

### G. Asinhrono i integracije — 8%

- queue/cron/worker ownership;
- retry, timeout, backoff, dedupe i dead-letter ponašanje;
- redoslijed događaja i at-least-once posljedice;
- vanjski API failure modes i circuit/fallback ponašanje;
- recovery nakon restarta.

### H. Testovi i dokazivost — 10%

- unit, service, controller, contract i integracijski testovi;
- pozitivne, negativne, scope i race grane;
- determinističnost, izolacija i kvalitet fixturea;
- relevantni E2E tokovi;
- nedokazane kritične grane.

### I. Operativnost i performanse — 7%

- strukturirani logovi, metrike, health i alarmi;
- bounded rad, query plan rizik i memorija;
- timeouti, rate limit i abuse granice;
- konfiguracijska validacija i siguran default;
- runbook/recovery dokaz.

## 4. Ozbiljnost nalaza

| Nivo | Značenje                                                             | Primjeri                                                                 | Pravilo implementacije                   |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| P0   | neposredna kompromitacija, gubitak podataka ili potpuna nedostupnost | auth bypass, cross-tenant čitanje, destruktivna migracija                | prekid audita tog toka i hitna izolacija |
| P1   | visok proizvodni rizik bez sigurnog workarounda                      | pogrešna autorizacija, nekonzistentna transakcija, trajni gubitak poruke | prva implementacijska faza               |
| P2   | srednji rizik, ograničen kvar ili važan dokazni nedostatak           | nedostajući limit, slab race test, N+1 na rastućoj listi                 | planirana korektivna faza                |
| P3   | nizak rizik, održavanje ili poboljšanje                              | kohezija, observability rupa, mali testni dug                            | završno poliranje/backlog                |
| OBS  | zapažanje bez korektivne obaveze                                     | prihvatljiv trade-off ili potvrđeno dobro stanje                         | ne utiče na ocjenu                       |

Svaki nalaz mora sadržati: ID, naslov, severity, status, pogođene putanje/simbole, reprodukciju ili statički dokaz, uticaj, root cause, preporučenu korekciju, test prihvata, zavisnosti, ownera i procjenu veličine (`S/M/L/XL`).

## 5. Ocjenjivanje

Svaki presjek dobija 0–10 sa dvije decimale, a ukupna ocjena je ponderisana tabela iz §3. Kazne moraju biti vezane za nalaze:

- otvoren P0: maksimalna ukupna ocjena 5,00;
- otvoren P1: maksimalno 7,49;
- otvoren P2 bez prihvaćenog plana: maksimalno 8,99;
- ocjena 9,50+ traži zelene ciljane testove i nema otvoren P0/P1;
- ocjena 9,90+ traži zatvorene sve korektivne nalaze ili formalne owner exceptione, čist production dependency audit za modul i potpuni traceability;
- 10/10 traži nula otvorenih nalaza/izuzetaka i zvanični CI/integracijski dokaz na finalnom SHA.

Ocjena prije implementacije označava se **audit baseline**. Poslije implementacije računa se nova ocjena iz novih dokaza; ne prenosi se administrativno.

## 6. Obavezni postupak po modulu

1. **Scope snapshot:** popis produkcijskih/testnih fajlova, entrypointa, Prisma površine i zavisnosti.
2. **Static map:** controller rute, DTO-i, guardovi, servisi, jobovi i događaji.
3. **Contract review:** uporediti backend mapper/DTO sa consumerima i fixtureima.
4. **Security review:** permission/scope matrica i negativne putanje.
5. **Data review:** schema, migracije, indeksi, transakcije i query boundedness.
6. **Business review:** invarijante, stanje, konkurencija i idempotentnost.
7. **Async/ops review:** worker, queue, cron, retry, metrike i recovery.
8. **Test execution:** najprije ciljani, zatim relevantni širi suite; zabilježiti environment blokade.
9. **Findings:** deduplikovati, klasifikovati i povezati svaki nalaz sa dokazom.
10. **Score:** popuniti ponderisanu tabelu i obrazloženje.
11. **Phase plan:** grupisati korekcije po zavisnostima i riziku, bez implementacije.
12. **Quality gate:** Markdown/link/traceability provjera i review zaključka.

## 7. Minimalne komande dokaza

Komande se prilagođavaju modulu, ali izvještaj mora zabilježiti tačan poziv i rezultat:

```bash
cd backend
npm ci
npm run lint
npx jest --runInBand <module paths/patterns>
npm audit --omit=dev
npm audit
DATABASE_URL=<audit database> npm run db:generate
npm run build
```

Ako audit baza nije dostupna, generator/build se bilježe kao **environment-blocked**, nikad kao pass. Nije dozvoljeno unositi stvarne tajne ili produkcijske konekcije u dokumentaciju.

## 8. Faze popravki

Fazni plan modula koristi ovaj redoslijed, preskačući prazne faze:

- **Faza 0 — reprodukcija i safety net:** fixture/test koji dokazuje nalaz;
- **Faza 1 — P0/P1 sigurnost i integritet:** najmanji siguran korektivni rez;
- **Faza 2 — ugovori i poslovna pravila:** API, mapper, validacija, stanje;
- **Faza 3 — podaci i konkurencija:** schema, migracije, transakcije, indeksi;
- **Faza 4 — async/integracije:** retry, idempotentnost, queue/cron;
- **Faza 5 — testovi, observability i performanse:** dokazivost i operativnost;
- **Faza 6 — dokumentacija i finalni gate:** regression suite, audit preračun i changelog.

Svaka faza navodi ulazne nalaze, tačne fajlove/odgovornosti, migracijski rizik, testove, rollback i acceptance kriterije. Implementacijski commitovi se određuju tek nakon odobrenja kompletnog audita.

## 9. Struktura izlaznog dokumenta

Svaki `docs/backend/audits/<redni-broj>-<modul>.md` mora imati:

1. status i metadata;
2. executive summary;
3. scope i inventar;
4. arhitekturu i tok podataka;
5. API/permission matricu;
6. Prisma/transakcijsku analizu;
7. async/integracijsku analizu;
8. testnu matricu i izvršene komande;
9. pozitivne nalaze;
10. tabelu BA nalaza;
11. detalj svakog nalaza;
12. ponderisanu score tabelu;
13. fazni plan popravki;
14. rizike implementacije/rollback;
15. acceptance i traceability matricu;
16. konačnu audit presudu.

Statusi dokumenta su: `nije započeto`, `u auditu`, `audit završen`, `implementacija u toku`, `zatvoreno`. Samo registar inventara određuje trenutno aktivni modul.
