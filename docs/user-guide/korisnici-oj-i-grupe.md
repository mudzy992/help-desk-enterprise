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
4. **Obriši** je moguće samo ako jedinica **nema podređenih OU-a** i **nema mapiranih korisnika**; inače se
   prikazuje poruka da je brisanje blokirano.
5. Panel **AD sinhronizacija** (vidljiv samo SuperAdminu) prikazuje režim čitanja, throttle, keš, zadnje
   očitavanje i izvor (**AD (LDAPS)** ili **Ručni katalog**), uz **Pokreni ručno očitavanje**.
6. U istom panelu je **Sinhronizacija s Active Directoryjem**: **Test veze**, **Probni prolaz** (pregled plana
   izmjena) i **Primijeni plan**. Kod primjene se prikazuje potvrda s brojem novih/ažuriranih/deaktiviranih
   korisnika i izmjenama OU-a; deaktiviranim korisnicima se odmah gase sesije. Plan se ne može primijeniti ako
   je aktivan **osigurač deaktivacije** (previše deaktivacija u jednom prolazu) niti dva puta.

### Grupe

1. Tab **Grupe** („Grupe za rutiranje“). Filter **Filtriraj po OJ** ograničava listu; dugme **Nova grupa** otvara
   formu **Naziv grupe**, **Organizaciona jedinica**, **Fallback grupa za ovu OJ**.
2. Svaka OJ treba **barem jednu fallback grupu** — kad je označite, prethodna fallback grupa te OJ prestaje to
   biti. Fallback grupa se ne može obrisati ako je jedina za svoju OJ.
3. Oznaka **Fallback** stoji na kartici grupe; kartica prikazuje broj **Članova** i **routing pravila**.
4. **Članovi** → **Odaberi korisnika** i **Dodaj člana**; **Ukloni** izbacuje člana. Promjena članstva odmah
   mijenja šta korisnik vidi u grupnom inboxu.
5. Kod izmjene grupe mogu se uključiti **Problem-grupa** i **CAB grupa**:
   - Problem-grupa: „Agenti ovoj grupi predaju probleme; upravitelji problema u njoj ih preuzimaju i rješavaju.
     Modul problema je aktivan tek kad postoji bar jedna problem-grupa.“
   - CAB grupa: „Članovi s dozvolom `change.approve` glasaju o promjenama. Modul promjena je aktivan tek kad
     postoji bar jedna CAB grupa.“
6. **Obriši** je blokirano ako grupa ima tikete koji nisu zatvoreni (dugme **Potvrdi brisanje** / **Odustani**).

## Polja, validacije i statusi

| Polje / radnja | Validacija / pravilo | Poruka ili efekat |
|---|---|---|
| E-mail korisnika | `@IsEmail`, jedinstven, sprema se malim slovima | Postojeći e-mail → `EMAIL_CONFLICT` („Kreiranje korisnika nije uspjelo“) |
| Ime i prezime | ne smije biti prazno | „Ažuriranje korisnika nije uspjelo“ |
| Organizacijska jedinica | mora postojati; može biti prazna | `ORGANIZATIONAL_UNIT_NOT_FOUND` |
| Uloga | mora postojati; `SUPER_ADMIN` samo SuperAdmin | „Samo SuperAdmin može dodijeliti SuperAdmin ulogu.“ |
| Reset lozinke | samo aktivan i **lokalni** nalog | privremena lozinka + odjava svih sesija |
| Brisanje korisnika | nema otvorenih tiketa; ne može vlastiti nalog | „Obrisati korisnika …? Ova radnja se ne može poništiti.“ |
| OU naziv | ne smije biti prazan; gradi `ouPath` | `INVALID_NAME` |
| OU DN | mora odgovarati parentu; jedinstven | „Distinguished name must be a descendant of the parent distinguished name“, „Distinguished name already exists“ |
| Brisanje OU-a | bez podređenih OU-a i bez korisnika | „Organizational unit still has child units“ / „…still has mapped users“ |
| Grupa | naziv obavezan; `key` jedinstven (automatski) | `DUPLICATE_KEY` |
| Fallback grupa | jedna po OU-u; posljednja se ne briše | `SOLE_FALLBACK_GROUP` |
| Članstvo u grupi | korisnik mora postojati; bez duplikata | `MEMBER_ALREADY_EXISTS` / `MEMBER_NOT_FOUND` |
| LDAPS plan | probni prolaz + primjena u roku, bez osigurača | „Plan je istekao (važi 24 sata)…“ / „Plan je zaustavljen osiguračem…“ |

## Česta pitanja i greške

- **„Zašto ne mogu promijeniti e-mail korisnika?“** — Nalog je AD-praćen (`AD-praćen` badge); e-mail dolazi iz
  kataloga. Ako korisnik treba lokalni e-mail, prvo **Raskini AD vezu** (SuperAdmin).
- **„Zašto nema dugmeta Resetuj lozinku?“** — Vidi se samo za lokalne naloge. Za AD/Entra nalog lozinkom
  upravlja Microsoft (vidi i stranicu *Prijava i MFA*).
- **„Reset MFA-a je odbio radnju.“** — Potrebna su najmanje 5 znakova u polju **Razlog** i SUPER_ADMIN nalog.
- **„Ne mogu obrisati korisnika.“** — Ima otvorene tikete; prvo ih zatvorite ili ih prebacite na drugog
  obrađivača.
- **„Ne mogu obrisati OU.“** — Ima podređene jedinice ili mapirane korisnike. Ako jedinica ima **grupu**,
  imovinu, KB članak ili routing/SLA pravilo, brisanje trenutno vraća opću grešku bez objašnjenja; uklonite
  zavisnosti pa pokušajte ponovo (vidi *Poznata ograničenja*).
- **„Osigurač je aktiviran.“** — Probni prolaz je našao previše deaktivacija u odnosu na prag; provjerite bazni
  DN i filtere, pa ponovite probni prolaz.
- **„Sve prijave su odjavljene nakon reset lozinke.“** — Tako je i predviđeno: reset lozinke prekida sve sesije.

## Poznata ograničenja

- **Brisanje OU-a ne provjerava sve zavisnosti** — provjeravaju se samo podređene jedinice i korisnici. Ako OU
  ima grupu, imovinu, zahtjev za promjenu, KB članak ili routing/SLA pravilo, brisanje vraća opću grešku
  servera. (Nalaz B1 iz `REVIEW_ANALIZA.md` §M3.)
- **Brisanje OU-a briše i dodjele rola** vezane za tu jedinicu; korisnici ostaju bez tog pristupa, a keš
  dozvola se ne osvježava odmah. (Nalaz B2.)
- **Izmjene korisnika, OU-a i grupa se ne bilježe u audit log** (bilježe se samo dodjela i uklanjanje role).
  (Nalaz B3.)
- **API dozvoljava reset lozinke AD-praćenog naloga** i time ga pretvara u lokalni (UI to dugme ne prikazuje).
  (Nalaz B4.)
- **Nema zaštite posljednjeg SuperAdmin naloga** — uklanjanje zadnje SUPER_ADMIN role je moguće. (Nalaz B5.)
- **Neaktivan korisnik na reset lozinke** dobija opću poruku „Reset lozinke nije uspio“. (Nalaz B6.)
- **Lista korisnika se prikazuje do 500 redova**; ako organizacija ima više korisnika, dio se ne prikazuje.
  (Nalaz B7.)
- **Manager iz AD-a se ne sinhronizuje**; polje postoji, ali mapiranja iz direktorija nema.

## Povezani moduli

- **Prijava i MFA** (`prijava-i-mfa.md`) — prisilna promjena lozinke nakon reseta, potvrda u dva koraka.
- **Prosljeđivanje tiketa** (`prosljedjivanje-tiketa.md`) — ciljna grupa pri prosljeđivanju.
- **Dežurstva** (`dezurstva.md`) — rasporedi po OJ i agentima ograničenim na OJ.
- **Imovina** (`imovina.md`) — lokacije i imovina vezane za OU.
- Administracija → **Postavke** (Autentikacija, AD/LDAPS) i **Permisije uloga** (SuperAdmin) za ono što nije na
  ovoj stranici.

---

*Ažurirano: 2026-10-03 · Moduli: korisnici, organizacione jedinice, grupe (M3)*
