---
title: Instalacija (prvi start)
slug: instalacija
module: M1
part: pocetak
audience: [Administrator, Operativa]
roles: [ADMIN, SUPER_ADMIN]
order: 10
tags: [instalacija, install-token, superadmin, smtp, dodaci]
---
# Instalacija (prvi start)

## Čemu služi ovaj modul

Instalacija je **jednokratni tok** koji se vodi na adresi `/install` neposredno nakon prvog deploya aplikacije.
Njime nastaju prvi nalog (SuperAdmin), način prijave, odlazni e-mail i minimalni podaci za rad tiketa. Dok
instalacija nije završena, aplikacija ne radi ništa drugo: svaki zahtjev dobija odgovor „Instalacija još nije
završena“ (`SETUP_REQUIRED`).

## Kome je namijenjen

Stranica je namijenjena **administratoru/operativi koja postavlja aplikaciju**, ne krajnjim korisnicima.

## Kako doći

Instalacija se otvara na adresi `/install` neposredno nakon prvog deploya. Dok nije završena, pristup bilo kojoj
drugoj stranici se preusmjerava na wizard. Prvo što se pojavi je ekran **„Instalacijski token“**, pa se wizard
otključava tek kad je token ispravan.

### Prije početka

1. **Token za otključavanje.** U Coolify → Environment postavite `INSTALL_TOKEN` (najmanje 16 znakova). Bez njega
   je wizard zatvoren: ekran prikazuje poruku da token nije podešen. Token se ne čuva u bazi i ne treba ga
   ostavljati trajno uključenog.
2. **Deploy** po `ops/COOLIFY.md` (frontend, backend koji radi migracije, worker, Redis, PostgreSQL).
3. **SMTP je opcion.** Ako ga preskočite, e-mail kanal ostaje isključen i ne može se uključiti dok se SMTP ne
   podesi (kasnije u Admin → Postavke).

### Otključavanje

Na `/install` se prvo pojavljuje ekran **„Instalacijski token“** sa poljem za token i dugmetom **Otključaj**.
Unesite vrijednost iz `INSTALL_TOKEN`. Ako token nije ispravan, prikazuje se „Token nije ispravan.“; ako u
okruženju nije ni postavljen, prikazuje se poruka da token nije podešen. Token se pamti **samo za taj tab**
(sessionStorage) i šalje uz svaki instalacijski zahtjev.

## Korak po korak

Wizard ima šest koraka i traku napretka („Korak x od 6“). Dugme za nastavak u svakom koraku je **Dalje** (osim
posljednjeg, gdje je **Završi**).

### 1. SuperAdmin nalog

- Polja: **Email**, **Ime i prezime**, **Lozinka**, **Potvrda lozinke**.
- Lozinka: 12–128 znakova, mora imati najmanje jedan znak koji nije razmak i **ne smije biti jednaka emailu**.
- Ovaj nalog je **uvijek lokalni** i ostaje dostupan kao „break-glass“ prijava i kada se poslije izabere Entra AD.
- Nakon snimanja korak prikazuje potvrdu „SuperAdmin je kreiran“.
- Poruke: „Podaci za SuperAdmin nisu ispravni…“, „Početni SuperAdmin već postoji ili je email zauzet.“,
  „SuperAdmin nalog trenutno nije moguće sačuvati.“

### 2. Način prijave

- Bira se tačno jedan provajder: **Lokalni nalozi** ili **Microsoft Entra AD**.
- Za **Microsoft Entra AD** unosi se **Entra tenant ID** i **Entra client ID**, ili kompletni LDAPS podaci:
  **LDAPS URL-ovi (CSV)**, **LDAPS bind DN**, **LDAPS bind lozinka**.
- Već sačuvane tajne se ne prikazuju: ako polje ostavite prazno, postojeća vrijednost se zadržava.
- Lokalni SuperAdmin iz koraka 1 ostaje dostupan za prijavu bez obzira na izbor.
- Poruke: „Za Entra AD unesite tenant i client ili kompletne LDAPS bind podatke.“, „Konfiguracija prijave nije
  ispravna ili nije potpuna.“

### 3. SMTP

- Prekidač **SMTP omogućen**. Ako je isključen, polja se ne moraju popunjavati i e-mail dodatak ostaje ugašen.
- Kada je uključen: **SMTP host**, **SMTP port** (zadano 587), **TLS** (zadano uključen), **SMTP korisnik**,
  **SMTP lozinka**, **From adresa**.
- Lozinka je tajna: pri ponovnom upisu prazno polje zadržava postojeću vrijednost.
- Ako su vrijednosti pripremljene u okruženju (`SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM`), polja se popunjavaju unaprijed.
- Poruka: „Za uključen SMTP unesite host, port, korisnika, lozinku i validnu from adresu.“

### 4. Početni podaci

- Kreira se **minimum za rad** i ništa više: demo tiketi se **ne** kreiraju.
- Zadano se kreiraju: organizaciona jedinica **Direkcija**, grupa **Fallback**, kategorija **Opšte**, servis
  **Opšti zahtjev** sa formom (polje „Dodatne informacije“) i routing pravilo koje taj servis vodi na grupu
  Fallback.
- Poslije snimanja prikazuje se potvrda da se origin OU i servis razrješavaju na fallback grupu.
- Uz minimum se upisuju i **sistemske role s default permisijama** (USER, AGENT, ADMIN, ASSET_MANAGER,
  PROBLEM_MANAGER, CHANGE_MANAGER, SUPER_ADMIN — ukupno 161 veza), pa ADMIN i AGENT mogu raditi odmah nakon
  instalacije. Postupak je aditivan i ponavlja se bezbjedno; detaljno: `uloge-i-permisije.md`.

### 5. Dodaci

- Uključuju/isključuju se opcioni moduli. Jezgro (tiketi, usmjeravanje, inbox, RBAC, audit, in-app obavijesti,
  prilozi) ostaje uvijek uključeno.
- Zadano uključeni: CSAT, odobrenja, povjerljivi tiketi, KB intercept, razdvajanje tiketa, grupne akcije,
  sačuvani pogledi, izvještaji.
- Zadano isključeni: **Email** (traži uključen SMTP), **Edge**, **CMDB (imovina)**, **Problemi**, **Promjene**,
  **Microsoft Teams**.
- Isključen dodatak se kasnije može uključiti u Admin → Postavke.

### 6. Završi podešavanje

- Dugme **Završi** zaključava wizard („Zaključavanje…“).
- Nakon toga se otvara aplikacija, a instalacijske rute su zaključane: koraci se više ne mogu mijenjati; izmjene
  idu kroz **Admin → Postavke** (i odgovarajuće administratorske stranice).
- Uklonite `INSTALL_TOKEN` iz okruženja nakon završetka.

## Polja, validacije i statusi

Polja po koracima wizarda i pravila koja se primjenjuju:

| Korak | Polja | Validacija / pravilo |
|---|---|---|
| 1. SuperAdmin nalog | **Email**, **Ime i prezime**, **Lozinka**, **Potvrda lozinke** | Lozinka 12–128 znakova, najmanje jedan znak koji nije razmak, ne smije biti jednaka emailu; nalog je **uvijek lokalni** |
| 2. Način prijave | prekidač provajdera (**Lokalni nalozi** / **Microsoft Entra AD**), **Entra tenant ID**, **Entra client ID** ili **LDAPS URL-ovi (CSV)**, **LDAPS bind DN**, **LDAPS bind lozinka** | Bira se tačno jedan provajder; za Entra su obavezna oba ID-a ili kompletni LDAPS podaci; prazno polje tajne zadržava postojeću vrijednost |
| 3. SMTP | **SMTP omogućen**, **SMTP host**, **SMTP port** (zadano 587), **TLS** (zadano uključen), **SMTP korisnik**, **SMTP lozinka**, **From adresa** | Ako je prekidač isključen, polja nisu obavezna i e-mail dodatak ostaje ugašen; inače su host, port, korisnik, lozinka i validna from adresa obavezni; prazna lozinka zadržava postojeću vrijednost |
| 4. Početni podaci | bez polja | Kreiraju se OU **Direkcija**, grupa **Fallback**, kategorija **Opšte**, servis **Opšti zahtjev** s formom i routing pravilo, uz sistemske role i default permisije |
| 5. Dodaci | prekidači po modulu | Jezgro (tiketi, usmjeravanje, inbox, RBAC, audit, in-app obavijesti, prilozi) je uvijek uključeno; **Email** se ne može uključiti bez podešenog SMTP-a |
| 6. Završi podešavanje | dugme **Završi** | Zaključava wizard; dalje izmjene idu kroz **Admin → Postavke** |

**Statusi instalacije:** dok traje — zahtjevi van `/install` dobijaju `SETUP_REQUIRED` (HTTP 503); poslije
**Završi** — instalacijski koraci vraćaju `INSTALL_LOCKED`.

**Šta se ne provjerava:** veza prema SMTP-u, LDAPS-u i Entra-u se **ne testira** (ni formatom van obaveznih
polja) — greška u vezi vidi se tek pri prvoj upotrebi. Vidi *Poznata ograničenja*.

## Česta pitanja i greške

- **„Moram li ponovo unositi SMTP lozinku?“** — Ne. Sačuvane tajne se ne prikazuju; prazno polje zadržava
  postojeću vrijednost.
- **„Kreiraju li se demo tiketi?“** — Ne; kreira se samo minimum za rad (korak 4).
- **„Ostavio sam `INSTALL_TOKEN` u okruženju.“** — Uklonite ga nakon završetka. Rute su zaključane
  (`INSTALL_LOCKED`), ali token nije potreban i ne treba stajati trajno.
- **„Prekinuo sam instalaciju poslije koraka 2.“** — Osvježavanje vraća na korak **Način prijave**; već sačuvane
  vrijednosti ostaju (vidi *Poznata ograničenja*).

| Situacija | Šta korisnik vidi / dobija |
|---|---|
| Token nije postavljen u okruženju | poruka da token nije podešen (`INSTALL_TOKEN_NOT_CONFIGURED`) |
| Token je pogrešan | „Token nije ispravan.“ (`INSTALL_TOKEN_INVALID`) |
| Aplikacija nije instalirana, a pristupa joj se van `/install` | „Instalacija još nije završena.“ (`SETUP_REQUIRED`, HTTP 503) |
| Instalacija je završena, a poziva se instalacijski korak | `INSTALL_LOCKED` |
| Korak traži SuperAdmina prije njegovog kreiranja | „Prvo kreirajte SuperAdmin nalog.“ (`SUPER_ADMIN_REQUIRED`) |
| Seed ne može razriješiti rutu | `SEED_ROUTING_UNRESOLVED` (instalacija se ne završava) |

## Poznata ograničenja

- **Nema test-konekcije.** SMTP, LDAPS i Entra podaci se provjeravaju samo po formatu; greška u vezi vidi se tek
  pri prvoj upotrebi.
- **Nastavak instalacije.** Ako prekinete poslije koraka 2, a SMTP nije podešen i podaci nisu ubačeni,
  osvježavanje stranice vraća vas na korak **Način prijave** (već sačuvane vrijednosti ostaju i ne moraju se
  ponovo unositi).
- **Lozinka prvog naloga.** Za SuperAdmina se provjerava samo dužina i da nije email; pravila jačine lozinke iz
  *Sigurnost naloga* (lista najčešćih lozinki, historija) primjenjuju se na ostale naloge.
- **Stanje dodataka** je nakon završetka instalacije čitljivo i bez prijave (tehnički detalj; ne unosi nikakve
  tajne u nazive dodataka).

## Povezani moduli

- Postavljanje infrastrukture: `ops/COOLIFY.md`, `docs/ops/staging-checklist.md`
- Sigurnost naloga (MFA, promjena lozinke): *Sigurnost naloga* i `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md`
- Teze: **T15**, **T16**, **T17**
- Analiza modula: `REVIEW_ANALIZA.md` §M1
