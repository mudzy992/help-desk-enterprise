# Promjene (change management)

Promjena je planirana izmjena IT okruženja: nadogradnja servera, nova verzija aplikacije, izmjena mrežne opreme i slično. Modul vodi promjenu od zahtjeva, preko procjene i odobrenja (CAB), do realizacije i pregleda nakon realizacije. Modul je zadano isključen.

## Podešavanje (administrator)
1. Uključite modul promjena u postavkama (**Postavke → Promjene**).
2. U **Grupe** uredite grupu (npr. „CAB – infrastruktura“) i označite **CAB grupa**.
3. U grupu dodajte korisnike koji glasaju: trebaju ulogu **Upravitelj promjena** (ili administratorsku).

Dok ne postoji bar jedna CAB grupa, stranica Promjene prikazuje poruku da modul čeka podešavanje.

Postavke: prefiks broja (zadano `CHG-`), kvorum za normalnu (2) i hitnu (1) promjenu, minimalno najavno vrijeme, obavezan plan testiranja, periodi zamrzavanja i podsjetnik prije početka (24 h). Sve imaju opis u postavkama.

## Ko šta radi
| Radnja | Agent | Upravitelj promjena | Administrator |
|---|---|---|---|
| Pregled registra, kalendara i detalja | ✓ (svoja OJ i svoje promjene) | ✓ (sve OJ) | ✓ |
| Kreiranje, uređivanje svog nacrta, slanje na procjenu | ✓ | ✓ | ✓ |
| Procjena, termin, realizacija, pregled, otkazivanje, šabloni | – | ✓ | ✓ |
| Glas u CAB-u (samo član CAB grupe) | – | ✓ | ✓ |

Ko je zatražio promjenu, uvijek je vidi. Korisnici (USER) nemaju pristup.

## Tipovi promjena
- **Standardna** – unaprijed odobrena, iz šablona niskog ili srednjeg rizika. Ide direktno iz nacrta u zakazano, bez CAB-a.
- **Normalna** – nacrt → procjena → odobravanje (CAB) → zakazano.
- **Hitna** – nacrt → odobravanje → zakazano; zamrzavanje je samo upozorenje.

Rizik računa sistem iz uticaja i vjerovatnoće (nizak, srednji, visok, kritičan) i prikazuje ga odmah u formi.

## Tok
1. **Kreiranje** – dugme **Nova promjena**: tip, naslov, opis, razlog, uticaj i vjerovatnoća, servisi, oprema (kad je evidencija imovine uključena), problem (kad je modul problema uključen), termin, „uzrokuje prekid servisa“, CAB grupa i planovi. Dok birate termin, forma odmah prikazuje konflikte.
2. **Slanje na procjenu** – podnosilac ili upravitelj.
3. **Procjena** – upravitelj dopunjava planove, termin i CAB grupu, pa šalje na odobravanje ili vraća podnosiocu uz razlog.
4. **Odobravanje** – članovi CAB grupe glasaju. Kad se skupi kvorum, promjena je zakazana; jedno odbijanje (uz obavezan komentar) je odbija. Podnosilac ne glasa o svojoj promjeni.
5. **Realizacija** – **Započni** pa **Završi** uz ishod (uspješno, djelimično, neuspješno, vraćeno).
6. **Pregled nakon realizacije** – bilješke su obavezne za zatvaranje; kod neuspjeha najmanje 20 znakova. Ako je neuspjela promjena vezana za problem, vlasnik problema dobija obavijest.

U zakazanoj promjeni smiju se mijenjati samo termin i vlasnik.

## Konflikti i zamrzavanje
Sistem upozorava na drugu promjenu u istom terminu na istom servisu ili opremi i na postojeći prekid servisa. Prije prelaza dalje treba potvrditi „Upoznat sam s konfliktima“. Periodi zamrzavanja (npr. kraj godine) blokiraju standardne i normalne promjene.

## Prekidi servisa i održavanje
Kad promjena koja „uzrokuje prekid servisa“ postane zakazana (i planirani prekidi su uključeni u katalogu), za svaki zahvaćeni servis automatski nastaje planirani prekid – servis je u terminu u statusu održavanja i to se vidi na status stranici. Pomjeranje termina pomjera prekid, otkazivanje ga briše, a završetak ga skraćuje.

## Kalendar
Tab **Kalendar** prikazuje mjesec (ponedjeljak–nedjelja): promjene s oznakom rizika, prekide servisa koji nisu nastali iz promjene i periode zamrzavanja (ikona pahulje). Na mobitelu je isti sadržaj lista po danima.

## Šabloni
Tab **Šabloni** (samo upravitelj): naziv, opis, planovi, uticaj, vjerovatnoća, servisi i „uzrokuje prekid“. Šablon visokog ili kritičnog rizika se ne može spremiti. Šablon se ne briše nego deaktivira.

## Veze s problemima i opremom
Na detalju problema i opreme postoji tab **Promjene** s povezanim promjenama; dugme **Kreiraj promjenu** otvara formu s već popunjenim problemom, odnosno opremom.

## Obavijesti
- ulazak u odobravanje → članovi CAB-a s pravom glasa;
- odluka CAB-a → podnosilac i vlasnik;
- podsjetnik prije početka → vlasnik (inače podnosilac);
- prekoračen planirani kraj → vlasnik (inače CAB).

## Izvještaji
Dok je modul uključen, u **Izvještajima** su dva paketa: **Promjene: ishodi** (po tipu, sa stopom uspješnosti i udjelom hitnih) i **Promjene: raspored** (promjene čiji termin pada u period).

## Lični podaci
Izvoz ličnih podataka sadrži `changes.json` (promjene koje je osoba tražila ili vodi, njeni glasovi i radnje). Anonimizacija uklanja ime osobe iz teksta tih promjena i komentara njenih glasova.

Prečica **g c** otvara Promjene.
