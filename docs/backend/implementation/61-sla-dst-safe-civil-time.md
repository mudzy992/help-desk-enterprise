# W5.34 — DST-safe SLA civil-time deadline engine

**Finding:** `BA-sla-04`  
**Implementacija:** `1b1749b`  
**CI:** `40557025171` — zelen

## Problem

Prethodna konverzija lokalnog civilnog vremena u instant koristila je jednu offset aproksimaciju. U DST gapu traženo vrijeme ne postoji, a u foldu postoje dva instanta; bez round-trip provjere rezultat je mogao pasti na pogrešan dan, dati deadline prije starta ili preskočiti cijelu sedmicu.

## Implementacija

Civil-time resolver sada iz IANA/`Intl` podataka prikuplja offsete na obje strane tranzicije, generiše sve moguće instante i svaki kandidat potvrđuje round-tripom nazad u isti timezone i isti civilni minut.

Eksplicitna disambiguation politika je:

- **fold:** bira se raniji od dva validna instanta;
- **gap:** napreduje se do prvog reprezentabilnog civilnog minuta;
- ako se vrijeme ne može razriješiti unutar fail-closed limita od 24 sata, baca se `RangeError` umjesto tihog pogrešnog deadlinea.

`addBusinessMinutes` i `countBusinessMinutes` sada računaju stvarno protekle minute dok je lokalni poslovni interval otvoren. Time nonexistent gap minute nisu lažno obračunate, dok se obje stvarne fold pojave računaju u skladu sa otvorenim intervalom. `add` i `count` zato ostaju međusobno reverzibilni kroz offset tranzicije.

## Test matrica

Direktno su pokriveni gap i fold za:

- `Europe/Sarajevo` — standardna jednosatna EU tranzicija;
- `America/New_York` — druga pravila i datumi tranzicije;
- `Australia/Lord_Howe` — netrivijalna tranzicija od 30 minuta.

Matrica provjerava tačan instant i civilni round-trip za nonexistent/ambiguous vremena te deadline monotonicity i `count(start, add(start, n)) = n` za intervale 1, 15, 30, 60, 90 i 120 minuta preko svih šest tranzicija.

## Validacija

- fokusirana civil-time i add/count kolekcija: **18/18**;
- backend ESLint — zelen;
- CI `40557025171` — potpuno zelen: generated Prisma/build, svi backend testovi, PostgreSQL/Redis integracije, frontend, docs, container/supply-chain i završni gate.

## Migracije i release

Nema nove biblioteke, DB migracije niti ručne release DB radnje. Engine koristi runtime IANA timezone podatke kroz standardni `Intl` API.

## Ishod

SLA deadline više ne može nastati iz neprovjerene jednokratne offset aproksimacije; gap/fold ponašanje je eksplicitno, monotono i izvršivo dokazano. `BA-sla-04` je zatvoren; registar prelazi na **622 otvorena / 70 zatvorenih / 692 ukupno**.
