---
title: Prijava i potvrda u dva koraka (MFA)
slug: prijava-i-mfa
module: M2
part: pocetak
audience: [Svi korisnici, Agent, Administrator]
roles: []
order: 20
tags: [prijava, mfa, totp, lozinka, sesija, rezervni-kodovi]
---
# Prijava i potvrda u dva koraka (MFA)

## Čemu služi ovaj modul

Prijava je ulaz u aplikaciju: korisničko ime je **email**, a uz lozinku može biti tražena i **potvrda u dva
koraka** (jednokratni kod iz aplikacije na telefonu). Uz prijavu ide i **„Sigurnost naloga“**, stranica na kojoj
svaki korisnik mijenja lozinku, upravlja potvrdom u dva koraka i pregleda svoje aktivne prijave.

## Kome je namijenjen

Namijenjeno **svim korisnicima** (prijava i sopstveni nalog), a dijelovi su namijenjeni **agentima** i
**administratorima** (reset potvrde u dva koraka i odjava sesija drugom korisniku).

## Kako doći

- **Prijava:** adresa `/login`, ili automatski preusmjerenje kad pristupite bilo kojoj stranici bez sesije.
- **Sigurnost naloga:** klik na svoje ime (donji lijevi ugao) → **Sigurnost naloga** (`/account/security`).
- **Administracija tudjeg naloga:** **Korisnici** → otvorite korisnika → sekcija **Sigurnost naloga**.

## Korak po korak

### Prijava lokalnim nalogom

1. Unesite **Email** i **Lozinku** i kliknite **Prijava**.
2. Ako su podaci ispravni, otvara se aplikacija. Ako nisu: „Prijava nije uspjela. Provjerite email i lozinku.“
3. Lokalna prijava ima odvojena ograničenja po nalogu i IP adresi. Nakon tri pogrešna pokušaja po nalogu uvodi
   se ograničeno progresivno kašnjenje (počinje od 250 ms i raste do najviše 2 s); nalog se ne zaključava.
   Stanje naloga važi u prozoru od 30 minuta, a uspješna prijava ga poništava.
4. IP adresa može dobiti privremeni HTTP `429` nakon 40 pogrešnih lokalnih prijava u 5 minuta. IP prag dijele
   sve lokalne prijave s te adrese; uspješna prijava ne briše IP prozor.
5. Ovo su početne vrijednosti implementacije. Potvrda pragova mjerenjem u stagingu ostaje potrebna prije
   produkcijskog rollouta.

### Prijava Microsoft nalogom (kada je tako podešeno)

1. Na ekranu prijave kliknite **Prijava preko Microsoft naloga**.
2. Prijavite se na Microsoft stranici (lozinku, potvrdu u dva koraka i pravila pristupa vodi Microsoft).
3. Ako Microsoft prijava nije podešena, aplikacija to kaže i nudi lokalnu formu preko linka
   **Prijavi se lokalnim nalogom**. SuperAdmin nalog uvijek ima i lokalnu lozinku (rezervni ulaz).

### Prisilna promjena lozinke

1. Ako je lozinka privremena ili je istekla, poslije prijave se prikazuje **Promijenite lozinku**.
2. Unesite **Novu lozinku** i **Potvrdu lozinke** i kliknite **Sačuvaj i nastavi**.
3. Lozinka mora imati najmanje onoliko znakova koliko je podešeno (zadano 12), ne smije biti jednaka emailu, ne
   smije sadržavati naziv organizacije, dio vaše email adrese i ne smije biti među najčešćim lozinkama. Ako
   organizacija to traži, ne smije se ponoviti ni neka od prethodnih lozinki.
4. Ako je lozinka istekla, gornji tekst kaže „Vaša lozinka je istekla…“; ako je privremena, prikazuje se uvodni
   tekst o postavljanju nove lozinke.
5. Poslije promjene sve ostale prijave tog naloga se odjavljuju.

### Prvi upis potvrde u dva koraka

1. Kad je potvrda obavezna a nije upisana, poslije prijave se prikazuje **Postavite potvrdu u dva koraka**.
2. Instalirajte aplikaciju za autentifikaciju (Microsoft Authenticator, Google Authenticator, FreeOTP…).
3. Skenirajte **QR kod** ili ručno unesite **Ključ za ručni unos**.
4. Unesite šestocifreni **Kod iz aplikacije** i kliknite **Uključi**.
5. Prikazuju se **Rezervni kodovi**; sačuvajte ih (**Kopiraj** ili **Preuzmi .txt**), označite
   **Sačuvao/la sam rezervne kodove** i kliknite **Nastavi**. Kodovi se poslije ne mogu ponovo prikazati.

**Važno nakon sigurnosne nadogradnje:** raniji rezervni kodovi iz stare hash-sheme više se ne prihvataju jer se
ne mogu bezbjedno pretvoriti. Potvrda u dva koraka (TOTP) ostaje uključena. Prijavite se kodom iz aplikacije,
pa u **Sigurnost naloga** → **Novi rezervni kodovi** potvrdite TOTP i sačuvajte novi set. Ako nemate pristup
TOTP-u, obratite se administratoru za **Reset MFA**.

### Prijava s uključenom potvrdom u dva koraka

1. Poslije ispravne lozinke traži se **Potvrda u dva koraka**.
2. Unesite **Kod iz aplikacije** i kliknite **Potvrdi** (kod se mijenja svakih 30 sekundi).
3. Ako nemate telefon, kliknite **Nemam pristup aplikaciji — koristi rezervni kod**, unesite jedan od sačuvanih
   kodova i potvrdite. Rezervni kod vrijedi samo jednom.
4. Svaki kod (i rezervni) može se iskoristiti samo jednom; aplikacija to provjerava i na serveru.

### Sigurnost naloga (svoj nalog)

- **Potvrda u dva koraka (MFA):** status **Uključena**/**Isključena**, značka **Obavezna za vaš nalog** kada je
  tako, dugmad **Uključi potvrdu u dva koraka**, **Novi rezervni kodovi** i **Isključi potvrdu u dva koraka**.
  Isključivanje i novi kodovi traže potvrdu kodom iz aplikacije.
- **Lozinka:** **Trenutna lozinka**, **Nova lozinka**, **Potvrda lozinke** i dugme **Promijeni lozinku**. Pravila
  (najmanja dužina, istorija) pišu iznad polja. Ako lozinka ima rok, prikazuje se značka **Ističe …**, a 14 dana
  prije isteka u vrhu aplikacije stoji traka **„Vaša lozinka ističe za N dana. Promijenite je sada“**.
- **Aktivne prijave:** lista uređaja (uređaj, skraćena IP adresa, vrijeme), dugme **Odjavi** po prijavi i
  **Odjavi sve ostale** (ova prijava ostaje aktivna). Vlastita prijava je označena kao **Ovaj uređaj**.
- Ako se nalog prijavljuje preko Microsofta, piše **„Vaš nalog nema lokalnu lozinku — lozinkom upravlja
  Microsoft.“** i polje za lozinku se ne prikazuje.

### Za administratore: tudji nalog

1. **Korisnici** → korisnik → **Sigurnost naloga**: status potvrde u dva koraka, zadnja promjena lozinke, istek
   lozinke i lista aktivnih prijava.
2. **Reset MFA** — traži **razlog**; korisnik pri sljedećoj prijavi mora ponovo upisati potvrdu. Reset automatski
   odjavljuje sve sesije tog korisnika.
3. **Odjavi sve sesije** — odjavljuje korisnika na svim uređajima.
4. Vlastiti nalog se ne mijenja ovim putem: za sebe koristite **Sigurnost naloga** u svom meniju.

### Za administratore: politika (Admin → Postavke)

Kategorija **Prijava i direktorij** sadrži pravila koja važe za sve:

| Postavka | Značenje |
|---|---|
| Obavezna potvrda u dva koraka (TOTP) za ADMIN naloge s lokalnom lozinkom | SUPER_ADMIN je uvijek obavezan; ADMIN po ovoj postavci |
| Ostali korisnici s lokalnom lozinkom mogu sami uključiti potvrdu u dva koraka | dozvola za samostalan upis; isključivanje zaustavlja **nove** upise, a korisnici koji su potvrdu već upisali i dalje je unose pri svakoj prijavi |
| Naziv koji aplikacija za autentifikaciju prikazuje uz nalog | prazno = naziv aplikacije |
| Minimalna dužina lokalne lozinke | 12–64 |
| Odbij najčešće lozinke, naziv organizacije i dijelove vlastite e-mail adrese (offline lista) | uključeno/isključeno |
| Riječi organizacije koje lozinka ne smije sadržavati | zarezom odvojene; naziv aplikacije i interne domene se dodaju |
| Broj prethodnih lozinki koje se ne smiju ponoviti | 0 = bez provjere |
| Istek lokalne lozinke u danima (osim SUPER_ADMIN) | 0 = bez isteka |
| Istek lozinke SUPER_ADMIN naloga u danima | 0 = bez isteka; zadano 365 |
| Najveći broj istovremenih prijava po korisniku | 0 = bez ograničenja; prekoračenje odjavljuje najstariju |
| Obavijesti ADMIN/SUPER_ADMIN o prijavi s novog uređaja ili mreže | uključeno/isključeno |

## Polja, validacije i statusi

| Polje / status | Pravilo |
|---|---|
| Email | obavezan, format email adrese |
| Lozinka pri prijavi | obavezna; ne otkriva se da li email postoji |
| Nova lozinka | najmanje `private.auth.password.minLength` znakova (12–64); ne smije biti jednaka emailu, sadržavati naziv organizacije, dio email adrese ni biti među najčešćim lozinkama; uz istoriju, ne smije se ponoviti. Prisilna promjena na ekranu prijave prikazuje istu granicu (server je šalje uz odgovor o potrebi promjene) |
| Kod iz aplikacije | 6 cifara, tolerancija ±30 s |
| Rezervni kod | format `xxxxx-xxxxx`, jednokratan |
| Statusi prijave | `MUST_CHANGE_PASSWORD` (privremena/istekla lozinka), `MFA_REQUIRED` (upisana potvrda), `MFA_ENROLLMENT_REQUIRED` (obavezna, nije upisana) |
| Trajanje međukoraka | promjena lozinke 15 minuta, potvrda u dva koraka 5 minuta |
| Sesija | 1 sat, produžava se dok radite; miran tab se sam odjavljuje |

## Česta pitanja i greške

| Poruka / situacija | Šta znači i šta uraditi |
|---|---|
| „Prijava nije uspjela. Provjerite email i lozinku.“ | Pogrešan email ili lozinka; ne govori koji je od njih pogrešan. |
| `429 TOO_MANY_LOGIN_ATTEMPTS` | Dosegnut je privremeni prag za lokalne prijave s ove IP adrese; nalog nije zaključan. Sačekajte da IP prozor istekne pa pokušajte ponovo. |
| „Kod nije ispravan ili je već iskorišten.“ | Kod je istekao, pogrešno prepisan ili je već upotrijebljen; sačekajte novi kod ili koristite rezervni. |
| „Korak prijave je istekao (vrijedi 5 minuta).“ | Predugo ste čekali na ekranu koda; vratite se na prijavu i ponovite. |
| „Postavljanje je isteklo. Počnite ispočetka.“ | Upis potvrde u dva koraka traje 15 minuta; pokrenite upis ponovo. |
| „Potvrda u dva koraka nije konfigurisana na serveru (MFA_ENCRYPTION_KEY).“ | Administrator mora postaviti ključ; do tada se potvrda ne može uključiti. |
| „Trenutna lozinka nije ispravna.“ | Pogrešno unijeta trenutna lozinka pri promjeni. |
| „Ova lozinka je nedavno korištena. Izaberite novu.“ | Lozinka je u istoriji; izaberite drugu. |
| „Radnja nije uspjela. Pokušajte ponovo.“ | Opšta greška; ako se ponavlja, provjerite vezu ili se obratite administratoru. |
| Nemam više rezervnih kodova | Administrator može uraditi **Reset MFA**, pa upisujete potvrdu ponovo. |
| Promijenio/la sam telefon | **Novi rezervni kodovi** ne pomažu; potreban je **Reset MFA** (kod administratora) ili ponovni upis. |

## Poznata ograničenja

- Potvrda u dva koraka je **samo TOTP** (aplikacija na telefonu); SMS i email kodovi se ne koriste.
- Za naloge koji se prijavljuju preko Microsofta **naš** drugi faktor se ne primjenjuje — pravila pristupa
  podešava Microsoft.
- Brojač neuspjelih prijava je vezan za **email i IP adresu**; iza proxyja se praktično svodi na email adresu.
- **Jeftino je samo za korisnika:** ako ostane bez telefona i rezervnih kodova, put je preko administratora
  (**Reset MFA**), bez samoopsluživanja.

## Povezani moduli

- Instalacija (prvi SuperAdmin i način prijave): `docs/user-guide/instalacija.md`
- Korisnici i uloge: **Korisnici**, **Uloge i dozvole**
- Teze: **T15**, **T18**, **T19**, **T20**, **T21**, **T22**
- Analiza modula: `REVIEW_ANALIZA.md` §M2
