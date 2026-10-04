
# Česta pitanja

## Čemu služi ovaj modul

Zbir najčešćih pitanja i poruka grešaka iz svih vodiča, na jednom mjestu. Svako pitanje nosi link na stranicu
modula na kojoj je detaljno objašnjenje; ovdje su samo najkraći odgovori.

## Kome je namijenjen

**Svim korisnicima**, agentima i administratorima kao prvi korak prije traženja pomoći. Dio pitanja tiče se
administracije i zato upućuje na stranicu modula (npr. `uloge-i-permisije.md`), koja je namijenjena
administratorima.

## Kako doći

- **Dokumentacija → Referenca → Česta pitanja.**
- **Pretraga:** polje pretrage u Dokumentaciji pretražuje i ovu stranicu; za pojam iz poruke greške ukucajte
  njegov dio (npr. „Kod nije ispravan“).

## Korak po korak

1. Nađite svoje pitanje u sekciji svog modula ispod (sekcije prate vodiče).
2. Ako odgovor upućuje na detalje, otvorite link `[vodič]` iz naslova sekcije.
3. Ako pitanja nema ovdje, otvorite stranicu modula i njegovu sekciju **Česta pitanja i greške**, ili
   pretražite cijelu Dokumentaciju.
4. Ako ni tamo nema odgovora, otvorite tiket u kategoriji koja odgovara problemu (za probleme s pristupom:
   **Korisnici**/IT podrška).

## Polja, validacije i statusi

**Kako čitati odgovore:**

| Oznaka u tekstu | Značenje |
|---|---|
| **Podebljano** | naziv dugmeta, ekrana ili polja tačno kako stoji u aplikaciji |
| `kod` | tehnički kod greške ili ključ postavke (za administratore) |
| *Kurziv* | naziv postavke ili ekrana iz menija |

**Poruke grešaka** su navedene onako kako ih aplikacija prikazuje; kodovi iz zagrada (npr. `403`, `SETUP_REQUIRED`)
su tehnička oznaka za administratora.

## Česta pitanja i greške

### Prijava i potvrda u dva koraka (MFA) ([vodič](prijava-i-mfa.md))

- **„Kod nije ispravan ili je već iskorišten.“** — Kod je istekao, pogrešno prepisan ili je već upotrijebljen; sačekajte novi kod ili koristite rezervni.
- **„Korak prijave je istekao (vrijedi 5 minuta).“** — Predugo ste čekali na ekranu koda; vratite se na prijavu i ponovite.
- **„Nemam više rezervnih kodova.“** — Administrator može uraditi **Reset MFA**, pa potvrdu upisujete ponovo.

### Prečice na tastaturi i pristupačnost ([vodič](precice-i-pristupacnost.md))

- **„Prečica ne radi.“** — Provjerite tri stvari: da li je fokus u polju ili je otvoren dijalog (tada jednoslovne prečice ne rade), da li su prečice od jednog slova uključene, i da li prečica važi za vašu ulogu na tom ekranu.
- **„Prečica ne mijenja ništa.“** — Ako dugme nije dostupno (npr. tiket je već preuzet), prečica ne mijenja stanje i kratko najavi razlog.
- **„`]` ne prelazi na sljedeću stranicu liste.“** — Na kraju stranice aplikacija najavi „Kraj stranice liste“; vratite se na listu (`U`), pređite na narednu stranicu i nastavite.

### Tiketi ([vodič](tiketi.md))

- **„Tiket ne mogu naći u listi.“** — Vidljivost zavisi od OU/servisa, članstva u handler grupi i povjerljivosti; korisnik u grupnom inboxu vidi samo radni red svoje grupe (vlastite tikete vidi u **Moji zahtjevi**).
- **„Preuzimanje nije moguće.“** — tiket nije u vašoj grupi ili je već preuzet; preuzimanje ima zaštitu od istovremenog preuzimanja.
- **„Prelaz statusa nije dozvoljen.“** — tok statusa je unaprijed definisan (tabela prelaza je u vodiču); neke prelasce radi samo sistem ili odobravalac.

### Odobrenja i CSAT ([vodič](odobrenja-i-csat.md))

- **„Ne mogu odobriti tiket.“** — mogući razlozi: vi ste naručilac zahtjeva, nemate rolu odobravaoca, tiket je van vašeg OU/servis scope-a, ili tiket više nije u statusu **Čeka odobrenje**.
- **„Dugmad Odobri/Odbij su neaktivna.“** — **Razlog odluke** je obavezan; upišite ga i dugmad se aktiviraju.
- **„Tiket je zatvoren, a nisam ga rješavao.“** — odobrenje je **odbijeno**; status tiketa je **Zatvoreno**, a razlog odbijanja stoji u panelu **Odobrenja**.

### Status servisa: incident ili zakazani prekid? ([vodič](status-incidenti-i-planirani-prekidi.md))

- **„Zakazali smo održavanje za subotu — da li to ide kao incident?“** — Ne. Ako se zna unaprijed, ide kroz **Zakaži prekid** (poređenje je u vodiču).
- **„Zašto incident s uticajem ‚Održavanje‘ nije u historiji incidenata?“** — Zato što je namijenjen hitnom, nenajavljenom održavanju; sve što se može najaviti ide kroz **Zakaži prekid**.
- **„Zašto je usluga prikazana kao Održavanje iako nisam mijenjao status?“** — Dok traje zakazani prekid, usluga se prikazuje kao **Održavanje** ako je u postavkama uključeno automatsko postavljanje statusa održavanja.

### Baza znanja ([vodič](baza-znanja.md))

- **„Zašto ne vidim članak koji kolega vidi?“** — klasifikacija i opseg odlučuju: `INTERNAL` objavljen članak vidi svaki prijavljeni korisnik, `CONFIDENTIAL` traži osoblje u opsegu OJ i servisa, a `RESTRICTED` samo ADMIN u tom opsegu; neobjavljene vide vlasnik, recenzent i osobe s pravom.
- **„Zašto mi je članak označen kao zastarjelo?“** — prošao je rok pregleda ili je od posljednjeg pregleda prošlo više od „Dani do zastarjelo“. Recenzent klikom **Odobri pregled** pomjera rok i skida oznaku.
- **„Ne mogu objaviti članak.“** — objava traži prethodni pregled: prvo **Pošalji na pregled**, pa **Odobri pregled**.

### Najave ([vodič](najave.md))

- **„Zatvorio sam najavu — zašto je nema više?“** — **Zatvori** sakriva najavu bez potvrde i ona se više ne prikazuje; ako tražite najavu kasnije, otvorite je u meniju **Najave**.
- **„Prozor se vraća iako sam ga zatvorio.“** — Prozor se vraća pri sljedećoj navigaciji najviše **3 puta po prijavi**; nakon toga ostaje samo traka. Za najave s potvrdom traka traje dok ne potvrdite.
- **„Nisam dobio e-mail za najavu.“** — Provjerite svoje postavke obavještenja: isključen e-mail za „Najave“, sažetak ili tihi sati znače da se šalje samo e-mail za **kritične** najave, ostalo vidite u aplikaciji.

### Realtime i obavještenja ([vodič](realtime-i-obavjestenja.md))

- **„Zvono ne pokazuje ništa, a znam da se tiket mijenjao.“** — provjerite da li ste član grupe kojoj tiket pripada i da li ste obavještenja tog tipa isključili u svojim podešavanjima; interno obavještenje stiže samo ako ste spomenuti.
- **„Obavještenje je stiglo u jednom tabu, a u drugom ne.“** — brojanje ide po **grupi**, ne po korisniku: ako je obavještenje grupno i vi ste u toj grupi, vidjet ćete ga jednom; lična obavještenja stižu u sve vaše otvorene tabove.
- **„Klik na obavještenje ne otvara tiket.“** — možda više nemate pristup tom tiketu (promijenjen scope, povjerljivost ili dodjela); tiket se tada otvara kao „nema pristupa“.

### Katalog usluga i forme ([vodič](katalog-usluga-i-forme.md))

- **„Zašto korisnici ne vide uslugu?“** — Usluga mora biti **Aktivna** i imati **aktivnu verziju forme**; bez aktivne forme prijava tiketa se odbija porukom „Odabrana usluga nema aktivnu verziju forme, pa tiket ne može biti kreiran. Aktivirajte formu na ekranu Usluge.“
- **„Polje je označeno obavezno, a tiket je prošao bez njega.“** — Obaveznost iz forme provjerava se pri **rješavanju/zatvaranju** tiketa, a ne pri kreiranju (detalji u *Poznatim ograničenjima* vodiča).
- **„Ne mogu sačuvati izmjenu polja.“** — Verzija je aktivna ili ima tikete; napravite **Novu verziju iz odabrane** i izmijenite nacrt.

### Pošta (e-mail) ([vodič](posta.md))

- **„Nisam dobio e-mail, a vidim obavještenje u aplikaciji.“** — provjerite: je li SMTP uključen, je li uključeno slanje obavještenja, je li vaša domena na listi dozvoljenih, i niste li u „Moj profil“ isključili e-mail ili uključili sažetak/tihe sate.
- **„E-mail nema dugme za otvaranje tiketa.“** — nije postavljen javni URL aplikacije; bez njega se linkovi izostavljaju namjerno.
- **„Odgovorio sam, ali odgovor nije na tiketu.“** — odgovor mora ići na Reply-To adresu zajedničkog sandučeta (način „zajednički sandučić“); provjerite i dnevnik dolazne pošte — poruka je vjerovatno u „odbijeno“ sa razlogom.

### Imovina (CMDB) ([vodič](imovina.md))

- **„Zašto ne vidim opremu kolege?“** — Korisnik vidi samo opremu zaduženu na sebe; upravitelj imovine vidi opremu svojih organizacionih jedinica. Tuđu opremu ni registar ne prikazuje.
- **„Kako prijavim problem s opremom?“** — **„Prijavi problem“** na stavci u *Mojoj opremi*, ili polje „Na koju opremu se odnosi?“ na formi **Novi tiket**. Tiket ide grupi zaduženoj za tu opremu (kod tipova s definisanom grupom).
- **„Prenosnica je izdata greškom.“** — Stornirajte je uz razlog; ispravka je **novo kretanje** (novi broj).

## Poznata ograničenja

- **Ova stranica ne zamjenjuje stranice modula** — sadrži najkraće odgovore; potpuna pravila, polja i
  ograničenja su na stranici modula.
- **Pitanja su preuzeta iz vodiča u trenutku generisanja**; ako je odgovor u vodiču promijenjen, ovdje se
  pojavljuje verzija iz vodiča (izvor je uvijek stranica modula).
- **Pitanja iz administracije** (npr. o permisijama, SLA pravilima, uvozu opreme) zahtijevaju pristup tim
  ekranima; ako nemate pristup, obratite se administratoru.

## Povezani moduli

- Pregled svih stranica: `pregled-modula.md`
- Rječnik pojmova: `rjecnik.md`
- Uloge i dozvole (šta koja rola smije): `uloge-i-dozvole.md`
