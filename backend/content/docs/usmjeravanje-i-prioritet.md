# Usmjeravanje i prioritet

> **Namjena:** usmjeravanje (rutanje) odlučuje **kojoj grupi** ide novi tiket, na osnovu para
> *(organizacijska jedinica porijekla + usluga)*. Prioritet se izvodi iz matrice **uticaj × hitnost**, a agent ili
> admin ga može ručno promijeniti uz obavezan razlog. Oba ekrana su u sekciji **Administracija**.

## Čemu služi ovaj modul

- **Pravilo usmjeravanja** povezuje par (origin OU + usluga) s **ciljnom grupom**. Ako za par ne postoji pravilo,
  sistem traži pravilo na **roditeljskim** jedinicama (fallback), a ako ga nema nigdje, tiket ide u
  **neusmjereni red** ili u unaprijed podešenu ciljnu grupu.
- **Tiket se nikad ne dodjeljuje agentu automatski rutanjem** — rutanje određuje samo grupu; agent preuzima tiket
  iz grupnog inboxa.
- **Matrica pokrivanja** pokazuje gdje postoje rupe: za svaku kombinaciju (usluga × OU) piše je li pravilo
  tačno, naslijeđeno ili neusmjereno.
- **Test rezolucije** pušta isti motor odlučivanja bez kreiranja tiketa — služi za provjeru „gdje bi ovaj tiket
  otišao“.
- **Korak pregleda pri kreiranju tiketa** sam pokazuje ishod rutanja: ciljnu grupu, dubinu fallbacka i SLA profil
  (ili poruku da tiket ide u neusmjereni red), koristeći isti motor kao i samo kreiranje.
- **Prioritet** se računa iz matrice uticaj × hitnost; ručna promjena je izuzetak koji se auditira i pomjera SLA
  rokove.

## Kome je namijenjen

| Rola | Šta može |
|---|---|
| **Korisnik** | Nema pristup ekranima **Usmjeravanje** i **SLA**; vidi samo sopstvene tikete i njihov prioritet. |
| **Agent** | Vidi prioritet i oznaku „bez pravila rutiranja“ na tiketu; ne mijenja pravila. Smije promijeniti prioritet samo ako ima permisiju za to (dugme **Promijeni prioritet**). |
| **ADMIN** | **Usmjeravanje** (pravila, matrica pokrivanja, test rezolucije, change log) uz permisiju `routing.write`; matrica prioriteta na ekranu **SLA** uz `sla.write`. |
| **SUPER_ADMIN** | Sve navedeno, uključujući slučajeve kad je modul zaključan režimom samo za čitanje. |

## Kako doći

1. **Usmjeravanje:** sekcija **Administracija** → **Usmjeravanje** (ruta `/routing`).
2. **Matrica prioriteta:** sekcija **Administracija** → **SLA** → panel **Matrica prioriteta**.
3. **Ručna promjena prioriteta tiketa:** detalj tiketa → panel **Promjena prioriteta** (dugme **Promijeni
   prioritet**).
4. **Neusmjereni tiketi:** **Grupni inbox** → tab **Neusmjereni red**, ili filter **Nerutirani preko roka** u listi
   tiketa, ili bedž u detalju tiketa.

## Korak po korak

### 1. Novo pravilo usmjeravanja

1. Otvorite **Usmjeravanje** → tab **Pravila** → dugme **Novo pravilo**.
2. Popunite **Origin organizacijska jedinica**, **Servis** i **Ciljna grupa**.
3. Upišite **Razlog izmjene** (obavezno) i kliknite **Spremi pravilo**.
4. Ako za isti par (OU + servis) pravilo već postoji, unos se odbija porukom **„Pravilo za ovu kombinaciju OU i
   servisa već postoji.“**. U formi se to najavljuje unaprijed (upozorenje o duplikatu).

### 2. Izmjena i brisanje pravila

1. U tabeli pravila kliknite **Uredi** (ili **Obriši**).
2. **Uredi:** promijenite **Ciljnu grupu**, upišite razlog i kliknite **Spremi izmjenu**.
3. **Obriši:** otvara se potvrda **„Obrisati ovo routing pravilo?“** s prikazom šta se mijenja — *prije → poslije*
   i nova grupa. Potvrdite dugmetom **Potvrdi brisanje** (**Odustani** prekida).
4. Svaka uspješna izmjena ide u **Change log** s akterom, razlogom i before/after diff-om rezolucije.

### 3. Matrica pokrivanja

1. Tab **Matrica pokrivanja** prikazuje sve kombinacije **usluga × OU** sa oznakama **E** (tačno pravilo),
   **N** (naslijeđeno) i **×** (neusmjereno).
2. Iznad tabele stoji statistika: koliko je ćelija tačno, koliko naslijeđeno i koliko neusmjereno.
3. Klik na ćeliju otvara detalje: koji je ishod (**Tačno**, **Naslijeđeno**, **UNROUTED**), koja je grupa, koja je
   putanja fallbacka i kolika je dubina fallbacka.
4. Iz praznog stanja ili prečice možete odmah kreirati pravilo za odabranu kombinaciju.

### 4. Test rezolucije

1. Tab **Test rezolucije** → izaberite **origin OU** i **servis** → pokrenite provjeru.
2. Prikazuje se **RoutingResolution**: ishod, grupa (ili **„Bez grupe — neusmjereni red“**), dubina i putanja
   fallbacka.
3. Isti ulaz uvijek daje isti ishod; test **ne** kreira tiket i **ne** dodjeljuje agenta.

### 5. Matrica prioriteta (ekran SLA)

1. Otvorite **Administracija → SLA → Matrica prioriteta**.
2. Za svaku ćeliju **Uticaj × Hitnost** izaberite prioritet (**Nizak**, **Srednji**, **Visok**, **Kritičan**).
3. Upišite **Razlog izmjene matrice** i kliknite **Sačuvaj matricu** — upisuju se samo izmijenjene ćelije, izmjena
   ide u change log.
4. Prekidačem **`private.ticket.priorityMatrix.enabled`** (**Administracija → Postavke**, kategorija
   **Privatno: Tiketi**) isključujete čitanje matrice: prioritet se tada računa ugrađenom formulom (zbir težina
   uticaja i hitnosti). Ćelije ostaju sačuvane i važe čim prekidač ponovo uključite.

### 6. Ručna promjena prioriteta tiketa

1. U detalju tiketa otvorite **Promjena prioriteta**.
2. Izaberite **Novi prioritet** i upišite **Razlog** (**„Zašto se prioritet mijenja?“**), pa kliknite
   **Sačuvaj prioritet**.
3. Dugme **Vrati na matricu** poništava ručnu vrijednost i vraća prioritet iz matrice.
4. Nakon promjene, tiket nosi oznaku **ručno**, a SLA rokovi se preračunavaju prema novom prioritetu (napomena u
   panelu).

## Polja, validacije i statusi

### Pravilo usmjeravanja

| Polje | Pravilo |
|---|---|
| Origin OU | obavezno; mora postojati |
| Servis | obavezno; mora postojati |
| Ciljna grupa | obavezno; mora postojati |
| Razlog izmjene | obavezan (do 512 znakova) — ide u ChangeLog |
| Jedinstvenost | jedan par (OU + servis) može imati samo jedno pravilo |

### Ishod rutanja

| Ishod | Znači |
|---|---|
| **Tačno** (`EXACT`) | pravilo postoji za samu OU porijekla |
| **Naslijeđeno** (`PARENT_FALLBACK`) | pravilo je nađeno na roditeljskoj jedinici |
| **UNROUTED** | nema pravila nigdje u lancu — tiket ide u neusmjereni red ili u ciljnu grupu |

### Prioritet

| Element | Vrijednost |
|---|---|
| Ose | **Uticaj** i **Hitnost**: Nizak, Srednji, Visok, Kritičan |
| Izlaz | **Nizak**, **Srednji**, **Visok**, **Kritičan** |
| Formula (kad ćelija nije podešena) | zbir rangova: ≤2 Nizak, ≤4 Srednji, ≤6 Visok, inače Kritičan |
| Ručna promjena | obavezan razlog; tiket dobija oznaku **ručno**; preračun SLA rokova |
| Povratak | dugme **Vrati na matricu** |

### Statusi tiketa vezani za rutanje

| Status / oznaka | Znači |
|---|---|
| `UNROUTED` | nema grupe — tiket čeka u neusmjerenom redu |
| `routedByUnroutedFallback` + status `PENDING` | nije bilo pravila, ali je tiket poslan u podešenu **ciljnu grupu** |
| **Bez pravila rutiranja** (bedž) | tiket je nastao bez pronađenog pravila |
| **Nerutirani preko roka** | tiket bez pravila duže od podešenog roka (postavka **Unrouted cleanup hours**) |

## Česta pitanja i greške

- **„Nemate dozvolu za izmjenu usmjeravanja.“** — nedostaje permisija `routing.write`; ekrani su vidljivi samo
  administratorima.
- **„Razlog izmjene je obavezan.“** — svaka izmjena (i brisanje) pravila traži razlog.
- **„Pravilo za ovu kombinaciju OU i servisa već postoji.“** — izmijenite postojeće pravilo umjesto novog unosa.
- **„Usmjeravanje trenutno nije dostupno.“** — postavke rutanja nisu ispravne (npr. neispravna vrijednost u
  postavkama); javite administratoru.
- **„Tiket je završio u neusmjerenom redu, zašto?“** — za taj par (origin OU + usluga), uključujući roditeljske
  jedinice, ne postoji nijedno pravilo.
- **„Tiket nije u tabu Neusmjereni red, a nema pravilo.“** — ako je podešena **ciljna grupa** za neusmjerene
  tikete, tiket dobija status `PENDING` u toj grupi (oznaka **Bez pravila rutiranja**) i tada se prati kroz filter
  **Nerutirani preko roka** i upozorenja, a ne kroz tab **Neusmjereni red**.
- **„Ne mogu promijeniti prioritet.“** — potrebna je permisija za ručnu promjenu prioriteta i tiket mora biti u
  izmjenjivom stanju (npr. nije spojen kao podređeni tiket).
- **„Prioritet se sam promijenio.“** — ako tiket nije ručno postavljen, prioritet prati matricu; matrica se
  primjenjuje kad se promijeni **uticaj** ili **hitnost**.

## Poznata ograničenja

- **Matrica pokrivanja prikazuje i neaktivne usluge** (nacrte i ukinute) i učitava **sve** kombinacije OU × usluga
  bez filtera i paginacije. (Nalaz B1 iz §M7.)
- **Dvije definicije „neusmjerenog“:** brojač `unrouted` broji samo status `UNROUTED`, dok upozorenja i filter
  **Nerutirani preko roka** uključuju i tikete preusmjerene u ciljnu grupu. (Nalaz B4.)
- **Matrica prioriteta nema ose iz RAW-a**: kolone su **Uticaj** i **Hitnost**, a vrijednosti Nizak–Kritičan
  (RAW je predviđao `self/team/unit/company` i `low/medium/high`). Prekidač za isključivanje matrice postoji
  (`private.ticket.priorityMatrix.enabled`, vidi §5). (Nalaz B5 — ose ostaju dokumentovano odstupanje.)
- **Ekrani za čitanje rutanja** (matrica, test, pravila, change log) traže samo administratorsku rolu, bez
  posebne permisije za čitanje. (Nalaz B6.)
- **Prvo otvaranje matrice prioriteta upisuje nedostajuće ćelije** u bazu ako matrica još nije popunjena.
  (Nalaz B9.)

## Povezani moduli

- **Katalog usluga i forme** — usluga je jedan ulaz u pravilo; onboarding čarobnjak predlaže referencu rutanja.
- **Tiketi** — kreiranje, grupni inbox, neusmjereni red, prioritet i SLA rokovi.
- **SLA** — matrica prioriteta, SLA profili i preračun rokova pri promjeni prioriteta.
- **Uloge i permisije** — `routing.write`, `sla.write` i pravo na ručnu promjenu prioriteta.
- **Verzije konfiguracije** — rutanje i matrica prioriteta ulaze u snapshot i validiraju se prije aktivacije.
- **Uloge, OJ i grupe** — ciljna grupa i origin jedinica dolaze iz ovih ekrana.

---

*Ažurirano: 2026-10-03 · Modul: Usmjeravanje i prioritet (M7)*
