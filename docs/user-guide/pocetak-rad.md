---
title: Početak rada
slug: pocetak-rad
module: —
part: pocetak
audience: [Svi korisnici, Agent, Administrator]
roles: []
order: 5
tags: [pocetak, prijava, meni, tiket, obavjestenja, pomoc]
---

# Početak rada

## Čemu služi ovaj modul

Prvi koraci u aplikaciji: kako se prijaviti, gdje je šta u meniju, kako otvoriti tiket i gdje se prati
njegov status. Sve detalje po modulima pokrivaju posebne stranice na koje ova stranica upućuje.

## Kome je namijenjen

**Svim korisnicima**, posebno novim. Agentima i administratorima služi kao mapa menija i podsjetnik gdje se
koja funkcija nalazi.

## Kako doći

- **Prijava:** adresa `/login` (ili automatsko preusmjerenje kad otvorite bilo koju stranicu bez sesije).
- **Meni:** lijevi navigacijski stub, podijeljen na **Pregled**, **Tiketi**, **Usluge i znanje** i
  **Administracija** (posljednji dio vidite samo ako imate administratorsku rolu).
- **Paleta komandi:** `Ctrl+K` ili `/` — pretraga i brze radnje.
- **Pomoć:** `?` otvara listu prečica koje važe na ekranu na kome ste.

## Korak po korak

1. **Prijavite se** svojim emailom i lozinkom. Ako je uključena **potvrda u dva koraka**, unesite šestocifreni
   kod iz aplikacije ili rezervni kod. Detalji: `prijava-i-mfa.md`.
2. **Pogledajte meni.** U dijelu **Pregled** su **Nadzorna ploča** i **Izvještaji** (izvještaji su vidljivi
   samo s pravom izvoza). U dijelu **Tiketi** su **Svi tiketi**, **Grupni inbox** (osoblje) i, kad su moduli
   uključeni, **Problemi**, **Promjene**, **Šabloni i playbooks** i **Dežurstva**. U dijelu **Usluge i znanje**
   su **Katalog usluga**, **Status servisa**, **Najave**, **Baza znanja** i, kad je modul uključen, **Moja
   oprema** i **Imovina**.
3. **Otvorite tiket:** dugme **Novi tiket** (iznad menija) ili **Katalog usluga** → izaberite uslugu →
   popunite formu. Detalji: `tiketi.md`, `katalog-usluga-i-forme.md`.
4. **Pratite tiket:** **Svi tiketi** → vaš tiket; tamo vidite status, poruke, priloge i rok (ako je SLA
   uključen). Odgovor možete poslati iz same stranice tiketa.
5. **Obavještenja:** zvono u zaglavlju prikazuje obavještenja u aplikaciji; kanale i tihi sati podešavate u
   svojim postavkama obavještenja. Detalji: `realtime-i-obavjestenja.md`.
6. **Ako nešto zapne:** pritisnite `?` za prečice, `Ctrl+K` za paletu komandi, ili potražite pojam u
   **Dokumentaciji** (meni → **Dokumentacija**).

## Polja, validacije i statusi

| Gdje | Šta tamo radite |
|---|---|
| **Nadzorna ploča** | brojači i liste tiketa koje smijete otvoriti |
| **Svi tiketi** | lista i pretraga tiketa, otvaranje detalja, kreiranje novog tiketa |
| **Grupni inbox** (osoblje) | tiketi grupa kojima pripadate i preuzimanje |
| **Katalog usluga** | izbor usluge i forma za prijavu |
| **Status servisa** | stanje usluga, planirano održavanje i incidenti |
| **Baza znanja** | članci i predlozi pri kreiranju tiketa |
| **Najave** | obavještenja organizacije i potvrda čitanja |
| **Dokumentacija** | ovi vodiči, pretraga i navigacija po modulima |

**Validacije koje ćete odmah osjetiti:** lozinka i potvrda u dva koraka na prijavi; obavezna polja u formi
usluge pri kreiranju tiketa; rok (SLA) se prikazuje na tiketu i ne može se ručno skratiti.

## Česta pitanja i greške

- **„Ne mogu da se prijavim.“** — Provjerite email i lozinku; poslije 5 neuspjelih pokušaja u 15 minuta
  prijava se zaključava za taj email. Ako je uključena potvrda u dva koraka, potreban je i kod iz aplikacije.
- **„Gdje vidim svoje tikete?“** — **Svi tiketi** (lista po vašem pristupu) ili **Nadzorna ploča**.
- **„Kako da ubrzam rad?“** — `Ctrl+K` (paleta komandi), `N` (novi tiket), `G` pa `T` (tiketi),
  `?` (lista prečica). Detalji: `precice-i-pristupacnost.md`.
- **„Ne vidim neki dio menija.“** — Meni se prilagođava vašoj roli i uključenim modulima; administracija,
  izvještaji i pojedini moduli traže rolu ili pravo.
- **„Gdje je uputstvo za modul?“** — Meni → **Dokumentacija**, pa izaberite modul u lijevom navu.

## Poznata ograničenja

- **Meni zavisi od role i uključenih modula** — neke stavke (Problemi, Promjene, Imovina, Dežurstva, Šabloni)
  vidite samo ako su modul i pravo uključeni.
- **Izvještaji nisu za svakoga** — traže administratorsku rolu i pravo izvoza.
- **Dokumentacija u aplikaciji prikazuje sadržaj iz repozitorija** (`docs/user-guide/`); uređivanje iz same
  aplikacije nije predviđeno.

## Povezani moduli

- Prijava i potvrda u dva koraka: `prijava-i-mfa.md`
- Tiketi: `tiketi.md` · Katalog usluga i forme: `katalog-usluga-i-forme.md`
- Obavještenja: `realtime-i-obavjestenja.md` · Prečice i pristupačnost: `precice-i-pristupacnost.md`
- Pregled svih stranica: `pregled-modula.md` · Rječnik pojmova: `rjecnik.md`
