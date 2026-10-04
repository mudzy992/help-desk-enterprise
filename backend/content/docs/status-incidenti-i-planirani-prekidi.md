# Status servisa: incident ili zakazani prekid?

> Paket 2.7 · važi od verzije s modulom `status-page` (commit 1cb86d6 i dalje).

## Čemu služi ovaj modul

Sistem ima dvije opcije koje na prvi pogled liče, ali služe za različite situacije.

- **Znate unaprijed** → **Usluge → (usluga) → Zakaži prekid**.
- **Desilo se neočekivano** → **Status servisa → Novi incident**.

## Kome je namijenjen

- **Svim korisnicima** — vide status usluga, planirano održavanje i javne incidente; mogu se pretplatiti
  („Obavijesti me“) i dobiti obavijest kad se incident riješi.
- **Noslocu prava za katalog usluga** — zakazuje prekide.
- **Osoblju s permisijom `status.incidents.manage`** (zadano ADMIN, SUPER_ADMIN) — upravlja incidentima.
- **Osoblju** — vidi i incidente označene kao „samo osoblje“, koje korisnici ne vide.

## Kako doći

- **Zakaži prekid:** **Usluge → (usluga) → Zakaži prekid**.
- **Novi incident:** **Status servisa → Novi incident**.
- **Planirano održavanje:** **Status servisa** → odjeljak **Planirano održavanje** (prikazuje zakazane prekide
  u narednih 14 dana).

## Korak po korak

### Kako rade zajedno

- Zakazani prekid u narednih 14 dana prikazuje se na **Status servisa** u odjeljku **Planirano održavanje**.
- Dok zakazani prekid traje, usluga se prikazuje kao **Održavanje**. To važi ako je u postavkama uključeno
  automatsko postavljanje statusa održavanja.
- Otvoren incident privremeno pogoršava prikazano stanje usluge u katalogu i na „Novi tiket“. Ručno
  postavljeno stanje usluge se pri tome ne mijenja; kad se incident riješi, vraća se ono što je bilo.
- Ni jedno ni drugo ne blokira prijavu tiketa: korisnik vidi upozorenje („Poznat problem“ ili „Planirani
  prekid“) i svejedno može poslati tiket.

### Posebni slučaj: incident s uticajem „Održavanje“

Incident ima i uticaj **Održavanje**. On je namijenjen **hitnom, nenajavljenom** održavanju, npr. „moramo
odmah restartati server“. Sve što se može najaviti unaprijed ide kroz **Zakaži prekid**, jer:

- korisnici ga vide unaprijed u „Planirano održavanje“;
- ne treba ga ručno zatvarati;
- ne ulazi u historiju incidenata.

## Polja, validacije i statusi

| | **Zakaži prekid** (Usluge) | **Incident** (Status servisa) |
|---|---|---|
| Situacija | **Planirano** (npr. održavanje u subotu od 22 do 24 h) | **Neplanirano**: nešto se pokvarilo sada |
| Vrijeme | Poznati su i početak i kraj | Početak je poznat, a kraj tek kad se riješi |
| Tok | Nema toka: prekid sam počne i sam završi | Istražujemo → Uzrok utvrđen → Pratimo → Riješeno, s porukom na svakom koraku |
| Tiketi | Ne povezuje se s tiketima | Prijave istog problema se povezuju s incidentom |
| Obavijesti | Nema | „Obavijesti me“ (pretplata) i opciona obavijest korisnicima s otvorenim tiketima; pri rješenju obavijest pretplaćenima i podnosiocima povezanih tiketa (u aplikaciji, bez e-maila) |
| Dostupnost (%) | Ne umanjuje procenat | Incident s uticajem „Prekid rada“ umanjuje procenat |
| Ko upravlja | Nosilac prava za katalog usluga | Permisija `status.incidents.manage` (zadano ADMIN, SUPER_ADMIN) |

### Vidljivost incidenta

- **Svi korisnici**: vidljiv na Status servisa, u katalogu, na „Novi tiket“ i na tiketu kao „Poznat problem“.
- **Samo osoblje**: vide ga samo agenti i administratori. Korisnici ga ne vide, ne dobijaju obavijesti,
  a ne utiče ni na prikaz usluge u katalogu.

## Česta pitanja i greške

- **„Zakazali smo održavanje za subotu — da li to ide kao incident?“** — Ne. Ako se zna unaprijed, ide kroz
  **Zakaži prekid** (vidi tabelu iznad).
- **„Zašto incident s uticajem ‚Održavanje‘ nije u historiji incidenata?“** — Zato što je namijenjen hitnom,
  nenajavljenom održavanju; sve što se može najaviti ide kroz **Zakaži prekid**.
- **„Zašto je usluga prikazana kao Održavanje iako nisam mijenjao status?“** — Dok traje zakazani prekid,
  usluga se prikazuje kao **Održavanje** ako je u postavkama uključeno automatsko postavljanje statusa
  održavanja.
- **„Da li incident mijenja moje ručno postavljeno stanje usluge?“** — Ne; otvoren incident privremeno
  pogoršava prikazano stanje, a kad se riješi vraća se ono što je bilo.
- **„Korisnici prijavljuju tikete i pored prikazanog prekida.“** — Tako je i predviđeno: prekid ne blokira
  prijavu, korisnik vidi upozorenje i svejedno može poslati tiket.
- **„Korisnik ne vidi incident.“** — Incident je označen kao **samo osoblje**; takav incident korisnici ne
  vide, ne dobijaju obavijesti i ne utiče na prikaz usluge u katalogu.

## Poznata ograničenja

- **Obavijesti o incidentu su samo u aplikaciji** (pretplata „Obavijesti me“ i obavijest podnosiocima
  povezanih tiketa pri rješenju) — **bez e-maila**.
- **Dostupnost (%) umanjuje samo incident s uticajem „Prekid rada“**; zakazani prekid ne umanjuje procenat.
- **Zakazani prekid se ne povezuje s tiketima** i nema svoj tok — sam počne i sam završi.
- **Automatsko postavljanje statusa održavanja** zavisi od postavke; ako je isključeno, usluga se ne prikazuje
  kao **Održavanje** dok prekid traje.
- **Prikaz „Planirano održavanje“ pokriva narednih 14 dana.**

## Povezani moduli

- Katalog usluga i forme (usluge, dostupnost, zakazani prekidi): `katalog-usluga-i-forme.md`
- Tiketi (upozorenje „Poznat problem“, povezivanje prijava s incidentom): `tiketi.md`
- Problemi (incident kao posljedica problema): `problemi.md`
- Promjene (promjena koja „uzrokuje prekid servisa“ automatski stvara planirani prekid): `promjene.md`
- Teze: **T1**
- Dizajn paketa: `docs/plans/modules/2.7-pouzdanost-i-monitoring.md`
