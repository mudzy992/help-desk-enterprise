# Status servisa: incident ili zakazani prekid?

Paket 2.7 · važi od verzije s modulom `status-page` (commit 1cb86d6 i dalje).

Sistem ima dvije opcije koje na prvi pogled liče, ali služe za različite situacije.

## Ukratko

- **Znate unaprijed** → **Usluge → (usluga) → Zakaži prekid**.
- **Desilo se neočekivano** → **Status servisa → Novi incident**.

## Poređenje

| | **Zakaži prekid** (Usluge) | **Incident** (Status servisa) |
|---|---|---|
| Situacija | **Planirano** (npr. održavanje u subotu od 22 do 24 h) | **Neplanirano**: nešto se pokvarilo sada |
| Vrijeme | Poznati su i početak i kraj | Početak je poznat, a kraj tek kad se riješi |
| Tok | Nema toka: prekid sam počne i sam završi | Istražujemo → Uzrok utvrđen → Pratimo → Riješeno, s porukom na svakom koraku |
| Tiketi | Ne povezuje se s tiketima | Prijave istog problema se povezuju s incidentom |
| Obavijesti | Nema | „Obavijesti me“ (pretplata) i opciona obavijest korisnicima s otvorenim tiketima; pri rješenju obavijest pretplaćenima i podnosiocima povezanih tiketa (u aplikaciji, bez e-maila) |
| Dostupnost (%) | Ne umanjuje procenat | Incident s uticajem „Prekid rada“ umanjuje procenat |
| Ko upravlja | Nosilac prava za katalog usluga | Permisija `status.incidents.manage` (zadano ADMIN, SUPER_ADMIN) |

## Kako rade zajedno

- Zakazani prekid u narednih 14 dana prikazuje se na **Status servisa** u odjeljku **Planirano održavanje**.
- Dok zakazani prekid traje, usluga se prikazuje kao **Održavanje**. To važi ako je u postavkama uključeno
  automatsko postavljanje statusa održavanja.
- Otvoren incident privremeno pogoršava prikazano stanje usluge u katalogu i na „Novi tiket“. Ručno
  postavljeno stanje usluge se pri tome ne mijenja; kad se incident riješi, vraća se ono što je bilo.
- Ni jedno ni drugo ne blokira prijavu tiketa: korisnik vidi upozorenje („Poznat problem“ ili „Planirani
  prekid“) i svejedno može poslati tiket.

## Posebni slučaj: incident s uticajem „Održavanje“

Incident ima i uticaj **Održavanje**. On je namijenjen **hitnom, nenajavljenom** održavanju, npr. „moramo
odmah restartati server“. Sve što se može najaviti unaprijed ide kroz **Zakaži prekid**, jer:

- korisnici ga vide unaprijed u „Planirano održavanje“;
- ne treba ga ručno zatvarati;
- ne ulazi u historiju incidenata.

## Vidljivost incidenta

- **Svi korisnici**: vidljiv na Status servisa, u katalogu, na „Novi tiket“ i na tiketu kao „Poznat problem“.
- **Samo osoblje**: vide ga samo agenti i administratori. Korisnici ga ne vide, ne dobijaju obavijesti,
  a ne utiče ni na prikaz usluge u katalogu.
