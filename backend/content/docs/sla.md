# SLA (rokovi, kalendari i eskalacije)

> **Namjena:** SLA modul mjeri **rok za prvi odgovor** i **rok za rješenje** svakog tiketa — u radnom vremenu
> (BH kalendar), a ne u „zidnom“ vremenu. Administrator ovdje definiše kalendare, profile, pravila po
> prioritetu i eskalacije; agent na tiketu vidi koliko je vremena ostalo i da li je tiket pod rizikom.

## Čemu služi ovaj modul

- **Rokovi (SLA tajmeri):** za svaki tiket na koji se primjenjuje profil, sistem računa dva roka — *prvi
  odgovor* i *rješenje* — **u minutama radnog vremena** iz odabranog kalendara.
- **Kalendari radnog vremena (BH kalendari):** vremenska zona, radni intervali po danu i **neradni dani
  (praznici)**. Dok je kalendar zatvoren, satovi ne troše vrijeme.
- **Profili i pravila:** pravilo veže *prioritet* (uz opciono *servis* i *organizacionu jedinicu*) na par
  brojeva minuta; profil je skup pravila sa jednim kalendarom.
- **Pauze:** dok je tiket **Čeka korisnika** ili **Čeka odobrenje**, satovi stoje (podešeno u postavkama).
- **Eskalacije:** nakon prekoračenja roka sistem obavještava metu iz pravila eskalacije i to bilježi u tiketu.
- **Usklađenost i nadzor:** procenat tiketa unutar rokova po profilu, plus trend na izvještajima i alarm ako
  pozadinski skener ne radi.

## Kome je namijenjen

| Rola | Šta može |
|---|---|
| **ADMIN / SUPER_ADMIN** | Otvara **SLA pravila**, kreira i mijenja kalendare, profile, pravila i eskalacije, uređuje **Matricu prioriteta** i vidi change log. Sve izmjene traže razlog. |
| **AGENT** | Vidi SLA tajmere na tiketu (rok, preostalo vrijeme, stanje) i listu prekoračenih tiketa; ne mijenja SLA konfiguraciju. |
| **Korisnik (naručilac)** | Vidi samo rok/stanje na svom tiketu ako mu je tiket dostupan; nema pristup administraciji. |

### Permisije i pristup

- Stranica je dostupna samo ako je otvorena **administratorska zona**; u suprotnom se prikazuje „Nema pristupa
  SLA“ („SLA profili, kalendari i pravila dostupni su administratorima.“).
- Svaka **izmjena** traži i permisiju **`sla.write`**; čitanje kalendara, profila i pravila traži samo
  administratorsku rolu.
- **Matrica prioriteta** je izuzetak kod čitanja: vidi je svaka prijavljena rola (koristi se pri kreiranju
  tiketa), a mijenja je admin sa `sla.write`.

## Kako doći

1. **SLA pravila:** lijevi meni → **SLA pravila** (ruta `/sla`). Stranica ima tri prikaza: **Profili**,
   **Kalendari** i detalj profila sa sekcijama **Pravila**, **Override pravila**, **Eskalacije**,
   **Usklađenost (30 dana)** i **Change log**.
2. **Kalendari:** dugme **Upravljaj kalendarima** (gore desno na listi profila).
3. **Matrica prioriteta:** dugme **Matrica prioriteta** (gore desno na listi profila).
4. **Na tiketu:** detalj tiketa → panel **SLA tajmeri**.
5. **Prekoračeni tiketi:** nadzorna ploča → lista prekoračenih tiketa (vodi na listu tiketa sa filterom
   „prekoračeno“).

## Korak po korak

### 1. Napravite BH kalendar

1. **SLA pravila** → **Upravljaj kalendarima** → **Novi kalendar**.
2. Popunite **Ključ** (npr. `BH_STANDARD`), **Naziv**, **Vremenska zona** (npr. `Europe/Sarajevo`) i **Radno
   vrijeme** po danima (ponedjeljak–nedjelja); po danu je dozvoljeno najviše **4 intervala**, a kraj može biti i
   `24:00`.
3. Po potrebi dodajte **Neradne dane**: **Naziv praznika** + datum → **Dodaj praznik**.
4. Upišite **Razlog izmjene** i kliknite **Spremi kalendar** (izmjena: **Ažuriraj kalendar**).
5. Kalendar možete deaktivirati prekidačem **Aktivan**; kalendar koji koristi neki profil se ne može obrisati.

### 2. Napravite SLA profil

1. **SLA pravila** → **Novi profil**.
2. Unesite **Ključ** (npr. `INCIDENT`), **Naziv**, opcioni **Opis** i odaberite **Kalendar**.
3. Upišite **Razlog izmjene** i kliknite **Spremi profil**.
4. U startnom setu već postoje profili **INCIDENT**, **ACCESS**, **STANDARD_REQUEST**, **FINANCE** i **HR** na
   kalendaru `BH_STANDARD` (Pon–Pet 08:00–16:00).

### 3. Dodajte pravila (ciljevi po prioritetu)

1. Otvorite profil u listi → sekcija **Pravila** („Ciljevi prvog odgovora i rješenja po prioritetu; promjene
   idu kroz change log s razlogom“).
2. Za svaki prioritet (**Kritičan**, **Visok**, **Srednji**, **Nizak**) unesite **Prvi odgovor (min)** i
   **Rješenje (min)**, opciono **Redoslijed** (manji se ocjenjuje prvi) i kliknite **Spremi pravilo**.
3. Ako želite pravilo za konkretan servis ili organizacionu jedinicu, u **Override pravila** dodajte
   **Uslov**: **Servis (opcionalno)** i/ili **OU (opcionalno)**; red bez odabira je **Default (svi servisi/OU)**.
4. Redoslijed odlučivanja: prvo se gleda **Redoslijed**, pa **specifičnost** (servis je specifičniji od OU), pa
   redoslijed zapisa. Zato jedan profil treba da ima **default pravilo za sva četiri prioriteta**, a override
   pravila samo tamo gdje odstupanje ima smisla.
5. Ako je u postavkama isključeno „servis može override SLA profil/pravila“ ili „OU može override SLA“, unos
   takvog pravila se odbija.

### 4. Podesite eskalacije

1. U detalju profila otvorite **Eskalacije** („Automatsko obavještavanje nakon prekoračenja SLA“) → **Novo
   pravilo eskalacije**.
2. Unesite **Trigger offset (min nakon breach-a)** — npr. `0`, `30`, `120`. Nivo se određuje automatski prema
   rastu offseta.
3. Odaberite **Tip targeta**: **Grupa**, **Rola** ili **Korisnik** (tačno jedan), ili uključite **Dežurni
   grupe** uz odabranu grupu.
4. Upišite **Razlog izmjene** i kliknite **Spremi eskalaciju** (izmjena: **Ažuriraj eskalaciju**).
5. Broj pravila po profilu ograničen je postavkom **maksimalnog broja nivoa eskalacije** (podrazumijevano 3).

### 5. Podesite matricu prioriteta

1. **SLA pravila** → **Matrica prioriteta**.
2. Za svaku kombinaciju **Uticaj × Hitnost** odaberite prioritet („Odaberite prioritet za svaku ćeliju uticaj
   × hitnost. Snimanje upisuje samo izmijenjene ćelije.“).
3. Upišite **Razlog izmjene matrice** i kliknite **Sačuvaj matricu**.

### 6. Šta se dešava na tiketu

1. Pri kreiranju tiketa, ako servis ima aktivan profil, pravilo za prioritet/servis/OU i aktivan kalendar,
   sistem postavlja **SLA tajmere** i računa rokove **od trenutka kreiranja**.
2. Panel **SLA tajmeri** prikazuje dva reda — **Prvi odgovor** i **Rješenje** — sa stanjem **U okviru**,
   **Pod rizikom** (kada je iskorišteno više od ~75% okvira ili je blizu roka) ili **Prekoračen**, uz zapis
   **rok:** i **za …** (preostalo) odnosno **prekoračeno …**.
3. **Prvi odgovor** se evidentira pri prvoj agentskoj reakciji ili prelasku tiketa u **U obradi**; **Rješenje**
   se zaustavlja kada tiket pređe u **Riješeno**, **Zatvoreno** ili **Arhivirano**.
4. Dok je tiket **Čeka korisnika** ili **Čeka odobrenje**, u panelu stoji oznaka **pauza** i satovi stoje; pri
   povratku u obradu rok se pomjera za preostalo radno vrijeme.
5. Ako tiket nema tajmere, panel to objašnjava (vidi *Polja, validacije i statusi* → razlozi „SLA nije
   primijenjen“).

### 7. Provjerite usklađenost

1. U detalju profila kartica **Usklađenost (30 dana)** prikazuje **Odgovor** i **Rješenje** kao procenat
   tiketa unutar ciljeva (ili **Nema uzorka** ako u zadnjih 30 dana nema zatvorenih tiketa sa SLA stanjem za
   taj profil).
2. Kartica **Trenutno izloženih** prikazuje broj otvorenih tiketa i koliko ih je **ugroženih**/**prekoračenih**
   po profilu i prioritetu.
3. Na nadzornoj ploči i u izvještajima koristi se prag usklađenosti iz postavki trendova (podrazumijevano 90%).

## Polja, validacije i statusi

### BH kalendar

| Polje | Pravilo |
|---|---|
| **Ključ** | Obavezno, jedinstveno, do 64 znaka |
| **Naziv** | Obavezno, do 120 znakova |
| **Vremenska zona** | Obavezna, mora biti ispravna IANA zona (npr. `Europe/Sarajevo`) |
| **Radno vrijeme** | Bar jedan interval u sedmici; najviše 4 intervala po danu; intervali se ne smiju preklapati; kraj može biti `24:00` |
| **Neradni dani** | Datum + naziv (do 120 znakova), jedinstven po kalendaru |
| **Aktivan** | Neaktivan kalendar ne pokreće nove tajmere |

### SLA profil

| Polje | Pravilo |
|---|---|
| **Ključ** | Obavezno, jedinstveno, do 64 znaka |
| **Naziv** | Obavezno, do 120 znakova |
| **Opis** | Opciono, do 2000 znakova |
| **Kalendar** | Obavezan; profil se ne može obrisati dok ga koristi servis ili paket politika |
| **Aktivan** | Neaktivan profil ne pokreće tajmere novim tiketima |

### SLA pravilo

| Polje | Pravilo |
|---|---|
| **Prioritet** | Jedan od četiri (Kritičan, Visok, Srednji, Nizak) |
| **Prvi odgovor (min)** / **Rješenje (min)** | Cijeli brojevi > 0, u minutama radnog vremena |
| **Redoslijed** | Cijeli broj (podrazumijevano 100); manji se ocjenjuje prvi |
| **Servis (opcionalno)** / **OU (opcionalno)** | Najviše jedan zapis za istu kombinaciju prioriteta i uslova; mora postojati; zabranjeno ako su override-i isključeni postavkom |
| **Razlog izmjene** | Obavezan za svaku izmjenu i brisanje |

### Eskalaciono pravilo

| Polje | Pravilo |
|---|---|
| **Trigger offset (min nakon breach-a)** | Cijeli broj ≥ 0; unutar profila mora biti jedinstven i strogo rastući |
| **Tip targeta** | Tačno jedan: **Grupa**, **Rola** ili **Korisnik** (meta mora postojati) |
| **Dežurni grupe** | Samo uz odabranu grupu; eskalacija tada ide osobi koja je dežurna u tom trenutku, a ako nikoga nema — cijeloj grupi |
| **Broj nivoa** | Ograničen postavkom **maksimalnog broja nivoa eskalacije** (podrazumijevano 3) |

### Matrica prioriteta

| Polje | Pravilo |
|---|---|
| **Uticaj × Hitnost** | Sve ćelije matrice; nedostajuće ćelije se dopunjuju zadanim vrijednostima |
| **Prioritet** | Kritičan / Visok / Srednji / Nizak |
| **Razlog izmjene matrice** | Obavezan |

### Stanja i poruke na tiketu

| Element | Značenje |
|---|---|
| **U okviru** | sat je unutar roka |
| **Pod rizikom** | ostalo je manje od podešenog upozorenja (podrazumijevano 30 min) ili je iskorišteno više od ~75% okvira |
| **Prekoračen** | rok je prošao; događaj se bilježi u tiketu i pokreće eskalacije |
| **pauza** | tiket je u statusu koji pauzira satove (**Čeka korisnika**, **Čeka odobrenje**) |
| **rok:** / **za …** / **prekoračeno …** | apsolutni rok, preostalo vrijeme ili koliko je prekoračeno |
| **SLA nije primijenjen** | panel objašnjava razlog: **NO_PROFILE** (servis nema profil), **PROFILE_INACTIVE** (profil je neaktivan), **NO_RULE** (nema pravila za prioritet/servis/OU), **NO_CALENDAR** (kalendar je neaktivan), **NOT_APPLIED** (SLA je isključen ili je tiket kreiran prije dodjele profila) |

## Česta pitanja i greške

- **„Tiket nema SLA tajmere.“** — pogledajte poruku u panelu: najčešće servis nema dodijeljen SLA profil
  (dodjeljuje se u čarobnjaku za uvođenje usluge), profil je neaktivan, nema pravila za taj prioritet/servis/OU
  ili je kalendar neaktivan.
- **„Zašto rok stoji iako je tiket čekao korisnika tri dana?“** — satovi su pauzirani u statusu **Čeka
  korisnika**; pri povratku u obradu rok se pomjera za preostalo radno vrijeme.
- **„Promijenio sam prioritet, a stari prekršaj je ostao.“** — namjerno: zabilježen prekršaj se ne briše, a
  novi rok se računa od kreiranja tiketa uz vraćene pauze. Ako je prvi odgovor već dat, njegov rok ostaje.
- **„Razlog izmjene je obavezan.“** — svaka izmjena ili brisanje u SLA konfiguraciji traži razlog; bez njega se
  prikazuje poruka **Razlog izmjene je obavezan.**
- **„Zapis s ovim ključem ili match uslovom već postoji.“** — ključ kalendara/profila je jedinstven, a isto
  pravilo (prioritet + isti servis/OU) ne može postojati dvaput u profilu.
- **„Radni intervali se preklapaju ili nisu ispravni.“** — provjerite redoslijed intervala (kraj mora biti
  poslije početka, do 4 intervala dnevno, bez preklapanja).
- **„Zapis se još koristi i ne može se obrisati.“** — kalendar koji koristi profil ili profil koji koristi
  servis/paket politika.
- **„Dosegnut je maksimalni broj nivoa eskalacije za ovaj profil.“** — obrišite ili izmijenite postojeće
  pravilo, ili podignite postavku maksimalnog broja nivoa.
- **„Eskalacija je u tiketu, ali niko nije dobio obavještenje.“** — ako profil nema nijedno eskalaciono pravilo,
  sistem bilježi eskalaciju po ugrađenom pravilu koje **nema metu** (vidi *Poznata ograničenja*).
- **„Nemam pristup SLA pravilima.“** — stranica je administratorska; poruka **Nema pristupa SLA** znači da
  korisnik nije u administratorskoj roli.

## Poznata ograničenja

- **Eskalacija iz ugrađenog pravila ne obavještava nikoga.** Ako profil nema nijedno eskalaciono pravilo,
  eskalacija se evidentira odmah u trenutku prekoračenja, ali bez primaoca — događaj je vidljiv u tiketu, a
  obavještenje ne stiže ni grupi ni odgovornima. (Nalaz B1 iz §M10.)
- **Satovi se ne uspostavljaju retroaktivno.** Tiket koji je kreiran prije nego što je servis dobio profil
  (ili pravilo/kalendar) ostaje bez SLA stanja do sljedećeg događaja na tiketu; pozadinski skener samo
  osvježava **postojeća** stanja. (Nalaz B2.)
- **Izvještaj usklađenosti je samo po profilu i samo za završene tikete.** Nema razrade po organizacionoj
  jedinici, servisu ni grupi, a tiketi koji su prekoračili rok i još su otvoreni ne ulaze u procenat. (Nalaz B3.)
- **„Prvi odgovor“ na tiketu zavisi od SLA modula.** Ako je SLA isključen ili tiket nema tajmere, kolona
  **Prvi odgovor** ostaje prazna i pored agentskih odgovora. (Nalaz B4.)
- **Polja iz RAW specifikacije za konfiguraciju kao JSON postavku ne postoje** — kalendari, profili, pravila i
  eskalacije se čuvaju u bazi i uređuju kroz ovu stranicu, a ne kroz `calendarsJson`/`profilesJson`/`rulesJson`.
  Postavka `escalations.inAppEnabled` takođe ne postoji: in-app obavještenje je uvijek uključeno, dok
  `escalations.emailEnabled` važi samo za eskalacije.
- **Uzorak dnevnika skenera** može prikazati da nema zaostatka i kada ga ima; nadzor se zato oslanja na ops
  alarm „skener kasni“ (podrazumijevano 5 minuta bez uspješnog ciklusa). (Nalaz B5.)

## Povezani moduli

- **Tiketi** — statusi (**Čeka korisnika**, **Čeka odobrenje**), prvi odgovor, rješavanje i vremenska linija.
- **Katalog usluga i forme** — servis nosi SLA profil (čarobnjak za uvođenje usluge, korak *SLA*).
- **Odobrenja i CSAT** — pauza satova dok tiket čeka odobrenje.
- **Izvještaji i nadzorna ploča** — usklađenost, trend sa pragom cilja i lista prekoračenih tiketa.
- **Dežurstva** — meta **Dežurni grupe** u eskalacijama (ako niko nije dežuran, obavještava se cijela grupa).
- **Postavke** — uključivanje SLA-a, pauze, upozorenje prije roka, eskalacije (in-app/e-mail), dozvola
  override-a, maksimalni broj nivoa i pragovi nadzora.
- **Verzije konfiguracije** — SLA kalendari, profili, pravila i matrica ulaze u snimku, validaciju i poređenje
  (shadow mode) prije aktivacije.

---

*Ažurirano: 2026-10-03 · Modul: SLA (M10)*
