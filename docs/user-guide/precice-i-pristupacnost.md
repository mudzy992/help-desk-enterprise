# Prečice na tastaturi i pristupačnost

Aplikacija se može koristiti samo tastaturom, s čitačem ekrana (NVDA, JAWS), uz uvećanje i u
Windows visokom kontrastu. Agenti dodatno imaju prečice koje ubrzavaju svakodnevni rad.

## Uključivanje i isključivanje prečica

**Izgled → Pristupačnost → Prečice od jednog slova**

| Izbor | Značenje |
|---|---|
| Zadano | Za agente i administratore uključeno, za krajnje korisnike isključeno |
| Uključeno | Prečice od jednog slova rade (npr. `N`, `J`, `R`) |
| Isključeno | Rade samo prečice s tipkom `Ctrl` (`Ctrl+K`, `Ctrl+Enter`) |

Postavka je vezana za vaš nalog, pa vrijedi na svakom računaru. Isključite prečice ako koristite
govorni unos ili vam slučajan pritisak tipke smeta.

Prečice od jednog slova **ne rade dok pišete** u polju i dok je otvoren dijalog ili meni.

## Lista prečica

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

## Čitač ekrana

- Na svakoj stranici je prvi element **Preskoči na glavni sadržaj**.
- Pri prelasku na drugu stranicu čitač pročita njen naslov, a fokus je na naslovu stranice.
- U razgovoru na tiketu svaka poruka nosi autora, vrijeme i vrstu (javni odgovor ili interna
  napomena). Nova poruka druge osobe se kratko najavi, bez čitanja cijelog teksta.
- Grafikoni imaju tekstualni sažetak, a dugme **Prikaži kao tabelu** daje iste podatke kao tabelu.

## Visoki kontrast i uvećanje

- U Windows visokom kontrastu okvir fokusa i značke statusa ostaju vidljivi.
- Aplikacija se može koristiti uz uvećanje do 200 %; tabele se tada pomiču unutar svog okvira.
- Ako je u sistemu uključeno smanjeno kretanje, animacije se ne izvode.
