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

1. Unesite **Email** i **Lozinku** i kliknite **Prijava**. Ikona oka u polju lozinke privremeno prikazuje
   upisanu lozinku, a ispod polja se pojavi upozorenje **Caps Lock je uključen.** kad je to slučaj. Jezik ekrana
   bira se padajućim izborom u gornjem desnom uglu.
2. Ako su podaci ispravni, otvara se aplikacija. Ako nisu: „Prijava nije uspjela. Provjerite email i lozinku.“
3. **Zapamti me na ovom uređaju (30 dana)** — prijava traje 30 dana umjesto jednog sata; preporučeno samo na
   vlastitom, zaključanom uređaju. SUPER_ADMIN nalog se ne pamti (rezervni ulaz je namjerno kratkotrajan), a
   odjava ili promjena lozinke pamćenje prekidaju.
4. Lokalna prijava ima odvojena ograničenja po nalogu i IP adresi. Nakon tri pogrešna pokušaja po nalogu uvodi
   se ograničeno progresivno kašnjenje (počinje od 250 ms i raste do najviše 2 s); **nalog se ne zaključava** —
   ispravna lozinka prolazi i poslije pogrešnih pokušaja. Stanje naloga važi u prozoru od 30 minuta, a uspješna
   prijava ga poništava.
5. IP adresa može dobiti privremeni `429` nakon 40 pogrešnih lokalnih prijava u 5 minuta. Odgovor nosi
   `retryAfterSeconds` (koliko još traje blokada). IP prag dijele sve lokalne prijave s te adrese; uspješna
   prijava ne briše IP prozor.
6. **Pragovi su podesivi.** SuperAdmin ih mijenja na **Admin → Sigurnost → Ograničenja prijava** (osam
   vrijednosti u tri reda, uz obavezan razlog i potvrdu identiteta); promjena važi odmah, bez restarta. Brojevi
   u koracima 4 i 5 su zadane vrijednosti instalacije.
7. **Provjera da niste robot (CAPTCHA)** — ako je SuperAdmin uključio Turnstile, poslije **pet neuspjelih
   prijava s iste IP adrese** prijava traži i rješenje kratke provjere; bez njega server odbija pokušaj
   (`CAPTCHA_REQUIRED`), a stranica prijave tada prikaže provjeru. Rješenje važi za **jedan pokušaj** — ako i
   on padne, provjera se rješava ponovo; ako je provjera isključena (zadano), ovaj korak ne postoji.
   Ista provjera se traži i na **koraku s kodom** (kod iz aplikacije ili rezervni kod) poslije pet neuspjelih
   unosa koda za vaš nalog; prijava passkeyjem je ne traži.

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
2. Ako nalog ima i passkey, iznad forme stoje dva izbora: **Kod iz aplikacije** i
   **Koristi passkey / uređaj**. Uz passkey kliknite **Potvrdi passkeyjem** i odobrite prijavu na uređaju
   (Windows Hello, Touch ID, Face ID ili sigurnosni ključ) — kod se tada ne kuca. Izbor se pamti po uređaju,
   pa se sljedeća prijava otvara na onom faktoru koji ste zadnji koristili; kod iz aplikacije uvijek ostaje
   dostupan kao drugi izbor.
3. Unesite **Kod iz aplikacije** i kliknite **Potvrdi** (kod se mijenja svakih 30 sekundi).
4. Ako nemate telefon, kliknite **Nemam pristup aplikaciji — koristi rezervni kod**, unesite jedan od sačuvanih
   kodova i potvrdite. Rezervni kod vrijedi samo jednom.
5. Svaki kod (i rezervni) može se iskoristiti samo jednom; aplikacija to provjerava i na serveru.

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

### Za administratore: „Sigurnost“ — dnevnik i metrike

Tab **Sigurnost** u ekranu **Admin** vidi samo **SUPER_ADMIN**; običnom administratoru se prikazuje poruka
„Sigurnost je dostupna samo superadministratoru“ i nijedan zahtjev se ne šalje.

- **Sigurnosni dnevnik** — hronološka lista filtrirana na `auth.*` događaje iz zajedničkog audit dnevnika (prijave,
  neuspjele prijave, odjave, potvrda u dva koraka, promjene i reseti lozinki, zaključavanja, promjene ograničenja).
  Filteri su **Događaj** („Svi auth događaji“ ili pojedinačna radnja) i **Osoba** (najmanje dva znaka, izbor iz
  liste; obuhvata zapise u kojima je osoba cilj ili izvršilac). Kolone su **Vrijeme**, **Događaj**, **Cilj**,
  **Izvršilac** i **Detalji**, a dugme **Učitaj još** dohvata starije zapise. Detalji prikazuju metapodatke zapisa
  (npr. način, uređaj, razlog) — bez lozinki i kodova, a nazivi polja i kodovi vrijednosti (npr. `must_change`)
  prevode se na jezik sučelja; kada izvršilac nije poznat (neuspjela prijava) piše **Pseudonim**, a sistemski zapisi
  nose oznaku **Sistem**.

Na tabu **Sigurnost**, **iznad** sigurnosnog dnevnika, stoje kartice (u **Postavkama → Sigurnost** red
**Sigurnosna administracija** samo vodi na taj tab — vrijednosti se uređuju na jednom mjestu):

- **Ograničenja prijava** — osam pragova (prozor i kašnjenje po računu, IP blokada i „ostali“ tokovi), grupisani u
  tri reda (**Kašnjenje po računu**, **Blokada po IP adresi**, **Ostali sigurnosni tokovi**) u kojima stoji trenutna
  vrijednost. Red otvara dijalog: uz svako polje piše dozvoljeni raspon, a promjena traži **razlog** (najmanje
  5 znakova) i potvrdu identiteta kodom ili passkeyjem.
- **Sigurnosne postavke** — tri reda: **Trajanje i prekid sesija** (zadržavanje prijave i prekid zbog
  neaktivnosti), **Provjera procurjelih lozinki** (uključeno/isključeno) i **Provjera da niste robot (CAPTCHA)**
  (uključeno/isključeno; uključeno znači da prijava poslije pet neuspjeha s iste adrese traži Cloudflare
  Turnstile rješenje, a tajni ključ se čuva kao tajna postavka i nikad se ne prikazuje). Svaki red nosi oznaku stanja i otvara
  isti dijalog kao i ostale postavke (razlog, zavisnosti, zapis u dnevniku). Forme za izmjenu nema u samoj kartici
  — uređuje se isključivo kroz dijalog.
- **Prisilna promjena svih lokalnih lozinki** — svim lokalnim nalozima (osim SUPER_ADMIN i Microsoft naloga)
  postavlja se obavezna promjena lozinke i prekidaju se sve njihove sesije; samu lozinku korisnik mijenja pri
  sljedećoj prijavi.

### Za administratore: passkey (FIDO2) — uslovi i dijagnostika

Passkey je drugi faktor pored koda iz aplikacije. Uslovi bez kojih ne radi (sve su postavke instalacije, ne korisnika):

- **HTTPS i tačan naziv hosta.** `CORS_ORIGIN` (ili `WEBAUTHN_RP_ID`) mora odgovarati adresi koju korisnik otvara
  u pregledniku, npr. `https://helpdesk.firma.ba`. Ako se aplikacija otvara preko `localhost`, IP adrese ili
  drugačijeg imena, preglednik odbije ceremoniju (`SecurityError`), a potvrda na serveru padne.
- **QR tok (telefon kao autentifikator)** traži **javnu domenu** i uključen Bluetooth na oba uređaja. Za
  `localhost` i IP adrese telefon ne može sačuvati passkey — na telefonu se pojavi poruka „nešto je pošlo po
  zlu“, a na računaru istekne čekanje. Za probu na istoj mašini koristite Windows Hello / Touch ID.
- **Dodavanje iz profila:** **Moj profil → Sigurnost naloga → Passkey → Dodaj passkey**. Ako nalog ima uključen
  kod iz aplikacije, kod se traži **poslije** potvrde na uređaju.
- **Neuspješna potvrda ne odjavljuje sesiju.** Pogrešan kod ili odbijena passkey potvrda samo prikažu poruku;
  sesija ostaje aktivna (ranije je 401 iz potvrde odjavljivao korisnika).
- **Dijagnostika:** server u log ispisuje razlog odbijanja (`passkey registration refused …` /
  `passkey assertion refused …`) — poruka imenuje šta nije odgovaralo (origin, RP ID, challenge, brojač).

Na tabu **Nadzor** je i kartica **Sigurnosne metrike (zadnji sat)**: četiri pločice s brojevima (ukupno blokada,
najviše u minuti, neuspjesi drugog faktora i preskočene HIBP provjere) i grafik **Blokade (429)** i **Kašnjenja po
računu** — dvije trake stupaca, jedan stupac po minuti zadnjeg sata, sa zajedničkom skalom i najviše pet oznaka na
osi, pa grafik uvijek ostaje unutar kartice. Brojevi su agregirani po minuti i ne sadrže lične podatke.

## Polja, validacije i statusi

| Polje / status | Pravilo |
|---|---|
| Email | obavezan, format email adrese |
| Lozinka pri prijavi | obavezna; ne otkriva se da li email postoji |
| Nova lozinka | najmanje `private.auth.password.minLength` znakova (12–64); ne smije biti jednaka emailu, sadržavati naziv organizacije, dio email adrese ni biti među najčešćim lozinkama; uz istoriju, ne smije se ponoviti. Prisilna promjena na ekranu prijave prikazuje istu granicu (server je šalje uz odgovor o potrebi promjene) |
| Kod iz aplikacije | 6 cifara, tolerancija ±30 s |
| Rezervni kod | format `xxxxx-xxxxx`, jednokratan |
| Statusi prijave | `MUST_CHANGE_PASSWORD` (privremena/istekla lozinka), `MFA_REQUIRED` (upisana potvrda), `MFA_ENROLLMENT_REQUIRED` (obavezna, nije upisana), `CAPTCHA_REQUIRED` (traži se rješenje provjere), `CAPTCHA_FAILED` (rješenje nije prihvaćeno) |
| Trajanje međukoraka | promjena lozinke 15 minuta, potvrda u dva koraka 5 minuta |
| Sesija | 1 sat, produžava se dok radite; miran tab se sam odjavljuje |

## Česta pitanja i greške

| Poruka / situacija | Šta znači i šta uraditi |
|---|---|
| „Prijava nije uspjela. Provjerite email i lozinku.“ | Pogrešan email ili lozinka; ne govori koji je od njih pogrešan. |
| `429 TOO_MANY_LOGIN_ATTEMPTS` | Dosegnut je privremeni prag za lokalne prijave s ove IP adrese; nalog nije zaključan. Sačekajte da IP prozor istekne pa pokušajte ponovo. |
| `CAPTCHA_REQUIRED` — pojavi se „Provjera da niste robot“ | S vaše adrese je palo pet prijava pa server traži ljudski dokaz. Riješite provjeru i pošaljite prijavu ponovo; provjera se traži dok traje prozor neuspjeha. |
| „Provjera se nije učitala. Provjerite vezu…“ | Preglednik (ili server) nema pristup Cloudflare Turnstile servisu. Provjerite vezu i pokušajte ponovo; ako se ponavlja, javite administratoru — na instalaciji bez izlaza na internet provjera ostaje isključena. |
| `CAPTCHA_FAILED` — „Provjera nije prihvaćena“ | Rješenje je isteklo ili je već iskorišteno (jednokratno je); provjera se resetuje, riješite je ponovo i pošaljite prijavu. |
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
- **Provjera da niste robot** traži izlaz na internet i sa servera i iz preglednika korisnika; na instalaciji bez
  interneta ostaje isključena (`private.security.captcha.provider` na `none`). Traži se po **IP adresi**, pa je
  iza zajedničkog NAT-a dobija cijeli ured nakon pet zajedničkih neuspjeha.
- **Jeftino je samo za korisnika:** ako ostane bez telefona i rezervnih kodova, put je preko administratora
  (**Reset MFA**), bez samoopsluživanja.

## Povezani moduli

- Instalacija (prvi SuperAdmin i način prijave): `docs/user-guide/instalacija.md`
- Korisnici i uloge: **Korisnici**, **Uloge i dozvole**
- Teze: **T15**, **T18**, **T19**, **T20**, **T21**, **T22**
- Analiza modula: `REVIEW_ANALIZA.md` §M2
