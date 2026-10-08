---
title: Korisnici, organizacione jedinice i grupe
slug: korisnici-oj-i-grupe
module: M3
part: administrator
audience: [Administrator, SUPER_ADMIN]
roles: [ADMIN, SUPER_ADMIN]
order: 40
tags: [korisnici, organizacione-jedinice, grupe, ad-sync, uloge]
---
# Korisnici, organizacione jedinice i grupe

> **Namjena:** administracija naloga, OU stabla i grupa za rutiranje. Sve na ovoj stranici radi se u
> **Administracija** (`/admin`) i dostupno je samo ulogama **ADMIN** i **SUPER_ADMIN** (osim OU stabla, koje vide
> svi korisnici preko padajućih lista).

## Čemu služi ovaj modul

- **Korisnici** — nalozi koji mogu otvarati tikete, biti agenti ili administratori; svaki nalog može biti
  *lokalni* (lozinka u aplikaciji) ili *AD-praćen* (identitet dolazi iz Active Directoryja / Microsofta).
- **Organizacione jedinice (OU)** — hijerarhija koja određuje vidljivost i rutiranje tiketa. `ouPath` je
  aplikacijski identitet jedinice, a `distinguishedName` (DN) je LDAP/DN identitet.
- **Grupe** — „grupe za rutiranje“: tiketi se dodjeljuju grupi, a svi njeni članovi vide tiket u grupnom inboxu.
  Grupa može biti i **fallback** (za OU bez tačnog pravila), **problem-grupa** ili **CAB grupa**.

## Kome je namijenjen

- **Administratori** (ADMIN/SUPER_ADMIN): tabovi **Korisnici**, **Org. jedinice**, **Grupe**.
- **Svi korisnici**: `GET /organizational-units/tree` je otvoren svim rolama, pa se OU-hijerarhija koristi u
  filterima i formama. Administratorski tabovi se ne prikazuju korisnicima.

## Kako doći

1. Prijavite se i otvorite **Administracija** (`/admin`).
2. Odaberite tab: **Org. jedinice**, **Grupe** ili **Korisnici**.
3. Stare putanje preusmjeravaju: `/users` → tab **Korisnici**, `/organizational-units` → tab **Org. jedinice**.

## Korak po korak

### Dodavanje korisnika

1. Tab **Korisnici** → dugme **Dodaj korisnika**.
2. Popunite **Ime i prezime**, **E-mail**, **Organizacijska jedinica** (može i „Bez organizacijske jedinice“) i
   **Odaberi ulogu**.
3. Sačuvajte. Ako e-mail nije poslan (SMTP nije aktivan), prikazuje se **Privremena lozinka (zapišite sada)** uz
   napomenu da se neće ponovo prikazati i da je korisnik mora promijeniti pri prvoj prijavi; tu je i dugme
   **Kopiraj**. Ako je e-mail poslan, umjesto lozinke piše da je poslana na e-mail korisnika.
4. Korisnik je odmah kreiran kao **lokalni nalog** i sa obavezom promjene lozinke.

### Uređivanje korisnika

1. U listi korisnika otvorite red i izaberite **Uredi**.
2. **Ime i prezime**, **Organizacijska jedinica** i **Aktivan nalog** možete mijenjati uvijek.
   **E-mail** mijenjate samo kod **lokalnih** naloga — kod AD-praćenih polje je zaključano uz poruku
   *„E-mail za AD-praćene naloge dolazi iz kataloga.“*
3. **Sačuvaj izmjene**; deaktivacija važi odmah (keš dozvola se invalidira).

### Šta pokazuje lista korisnika

- Kolona **MFA** pokazuje da li je potvrda u dva koraka **Uključen** ili **Isključen** za lokalne naloge; za
  AD/Entra naloge piše **Ne primjenjuje se (Microsoft)** jer drugi faktor daje sam davalac identiteta. Nikad se ne
  prikazuje nikakva tajna — samo stanje.
- Kolona **Paket politika** prikazuje bedž samo kad je paket zaista aktivan. Ispod naziva piše **naslijeđeno iz OJ**
  (korisnik nema svoj paket, nasljeđuje ga iz organizacione jedinice) ili **isključen postavkom** kada je paket
  isključen u postavkama instalacije.
- Oznaka **neaktivan** stoji samo za deaktiviran nalog. Ne postoji zasebno „zaključan“ stanje po korisniku.

### Pretraga i stranice korisnika

- Pretraga filtrira korisnike, a lista učitava **100 redova po stranici**.
- Iznad liste se prikazuje opseg zapisa i ukupan broj rezultata za trenutni filter; za ostale rezultate koristite
  dugmad za prethodnu/sljedeću stranicu. Lista se ne prekida tiho na 500 korisnika.

### Reset lozinke, reset MFA-a, odjava sesija (Administracija naloga)

1. Otvorite korisnika i sekciju **Akcije naloga**.
2. **Resetuj lozinku** — dostupno **samo lokalnim nalozima**. Vraća novu privremenu lozinku (e-mailom ili u UI-u)
   i odjavljuje sve sesije tog korisnika.
3. **Sigurnost naloga**: **Resetuj potvrdu u dva koraka** traži **Razlog** (najmanje 5 znakova) i nakon potvrde
   korisnik mora ponovo upisati potvrdu pri sljedećoj prijavi; **Odjavi sve prijave** prekida sve sesije.
   Obje akcije vidi **samo SUPER_ADMIN**.
4. **Obriši** briše nalog, ali **ne** ako ima otvorenih tiketa (kao podnosilac ili obrađivač) — tada se prikazuje
   *„Brisanje korisnika nije uspjelo“*. Zatvoreni tiketi (Riješeno/Zatvoreno/Arhivirano) ne blokiraju brisanje.

### Povezivanje s AD nalogom (samo SUPER_ADMIN)

1. Kod lokalnog naloga izaberite **Poveži sa AD nalogom** (dijalog **Poveži sa katalog identitetom**).
2. U dijalogu su uporedo **Lokalni nalog** i **Katalog (AD/manual)**; izaberite zapis iz kataloga.
   Nalozi se **nikad** ne spajaju automatski po e-mail adresi.
3. **Poveži naloge** čuva vezu; otkazivanje je dugme **Odustani**.
4. **Raskini AD vezu** vraća nalog u lokalni i izdaje novu privremenu lozinku koju korisnik mora promijeniti pri
   sljedećoj prijavi (potvrda to i piše).
5. Nalozi sa rolom **SUPER_ADMIN** ne mogu se povezivati s katalogom.

### Organizacione jedinice

1. Tab **Org. jedinice**; stablo je **Stablo organizacionih jedinica**, s napomenom da je `ouPath` aplikacijski
   identitet stabla, a DN izvor istine za direktorij.
2. **Dodaj OU** otvara formu: **Naziv (segment putanje)**, **parent** (ili bez parenta) i **tip**. DN se gradi
   automatski iz parenta i naziva — ne unosi se ručno u ovoj formi.
3. Detalji jedinice prikazuju **Naziv (segment putanje)**, **ouPath (kanonski)**, **Distinguished Name (LDAP)** i
   broj **mapiranih korisnika**. Izmjena naziva ili parenta **prepisuje `ouPath` i DN cijele podgrane**.
4. Ako red nije u ručnom katalogu (ili mu se `ouPath` razlikuje od kataloškog zapisa), poruka se prikazuje **odmah
   ispod tog reda** i **nijedan zahtjev ne ide na server** — prvo pokrenite očitavanje kataloga.
5. Ako je izvor **Ručni katalog**, **Obriši** u jednoj transakciji uklanja kataloški zapis i materijalizovanu
   OJ. Brisanje se odbija ako postoje djeca, katalog korisnici/grupe ili žive veze; poruka navodi tip i broj
   svake blokirajuće veze. Korisnički nalozi se **nikad ne brišu** ovim putem. OJ-scoped dodjele uloga se mogu
   ukloniti zajedno s OJ-om; nakon brisanja prikazuje se upozorenje s njihovim brojem, a pogođeni cachevi se
   invalidiraju. Ova radnja **ne briše stvarni AD nalog**.
6. Panel **AD sinhronizacija** (vidljiv samo SuperAdminu) prikazuje režim čitanja, throttle, keš, zadnje
   očitavanje i izvor (**AD (LDAPS)** ili **Ručni katalog**), uz **Pokreni ručno očitavanje**.
7. U istom panelu je **Sinhronizacija s Active Directoryjem**: **Test veze**, **Probni prolaz** (pregled plana
   izmjena) i **Primijeni plan**. Kod primjene se prikazuje potvrda s brojem novih/ažuriranih/deaktiviranih
   korisnika i izmjenama OU-a; deaktiviranim korisnicima se odmah gase sesije. Plan se ne može primijeniti ako
   je aktivan **osigurač deaktivacije** (previše deaktivacija u jednom prolazu) niti dva puta.

### Grupe

1. Tab **Grupe** („Grupe za rutiranje“). Filter **Filtriraj po OJ** ograničava listu; dugme **Nova grupa** otvara
   formu **Naziv grupe**, **Organizaciona jedinica**, **Fallback grupa za ovu OJ**.
2. Svaka OJ treba **barem jednu fallback grupu** — kad je označite, prethodna fallback grupa te OJ prestaje to
   biti. Fallback grupa se ne može obrisati ako je jedina za svoju OJ.
3. Oznaka **Fallback** stoji na kartici grupe; kartica prikazuje broj **Članova** i **routing pravila**.
4. Klik na karticu otvara **desni panel** s dva taba: **Članovi** (odabir korisnika, **Dodaj člana**, **Ukloni**) i
   **Uredi** (naziv, OJ, Problem-grupa, CAB grupa). Promjena članstva odmah mijenja šta korisnik vidi u grupnom
   inboxu. Panel se zatvara na **Escape**, klik izvan njega ili na **X**.
5. Kod izmjene grupe mogu se uključiti **Problem-grupa** i **CAB grupa**:
   - Problem-grupa: „Agenti ovoj grupi predaju probleme; upravitelji problema u njoj ih preuzimaju i rješavaju.
     Modul problema je aktivan tek kad postoji bar jedna problem-grupa.“
   - CAB grupa: „Članovi s dozvolom `change.approve` glasaju o promjenama. Modul promjena je aktivan tek kad
     postoji bar jedna CAB grupa.“
6. **Obriši** otvara **jednu** potvrdu u kojoj piše naziv grupe i broj članova; brisanje je blokirano ako grupa ima
   tikete koji nisu zatvoreni.

### Dnevnik izmjena

Promjene korisnika (kreiranje, izmjena, brisanje, reset lozinke i veza s direktorijem), organizacionih jedinica
(uključujući ručni katalog) i grupa (uključujući članstvo) upisuju se u audit log u istoj transakciji kao i
promjena podataka. Zapis nosi aktera, request ID kad je dostupan i relevantna polja prije/poslije; lozinke, hash
lozinke, tokeni i MFA tajne se ne upisuju. Pri brisanju OJ audit bilježi broj uklonjenih OJ-scoped dodjela i pogođene korisnike.

## Polja, validacije i statusi

| Polje / radnja | Validacija / pravilo | Poruka ili efekat |
|---|---|---|
| E-mail korisnika | `@IsEmail`, jedinstven, sprema se malim slovima | Postojeći e-mail → `EMAIL_CONFLICT` („Kreiranje korisnika nije uspjelo“) |
| Ime i prezime | ne smije biti prazno | „Ažuriranje korisnika nije uspjelo“ |
| Organizacijska jedinica | mora postojati; može biti prazna | `ORGANIZATIONAL_UNIT_NOT_FOUND` |
| Uloga | mora postojati; `SUPER_ADMIN` samo SuperAdmin | „Samo SuperAdmin može dodijeliti SuperAdmin ulogu.“ |
| Reset lozinke | samo aktivan i **lokalni** nalog | lokalni reset se auditira i odjavljuje sesije; reset AD-praćenog naloga vraća `409 DIRECTORY_ACCOUNT_NOT_LOCAL` i bilježi odbijeni pokušaj |
| Reset lozinke neaktivnog korisnika | API vraća `409 USER_INACTIVE`; ne izdaje privremenu lozinku | prvo aktivirajte nalog; UI prikazuje ciljanu uputu |
| Posljednji aktivni lokalni SuperAdmin | ne može se ukloniti, deaktivirati ili obrisati ako bi time ostalo 0 takvih naloga | `409 LAST_SUPER_ADMIN_REQUIRED`; operacija nema djelimične izmjene |
| Brisanje korisnika | nema otvorenih tiketa; ne može vlastiti nalog | „Obrisati korisnika …? Ova radnja se ne može poništiti.“ |
| OU naziv | ne smije biti prazan; gradi `ouPath` | `INVALID_NAME` |
| OU DN | mora odgovarati parentu; jedinstven | „Distinguished name must be a descendant of the parent distinguished name“, „Distinguished name already exists“ |
| Brisanje OU-a iz ručnog kataloga | bez djece, kataloških korisnika/grupa i drugih živih veza; svaka veza vraća tip i broj | `409` s `blockers`; samo neprepoznata FK restrikcija daje `409 RESOURCE_IN_USE` |
| Grupa | naziv obavezan; `key` jedinstven (automatski) | `DUPLICATE_KEY` |
| Fallback grupa | jedna po OU-u; posljednja se ne briše | `SOLE_FALLBACK_GROUP` |
| Članstvo u grupi | korisnik mora postojati; bez duplikata | `MEMBER_ALREADY_EXISTS` / `MEMBER_NOT_FOUND` |
| LDAPS plan | probni prolaz + primjena u roku, bez osigurača | „Plan je istekao (važi 24 sata)…“ / „Plan je zaustavljen osiguračem…“ |

## Česta pitanja i greške

- **„Zašto ne mogu promijeniti e-mail korisnika?“** — Nalog je AD-praćen (`AD-praćen` badge); e-mail dolazi iz
  kataloga. Ako korisnik treba lokalni e-mail, prvo **Raskini AD vezu** (SuperAdmin).
- **„Zašto nema dugmeta Resetuj lozinku?“** — Vidi se samo za lokalne naloge. Direktan API zahtjev za AD/Entra
  nalog se odbija s `409 DIRECTORY_ACCOUNT_NOT_LOCAL` i evidentira u auditu. Ako nalog treba preći na lokalnu
  prijavu, prvo koristite **Raskini AD vezu** (vidi i stranicu *Prijava i MFA*).
- **„Reset lozinke je odbijen uz `USER_INACTIVE`.“** — Nalog je neaktivan; prvo ga aktivirajte pa ponovite reset.
  API ne izdaje privremenu lozinku dok je nalog neaktivan.
- **„Ne mogu ukloniti/deaktivirati posljednji SuperAdmin nalog.“** — Sistem mora zadržati barem jedan aktivan
  lokalni SuperAdmin; dodajte/držite drugi takav nalog pa ponovite radnju. API vraća `409 LAST_SUPER_ADMIN_REQUIRED`.
- **„Reset MFA-a je odbio radnju.“** — Potrebna su najmanje 5 znakova u polju **Razlog** i SUPER_ADMIN nalog.
- **„Ne mogu obrisati korisnika.“** — Ima otvorene tikete; prvo ih zatvorite ili ih prebacite na drugog
  obrađivača.
- **„Ne mogu obrisati OU.“** — Odgovor navodi vrste i broj veza koje blokiraju brisanje (npr. korisnički
  nalozi, grupe, tiketi, imovina ili pravila). Uklonite ili premjestite te veze pa pokušajte ponovo; nalozi se
  ovim putem nikad ne brišu.
- **„Osigurač je aktiviran.“** — Probni prolaz je našao previše deaktivacija u odnosu na prag; provjerite bazni
  DN i filtere, pa ponovite probni prolaz.
- **„Sve prijave su odjavljene nakon reset lozinke.“** — Tako je i predviđeno: reset lozinke prekida sve sesije.

## Pravila zaštite i poznata ograničenja

- Sistem čuva najmanje jedan aktivan **lokalni** SuperAdmin. Radnja koja bi uklonila posljednjeg vraća
  `409 LAST_SUPER_ADMIN_REQUIRED` i ne ostavlja djelimičnu izmjenu.
- Reset lozinke neaktivnog korisnika odbija se s `409 USER_INACTIVE`; nalog prvo treba aktivirati, a privremena
  lozinka se ne izdaje.
- Lista korisnika učitava 100 redova po stranici i prikazuje filtrirani ukupan broj; koristite kontrole stranica
  za nastavak. Rezultati se ne odsijecaju tiho na 500.
- **Manager iz AD-a se ne sinhronizuje**; polje postoji, ali mapiranja iz direktorija nema.

## Povezani moduli

- **Prijava i MFA** (`prijava-i-mfa.md`) — prisilna promjena lozinke nakon reseta, potvrda u dva koraka.
- **Prosljeđivanje tiketa** (`prosljedjivanje-tiketa.md`) — ciljna grupa pri prosljeđivanju.
- **Dežurstva** (`dezurstva.md`) — rasporedi po OJ i agentima ograničenim na OJ.
- **Imovina** (`imovina.md`) — lokacije i imovina vezane za OU.
- Administracija → **Postavke** (Autentikacija, AD/LDAPS) i **Permisije uloga** (SuperAdmin) za ono što nije na
  ovoj stranici.

---

*Ažurirano: 2026-10-07 · Moduli: korisnici, organizacione jedinice, grupe (M3)*
