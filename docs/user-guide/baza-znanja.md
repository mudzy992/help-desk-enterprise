---
title: Baza znanja
slug: baza-znanja
module: M14
part: korisnik
audience: [Korisnik, Agent, Administrator]
roles: []
order: 40
tags: [baza-znanja, clanci, kategorije, ocjene, review-cycle]
---
# Baza znanja

> **Namjena:** modul drži uputstva, politike i rješenja na jednom mjestu, nudi ih korisniku **prije** nego
> otvori tiket i vraća ih agentu kao predlog dok rješava. Članci imaju vlasnika i rok pregleda, a ocjene
> čitalaca utiču na to koji se članci predlažu.

## Čemu služi ovaj modul

- **Self-service članci:** korisnik traži i čita uputstva bez otvaranja tiketa (portal sa kategorijama i
  često postavljanim pitanjima).
- **Presretanje tiketa:** pri kreiranju tiketa sistem predlaže do 8 članaka; ako članak riješi problem,
  korisnik to potvrdi i tiket ne mora nastati.
- **Ocjene i komentari:** članak se ocjenjuje zvjezdicama 1–5, ocjena utiče na redoslijed predloga u
  presretanju, a uz nisku ocjenu čitalac može napisati „šta nedostaje“ (vidi to samo urednik).
- **Vlasništvo i ciklus pregleda:** svaki članak ima vlasnika (korisnika **ili** grupu) i rok pregleda;
  vlasnik dobija obavještenje prije roka, a članak kojem je rok prošao označen je kao **zastarjelo**.
- **Članak iz odgovora:** agent na javnom odgovoru može kliknuti **Napravi članak** i od njega napraviti
  nacrt članka, uz automatsko uklanjanje ličnih podataka iz teksta.

## Kome je namijenjen

| Rola | Šta radi |
|---|---|
| **Korisnik** | Traži i čita objavljene članke, ocjenjuje ih 1–5 i (uz nisku ocjenu) piše šta nedostaje; pri kreiranju tiketa dobija predloge. |
| **Agent** | Piše i uređuje članke, pravi nacrt iz javnog odgovora, smješta članak u kategoriju i FAQ (ako ima pravo pisanja i u opsegu je servisa/OJ). |
| **Reviewer** | Vodi članak kroz pregled („Pošalji na pregled“, „Odobri pregled“, „Vrati u nacrt“). |
| **ADMIN / SUPER_ADMIN** | Objavljuje i arhivira članke, uređuje kategorije baze znanja, vidi tab **Uvidi** i označava komentare riješenim; trajno brisanje članka može samo **SUPER_ADMIN**. |

## Kako doći

1. **Portal:** meni **Baza znanja** (dostupan svim prijavljenim korisnicima).
2. **Presretanje:** **Kreiraj tiket** → korak 3 („Baza znanja“).
3. **Članak iz odgovora:** detalj tiketa → javni odgovor agenta → meni **⋯** → **Napravi članak**.
4. **Uvidi:** **Baza znanja** → tab **Uvidi** (vidljiv ako imate pravo pisanja, pregleda ili objave).
5. **Postavke (administrator):** **Postavke** → grupa **Baza znanja** → *Ciklus pregleda*, *Feedback*,
   *Rangiranje*, *Portal (FAQ)*.

## Korak po korak

### 1. Pretraga i čitanje (svaki korisnik)

1. Otvorite **Baza znanja**; zadano je otvoren tab **Portal**.
2. Na vrhu je **Često postavljana pitanja** (harmonika — klik na pitanje otvara odgovor bez učitavanja nove
   stranice), ispod su **Kategorije** sa brojem članaka; „Bez kategorije“ skuplja članke koji nisu smješteni.
3. Klik na kategoriju prikazuje njene članke; **Nazad na portal** vraća na početak.
4. Za slobodnu pretragu idite na tab **Svi članci** i koristite polje **Pretraži članke** (kad je upit
   prazan, lista je poredana po datumu izmjene, a uz upit se koristi full-text pretraga i rangiranje po
   korisnosti).
5. Članak otvarate klikom na naslov; neobjavljene članke (nacrt, za pregled) vide samo vlasnik, recenzent i
   osobe s pravom pisanja/pregleda u tom opsegu.

### 2. Ocjena i komentar (svaki korisnik)

1. Na objavljenom članku pitanje je **Koliko vam je ovaj članak pomogao?** — klik na zvjezdicu 1–5.
2. Uz ocjenu **1 ili 2** pojavljuje se polje **Šta nedostaje u članku?** (neobavezno, najviše 500 znakova);
   uz ocjenu 3–5 komentar nije moguć.
3. Klik **Pošalji**; potvrda je „Hvala na ocjeni.“ Ocjenu možete promijeniti bilo kada — glas je jedan po
   korisniku po članku.
4. Komentar vide **samo urednici baze znanja** i pojavljuje se u **Uvidi** → *Otvoreni komentari čitalaca*.

### 3. Presretanje pri kreiranju tiketa (korisnik)

1. U wizardu **Kreiraj tiket**, na koraku **Baza znanja**, sistem prikazuje predloge za odabrani servis.
2. Pored svakog predloga možete odmah reći **Pomoglo** ili **Nije pomoglo** (vaš glas se pamti).
3. Klik na naslov otvara članak u bočnom panelu.
4. Ako je članak riješio problem, kliknite **Članak je riješio moj problem** — poruka potvrđuje da se tiket
   ne kreira. Ako članci nisu pomogli, kliknite **Nastavi sa slanjem** i pošaljite tiket.

### 4. Pisanje i objava članka (agent/administrator)

1. Na tabu **Svi članci** kliknite **Novi članak** (ili **Novi članak za “…”** kad je upit u pretrazi).
2. Popunite **Naslov**, **Sadržaj**, **Servis** i **Organizacijska jedinica** (obavezno), pa **Tip vlasnika**
   (**Korisnik** ili **Grupa**) i vlasnika, po potrebi **Reviewer** i **Klasifikacija**.
3. Upišite **Razlog** i kliknite **Kreiraj**; članak nastaje kao **Nacrt**.
4. Kada je tekst spreman: **Pošalji na pregled** (uz razlog) → recenzent klikne **Odobri pregled** ili
   **Vrati u nacrt** → zatim **Objavi**. Objava bez prethodnog pregleda nije moguća.
5. Objavljen članak možete vratiti u pregled, u nacrt ili ga **Arhivirati** (uz razlog). Arhiviran članak
   nestaje iz portala i presretanja.
6. **Obriši članak** (trajno) vidi samo SUPER_ADMIN; brišu se i ocjene tog članka.

### 5. Kategorije i FAQ (administrator)

1. Otvorite **Portal** i kliknite **Uredi kategorije**.
2. **Nova kategorija**: **Ključ** (mala slova, brojevi i crtica; ne mijenja se nakon kreiranja), **Naziv
   (bosanski)** i **Naziv (engleski)**, **Nadređena kategorija** (bez nadređene = prvi nivo, najviše dva
   nivoa), **Ikona** i **Redoslijed**.
3. Kategoriju s člancima ili podkategorijama ne možete arhivirati; prvo premjestite ili arhivirajte sadržaj.
   **Arhiviraj** / **Vrati** mijenja vidljivost na portalu (ključ ostaje).
4. **Smještaj na portalu** (na članku): **Kategorija**, **Prikaži među često postavljanim pitanjima** i
   **Redoslijed u FAQ-u** (manji broj se prikazuje prije) → **Sačuvaj smještaj** (uz razlog).

### 6. Uvidi u sadržaj (urednici)

1. Otvorite tab **Uvidi**. Prikazuje se: **Najčitaniji (30 dana)**, **Najslabije ocijenjeni (min. 5 ocjena)**,
   **Bez pregleda 90 dana** i **Otvoreni komentari čitalaca**.
2. Kod komentara kliknite **Označi riješenim** kad je članak dopunjen; komentar tada nestaje iz liste.

### 7. Članak iz odgovora (agent)

1. U detalju tiketa, na **javnom odgovoru agenta**, otvorite meni **⋯** → **Napravi članak**
   (nije dostupno na povjerljivom tiketu ni na internoj bilješci).
2. Otvara se panel **Članak iz odgovora** sa prijedlogom naslova i teksta u kojem su lični podaci zamijenjeni
   oznakama; traka prikazuje koliko je šta zamijenjeno („Zamijenjeno: e-mail …, osobe …, IP …, telefon …“).
3. **Provjerite tekst** (uputa: „Provjerite da u tekstu nema drugih povjerljivih podataka“) i po potrebi ga
   dopunite; izvor je naveden kao **Izvorni tiket**.
4. Klik **Sačuvaj nacrt** kreira članak u statusu **Nacrt**, povezan sa tiketom i odgovorom; na tiketu se
   pojavi interni zapis „Napravljen nacrt članka“ (vidi ga samo osoblje).

## Polja, validacije i statusi

### Članak

| Polje | Pravilo |
|---|---|
| **Naslov** | Obavezno, do 200 znakova |
| **Sadržaj** | Obavezno, do 20 000 znakova |
| **Servis**, **Organizacijska jedinica** | Obavezno; određuju ko članak smije vidjeti i mijenjati |
| **Klasifikacija** | `INTERNAL` (zadano — vidi svaki prijavljeni korisnik), `CONFIDENTIAL` (osoblje u opsegu OJ + servisa), `RESTRICTED` (samo ADMIN u opsegu) |
| **Tip vlasnika / vlasnik** | Korisnik **ili** grupa (ne oboje); ako je grupa, obavještenja idu svim članovima |
| **Reviewer** | Opcionalno; recenzent vidi članak i kad nije objavljen |
| **Razlog** | Obavezan za svaku promjenu (kreiranje, izmjena, promjena statusa, smještaj) |

### Statusi i prelazi

| Status | Značenje | Dozvoljeni prelaz |
|---|---|---|
| **Nacrt** (DRAFT) | Radi se na tekstu | → **Za pregled** |
| **Za pregled** (IN_REVIEW) | Čeka recenzenta | → **Nacrt** ili → **Objavljen** |
| **Objavljen** (PUBLISHED) | Vidljiv po pravilima klasifikacije | → **Za pregled**, → **Nacrt**, → **Arhiviran** |
| **Arhiviran** (ARCHIVED) | Sklonjen s portala | nema dalje (ostaje u bazi) |

### Postavke (grupa **Baza znanja**)

| Postavka | Zadano | Šta radi |
|---|---|---|
| Ciklus pregleda — uključen | **da** | Uključuje rok pregleda i oznaku „zastarjelo“ |
| Dani do pregleda | **180** | Rok koji se postavlja pri objavi i odobrenju pregleda |
| Dani do „zastarjelo“ | **365** | Rok od posljednjeg pregleda/objave |
| Dani prije podsjetnika | **14** | Koliko prije roka vlasnik dobija obavještenje |
| Feedback — uključen | **da** | Dozvoljava ocjene i glasove na člancima |
| Jedan glas po korisniku | **da** | Ocjena se može mijenjati, ali je samo jedna po članku |
| Težina feedbacka u rangiranju | **da** | Ocjene i glasovi utiču na redoslijed u presretanju |
| FAQ na portalu | **8** (1–20) | Broj pitanja u sekciji „Često postavljana pitanja“ |

### Poruke grešaka koje možete sresti

| Poruka | Značenje |
|---|---|
| „Prijava je potrebna za bazu znanja.“ | Sesija je istekla — prijavite se ponovo |
| „Nemate dozvolu za izmjenu članaka.“ | Nedostaje pravo pisanja/pregleda/objave za taj servis i OJ |
| „Članak nije pronađen.“ | Članak je obrisan ili nemate pravo da ga vidite |
| „Unos nije ispravan. Provjerite naslov, sadržaj i razlog izmjene.“ | Nedostaje obavezno polje ili je razlog prekratak |
| „Kategorija nije ispravna, već postoji ili nije prazna. Osvježite i pokušajte ponovo.“ | Ključ je zauzet, kategorija je treći nivo ili ima sadržaj |
| „Izvorni odgovor nije pronađen ili nije javni odgovor agenta.“ | Meni „Napravi članak“ je upotrijebljen na poruci koja nije javni odgovor agenta |
| „Ocjena mora biti od 1 do 5; komentar je moguć samo uz ocjenu 1 ili 2.“ | Komentar uz ocjenu 3–5 ili ocjena van 1–5 |
| „Objavljivanje traži prethodni pregled.“ (kod `PUBLISH_REVIEW_REQUIRED`) | Članak nije prošao **Odobri pregled** |

## Česta pitanja i greške

- **„Zašto ne vidim članak koji kolega vidi?“** — klasifikacija i opseg odlučuju: `INTERNAL` objavljen
  članak vidi svaki prijavljeni korisnik, `CONFIDENTIAL` traži osoblje u opsegu OJ i servisa, a `RESTRICTED`
  samo ADMIN u tom opsegu; neobjavljene vide vlasnik, recenzent i osobe s pravom.
- **„Zašto mi je članak označen kao zastarjelo?“** — prošao je rok pregleda ili je od posljednjeg pregleda
  prošlo više od „Dani do zastarjelo“. Recenzent klikom **Odobri pregled** pomjera rok i skida oznaku.
- **„Ne mogu objaviti članak.“** — objava traži prethodni pregled: prvo **Pošalji na pregled**, pa
  **Odobri pregled**.
- **„Obrisao sam kategoriju, a članci su ostali.“** — kategorija se ne briše, nego **arhivira**; server
  to dozvoljava i kad u njoj ima članaka (blokira samo aktivne podkategorije), a članci arhivirane kategorije
  prikazuju se pod „Bez kategorije“. Uputa na ekranu zato obećava više nego što server provjerava (nalaz B7).
- **„Gdje ide komentar ‘šta nedostaje’?“** — u **Uvidi** → *Otvoreni komentari čitalaca*, gdje ga urednik
  može označiti riješenim; drugi korisnici ga ne vide.
- **„Kako se članak predlaže pri kreiranju tiketa?“** — po servisu, uz rangiranje po poklapanju teksta,
  glasovima „pomoglo/nije pomoglo“ i prosječnoj ocjeni (izglađenoj, da jedan glas ne dominira).
- **„Presretanje mi stalno nudi isti članak.“** — glasajte **Nije pomoglo**; vaš glas ulazi u rangiranje, a
  administrator može isključiti težinu feedbacka u postavkama.
- **„Zašto je broj pregleda velik za članak koji niko ne otvara?“** — pregled se trenutno bilježi čim se
  članak otvori (uključujući brza otvaranja i automatske posjete); pravilo o pet sekundi iz plana nije
  primijenjeno (nalaz B4 iz §M14).

## Poznata ograničenja

- **Zaštita ličnih podataka pri nastanku članka radi i na serveru.** Panel „Članak iz odgovora“ zamjenjuje
  imena, e-mailove, telefone i IP adrese, a **server ponavlja istu zamjenu pri upisu** — čak i ako se pošalje
  tekst bez pregleda, lični podaci ne ulaze u članak; odgovor nosi spisak zamjena, a radnja ide u audit.
  (Nalaz B1 iz §M14 — zatvoren u valu 2.)
- **Obavještenje „Pregled KB članka dospijeva“ se prikazuje bez naslova** (kao generičko „Obavještenje“) i klik
  ne vodi na članak. (Nalaz B2.)
- **„Članak je riješio moj problem“ ne sprječava slanje tiketa** i bilježi se uz **prvi** predlog, ne uz
  članak koji je stvarno pomogao; greška poziva se ne prikazuje. (Nalaz B3.)
- **Pregledi se broje odmah pri otvaranju** (bez pravila „5 sekundi ili skrol“), pa uvidi i izvještaj mogu
  precijeniti čitanost. (Nalaz B4.)
- **Lista članaka nema paginaciju**, a vidljivost se provjerava po članku — na velikom fondu lista i
  presretanje mogu biti sporiji. (Nalaz B5.)
- **Kolona „zastarjelo“ u bazi se ne održava** — oznaka se računa pri čitanju, pa odgovor poslije izmjene
  članka može nakratko pokazati pogrešno stanje. (Nalaz B6.)
- **Arhiviranje kategorije nije zaštićeno kako piše u uputi** — server dozvoljava arhiviranje i kad
  kategorija ima članaka (blokira samo aktivne podkategorije), a članci tada idu pod „Bez kategorije“.
  (Nalaz B7.)

## Povezani moduli

- **Tiketi** — presretanje pri kreiranju, interni zapis o nacrtu članka i veza članka s izvornim odgovorom.
- **Šabloni i playbooks** — korak playbooka može voditi na članak baze znanja.
- **Izvještaji** — paket „Znanje“ (korisnost članka sa ocjenama i pregledima) i nadzorna ploča
  („koliko je tiketa izbjegnuto“ presretanjem).
- **Obavještenja** — podsjetnik vlasniku članka prije roka pregleda.
- **Postavke** — grupa **Baza znanja** (ciklus pregleda, feedback, rangiranje, FAQ).
- **Privatnost** — pravilo o zamjeni ličnih podataka pri stvaranju članka i čuvanju komentara.

---

*Ažurirano: 2026-10-03 · Modul: Baza znanja (M14)*
