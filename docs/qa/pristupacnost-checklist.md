# Ručna provjera pristupačnosti (Paket 2.8 §5.3)

Radi se za svako izdanje koje dira ključne tokove T1–T6 (prijava, novi tiket, liste, detalj tiketa,
obavijesti, status). Automatski dio (axe, E2E 22) ne vidi sve: tok čitača ekrana, logiku fokusa i
razumljivost najava provjerava čovjek.

Zapisnik: datum, izdanje (commit), ko je provjerio, preglednik i čitač, nalazi. Nalazi idu u
`docs/plans/modules/2.8-pristupacnost-i-ux.md` §11 ili kao zasebni taskovi.

## 1. Samo tastatura (bez miša)

| # | Korak | Očekivano |
|---|---|---|
| 1.1 | Otvori aplikaciju, pritisni `Tab` | Prvi element je „Preskoči na glavni sadržaj“, vidljiv je. `Enter` prebacuje fokus na sadržaj |
| 1.2 | Prijava (T1) s MFA | Sva polja se dosežu redom; greška se čita uz polje |
| 1.3 | Novi tiket (T2): usluga, forma, baza znanja, slanje | Cijeli tok bez miša. Na neispravnoj formi fokus ide na sažetak grešaka, a link vodi na polje |
| 1.4 | Lista tiketa (T3): `J`/`K`, `O`, `X` (agent) | Fokus se vidi na broju tiketa; `X` označava red i najavljuje broj odabranih |
| 1.5 | Detalj tiketa (T4): `R`, piši, `Ctrl+Enter`; `I`; `C`; `F`; `S`; `Esc` | Svaka prečica radi isto kao dugme; `Esc` vraća fokus na razgovor, tekst ostaje |
| 1.6 | `]` / `[` na detalju (agent) | Prelazi na sljedeći / prethodni tiket s liste; na kraju najavi „Kraj stranice liste“ |
| 1.7 | Zvono i panel obavijesti (T5) | Otvara se i zatvara tastaturom; `Esc` vraća fokus na zvono |
| 1.8 | Status servisa i baner incidenta (T6) | Sadržaj dostupan redom, bez zamki fokusa |
| 1.9 | Fokus se nigdje ne gubi | Prsten fokusa se uvijek vidi; ljepljivi header ga ne prekriva |

## 2. NVDA (Chrome i Firefox): T2 i T4

| # | Provjera | Očekivano |
|---|---|---|
| 2.1 | Promjena stranice | NVDA pročita naslov nove stranice; naslov taba je „<stranica> · <proizvod>“ |
| 2.2 | Polja forme | Čita se oznaka, „obavezno“ (ne „zvjezdica“) i pomoćni tekst; kod greške „neispravno“ i poruka |
| 2.3 | Razgovor | Svaka poruka se čita kao „<autor>, <vrijeme>, Javni odgovor / Interna napomena“ |
| 2.4 | Nova poruka drugog učesnika | Kratka najava „Nova poruka od …“, bez čitanja cijelog teksta |
| 2.5 | „… piše odgovor“ | Najava najviše jednom u 15 s po osobi |
| 2.6 | Grafikon (izvještaji, kontrolna tabla) | Čita se sažetak (period, najviše, najmanje, zadnje); „Prikaži kao tabelu“ daje tabelu |
| 2.7 | NVDA browse mod | Jednoslovne tipke NVDA-a (H, K, B…) rade normalno; prečice aplikacije ne smetaju |

## 3. Uvećanje i širina

- Uvećanje 200 %: nema izrezanog teksta ni preklapanja na T1–T6.
- Širina 320 CSS px (≈ 400 % na 1280 px): nema horizontalnog scrolla cijele stranice; tabele se
  scrollaju unutar svog okvira.

## 4. Windows visoki kontrast

Postavke → Pristupačnost → Kontrastne teme (npr. „Pustinja“ i „Noćno nebo“):
- prsten fokusa je vidljiv (sistemska boja Highlight);
- značke statusa i prioriteta imaju okvir i čitljiv tekst;
- ikone koje nose značenje imaju tekst pored sebe.

## 5. Smanjeno kretanje

Windows: Postavke → Pristupačnost → Vizuelni efekti → Animacijski efekti isključeni. Ulazne animacije
stranica, kartica i grafikona se ne izvode.

## 6. Postavka prečica

- USER: prečice od jednog slova su zadano isključene (`N` ne otvara novi tiket); `Ctrl+K` radi.
- Izgled → Pristupačnost → „Uključeno“: `N` radi; postavka ostaje nakon odjave i na drugom računaru.
- Agent: zadano uključeno; `?` otvara listu prečica za trenutni ekran.
