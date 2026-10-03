# Nadzorna ploča i izvještaji

> **Namjena:** **Nadzorna ploča** je početna stranica na kojoj svaki korisnik vidi brojače i listu tiketa
> kojima ima pristup (najnoviji, oni koji traže pažnju, SLA nadzor, aktivnost). **Izvještaji** su
> administratorski dio: KPI pregled, trendovi kroz vrijeme, predefinisani paketi za izvoz (CSV/JSON) i
> zakazano slanje e-mailom. Izvještaji su nadzor nad radom službe, a ne mjesto za rad na pojedinačnom
> tiketu.

## Čemu služi ovaj modul

- **Nadzorna ploča (za svakoga):** brojači po statusima (otvoreni, kritični, SLA prekoračenja, čeka
  korisnika/odobrenje, neusmjereni, bez izvršioca, dodijeljeni meni, moji zahtjevi), grafik statusa,
  tok tiketa zadnjih 14 dana, lista tiketa koji traže pažnju i lista nedavnih tiketa.
- **SLA nadzor i grupni inbox (za osoblje):** najugroženiji tajmeri i nepreuzeti tiketi po grupama, uz
  upozorenje na neusmjerene tikete koji čekaju predugo.
- **Izvještaji — Pregled:** KPI kartice (kreirano, prosječan prvi odgovor i rješenje, CSAT, **KB
  resolution rate** sa ciljem ≥ 30 %) i četiri prikaza: uska grla po grupi, obim po usluzi, tok i
  starenje backloga, starost otvorenih tiketa.
- **Izvještaji — Trendovi:** vremenske serije (dolazni, riješeni, neto, otvoreni, SLA odziv i rješavanje,
  medijana i p90 rješenja, prvi odziv, CSAT, najčešći servisi) uz izbor raspona, granularnosti i filtera.
- **Izvještaji — Paketi izvještaja:** šest uključenih paketa (mjesečni KPI, prekoračeni po servisu,
  najčešći kodovi zatvaranja, korisnost baze znanja, prosljeđivanje „ping-pong“, evidentiranje vremena) —
  pregled prije preuzimanja i preuzimanje u CSV ili JSON.
- **Izvještaji — Zakazani:** rasporedi koji šalju izvještaj e-mailom sedmično ili mjesečno, sa sekcijama
  e-maila, prilozima, testnim slanjem i historijom izvršenja.

## Kome je namijenjen

| Rola | Šta radi |
|---|---|
| **Korisnik** | Vidi brojače i liste za tikete koje smije otvoriti; nema pristup izvještajima. |
| **Agent** | Uz sve navedeno dobija **SLA nadzor**, **Grupni inbox** i **Aktivnost**; nema izvještaje. |
| **ADMIN / SUPER_ADMIN** | Otvara **Izvještaje** ako ima pravo `reports.export` ili `audit.export` (ili je SUPER_ADMIN). Tab **Zakazani** vidi samo s pravom `reports.schedule.manage`. |

Prava se provjeravaju i u serveru: `GET /reports/*` traži ulogu `admin`/`superAdmin` **i** jedno od dva
prava izvoza, a svaki izvoz se zapisuje u audit.

## Kako doći

1. **Nadzorna ploča:** meni **Nadzorna ploča** (početna stranica, ruta `/`).
2. **Izvještaji:** meni **Izvještaji** (ruta `/reports`) — vidljivo samo s pravom izvoza.
3. **Uska grla** (kad je dostupno): tab **Pregled** → grafik **Bottleneck: prosj. rješenje po grupi**
   (detaljan prikaz uskih grla još nije na ekranu; vidi *Poznata ograničenja*).
4. **Zakazani izvještaji:** **Izvještaji** → tab **Zakazani**, ili iz **Trendova** dugme **Zakaži ovaj
   izvještaj**.

## Korak po korak

### 1. Čitanje nadzorne ploče

1. Otvorite **Nadzorna ploča**. Ispod naslova stoji „Operativni pregled tiketa kojima imate pristup.“
2. Prva grupa su brojači. Iznad pojedinih stoji dodatak kao „+3 danas“ (koliko je otvoreno danas); brojevi
   se puniju sa servera i mogu biti do **jedne minute** stari.
3. Ispod brojača su grafikoni **Tiketi po statusu** i **Tok tiketa — zadnjih 14 dana** (kreirani naspram
   riješenih; ako nema podataka, prikazuje se „Nema podataka za grafikone“).
4. Ako imate ulogu osoblja, slijede **SLA nadzor** („Najugroženiji tajmeri“, filter **Svi**, do 5 tiketa),
   **Grupni inbox** („Nepreuzeti tiketi po grupama“, dugme **Otvori inbox**) i **Aktivnost** (posljednji
   događaji).
5. Na dnu su **Tiketi koji zahtijevaju vašu pažnju** (dodijeljeni vama, kritični bez vlasnika i
   neusmjereni) i **Nedavni tiketi**; dugme **Prikaži sve** vodi na listu tiketa.

### 2. Praćenje SLA-a i grupnog reda (osoblje)

1. U **SLA nadzor** provjerite tikete s najkraćim preostalim rokom; klik na tiket otvara detalj.
2. U **Grupni inbox** vidite koliko nepreuzetih tiketa ima svaka grupa; **Otvori inbox** vodi u grupni red.
3. Ako postoji neusmjereni tiket koji čeka duže od zadanog broja sati, iznad liste stoji upozorenje
   („… nerutiranih tiketa čeka duže od … h — riješite ih“) i vodi na listu tiketa.

### 3. Pregled izvještaja (KPI i grafikoni)

1. Otvorite **Izvještaji** → tab **Pregled**.
2. Izaberite period: **Zadnjih 15 dana**, **Zadnjih 30 dana**, **Zadnjih 6 mjeseci**, **Zadnjih 12
   mjeseci** ili **Od – do** za prilagođeni raspon; po potrebi izaberite **Organizacionu jedinicu**.
3. Pročitajte KPI kartice: **Kreirano (30d)** (sa promjenom prema prethodnom periodu), **Prosj. prvi
   odgovor**, **Prosj. rješenje**, **CSAT (zadovoljstvo)** i **KB resolution rate**. Uz prosjeke piše i
   koliko uzoraka ima; **KB resolution rate** se računa kao *pomoglo u interceptu / (pomoglo + kreirani
   tiketi)*, sa ciljem **≥ 30 %**.
4. Ispod su grafikoni: **Bottleneck: prosj. rješenje po grupi** (grupa s najdužim ciklusom nosi oznaku
   „usko grlo: …“), **Obim po usluzi**, **Tok i starenje backloga** i **Starost otvorenih (bucketing)**.
5. Dugme **Izvezi PDF** otvara dijalog za štampu sa zaglavljem (opseg, period, kada je generisano i ko je
   generisao); štampa se evidentira u audit.

### 4. Trendovi

1. Otvorite tab **Trendovi**.
2. Izaberite **Raspon** (30 dana, 90 dana, 6, 12, 24 ili 36 mjeseci, ili **Prilagođeno**), **Granularnost**
   (**Automatski**, **Dnevno**, **Sedmično**, **Mjesečno**) i filtere **Servis**, **Grupa**, **Prioritet**.
3. Kartice prikazuju: **Dolazni i riješeni** (uz neto promjenu), **Otvoreni kroz vrijeme** (stanje na
   kraju perioda), **SLA usklađenost** (odziv i rješavanje prema cilju), **Vremena obrade** (medijana i
   p90), **Zadovoljstvo (CSAT)** (zadovoljan = ocjena ≥ 4; periodi s malo ocjena su prigušeni) i
   **Najčešći servisi**.
4. Svaka kartica ima znak **?** sa objašnjenjem formule. Iznad grafikona je i prekidač za prikaz **tabele**
   umjesto linija.
5. Izvoz: dugmad **CSV** i **JSON** preuzimaju trenutne serije, a dugme za štampu otvara PDF prikaz.
6. Dugme **Zakaži ovaj izvještaj** vodi na formu novog rasporeda sa već popunjenim rasponom i filterima.

### 5. Paketi izvještaja i preuzimanje

1. Otvorite tab **Paketi izvještaja**.
2. Izaberite **paket**, **period** (**Od**, **Do**) i po potrebi **Organizacionu jedinicu**, pa kliknite
   **Prikaži** za pregled prije preuzimanja. Uz period stoji i najveći broj dana za taj paket te napomena
   da se svako preuzimanje bilježi u audit.
3. Pregled prikazuje prvih nekoliko redova; ako je tabela odsječena, piše „Prikazano prvih …; preuzimanje
   sadrži sve redove.“
4. Dugmad **Preuzmi CSV** i **Preuzmi JSON** preuzimaju cijeli izvještaj; poslije preuzimanja piše
   „Preuzeto: …“ s imenom fajla.
5. Ako u periodu nema podataka, prikazuje se prazno stanje („Probajte duži period ili drugu organizacionu
   jedinicu.“); ako nijedan paket nije uključen, piše da ih administrator može uključiti u postavkama
   izvještaja.
6. U paketu prosljeđivanja („ping-pong“) naslovi povjerljivih tiketa prikazuju se kao **[povjerljivo]**.

### 6. Zakazani izvještaji

1. Otvorite tab **Zakazani** (potrebno pravo `reports.schedule.manage`) i kliknite **Novi raspored**.
2. Popunite **Naziv**, **Učestalost** (**Sedmično (pon)** ili **Mjesečno (1.)**), **Vrijeme slanja** (u
   zoni instalacije), **Sekcije e-maila** (Sažetak (KPI), Trend (zadnjih 12 perioda), Najčešći servisi,
   Prekoračeni po servisu), **Prilozi (CSV)** i **Primaoce** (pretraga po imenu ili e-mailu; samo interni korisnici
   s pristupom izvještajima i opsegu jedinice).
3. Uz polje **Sljedeće slanje** prikazuje se izračunati termin; raspored možete isključiti prekidačem
   **Raspored uključen** (tada se preskače, uz razlog u historiji).
4. Sačuvajte dugmetom **Sačuvaj**. U listi su kolone Naziv, Učestalost, Opseg, Primaoci i Zadnje slanje,
   a red ima radnje **Uredi**, **Pošalji test meni**, **Pošalji sada**, **Historija izvršenja** i
   **Obriši**.
5. **Pošalji test meni** šalje probni izvještaj samo vama; **Pošalji sada** pokreće slanje i rezultat se
   vidi u historiji. Historija bilježi period, koliko je primalaca primilo izvještaj i razloge
   preskakanja (npr. „korisnik nije aktivan“, „nema pristup izvještajima ili opsegu OJ“, „e-mail
   isključen“) i izostavljanja priloga („previše redova za prilog“, „prilozi premašuju 10 MB“).

## Polja, validacije i statusi

### Brojači na nadzornoj ploči (`dashboard.metric*`)

| Brojač | Značenje |
|---|---|
| **Grupni inbox** | Nepreuzeti tiketi u grupama (grupni red za preuzimanje). |
| **Otvoreni tiketi** | Svi otvoreni tiketi u vašem opsegu. |
| **Kritični prioritet** | Otvoreni tiketi s prioritetom kritičan. |
| **SLA prekoračenja** | Tiketi s prekoračenim SLA rokom. |
| **Dodijeljeni meni / Bez izvršioca** | Vaš aktivni rad; tiketi koji čekaju vlasnika u grupi. |
| **Čeka korisnika / Čeka odobrenje** | Pauza dok korisnik odgovori; lanac odobrenja u toku. |
| **Neusmjereni / Moji zahtjevi** | Rupa u pokriću — treba pravilo; zahtjevi koje ste otvorili. |

### KPI kartice (Pregled)

| Kartica | Kako se računa |
|---|---|
| **Kreirano (period)** | Broj tiketa kreiranih u periodu, uz promjenu prema prethodnom periodu iste dužine. |
| **Prosj. prvi odgovor** | Prosjek od kreiranja do prvog odgovora, uz broj uzoraka. |
| **Prosj. rješenje** | Prosjek od kreiranja do rješenja, uz broj uzoraka. |
| **CSAT (zadovoljstvo)** | Prosjek ocjena na skali 1–5, uz broj ocjena. |
| **KB resolution rate** | *pomoglo u interceptu / (pomoglo + kreirani tiketi)*; cilj ≥ 30 %. |

### Paketi izvještaja

| Paket | Sadržaj |
|---|---|
| **Mjesečni KPI** | Kreirano, riješeno, zatvoreno, SLA prekoračenja, CSAT i prosječna vremena. |
| **Prekoračeni po servisu** | Prekoračenja grupisana po servisu. |
| **Najčešći kodovi zatvaranja** | Kodovi zatvaranja riješenih/zatvorenih tiketa u periodu. |
| **Korisnost baze znanja** | Ocjene i pregledi članaka. |
| **Prosljeđivanje (ping-pong)** | Tiketi proslijedjeni najmanje tri puta. |
| **Evidentiranje vremena** | Sati po agentu i servisu, sa redovima „Agent × servis“ i zbirnim redovima. |

### Poruke i greške

| Poruka | Kada se pojavi |
|---|---|
| „Nema podataka za grafikone“ / „Još nema tiketa“ | nova instalacija bez tiketa. |
| „Nema tiketa s prekoračenim SLA rokom.“ | SLA nadzor bez prekoračenja. |
| „Nema nepreuzetih tiketa u grupama.“ | grupni inbox je prazan. |
| „Nema tiketa koji zahtijevaju pažnju.“ | nema dodijeljenih/kritičnih/neusmjerenih. |
| „Nema pristupa izvještajima“ | korisnik bez `reports.export`/`audit.export` pokuša otvoriti `/reports`. |
| „Nema podataka za izabrani period“ | paket nema redova u izabranom periodu. |
| „Prikazano prvih …; preuzimanje sadrži sve redove.“ | pregled paketa je odsječen. |
| „Izvoz paketa dolazi u Fazi 8.“ | zastarjeli tekst dugmeta na nadzornoj ploči; dugme je onemogućeno iako `/reports` postoji (vidi *Poznata ograničenja*). |
| „Unesite ispravno vrijeme (HH:mm).“ | neispravan format vremena slanja kod zakazanog izvještaja. |
| „Nema kandidata za prikaz.“ | pretraga primalaca bez rezultata. |

## Česta pitanja i greške

**Zašto se broj na ploči ne promijeni odmah poslije promjene tiketa?**
Brojači se keširaju **60 sekundi** po korisniku i opsegu. Osvježavanje stranice u tom intervalu vraća isti
broj; poslije minute broj se ponovo računa.

**Zašto mi neko polje na ploči izgleda prazno iako brojač pokazuje više od nule?**
Brojači su tačni (računa ih server), ali **SLA nadzor**, **Aktivnost**, **Tiketi koji zahtijevaju pažnju** i
**Nedavni tiketi** uzimaju samo **prvu stranu od 50 tiketa**. Ako tiket nije među prvih 50 po datumu
kreiranja, neće se pojaviti u tim listama (vidi *Poznata ograničenja*).

**Zašto ne vidim meni „Izvještaji“?**
Meni i ruta se otvaraju samo korisnicima s pravom `reports.export` ili `audit.export` (SUPER_ADMIN
uvijek). Bez prava dobijate poruku „Nema pristupa izvještajima“.

**Zašto je tab „Zakazani“ skriven?**
Tab se prikazuje samo s pravom `reports.schedule.manage`; bez njega ne možete ni praviti ni mijenjati
rasporede.

**Zašto je CSAT na trendovima „prigušen“ za neke periode?**
Periodi s manje ocjena od postavljenog minimuma (zadano 5) prikazuju se šuplje, jer prosjek iz nekoliko
ocjena nije pouzdan. Isto važi za prosjeke u KPI karticama — uz njih uvijek stoji broj uzoraka.

**Zbog čega gumb „Izvještaji“ na Nadzornoj ploči ništa ne radi?**
On je trajno onemogućen i nosi stari tekst „Izvještaji će biti dostupni kad se doda ruta.“, iako ruta
`/reports` postoji. Izvještaje otvorite iz glavnog menija.

**Zašto je izvoz paketa kraći od perioda koji sam tražio?**
Svaki paket ima najveći dozvoljeni raspon dana (npr. 366); ako tražite duže, server odbija zahtjev. Za
pregled se prikazuje samo prvih nekoliko redova, a preuzimanje sadrži sve redove u dozvoljenom periodu.

**Šta znači „[povjerljivo]“ u tabeli?**
U paketu prosljeđivanja naslovi povjerljivih tiketa se namjerno zamjenjuju tom oznakom prije prikaza.

**Zašto e-mail zakazanog izvještaja nije stigao nekome s liste primaoca?**
Historija izvršenja bilježi razlog po primaocu (npr. korisnik nije aktivan, nema pristup izvještajima ili
opsegu jedinice, e-mail kanal isključen). Prilog se izostavlja ako ima previše redova ili prelazi 10 MB,
a e-mail to navodi.

## Poznata ograničenja

- **Uska grla nisu na ekranu.** Server nudi `GET /reports/bottlenecks` sa brojačima (čeka odobrenje, čeka
  korisnika, neusmjereni, prekoračeni), razrezom po organizacionoj jedinici, servisu i prioritetu te
  dnevnim trendom, ali ga **nijedna stranica ne prikazuje**; zato ekran **Pregled** pokazuje samo
  „Bottleneck: prosj. rješenje po grupi“ (B2).
- **Postavka uskih grla ne djeluje na ekran.** Isključivanje „agregacija uskih grla na kontrolnoj tabli“ u
  postavkama zaustavlja samo API koji nema ekran, a grafik u pregledu izvještaja se i dalje prikazuje (B1).
- **Postavka perioda je podijeljena.** Postavka opisana kao „podrazumijevani prozor za trendove uskih
  grla“ (zadano 30 dana) određuje i podrazumijevani period paketa izvještaja (B3).
- **Opseg sažetka se ne koristi.** API prima `all`, `assignedToMe`, `requestedByMe` i `unassigned`, a ploča
  uvijek traži `all`; „Dodijeljeni meni“ i „Moji zahtjevi“ su brojači iz istog odgovora (B4).
- **Dugme „Izvještaji“ na ploči je onemogućeno** uz netačan tekst „Izvještaji će biti dostupni kad se doda
  ruta.“; prijevodi „Izvoz paketa“ i „Izvoz paketa dolazi u Fazi 8.“ više se nigdje ne koriste (B5).
- **Dio ploče se računa u pregledaču:** grafik zadnjih 14 dana i liste idu iz prve strane od 50 tiketa, pa
  mogu potcijeniti stanje na aktivnoj instalaciji (B6).
- **Nema razreza po organizacionoj jedinici** u pregledu (jedinica je samo filter), **nema CSAT-a po
  servisu i grupi** (samo ukupan prosjek i serija kroz vrijeme), a **„opterećenje admina“** postoji samo
  kao izvoz evidentiranja vremena.
- **Izvoz paketa nije vezan na izbor u pregledu:** period birate u tabu **Paketi izvještaja** nezavisno od
  perioda na tabu **Pregled**.
- **Nema automatskog testa nadzorne ploče:** nadzorna ploča je pokrivena samo a11y skeniranjem (kao
  korisnik i kao agent), a `GET /reports/dashboard` i `GET /reports/bottlenecks` nemaju e2e scenario.

## Povezani moduli

- **Tiketi** — svi brojači i liste vode u listu ili detalj tiketa; vidljivost je ista kao na listi.
- **SLA** — **SLA nadzor** i KPI/trend serije koriste iste tajmere kao SLA ekrani.
- **Baza znanja** — **KB resolution rate** i paket **Korisnost baze znanja** broje potvrde iz presretanja i
  ocjene članaka.
- **CSAT** — prosjek i serija dolaze iz ocjena datih poslije rješavanja tiketa.
- **Evidentiranje vremena** — paket **Evidentiranje vremena** sabira sate po agentu i servisu.
- **Odobrenja i „neusmjereni“** — brojači čekanja na odobrenje i neusmjerenih tiketa pokazuju gdje proces
  stoji; detalji su u modulima tiketa i odobrenja.
- **Audit** — svaki izvoz (paket, PDF, trendovi) ostavlja zapis u audit logu.
- **Postavke** — grupa **Izvještaji** (uključeni paketi, formati, zona, periodi, pragovi) i **Nadzorna
  ploča** (uska grla) mijenjaju ponašanje ovog modula.
