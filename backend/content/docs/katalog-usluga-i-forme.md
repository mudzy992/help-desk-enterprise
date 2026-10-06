# Katalog usluga i forme

> **Namjena:** katalog usluga je mjesto na kojem administrator definiše šta korisnici mogu tražiti (kategorije →
> usluge), a **forma** po usluzi određuje koja se polja prikazuju pri prijavi tiketa. Urednice i forme se
> uređuju na ekranu **Katalog usluga** (sekcija **Usluge i znanje**), a korisnici ih koriste kroz **Prijavi tiket**.

## Čemu služi ovaj modul

- **Kategorije (grupe usluga)** drže usluge u stablu (npr. „IT“ → „Oprema“), pa se pri prijavi tiketa usluga
  traži u poznatoj grupi.
- **Usluga** je ono što korisnik bira pri prijavi tiketa. Usluga ima **životni ciklus** (Nacrt → Aktivna →
  Ukinuta), **status dostupnosti** i opciono **zahtijeva odobrenje**.
- **Forma** pripada tačno jednoj usluzi i ima **verzije**. Kad su forme uključene, novi tiket veže aktivnu
  verziju ako postoji; postavka `requireVersionOnTicket` određuje da li je ta veza obavezna. Isključene forme
  znače da tiket nema vezanu verziju. Detalji su u *Postavke toka formi*.
- **Onboarding čarobnjak** vodi kroz pet koraka (Servis → Forma → Usmjeravanje → SLA → Odobrenja) i na kraju
  aktivira uslugu.
- **Prekidi rada (downtime)** su informativni: prijava tiketa **ostaje dozvoljena** i kad je usluga u
  održavanju.

## Kome je namijenjen

| Rola | Šta može |
|---|---|
| **Korisnik** | Vidi aktivne usluge i njihov status pri prijavi tiketa; popunjava formu ako je tok formi uključen. |
| **Agent** | Isto kao korisnik; u zaglavlju tiketa vidi broj vezane verzije forme kada tiket ima takvu vezu. |
| **ADMIN** (uz `service.catalog.write`) | Kategorije, usluge, životni ciklus, brisanje nacrta, pokretanje onboardinga. |
| **ADMIN** (uz `service.forms.write`) | Forme i verzije (kreiranje, izmjena nacrta, aktivacija, nova verzija). |
| **ADMIN** (uz `service.availability.write`) | Status dostupnosti i zakazivanje prekida. |
| **SUPER_ADMIN** | Sve navedeno, bez obzira na režim samo za čitanje. |

## Kako doći

1. Prijavite se i otvorite sekciju **Usluge i znanje** → **Katalog usluga**.
2. Ekran ima dva taba: **Katalog** (usluge) i **Grupe usluga** (kategorije).
3. Ako je modul zaključan, na vrhu stoji obavještenje **„Katalog usluga je privremeno zaključan za izmjene…“**;
   pregled radi, a dugmad za izmjene su onemogućena (osim SuperAdminu koji može zaobići režim po postavci).
4. Za prijavu tiketa: **Prijavi tiket** → izbor usluge → forma → provjera baze znanja → pregled i potvrda.

## Korak po korak

### 1. Grupe usluga (kategorije)

1. Tab **Grupe usluga** → dugme **Nova grupa**.
2. Unesite **Naziv**, **Slug** (nepromjenjiv poslije kreiranja) i opciono **Nadređena grupa** (**Nema (korijen)**)
   i **Redoslijed**.
3. Sačuvajte. Brisanje je moguće samo ako grupa nema podgrupe ni usluge.

### 2. Nova usluga

1. Tab **Katalog** → dugme **Nova usluga**.
2. Popunite **Naziv**, **Slug** (samo pri kreiranju; kasnije se ne mijenja), **Kategorija** i prekidač
   **Zahtijeva odobrenje**.
3. Upišite **Razlog izmjene** (obavezno polje) i kliknite **Kreiraj uslugu**. Usluga se kreira u statusu
   **Nacrt** i tada je ne vide korisnici.

### 3. Forma i verzije

1. Na kartici usluge kliknite **Uredi formu** (ili **Kreiraj i aktiviraj formu** ako forma još ne postoji).
2. U panelu **Forma** kliknite **Kreiraj formu** — kreira se verzija 1 u statusu **Nacrt** s poljem
   „Dodatne informacije“ kao početnom točkom.
3. Polja dodajete dugmetom **Dodaj polje**: **Identifikator** (mala slova, brojevi i donja crta),
   **Oznaka**, **Tip**, **Obavezno**, **Placeholder**, **Pomoćni tekst** i, za tipove izbora, **Opcije**.
   Redoslijed mijenjate dugmadima **Gore**/**Dolje**, a polje uklanjate s **Ukloni**.
4. Kliknite **Sačuvaj nacrt**.
5. Kliknite **Aktiviraj verziju**. Aktivacijom prethodna aktivna verzija prelazi u **Povučena** (osim ako je
   postavkom dozvoljeno više aktivnih verzija), a stari tiketi ostaju vezani za svoju verziju.
6. Za novu verziju (npr. poslije izmjene aktivne forme) kliknite **Nova verzija iz odabrane** — dobijate kopiju
   u statusu **Nacrt**. Verzija koja je aktivna ili ima tikete se **ne može** mijenjati („Ova verzija se ne može
   mijenjati. Napravite novu DRAFT verziju.“).

### 4. Aktivacija usluge

- Na kartici usluge koristite **Aktiviraj** (iz **Nacrta**), **Označi zastarjelim** (iz **Aktivne**) i
  **Vrati u aktivno** (iz **Ukinute**).
- **Obriši nacrt** je dostupno samo za **Nacrt** i samo ako usluga nema tikete, verzije forme, routing pravila
  ni dodjele rola.
- Korisnici vide i biraju isključivo **Aktivne** usluge; **Ukinute** ostaju u administraciji i izvještajima.

### 5. Onboarding čarobnjak

1. Dugme **Onboarding čarobnjak** (ili **Pokreni onboarding** na kartici nacrta).
2. Koraci: **Servis** → **Forma** → **Usmjeravanje** → **SLA** → **Odobrenja**.
3. Završetak (**finalizacija**) provjerava sve korake; ako nešto nedostaje, prikazuje listu problema i
   **ne aktivira** uslugu. Kod uspjeha usluga prelazi u **Aktivna**, dobija izabrani **SLA profil**, a polje
   „Zahtijeva odobrenje“ se usklađuje s korakom Odobrenja. Ako nema routing pravila, prikazuje se upozorenje
   (usluga se ipak aktivira, a tiket ide u nepokriveni tok).

### 6. Status dostupnosti i prekidi

1. Na kartici usluge otvorite akcije i izaberite status: **Dostupno**, **Smanjena**, **Nedostupno**,
   **Održavanje** (po potrebi upišite razlog — zavisi od postavke).
2. Dugme **Zakaži prekid** otvara panel **Prekidi rada** s poljima **Početak**, **Kraj** i **Poruka
   korisnicima**; prozori se **ne smiju preklapati**, a brisanje prozora traži razlog.
3. Dok je prozor aktivan, status u katalogu se prikazuje kao **Održavanje**, uz napomenu
   **„Trenutno nedostupno — prijava tiketa nije blokirana“**.

## Polja, validacije i statusi

### Usluga

| Polje | Pravilo | Napomena |
|---|---|---|
| Naziv | obavezno, do 128 znakova, višestruki razmaci se svode na jedan | |
| Slug | obavezno pri kreiranju, do 64 znaka, samo mala slova/cifre/crtice | jedinstven; ne mijenja se kasnije |
| Kategorija | obavezna, mora postojati | bez kategorija uslugu nije moguće kreirati |
| Zahtijeva odobrenje | prekidač | utiče na broj koraka odobrenja (0 ili 1) |
| Razlog izmjene | obavezan za potvrdu radnje (do 512 znakova) | vidi *Poznata ograničenja* |

### Forma

| Pravilo | Vrijednost |
|---|---|
| Tipovi polja | Tekst, Dugi tekst, Broj, Da/Ne, Izbor, Višestruki izbor, Datum, Datum i vrijeme, Email |
| Identifikator polja | `mala_slova_brojevi_donja_crta`, do 64 znaka, počinje slovom |
| Oznaka | obavezna, do 128 znakova |
| Pomoćni tekst | do 512 znakova |
| Broj polja | do 64 po formi |
| Opcije za Izbor / Višestruki izbor | obavezne, do 64, vrijednosti jedinstvene |
| Redoslijed | jedinstven cijeli broj ≥ 0 |
| Statusi verzije | **Nacrt** (mijenja se), **Aktivna** (koriste je novi tiketi), **Povučena** (stari tiketi) |

### Validacija podataka forme

Forma se provjerava i u pregledniku i na serveru. Server je mjerodavan pri **kreiranju** i pri izmjeni
`formData` na postojećem tiketu; validira prema šemi verzije vezane za taj tiket. Kreiranje provjerava cijeli
objekat, a izmjena samo poslana polja: polja koja nisu poslana zadržavaju postojeću vrijednost, dok slanje
`null` ili prazne vrijednosti za obavezno polje može biti odbijeno. Nepoznata polja se odbijaju.

| Tip / pravilo | Serverska provjera |
|---|---|
| Obavezno | Nedostajuće ili prazno obavezno polje daje `REQUIRED`; `false` je važeća vrijednost za Da/Ne. |
| Tekst, dugi tekst, email | Provjerava string, `minLength`/`maxLength` i `pattern`; tip Email dodatno traži znak `@` (nije puna provjera isporučivosti adrese). |
| Broj | Prihvata konačan broj ili numerički tekst; provjerava `integer`, `min` i `max` kada su zadani. |
| Da/Ne | Prihvata samo pravu JSON vrijednost `true` ili `false`. |
| Izbor / Višestruki izbor | Izbor mora biti tekst, višestruki izbor lista tekstova; za listu se provjeravaju `minItems` i `maxItems`. Interfejs nudi samo opcije šeme. |
| Neispravna vrijednost ili nepoznato polje | `INVALID`; server vraća `FORM_DATA_INVALID` s listom polja i kodom `REQUIRED` ili `INVALID`. Poznata polja prikazuju **„Ovo polje je obavezno.“** / **„Vrijednost nije ispravna.“**; nepoznati ključevi daju opću grešku validacije. |

### Postavke toka formi

| Postavka | Ponašanje pri kreiranju tiketa |
|---|---|
| `private.ticket.forms.enabled = false` | Forma se ne prikazuje pri prijavi; tiket se kreira bez `formVersionRef`. Poslana polja forme se odbijaju jer nema vezane šeme. |
| Forme uključene, `private.ticket.forms.versioning.requireVersionOnTicket = false` | Ako aktivna verzija postoji, koristi se; ako je nema, tiket može biti kreiran bez vezane forme. |
| `private.ticket.forms.versioning.requireVersionOnTicket = true` | Ako aktivna verzija ne postoji, kreiranje se odbija postojećom greškom `FORM_VERSION_REQUIRED`. |

Postavka toka kreiranja ne ukida uslov za **prelaz usluge iz Nacrta u Aktivnu**: serverska aktivacija bez
aktivne verzije forme vraća `409 NO_ACTIVE_FORM_VERSION`.

### Statusi usluge

| Status | Znači | Vide korisnici |
|---|---|---|
| **Nacrt** | priprema | ne |
| **Aktivna** | nudi se pri prijavi tiketa | da |
| **Ukinuta** | ne nudi se novim tiketima | ne |

| Dostupnost | Prikaz |
|---|---|
| OPERATIONAL | Dostupno |
| DEGRADED | Smanjena |
| DOWN | Nedostupno |
| MAINTENANCE | Održavanje |

## Česta pitanja i greške

- **„Zašto korisnici ne vide uslugu?“** — Usluga mora biti **Aktivna**. Pri prelazu u Aktivnu server zahtijeva
  aktivnu verziju forme (`409 NO_ACTIVE_FORM_VERSION`); na prijavi tiketa prikaz i obaveznost forme dalje
  zavise od postavki u *Postavke toka formi*.
- **„Zašto je prijava forme odbijena?“** — Server ponovo provjerava polja po šemi; `FORM_DATA_INVALID` sadrži
  `REQUIRED` ili `INVALID` za konkretno polje, a nepoznata polja se odbijaju. Provjerite tip, obaveznost,
  granice i obrazac iznad.
- **„Polje je označeno obavezno, a tiket je prošao bez njega.“** — Pri kreiranju i izmjeni podataka forme
  obavezna polja provjerava server. Dodatna pravila za rješavanje/zatvaranje (close code, napomena i globalna
  ili po-servisu obavezna polja) ostaju zasebna provjera statusa.
- **„Ne mogu sačuvati izmjenu polja.“** — Verzija je aktivna ili ima tikete; napravite **Novu verziju iz
  odabrane** i izmijenite nacrt.
- **„Nema opcija za polje Izbor.“** — Za tipove izbora opcije su obavezne: dodajte bar jednu opciju
  (**Dodaj opciju**) prije čuvanja.
- **„Kategorija usluge nije pronađena.“** — Kategorija je obrisana; osvježite ekran i izaberite drugu
  (`errorCategory`).
- **„Slug već postoji.“** — Izaberite drugi slug; slug se ne mijenja nakon kreiranja.
- **„Ovaj prijelaz životnog ciklusa nije dozvoljen.“** — Dozvoljeno je samo Nacrt → Aktivna, Aktivna → Ukinuta
  i Ukinuta → Aktivna.
- **„Usluga ima zavisne zapise i ne može se obrisati.“** — Postoje tiketi, verzije forme, routing pravila ili
  dodjele rola; brisanje nije moguće.
- **„Ne mogu zakazati prekid.“** — Prozor se preklapa s postojećim ili je kraj prije početka; zakazivanje može
  biti i isključeno postavkom.
- **„Katalog je privremeno zaključan.“** — Modul je u režimu samo za čitanje; izmjene radi SuperAdmin ili se
  režim mora isključiti u postavkama.

## Poznata ograničenja

- **Nacrt usluge i nacrt forme vidljivi su samo administratorima.** Agenti vide aktivne i povučene
  (`DEPRECATED`) usluge, a korisnici samo aktivne; ako se nacrt zatraži direktno preko API-ja, odgovor je
  **nije pronađeno** — ne otkriva ni postojanje zapisa.

- **Provjera Email polja je namjerno osnovna.** Server, kao i ekran za prijavu, traži znak `@`; ne provjerava
  punu sintaksu niti isporučivost adrese.
- **Za tipove Izbor i Višestruki izbor server provjerava oblik vrijednosti i broj stavki, ne članstvo svake
  vrijednosti u opcijama šeme.** Ekran nudi definisane opcije; API klijent i dalje treba slati vrijednosti koje
  odgovaraju tim opcijama.
- **Razlog izmjene iz forme kataloga se ne čuva** u change logu, a diff izmjene usluge ne sadrži sva
  promijenjena polja. (Nalaz B6.)
- **Kroz formu kataloga ne možete postaviti** klasifikaciju, „povjerljivo po pravilu“, strategiju automatske
  dodjele ni policy paket — to rade API/wizard/policy paketi. **SLA profil** se postavlja isključivo kroz
  onboarding čarobnjak. (Nalaz B7.)

## Povezani moduli

- **Prijava i MFA** — ko može pristupiti ekranu.
- **Uloge i permisije** — `service.catalog.write`, `service.forms.write`, `service.availability.write`.
- **Policy paketi** — paket se vezuje na uslugu i mijenja role/permisije.
- **Promjene** — zakazane promjene mogu otvoriti prekid rada na usluzi (prozor s vezom na promjenu).
- **Status/incidenti i planirani prekidi** — incidenti podižu efektivnu dostupnost usluge u katalogu.

---

*Ažurirano: 2026-10-06 · Modul: Katalog usluga i forme (M6)*
