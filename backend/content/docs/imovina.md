# Imovina (CMDB)

## Čemu služi ovaj modul

Modul Imovina vodi opremu organizacije: računare, monitore, štampače, mrežnu opremu, licence i ugovore.
Uz to pamti ko je šta zadužio, bilježi historiju i povezuje opremu s tiketima. Modul je **zadano isključen**.
Uključuje ga administrator (vidi [runbook aktivacije](../../ops/runbook/cmdb-aktivacija.md)).

## Kome je namijenjen

- **Svim korisnicima** — vide samo opremu zaduženu na sebe („Moja oprema“) i svoje prenosnice.
- **Upraviteljima imovine i agentima** — upravljaju opremom svojih organizacionih jedinica (registar,
  kretanja, prenosnice, licence, ugovori, uvoz).
- **Administratorima** — katalog tipova i lokacija, šablon prenosnice, grupe za rješavanje po tipu i
  sinhronizacija računara iz Active Directoryja.

## Kako doći

- **Moja oprema:** meni **Usluge** → **Moja oprema**.
- **Registar:** **Imovina → Registar**; **Pregled:** **Imovina → Pregled** (pravo `asset.report.read`);
  **Uvoz:** **Imovina → Uvoz**.
- **Prijava problema s opremom:** dugme **„Prijavi problem“** na stavci u *Mojoj opremi* ili polje
  „Na koju opremu se odnosi?“ na formi **Novi tiket**.
- **Za administratore:** **Imovina → Tipovi i lokacije**; potpisnici u **Administracija → Organizacija**.

## Korak po korak

### Za sve korisnike

- **Moja oprema** (meni *Usluge*) prikazuje opremu koja je zadužena na vas: naziv, tip, inventarni broj,
  mjesto, od kada je kod vas i do kada traje garancija.
- **„Prijavi problem“** na stavci otvara novi tiket s tom opremom. Opremu možete izabrati i direktno na
  formi „Novi tiket“, u polju „Na koju opremu se odnosi?“.
- **Moje prenosnice** (na istoj stranici) su dokumenti o preuzimanju i vraćanju opreme. Svaku možete
  preuzeti kao Word dokument.
- Tuđu opremu ni registar ne vidite. Tiketi o opremi idu grupi koja je za nju zadužena.

### Za upravitelje imovine i agente

Upravitelj imovine može biti iz IT-a ili iz drugih službi, npr. nabavke. Vidi i uređuje samo opremu
svojih organizacionih jedinica.

**Registar (Imovina → Registar)**

- Filteri: pretraga (naziv, inventarni ili serijski broj, hostname), tip, status, OJ, izvor (ručno,
  uvoz, AD), garancija ističe u 30 dana i nezadužena oprema. Izvoz u Excel ili CSV prati filtere.
- **Nova stavka:** tip, naziv, OJ i atributi tipa, npr. RAM ili hostname. Prazan inventarni broj
  sistem dodjeljuje automatski (npr. `INV-2026-00042`).
- **Kartica opreme** ima tabove Pregled, Tiketi, Veze (uz analizu uticaja: šta sve zavisi od ove
  stavke), Prenosnice i Historija. Svaka izmjena ostaje u historiji.

**Kretanje opreme i prenosnice**

- **Zaduži** (sa skladišta korisniku), **Prezaduži** (s korisnika na korisnika) i **Razduži** (vraćanje na
  skladište ili na servis). Uz svako kretanje izdaje se prenosnica s brojem `MM-NNNN-GGGG`, a brojač
  kreće od 1 svakog mjeseca.
- Pri prvom zaduženju možete upisati ko predaje, npr. dobavljača. Ako polje ostane prazno, na
  prenosnici piše „Skladište“.
- Potpisnik se uzima po organizacionoj jedinici onoga ko preuzima. Kod razduženja to je jedinica onoga
  ko vraća. Ako jedinica nema svog potpisnika, uzima se najbliža nadređena jedinica. Potpisnika postavlja
  administrator u **Administracija → Organizacija**.
- **Više stavki odjednom:** u registru označite stavke i izaberite akciju na traci „Odabrano N“. Zajedno
  mogu ići samo stavke sa skladišta ili stavke istog korisnika, najviše 50. Za sve se izdaje jedna
  prenosnica.
- Potpisanu prenosnicu (PDF, JPG ili PNG) priložite u tabu **Prenosnice**. Pogrešna prenosnica se
  stornira uz razlog, a ispravka je novo kretanje.

**Licence i ugovori**

- Licenca može biti po uređaju, po korisniku, za lokaciju ili pretplata. Prikaz „dodijeljeno / mjesta“
  označava prekoračenje, ali ga ne blokira. Ključ licence je šifrovan, a svako prikazivanje se bilježi.
- Ugovori (garancija, podrška, lizing, održavanje) pokrivaju jednu ili više stavki. Podsjetnik o isteku
  stiže 60, 30 i 7 dana ranije (postavka).

**Uvoz iz Excela**

1. Preuzmite šablon za tip opreme (**Imovina → Uvoz**).
2. Popunite ga i pošaljite.
3. Provjerite mapiranje kolona i pregled.
4. Potvrdite. Do potvrde se ništa ne upisuje.

- „Sve ili ništa“ ne upisuje ništa ako i jedan red ima grešku.
- Greške se preuzimaju kao Excel fajl.

**Pregled (Imovina → Pregled)**

Tab je dostupan uz pravo `asset.report.read` i prikazuje stanje za vaše jedinice:

- opremu po statusu;
- šta ističe u 30 dana;
- prekoračene licence;
- pet stavki s najviše tiketa u zadnjih 90 dana;
- stanje AD računara;
- opremu kod neaktivnih ili premještenih korisnika.

Sve je prikazano u tabelama. Isti podaci postoje i u **Izvještajima**, kao pet paketa „Imovina: …“ koji
se mogu i zakazati.

### Za administratore

- **Katalog** (Imovina → Tipovi i lokacije): tipovi opreme s atributima, šablon prenosnice (Word, s
  poljima poput `{broj}`, `{predaje_ime}`, `{#stavke}…{/stavke}`), pregled potpisnika i AD računari.
- **Grupa za rješavanje po tipu:** kad korisnik u tiketu izabere opremu tipa koji ima grupu (npr. štampač),
  tiket ide toj grupi umjesto grupi iz pravila rutiranja.
- **Lokacije** (zgrada › sprat › prostorija, do 6 nivoa) su opcionalne i zadano isključene
  (`private.assets.locations.enabled`). Dok su isključene, kao mjesto se prikazuje puna putanja
  organizacione jedinice. Ranije unesene lokacije ostaju sačuvane.
- **Računari iz Active Directoryja:** prvo pokrenite probni prolaz, pa uključite sinhronizaciju. Veza
  računara s korisnikom je prijedlog, a ručno zaduženje uvijek ima prednost.

## Polja, validacije i statusi

| Polje / pravilo | Vrijednost |
|---|---|
| Inventarni broj | opcionalan pri unosu; ako je prazan, sistem dodjeljuje npr. `INV-2026-00042` |
| Broj prenosnice | `MM-NNNN-GGGG`; brojač kreće od 1 svakog mjeseca |
| Predao (prvo zaduženje) | opcionalno; ako je prazno, na prenosnici piše „Skladište“ |
| Potpisnik | uzima se po OJ onoga ko preuzima (kod razduženja: OJ onoga ko vraća); ako je nema, najbliža nadređena OJ |
| Grupno kretanje | samo stavke sa skladišta **ili** stavke istog korisnika, najviše **50**; jedna prenosnica za sve |
| Prilog prenosnice | PDF, JPG ili PNG; storniranje traži razlog, ispravka je novo kretanje |
| Licenca | po uređaju, po korisniku, za lokaciju ili pretplata; „dodijeljeno / mjesta“ označava prekoračenje ali ga **ne blokira**; ključ je šifrovan i svako prikazivanje se bilježi |
| Podsjetnik o isteku ugovora | **60, 30 i 7** dana ranije (postavka) |
| Uvoz | „sve ili ništa“ — ništa se ne upisuje ako i jedan red ima grešku; greške se preuzimaju kao Excel |
| Lokacije | zgrada › sprat › prostorija, do **6 nivoa**; zadano isključene (`private.assets.locations.enabled`) |
| Pravo za pregled | `asset.report.read` |
| Modul | **zadano isključen** |

## Česta pitanja i greške

- **„Zašto ne vidim opremu kolege?“** — Korisnik vidi samo opremu zaduženu na sebe; upravitelj imovine vidi
  opremu svojih organizacionih jedinica. Tuđu opremu ni registar ne prikazuje.
- **„Kako prijavim problem s opremom?“** — **„Prijavi problem“** na stavci u *Mojoj opremi*, ili polje
  „Na koju opremu se odnosi?“ na formi **Novi tiket**. Tiket ide grupi zaduženoj za tu opremu (kod tipova s
  definisanom grupom).
- **„Prenosnica je izdata greškom.“** — Stornirajte je uz razlog; ispravka je **novo kretanje** (novi broj).
- **„Uvoz je pao zbog jednog reda.“** — Uvoz je „sve ili ništa“; ispravite red u Excelu (greške se preuzimaju
  kao fajl) i pošaljite ponovo.
- **„Zašto je mjesto puna putanja OJ, a ne lokacija?“** — Lokacije su zadano isključene; ranije unesene
  lokacije ostaju sačuvane i vraćaju se kad se lokacije uključe.

## Poznata ograničenja

- **Modul je zadano isključen** i traži aktivaciju po runbook-u.
- **Prekoračenje licenci se samo označava** („dodijeljeno / mjesta“) — sistem ne blokira dodjelu preko
  dozvoljenog broja mjesta.
- **Grupa za rješavanje po tipu** ima prednost nad pravilom rutiranja; to je namjerno, ali znači da se
  pravilo rutiranja za tu opremu ne primjenjuje.
- **Sinhronizacija s AD-om je jednosmjerna** i traži probni prolaz; veza računara s korisnikom je **prijedlog**,
  a ručno zaduženje uvijek ima prednost.
- **Prenosnice se ne mogu urediti**, samo stornirati i izdati novo kretanje.
- **Ključ licence je šifrovan**, ali se svako prikazivanje bilježi — vidljivost ključa je ograničena, ne
  uklonjena.

## Povezani moduli

- Tiketi (oprema na tiketu, grupa po tipu opreme): `tiketi.md`
- Problemi (zahvaćena oprema) i Promjene (oprema u promjeni): `problemi.md`, `promjene.md`
- Nadzorna ploča i izvještaji (paketi „Imovina: …“): `nadzorna-ploca-i-izvjestaji.md`
- Korisnici, organizacione jedinice i grupe (potpisnici): `korisnici-oj-i-grupe.md`
- Runbook aktivacije: [cmdb-aktivacija](../../ops/runbook/cmdb-aktivacija.md)
- Dizajn paketa: `docs/plans/modules/3.2-cmdb.md`
