# Realtime i obavještenja

> **Namjena:** modul drži **zvono u zaglavlju** i kanal kojim promjene na tiketima stižu u aplikaciju **bez
> osvježavanja stranice**. Obavještenja se ne prikazuju kao običan spisak — dijele se na **lična** (samo za
> vas) i **grupna** (za cijelu vašu grupu), a broj nepročitanih je isti na svakom uređaju.

## Čemu služi ovaj modul

- **Obavještenja u aplikaciji:** lista, broj nepročitanih, označavanje jednog ili svih obavještenja kao
  pročitanih.
- **Automatsko osvježavanje ekrana:** dok ste na stranici, promjene tiketa i nove poruke stižu odmah (lista,
  detalj tiketa i nadzorna ploča se same osvježe).
- **Grupe i dodjele:** obavještenje za tiket koji pripada grupi stiže **svim članovima grupe**, osim onima koji
  su ga već dobili lično ili su ga sami izazvali.
- **Pad veze:** ako veza pukne, broj nepročitanih se i dalje provjerava (svakih 30 sekundi) dok se veza ne
  vrati — ništa ne treba ručno osvježavati.
- **Čišćenje:** obavještenja se čuvaju **90 dana**, pa se starija automatski brišu (podešeno na serveru).

## Kome je namijenjen

| Rola | Šta dobija |
|---|---|
| **Korisnik (naručilac)** | Obavještenja o svom tiketu: nova poruka, dodjela, rješenje/zatvaranje, zahtjev za potvrdu. Vidi **samo svoja** obavještenja. |
| **Agent** | Uz svoje, dobija i **grupna** obavještenja grupa kojima pripada (novi tiket u grupi, nova poruka, promjena statusa, SLA rizik/prekoračenje). |
| **ADMIN / SUPER_ADMIN** | Kao agent, plus događaji promjene konfiguracije koji se šalju svim administratorima (npr. izmjena usmjeravanja ili SLA pravila), da druga osoba odmah vidi da je nešto promijenjeno. |

## Kako doći

1. **Zvono:** gornja traka, ikona **Obavještenja** — broj u crvenom krugu su **nepročitana** obavještenja.
2. **Panel:** klik na zvono otvara listu; pri otvaranju se lista osvježi sa servera.
3. **Do tiketa:** klik na obavještenje vodi na povezani tiket (broj tiketa je vidljiv i kada je tiket
   povjerljiv), a obavještenje se istovremeno označi kao pročitano.
4. **Sve pročitano:** dugme **Označi sve** u zaglavlju panela.

## Korak po korak

### 1. Pregled i filtriranje

1. Otvorite panel klikom na zvono.
2. Prebacite filter **Sve** / **Nepročitane** da vidite samo ono što još nije otvoreno.
3. Ako nema rezultata, panel to kaže: **Nema obavještenja.** ili **Nema nepročitanih obavještenja.**

### 2. Označavanje kao pročitano

1. Klik na obavještenje — otvara se tiket i to obavještenje je pročitano.
2. Ili klik na **Označi sve** — sva obavještenja postaju pročitana, a broj na zvonu se vraća na nulu.
3. Promjena se odmah vidi i u drugom tabu/prozoru iste sesije.

### 3. Šta se dešava samo od sebe

1. Dok je stranica otvorena, aplikacija drži **jednu** vezu prema serveru.
2. Nova poruka u tiketu koji gledate pojavljuje se bez osvježavanja; promjena statusa ili prioriteta osvježi
   listu i detalj.
3. Ako veza pukne (mreža, prekid), broj nepročitanih se **provjerava svakih 30 sekundi**; čim se veza vrati,
   broj i lista se odmah osvježe.

### 4. Kada se obavještenje ne prikazuje

1. **Interna bilješka** obavještava samo kolege koje su u njoj **spomenute** (`@ime`); ostali članovi grupe je
   ne dobijaju.
2. **Sopstvena radnja** ne obavještava vas (npr. ne dobijate obavještenje za poruku koju ste sami poslali).
3. **Isključen tip obavještenja** (vaša lična podešavanja) ili **isključeno zvono** znače da se obavještenje ne
   stvara za vas.
4. Kod **grupnog** obavještenja, ono stiže jednom za cijelu grupu; ako ste ga već dobili lično, nećete ga
   vidjeti dvaput.

## Polja, validacije i statusi

### Zvono i panel

| Element | Značenje |
|---|---|
| **Broj na zvonu** | broj nepročitanih obavještenja (najviše se prikazuje do 1000) |
| **Sve / Nepročitane** | filter liste obavještenja |
| **Označi sve** | označava sva obavještenja kao pročitana |
| **Nema obavještenja.** | nema obavještenja uopšte (ili su starija od 90 dana obrisana) |
| **Nema nepročitanih obavještenja.** | filter „Nepročitane“ je prazan |

### Tipovi obavještenja (naslovi u listi)

| Naslov u listi | Kada stiže |
|---|---|
| Novi tiket | tiket je kreiran u vašoj grupi |
| Dodijeljen tiket | tiket je dodijeljen vama |
| Nova poruka | korisnik ili agent je odgovorio na tiket |
| Riješeno / Zatvoreno | tiket je prešao u **Riješeno**/**Zatvoreno** |
| Zahtjev za odobrenje / odluka o odobrenju | tiket čeka odobrenje ili je odluka donesena |
| SLA upozorenje / prekoračenje / eskalacija | rok prvog odgovora ili rješenja je pri riziku, prekoračen ili eskaliran |
| Proslijeđen tiket | tiket je proslijeđen u drugu grupu |
| Spomenuti ste | neko vas je spomenuo u internoj bilješci |
| Zahtjev za udaljenu pomoć | pokrenut je zahtjev za udaljenu sesiju |

### Sadržaj i privatnost

| Element | Pravilo |
|---|---|
| **Naslov tiketa** | prikazuje se kao tekst obavještenja |
| **Povjerljiv tiket** | u obavještenju se umjesto naslova prikazuje **samo broj tiketa** |
| **Interna bilješka** | nikad se ne prikazuje korisniku; obavještava samo spomenute kolege |
| **Grupno obavještenje** | jedan zapis za cijelu grupu; ko je dobio lično ili je bio akter ne vidi ga u svom brojaču |
| **Čuvanje** | 90 dana (može se podesiti na serveru kroz `NOTIFICATION_RETENTION_DAYS`) |

### Kada obavještenje stigne odmah, a kada uz provjeru

| Situacija | Ponašanje |
|---|---|
| Veza radi | obavještenja i promjene stižu odmah, broj se ažurira odmah |
| Veza je pala | broj se provjerava svakih 30 sekundi; lista se puni pri otvaranju panela |
| Veza se vratila | broj i lista se odmah osvježe |
| Istekla sesija | aplikacija vas odjavljuje i traži ponovnu prijavu |

## Česta pitanja i greške

- **„Zvono ne pokazuje ništa, a znam da se tiket mijenjao.“** — provjerite da li ste član grupe kojoj tiket
  pripada i da li ste obavještenja tog tipa isključili u svojim podešavanjima; interno obavještenje stiže samo
  ako ste spomenuti.
- **„Obavještenje je stiglo u jednom tabu, a u drugom ne.“** — brojanje ide po **grupi**, ne po korisniku: ako
  je obavještenje grupno i vi ste u toj grupi, vidjet ćete ga jednom; lična obavještenja stižu u sve vaše
  otvorene tabove.
- **„Klik na obavještenje ne otvara tiket.“** — možda više nemate pristup tom tiketu (promijenjen scope,
  povjerljivost ili dodjela); tiket se tada otvara kao „nema pristupa“.
- **„Broj se ne smanjuje.“** — osvježite panel ili kliknite **Označi sve**; ako je veza pala, broj se
  provjerava svakih 30 sekundi.
- **„Zašto je na povjerljivom tiketu u obavještenju samo broj?“** — namjerno: sadržaj povjerljivog tiketa ne
  ide u obavještenje.
- **„Nema obavještenja starijih od tri mjeseca.“** — čuvanje je 90 dana; starija se automatski brišu.
- **„Nisam dobio obavještenje za poruku koju sam poslao.“** — sopstvene radnje se ne obavještavaju.

## Poznata ograničenja

- **Članstvo u grupnim sobama i admin rola provjeravaju se ponovo tokom veze.** Aktivna veza sama provjerava
  svoje grupne i admin sobe najviše svakih pet minuta; ukinuto članstvo ili rola prestaju dobijati te događaje
  najkasnije u tom roku, bez ponovnog povezivanja. Sobe pojedinačnih tiketa se ne diraju — one se otvaraju
  kroz `ticket:join` uz provjeru prava pri svakom ulasku. (Nalaz B1 iz §M11 — zatvoren u valu 3.)
- **Ulazak u sobu tiketa i izlazak iz nje ograničeni su na 30 poruka u minuti po vezi** (isti prozor kao za
  „kucanje“); prekoračenje se odbija i broji u dnevniku. (Nalaz B2 — zatvoren u valu 3.)
- **Brojači opterećenja veze se samo bilježe** — server ih ne upozorava automatski, pa neuobičajen saobraćaj
  nije alarm. (Nalaz B3.)
- **Prelazni režim tokom nadogradnje je uključen po defaultu:** dok ga administrator ne isključi, grupne sobe
  dobijaju i puni sadržaj promjene, a ne samo lagani signal. (Nalaz B4.)
- **Slanje priloga ne šalje posebno obavještenje** — o prilogu saznajete kroz poruku uz koju je priložen.
- **Broj nepročitanih je ograničen na 1000**; iznad toga zvono prikazuje 1000.

## Povezani moduli

- **Tiketi** — događaji na tiketu (nova poruka, promjena statusa/prioriteta, dodjela) i detalj tiketa.
- **SLA** — upozorenja prije roka, prekoračenja i eskalacije.
- **Odobrenja i CSAT** — zahtjev za odobrenje i odluka.
- **Prosljeđivanje tiketa** — obavještenje novim handlerima.
- **Postavke** — lične preferencije po tipu obavještenja i sistemski prekidači kanala.
- **Dežurstva** — eskalacije mogu ići dežurnom agentu grupe.

---

*Ažurirano: 2026-10-03 · Modul: Realtime i obavještenja (M11)*
