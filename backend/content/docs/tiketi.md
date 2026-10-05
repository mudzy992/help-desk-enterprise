# Tiketi

> **Namjena:** tiket je osnovna jedinica rada — od prijave zahtjeva, preko preuzimanja u grupi i obrade, do
> rješavanja, zatvaranja i arhive. Ovaj vodič opisuje cijeli tok: kreiranje, liste i poglede, detalj tiketa,
> statuse, spajanje i dijeljenje, skupne akcije, sačuvane poglede, mjerenje vremena i priloge.

## Čemu služi ovaj modul

- **Prijava tiketa** ide kroz uslugu i njenu formu; sistem sam određuje **handler grupu** (v. *Usmjeravanje i
  prioritet*) i **prioritet** iz uticaja i hitnosti.
- **Grupni inbox** je radni red grupe: tiket stoji u grupi dok ga agent ne **preuzme**.
- **Tok statusa** je unaprijed definisan; nedozvoljeni prelasci se odbijaju, a zatvaranje zahtijeva close code,
  resolution note i obavezna polja.
- **Spajanje (merge)** povezuje duplikate u jedan parent tiket, a **dijeljenje (split)** pravi 2–10 pod-tiketa kad
  jedan zahtjev pokriva više tema.
- **Skupne akcije** rade samo unutar iste OU i grupe, bez zatvaranja, uz pregled i ograničenje za broadcast.
- **Mjerenje vremena** bilježi rad na tiketu, uz automatsku pauzu kad nema aktivnosti.

## Kome je namijenjen

| Rola | Šta može |
|---|---|
| **Korisnik** | Prijavljuje tikete, prati svoje zahtjeve, odgovara u porukama, ocjenjuje (CSAT), ponovo otvara u roku. |
| **Agent** | Vidi grupni inbox i tikete u svom OU/servis scope-u te tikete svoje grupe; preuzima, mijenja status, dodaje poruke, učesnike i priloge, mjeri vrijeme, spaja/dijeli i vodi skupne akcije u svojoj grupi. |
| **ADMIN** | Sve kao agent, uz skupne akcije i izvoz; podešava pravila modula u postavkama. |
| **SUPER_ADMIN** | Sve navedeno, uključujući skupne akcije preko OU granica (ako je postavka uključena). |

Vidljivost nije stvar dogovora: OU/servis scope, članstvo u trenutnoj handler grupi, učesništvo i pravila za
povjerljive tikete određuju ko šta vidi (SuperAdmin **nema** automatski pristup povjerljivim tiketima).

## Kako doći

1. **Lista tiketa:** sekcija **Tiketi** → **Svi tiketi** (pogledi su u zaglavlju liste).
2. **Grupni inbox:** sekcija **Tiketi** → **Grupni inbox** (ili tab **Grupni inbox** u listi).
3. **Prijava tiketa:** dugme **Prijavi tiket** (ili **Novi tiket**) → `/tickets/new`.
4. **Detalj tiketa:** klik na red u listi ili na broj tiketa.

## Korak po korak

### 1. Prijava tiketa (korisnik)

1. Otvorite **Prijavi tiket**.
2. Izaberite **uslugu**; forma usluge se učitava automatski (v. *Katalog usluga i forme*).
3. Popunite **naslov**, **opis**, **uticaj** i **hitnost**, te polja forme. Ako postoji sličan tiket, sistem
   prikazuje **upozorenje o duplikatu** i traži potvrdu.
4. Pregledajte sažetak (prioritet, routing ishod, odobrenja, SLA) i pošaljite.
5. Tiket dobija broj (`T-000001`), grupu i status — **Na čekanju** ili **Nije usmjereno**.

### 2. Rad iz grupnog inboxa (agent)

1. Otvorite **Grupni inbox** i tab svoje grupe.
2. Kliknite **Preuzmi** na tiketu — tiket prelazi u **Dodijeljeno** i vezuje se za vas.
3. Ako tiket nema grupu, vidjećete tab **Neusmjereni red** i prečicu **Kreiraj pravilo za ovu kombinaciju**.

### 3. Rad u detalju tiketa

1. **Promjena statusa:** izaberite novi status u zaglavlju i (ako se traži) popunite obavezna polja, close code i
   **napomenu o rješenju**.
2. **Poruke:** pišite u kompozitoru; birate tip poruke (javni odgovor ili interna bilješka, zavisno od postavki).
3. **Učesnici:** dodajte osobe s ulogom (npr. zaposleni uključen u problem); **pratilac** ne dobija pristup tiketu.
4. **Prilozi:** prevucite fajl ili ga izaberite; dozvoljeni su formati iz politike priloga (podrazumijevano PDF,
   PNG, JPG/JPEG, DOCX, XLSX, do 25 MB).
5. **Vrijeme:** pokrenite tajmer (**Start**) i zaustavite ga kad završite; tajmer se sam pauzira ako nema
   aktivnosti.
6. **Prioritet:** dugme **Promijeni prioritet** (v. *Usmjeravanje i prioritet*).

### 4. Spajanje i razdvajanje

1. Na tiketa (parent) otvorite akciju **Spoji**.
2. Izaberite do najviše 10 kandidata (ili do 50 tiketa ukupno) i upišite **razlog** (3–500 znakova).
3. Djeca se preusmjeravaju na parent tiket: poruke i status prate parent, a djeca postaju **samo za čitanje**.
4. **Razdvoji (unmerge)** vraća pojedinačno dijete u samostalan tiket.

### 5. Dijeljenje tiketa (split)

1. Na tiketu otvorite akciju **Podijeli tiket**.
2. Dodajte 2–10 djece: naslov, opis, servis i grupu po potrebi.
3. Izaberite poruke i priloge koji se prenose (ako ništa ne izaberete, dijete dobija samo referencu).
4. Upišite **razlog** i potvrdite — u tiketu se pojavljuje sistemski zapis s listom kreirane djece.

### 6. Skupne akcije (agent/admin)

1. U listi označite tikete (najviše 100).
2. Otvorite panel skupnih akcija i izaberite akciju: **Dodjela grupe/agenta**, **Promjena statusa**,
   **Promjena prioriteta**, **Obavijest (broadcast)** ili **Spajanje u parent**.
3. Za broadcast popunite strukturirana polja (**šta se dešava**, **koga pogađa**, **ETA**, opciono **workaround**);
   prikazuje se **broj primalaca** i poštuje se ograničenje slanja.
4. Upišite razlog (do 2000 znakova) i potvrdite. **Zatvaranje tiketa skupno nije dozvoljeno.**

### 7. Sačuvani pogledi

1. Podesite filtere, sort i kolone u listi.
2. Otvorite meni sačuvanih pogleda → **Sačuvaj pogled**, upišite naziv.
3. Pogled možete postaviti kao **podrazumijevani**; vidite ih samo vi (dijeljenje nije omogućeno).

## Polja, validacije i statusi

### Tiket

| Polje | Pravilo |
|---|---|
| Naslov | obavezno, do 200 znakova |
| Opis | obavezno, do 8000 znakova |
| Uticaj / Hitnost | obavezni, izbor: Nizak, Srednji, Visok, Kritičan |
| Usluga | obavezna; usluga mora biti aktivna i imati aktivnu formu |
| Povjerljivo | prekidač (može biti i podrazumijevano po usluzi) |
| Prilog | politika: tipovi, ekstenzije, veličina, broj po tiketu i poruci |

### Statusi i dozvoljeni prelazi

| Status | Znači | Tipični prelazi |
|---|---|---|
| **Na čekanju** (`PENDING`) | u grupi, čeka preuzimanje | → Dodijeljeno, U obradi, Čeka odobrenje (sistem), Zatvoreno |
| **Nije usmjereno** (`UNROUTED`) | nema handler grupe | → Na čekanju (prosljeđivanjem), Zatvoreno |
| **Čeka odobrenje** (`PENDING_APPROVAL`) | čeka odluku odobravalaca | → Na čekanju ili Zatvoreno (odlukom) |
| **Dodijeljeno** (`ASSIGNED`) | preuzeto | → U obradi, Na čekanju, Čeka korisnika, Zatvoreno |
| **U obradi** (`IN_PROGRESS`) | aktivna obrada | → Čeka korisnika, Riješeno, Dodijeljeno |
| **Čeka korisnika** (`WAITING_FOR_USER`) | čeka odgovor | → U obradi, Riješeno, Zatvoreno (automatika) |
| **Riješeno** (`RESOLVED`) | riješeno, čeka potvrdu | → Zatvoreno, U obradi (ponovno otvaranje) |
| **Zatvoreno** (`CLOSED`) | završeno | → Arhivirano (automatika), U obradi (ponovno otvaranje) |
| **Arhivirano** (`ARCHIVED`) | arhiva | samo za čitanje |

### Automatika i rokovi

| Pravilo | Podrazumijevano |
|---|---|
| Podsjetnik dok tiket čeka korisnika | 2 dana |
| Automatsko zatvaranje dok tiket čeka korisnika | 7 dana |
| Ponovno otvaranje | dozvoljeno 7 dana nakon rješavanja/zatvaranja |
| Arhiviranje zatvorenih tiketa | 30 dana |
| Raspored provjera | arhiva i čekanje korisnika svakih 15 minuta |

### Poruke i prilozi

| Element | Pravilo |
|---|---|
| Tipovi poruka | javni odgovor i interna bilješka (zavisno od postavki) |
| Učesnici | uloge; **pratilac** ne dobija pristup tiketu |
| Prilozi | do 25 MB, dozvoljeni tipovi/ekstenzije iz politike; opasne ekstenzije se odbijaju |
| Klasifikacija priloga | nasljeđuje se od tiketa; „spuštanje“ klasifikacije je zabranjeno |

### Skupne akcije, izvoz i mjerenje vremena

| Element | Pravilo |
|---|---|
| Obim skupne akcije | najviše 100 tiketa, ista OU **i** grupa (SuperAdmin može preko OU ako je uključeno) |
| Zatvaranje | **nije dozvoljeno** skupno |
| Broadcast | struktuirana polja obavezna, pregled primalaca, ograničenje slanja |
| Izvoz | CSV, najviše 5000 redova |
| Tajmer | jedan aktivan po korisniku, automatska pauza bez aktivnosti, ograničenje dužine sesije |

## Česta pitanja i greške

- **„Tiket ne mogu naći u listi.“** — Vidljivost zavisi od OU/servisa, članstva u handler grupi i povjerljivosti;
  korisnik u grupnom inboxu vidi samo radni red svoje grupe (vlastite tikete vidi u **Moji zahtjevi**).
- **„Preuzimanje nije moguće.“** — tiket nije u vašoj grupi ili je već preuzet; preuzimanje ima zaštitu od
  istovremenog preuzimanja.
- **„Prelaz statusa nije dozvoljen.“** — tok statusa je unaprijed definisan (tabela iznad); neke prelasce radi
  samo sistem ili odobravalac.
- **„Zatvaranje traži close code / napomenu / dodatna polja.“** — provjeravaju se close code, napomena o rješenju,
  globalna i po-servisu obavezna polja te (opciono) obavezna polja iz forme usluge.
- **„Tiket je zaključan za izmjene.“** — tiket je **spojen** kao dijete ili je **arhiviran** (samo za čitanje).
- **„Nije moguće spojiti tikete.“** — jedan od tiketa je zatvoren/arhiviran, povjerljivost se razlikuje, ili je
  prekoračen limit (10 kandidata / 50 djece).
- **„Skupna akcija je odbijena.“** — tiketi nisu u istoj OU i grupi, akcija nije na dozvoljenoj listi, ili je
  riječ o zatvaranju (koje skupno nije dozvoljeno).
- **„Broadcast je odbijen.“** — nisu popunjena obavezna polja (**šta se dešava**, **koga pogađa**, **ETA**) ili je
  dostignut limit slanja.
- **„Ponovno otvaranje nije moguće.“** — prošao je rok (podrazumijevano 7 dana) ili je funkcija isključena; u
  nekim slučajevima sistem otvara **novi** tiket povezan s originalom.
- **„Prilog je odbijen.“** — tip/ekstenzija nije na dozvoljenoj listi, fajl je veći od 25 MB, prekoračen je broj
  priloga ili je skeniranje označilo fajl kao problematičan.

## Poznata ograničenja

- **Politiku zadržavanja priloga vodi isključivo modul Privatnost** (kategorija *Prilozi*). Postavka
  *Zadržavanje priloga* u modulu Tiketi je označena kao **zastarjela i bez dejstva** i ne briše ništa — ako je
  trebate, uključite kategoriju u **Zaštita ličnih podataka → zadržavanje**. (Nalaz B1 iz §M8 — zatvoren u valu 2.)
- **Kolona „Prvi odgovor“** puni se pri prvom agentskom odgovoru i ne zavisi od SLA modula.
- **Ograničenje slanja broadcasta drži se u Redisu**, po korisniku i minuti, pa vrijedi za sve instance; ako
  Redis nije dostupan, limit se i dalje drži lokalno. (Nalaz B2 — zatvoren u valu 3.)
- **Dijeljenje sačuvanih pogleda je isključeno** bez obzira na postavku; pogledi su uvijek lični. (Nalaz B3.)
- **Lista po defaultu prikazuje i spojenu djecu** dok se ne uključi filter **Sakrij spojene**. (Nalaz B4.)
- **Ukupan broj tiketa u listi može zaostajati do 30 sekundi** (broj se kratko kešira zbog performansi); redovi
  su uvijek svježi. (Nalaz B5.)
- **Dugme za ponovno otvaranje ne prati postavku** `reopen.enabled` u listi dozvoljenih akcija — server će
  odbiti zahtjev ako je funkcija isključena. (Nalaz B7.)
- **Polja „tip zahtjeva“ i „rok (due date)“** iz projektnog zadatka ne postoje kao zasebna polja tiketa; tip
  zahtjeva nosi usluga i njena forma.

## Povezani moduli

- **Katalog usluga i forme** — usluga, forma i verzija s kojom je tiket kreiran.
- **Usmjeravanje i prioritet** — koja grupa prima tiket i kako se računa prioritet.
- **Prosljeđivanje tiketa** — promjena grupe uz razlog i historiju prosljeđivanja.
- **Odobrenja i CSAT** — koraci odobrenja prije obrade i ocjena zadovoljstva.
- **SLA** — rokovi odgovora i rješavanja po prioritetu.
- **Privatnost** — zadržavanje i brisanje sadržaja tiketa i priloga.
- **Šabloni i playbooks** — pripremljeni odgovori i koraci obrade.
- **Baza znanja** — predloženi članci pri kreiranju tiketa.

---

*Ažurirano: 2026-10-03 · Modul: Tiketi (M8)*
