# Prečice na tastaturi i pristupačnost

## Čemu služi ovaj modul

Aplikacija se može koristiti samo tastaturom, s čitačem ekrana (NVDA, JAWS), uz uvećanje i u
Windows visokom kontrastu. Agenti dodatno imaju prečice koje ubrzavaju svakodnevni rad.

## Kome je namijenjen

- **Svim korisnicima** — pristupačnost (tastatura, čitač ekrana, uvećanje, visoki kontrast) i prečice s
  `Ctrl` (npr. `Ctrl+K`).
- **Agentima i administratorima** — prečice od jednog slova (zadano uključene) i prečice na listi i detalju
  tiketa.

## Kako doći

- **Postavka prečica:** **Izgled → Pristupačnost → Prečice od jednog slova**.
- **Lista prečica:** pritisnite `?` ili otvorite korisnički meni → **Prečice na tastaturi**.

## Korak po korak

### Uključivanje i isključivanje prečica

**Izgled → Pristupačnost → Prečice od jednog slova**

| Izbor | Značenje |
|---|---|
| Zadano | Za agente i administratore uključeno, za krajnje korisnike isključeno |
| Uključeno | Prečice od jednog slova rade (npr. `N`, `J`, `R`) |
| Isključeno | Rade samo prečice s tipkom `Ctrl` (`Ctrl+K`, `Ctrl+Enter`) |

Postavka je vezana za vaš nalog, pa vrijedi na svakom računaru. Isključite prečice ako koristite
govorni unos ili vam slučajan pritisak tipke smeta.

### Lista prečica

Pritisnite `?` (ili korisnički meni → **Prečice na tastaturi**). Prikazuju se samo prečice koje
važe na ekranu na kome ste i za vašu ulogu.

| Gdje | Prečica | Radnja |
|---|---|---|
| Svuda | `Ctrl+K` ili `/` | Paleta komandi (pretraga i brze radnje) |
| Svuda | `N` | Novi tiket |
| Svuda | `?` | Lista prečica |
| Svuda | `G` pa `T` / `D` / `K` / `S` | Idi na tikete / kontrolnu tablu / bazu znanja / status servisa |
| Lista tiketa | `J` / `K` | Sljedeći / prethodni red |
| Lista tiketa | `Enter` ili `O` | Otvori tiket |
| Lista tiketa | `X` | Označi red za grupnu radnju |
| Detalj tiketa | `R` | Piši javni odgovor |
| Detalj tiketa | `I` | Piši internu napomenu (agenti) |
| Detalj tiketa | `C` | Preuzmi tiket |
| Detalj tiketa | `F` | Proslijedi |
| Detalj tiketa | `S` | Promijeni status |
| Detalj tiketa | `]` / `[` | Sljedeći / prethodni tiket s liste (agenti) |
| Detalj tiketa | `U` | Nazad na listu |
| Editor poruke | `Ctrl+Enter` | Pošalji |
| Editor poruke | `Esc` | Izađi iz editora (tekst ostaje) |

Prečica radi isto što i dugme: ako dugme nije dostupno (npr. tiket je već preuzet), prečica ništa
ne mijenja i kratko najavi razlog.

**Sljedeći tiket:** aplikacija pamti redoslijed tiketa sa stranice liste koju ste zadnju otvorili.
Na zadnjem tiketu stranice najavi „Kraj stranice liste“; za sljedeću stranicu vratite se na listu
(`U`) i pređite na narednu stranicu. Ako ste tiket otvorili direktnim linkom, lista za kretanje ne
postoji.

### Čitač ekrana

- Na svakoj stranici je prvi element **Preskoči na glavni sadržaj**.
- Pri prelasku na drugu stranicu čitač pročita njen naslov, a fokus je na naslovu stranice.
- U razgovoru na tiketu svaka poruka nosi autora, vrijeme i vrstu (javni odgovor ili interna
  napomena). Nova poruka druge osobe se kratko najavi, bez čitanja cijelog teksta.
- Grafikoni imaju tekstualni sažetak, a dugme **Prikaži kao tabelu** daje iste podatke kao tabelu.

### Visoki kontrast i uvećanje

- U Windows visokom kontrastu okvir fokusa i značke statusa ostaju vidljivi.
- Aplikacija se može koristiti uz uvećanje do 200 %; tabele se tada pomiču unutar svog okvira.
- Ako je u sistemu uključeno smanjeno kretanje, animacije se ne izvode.

## Polja, validacije i statusi

| Polje / status | Pravilo |
|---|---|
| Prečice od jednog slova | izbor **Zadano** / **Uključeno** / **Isključeno**; vezano za nalog (vrijedi na svakom računaru) |
| Zadano stanje | uključeno za agente i administratore, isključeno za krajnje korisnike |
| Ponašanje u polju i dijalogu | prečice od jednog slova **ne rade** dok pišete u polju i dok je otvoren dijalog ili meni |
| `Ctrl` prečice | rade uvijek, bez obzira na izbor |
| Lista prečica | prikazuje samo prečice koje važe na trenutnom ekranu i za vašu ulogu |
| Uvećanje | aplikacija radi do 200 %; tabele se pomiču unutar svog okvira |

## Česta pitanja i greške

- **„Prečica ne radi.“** — Provjerite tri stvari: da li je fokus u polju ili je otvoren dijalog (tada
  jednoslovne prečice ne rade), da li su prečice od jednog slova uključene, i da li prečica važi za vašu
  ulogu na tom ekranu.
- **„Prečica ne mijenja ništa.“** — Ako dugme nije dostupno (npr. tiket je već preuzet), prečica ne mijenja
  stanje i kratko najavi razlog.
- **„`]` ne prelazi na sljedeću stranicu liste.“** — Na kraju stranice aplikacija najavi „Kraj stranice
  liste“; vratite se na listu (`U`), pređite na narednu stranicu i nastavite.
- **„Tiket otvoren iz e-maila nema `]` / `[`.“** — Tiket otvoren direktnim linkom nema listu za kretanje;
  otvorite ga sa liste tiketa.
- **„Kako da isključim jednoslovne prečice?“** — **Izgled → Pristupačnost → Prečice od jednog slova** →
  **Isključeno**; `Ctrl` prečice ostaju.

## Poznata ograničenja

- **Prečice od jednog slova ne rade dok pišete** u polju ili je otvoren dijalog/meni — to je namjerno, da
  tipkanje ne pokreće radnje.
- **`]` / `[` rade samo unutar stranice liste** koju ste zadnju otvorili; prelazak na sljedeću stranicu nije
  automatski (odluka P7), a tiket otvoren direktnim linkom nema listu.
- **Postavka prečica je vezana za nalog**, ne za uređaj — ne može se razlikovati po računaru.
- **Animacije se ne izvode** ako je u sistemu uključeno smanjeno kretanje; to nije postavka aplikacije.

## Povezani moduli

- Tiketi (rad na listi i detalju, grupne akcije): `tiketi.md`
- Izgled i tema (postavke naloga): `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md`
- Teze: **T7**, **T8**
- Dizajn paketa: `docs/plans/modules/2.8-pristupacnost-i-ux.md`
