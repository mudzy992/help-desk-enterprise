---
title: Pošta (e-mail)
slug: posta
module: M12
part: administrator
audience: [Korisnik, Agent, Administrator]
roles: []
order: 70
tags: [email, smtp, sabloni, dolazna-posta, broadcast, odsustvo]
---
# Pošta (e-mail)

> **Namjena:** modul šalje obavještenja **e-mailom** i, ako je uključeno, **čita odgovore iz zajedničkog
> sandučeta** pa ih upisuje na tiket. Uz to drži **administraciju šablona** (tekstovi e-mailova) i **dnevni
> sažetak** za korisnike koji ne žele svaki e-mail odmah.

## Čemu služi ovaj modul

- **Obavještenja e-mailom:** isti događaji koji stižu u zvono (novi tiket, dodjela, poruka, rješeno, zatvoreno,
  zahtjev za odobrenje, SLA eskalacija, prosljeđivanje, udaljena pomoć, spominjanje) mogu stići i na e-mail.
- **Odgovor e-mailom:** kad je uključen zajednički sandučić, korisnik može odgovoriti na obavijest u svom
  mail klijentu i taj odgovor se pojavi na tiketu — kao da ga je napisao u aplikaciji.
- **Novi tiket iz e-maila (opcionalno):** poruka poslana na adresu podrške može otvoriti novi tiket.
- **Tekstovi e-mailova:** administrator mijenja naslov, uvod, tekst dugmeta i podnožje, uz **pregled** i
  **testno slanje** sebi.
- **Dnevni sažetak i tihi sati:** korisnik može izabrati da umjesto pojedinačnih e-mailova dobija sažetak, ili
  da mu u određenim satima e-mailovi ne stižu odmah nego na kraju perioda.

## Kome je namijenjen

| Rola | Šta radi |
|---|---|
| **Korisnik (naručilac)** | Dobija obavještenja e-mailom (ako je kanal uključen), odgovara na njih, bira svoje kanale i način u „Moj profil“ → obavještenja. |
| **Agent** | Isto kao korisnik, uz obavještenja za svoju grupu; može odgovoriti e-mailom kao javni odgovor na tiket. |
| **ADMIN / SUPER_ADMIN** | Uključuje kanal, podešava SMTP i From adresu, uređuje šablone, testira slanje i prati **dolaznu poštu** (status, zadnja greška, odbijene poruke). |

## Kako doći

1. **Administrator:** meni **Postavke** → sekcija **E-mail** — kartice **SMTP i dostava**, **Šabloni e-mailova**
   (dugme **Uredi tekstove**) i **Dolazna pošta**.
2. **Tekstovi e-mailova:** kartica **Šabloni e-mailova** → **Uredi tekstove** (posebna stranica, dostupna samo
   administratorima).
3. **Dolazna pošta:** kartica **Dolazna pošta** → **Testiraj konekciju** / **Otvori dnevnik**.
4. **Korisnik:** **Moj profil** → **Obavještenja** (kanal i način po tipu događaja, tihi sati).

## Korak po korak

### 1. Uključivanje e-mail kanala (administrator)

1. Postavke → E-mail → kartica **SMTP i dostava**: uključite SMTP, izaberite provajdera (**Office 365**,
   **Gmail** ili **SMTP server**), upišite korisničko ime, lozinku i **From adresu**.
2. Uključite slanje obavještenja e-mailom (postavka kanala). E-mail ide samo ako su uključeni addon, SMTP i sam
   kanal.
3. Provjerite domene: dok je uključeno „samo interno“, e-mail ide **isključivo** adresama sa dozvoljenih domena;
   izuzetke dodajete u liste domena i pojedinačnih adresa.
4. Za odgovore: izaberite način **zajednički sandučić** i upišite **Reply-To** adresu. Ako adresa nije upisana,
   sistem radi kao „bez odgovora“ (bez dugmeta za odgovor).
5. Ako e-mailovi nemaju dugme **Otvori tiket**, nedostaje javni URL aplikacije; to javlja kartica šablona.

### 2. Uređivanje teksta e-maila (administrator)

1. Otvorite **Šabloni e-mailova** → **Uredi tekstove**.
2. Izaberite **događaj** (npr. Novi tiket) i **jezik** (bosanski ili engleski).
3. Uredite polja: naslov, naslov za povjerljiv tiket, uvod, tijelo, tekst dugmeta i podnožje.
4. U tekst možete ubaciti samo dozvoljene **placeholdere** (npr. broj tiketa, naslov, ime primaoca, naziv
   aplikacije); pomoćnik prikazuje listu, a nepoznat placeholder se odbija.
5. Desno se **osvježava pregled** — isti renderer koji šalje prave e-mailove.
6. **Pošalji test** šalje probni e-mail **samo vama** (ograničeno na pet slanja u deset minuta).
7. **Sačuvaj** traži razlog i upisuje promjenu u reviziju; **Vrati na zadano** vraća ugrađeni tekst.

### 3. Odgovor na e-mail (korisnik)

1. Otvorite obavještenje u svom mail klijentu i kliknite **Odgovori** (odgovor ide na adresu iz polja Reply-To).
2. Ostavite **broj tiketa u naslovu** — sistem prepoznaje tiket po potpisanom `Message-ID` iz naše poruke, a
   broj u naslovu je rezervni put.
3. Napišite odgovor **iznad** citiranog teksta; citirani dio i potpis se automatski uklanjaju.
4. U roku od jednog ciklusa (do jedne minute) odgovor se pojavi na tiketu i ostali učesnici dobiju obavještenje.
5. Ako je tiket bio **Riješeno**, odgovor ga vraća u obradu. Ako je **Zatvoreno**, dobijate jedan e-mail da
   otvorite novi tiket (najviše jednom dnevno).

### 4. Pregled dolazne pošte (administrator)

1. Postavke → E-mail → **Dolazna pošta**: vidite da li je konektor uključen i zdrav, zadnju uspješnu obradu i
   zadnju grešku.
2. **Brojevi u 24 h:** obrađeno, odbijeno, ignorisano, neuspjelo.
3. **Otvori dnevnik** prikazuje posljednjih 50 poruka: status, razlog, pošiljalac, naslov i tiket — **bez
   tijela poruke**.
4. **Testiraj konekciju** provjerava vezu i broji poruke u sandučetu.

## Polja, validacije i statusi

### Postavke kanala

| Postavka | Značenje i ponašanje |
|---|---|
| **SMTP uključen** | Bez njega e-mail ne ide nigdje; From adresa je obavezna za obavljanje |
| **Provajder** | `Office 365`, `Gmail` ili `SMTP server`; preset puni host, port i TLS **samo** dok host nije upisan |
| **Port i TLS** | Port `465` znači „odmah TLS“, ostali portovi koriste STARTTLS kad je TLS uključen |
| **From adresa** | Adresa pošiljaoca; njena domena je i domena `Message-ID`-a i niti razgovora |
| **Samo interno** | Dozvoljene su domene sa liste internih domena (i izuzeci); isključeno = svaka ispravna adresa |
| **Dozvoljene domene / adrese** | Izuzeci kad je režim „samo interno“ uključen |
| **Način odgovora** | `Bez odgovora` ili `Zajednički sandučić` (+ Reply-To adresa); bez adrese sistem radi kao „bez odgovora“ |
| **Uključi isječak poruke** | Da li e-mail za novu poruku sadrži i tekst javnog odgovora (do 600 znakova) |
| **Javni URL aplikacije** | Bez njega nema dugmeta i linkova u e-mailovima |

### Polja šablona

| Polje | Šta je |
|---|---|
| **Naslov** | Naslov e-maila; broj tiketa se dodaje ispred kao `[T-000123]` |
| **Naslov za povjerljiv tiket** | Naslov koji ide bez naslova tiketa |
| **Uvod (heading)** | Veliki naslov u tijelu e-maila |
| **Tijelo** | Tekst sa placeholderima (npr. `{{ticketNumber}}`, `{{recipientName}}`) |
| **Tekst dugmeta** | Natpis na dugmetu koje vodi na tiket |
| **Podnožje** | Dodatni red na kraju e-maila |
| **Boja akcenta** | Boja dugmeta; prazno = boja instalacije |

### Statusi dolazne poruke

| Status | Značenje |
|---|---|
| **PROCESSING** | Poruka je preuzeta i obrađuje se |
| **PROCESSED** | Poruka je dodata na tiket (ili je iz nje otvoren novi tiket) i premještena u „obrađeno“ |
| **REJECTED** | Poruka nije prihvaćena; premještena je u „odbijeno“ uz razlog |
| **IGNORED** | Poruka je prepoznata kao automat/bounce/duplikat i nije mijenjana |

### Zašto poruka može biti odbijena

| Razlog | Šta znači |
|---|---|
| **UNKNOWN_SENDER** | Adresa pošiljaoca nije korisnik sistema |
| **SENDER_INACTIVE** | Korisnik je deaktiviran |
| **SENDER_DOMAIN_NOT_ALLOWED** | Domena nije dozvoljena postavkama |
| **AUTHENTICATION_FAILED** | Poruka nije prošla provjeru (DMARC ili SPF+DKIM) |
| **NO_TICKET_MATCH** | Nema tiketa u referencama, a otvaranje tiketa iz e-maila je isključeno |
| **TICKET_NOT_FOUND** | Tiket iz referenci više ne postoji |
| **TICKET_CLOSED** | Tiket je zatvoren; dobijate obavijest da otvorite novi |
| **EMPTY_REPLY** | Nakon uklanjanja citata i potpisa nije ostalo teksta |
| **REDACTION_BLOCKED** | Tekst sadrži podatke koje pravila redakcije ne dozvoljavaju |
| **RATE_LIMITED** | Prekoračen broj poruka po pošiljaocu (zadano 20 na sat) |
| **FORBIDDEN** | Pošiljalac nema pravo pisati na taj tiket |
| **TOO_LARGE / PARSE_FAILED** | Poruka je prevelika ili se ne može pročitati |
| **CREATE_FAILED** | Tiket nije mogao biti otvoren |

### Kada obavještenje stigne odmah, a kada u sažetku

| Situacija | Ponašanje |
|---|---|
| Korisnik nije ništa mijenjao | E-mail stiže odmah |
| Izabrao je **Isključeno** | Ne dobija e-mail za taj tip |
| Izabrao je **U sažetku** | Obavještenja se skupljaju i stižu jednim e-mailom u sažetku |
| Uključeni **tihi sati** | E-mailovi se ne šalju u tom periodu nego na njegovom kraju |
| Domena nije dozvoljena | E-mail se ne šalje, čak i kad je korisnik izabrao „odmah“ |
| Povjerljiv tiket | U e-mailu je **samo broj tiketa** i link, bez naslova i sadržaja |

## Česta pitanja i greške

- **„Nisam dobio e-mail, a vidim obavještenje u aplikaciji.“** — provjerite: je li SMTP uključen, je li
  uključeno slanje obavještenja, je li vaša domena na listi dozvoljenih, i niste li u „Moj profil“ isključili
  e-mail ili uključili sažetak/tihe sate.
- **„E-mail nema dugme za otvaranje tiketa.“** — nije postavljen javni URL aplikacije; bez njega se linkovi
  izostavljaju namjerno.
- **„Odgovorio sam, ali odgovor nije na tiketu.“** — odgovor mora ići na Reply-To adresu zajedničkog
  sandučeta (način „zajednički sandučić“); provjerite i dnevnik dolazne pošte — poruka je vjerovatno u
  „odbijeno“ sa razlogom.
- **„Kolega je dobio obavještenje, ja nisam.“** — e-mail se šalje po ličnim postavkama i po domeni; ista
  obavještenja u aplikaciji su grupna, a e-mail nije.
- **„Testno slanje ne radi.“** — poruka greške je odgovor SMTP servera (npr. „535 Authentication
  unsuccessful“); provjerite korisničko ime, lozinku i From adresu.
- **„Zašto e-mail za eskalaciju ne stiže?“** — e-mail za eskalacije je zasebna opcija i podrazumijevano je
  isključena.
- **„Zašto je odgovor odbijen kao automat?“** — poruke sa oznakama automatizacije (out-of-office, bulk,
  bounce) se ne obrađuju namjerno, da sistem ne uđe u petlju.

## Poznata ograničenja

- **Sadržaj broadcasta prolazi redakciju osjetljivih podataka** prije nego što ode primaocima: isto skeniranje i
  ista pravila kao za odgovor u tiketu. Ako se pogodak nađe, tekst se u poruci zamjenjuje oznakom `[REDACTED]`,
  a u tiket se upisuje sistemski događaj upozorenja (`ticket_redaction_warned`) — po tiketu, ne po primaocu.

- **Zapis o isporuci nema rok.** Ako proces padne tačno između preuzimanja i slanja, taj e-mail se neće poslati
  ni pri ponovnom pokušaju, a nigdje se ne prikazuje kao neuspjeh. (Nalaz B1 iz §M12.)
- **Bulk obavijest (broadcast)** skenira se i rediguje prije slanja; pogodak se u tiketu bilježi kao sistemski
  događaj upozorenja. (Nalaz B2 iz §M12 — zatvoren u valu 2.)
- **Svaki e-mail otvara novu vezu prema SMTP serveru** — kod većeg broja primalaca to je sporije i povećava
  rizik od ograničenja provajdera. (Nalaz B3.)
- **Ograničenje testnog slanja (pet u deset minuta) vrijedi po pokrenutom procesu**, pa se restartom resetuje.
  (Nalaz B4.)
- **Oznake polja u bulk obavijesti su na engleskom** („What happened“, „Who is affected“, „ETA“), i u
  bosanskom e-mailu. (Nalaz B5.)
- **Google Workspace konektor (Gmail API) nije isporučen** — za Google instalacije koristi se IMAP sa lozinkom
  aplikacije ili OAuth2 prijavom.
- **E-mail šabloni se ne prevode automatski** — ako tekst postoji samo na jednom jeziku, primaocu se šalje
  tekst na zadanom/rezervnom jeziku instalacije.

## Povezani moduli

- **Realtime i obavještenja** — isti događaji u zvono; e-mail je drugi kanal istog fan-out-a.
- **Tiketi** — poruke, odgovori, prilozi i pravila pisanja (odgovor e-mailom se upisuje kroz iste provjere).
- **SLA** — e-mail za eskalacije (opcionalno).
- **Odobrenja i CSAT** — obavještenja o odobrenjima e-mailom.
- **Postavke** — izvor svih postavki kanala i šablona.
- **Privatnost** — retencija zapisa o isporuci i metapodataka dolazne pošte.

---

*Ažurirano: 2026-10-03 · Modul: Pošta (M12)*
