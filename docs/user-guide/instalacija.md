---
title: Instalacija (prvi start)
slug: instalacija
module: M1
part: pocetak
audience: [Administrator, Operativa]
roles: [ADMIN, SUPER_ADMIN]
order: 10
tags: [instalacija, install-token, superadmin, paketi, checklist]
---
# Instalacija (prvi start)

## Čemu služi ovaj modul

Instalacija je **jednokratni tok** koji se vodi na adresi `/install` neposredno nakon prvog deploya aplikacije.
Njime nastaju prvi nalog (SuperAdmin), identitet instalacije, način prijave, odlazni e-mail, organizacijska
struktura s prvim servisom, tim i katalog. Dok instalacija nije završena, aplikacija ne radi ništa drugo: svaki
zahtjev dobija odgovor „Instalacija još nije završena“ (`SETUP_REQUIRED`).

Od verzije 2 čarobnjak ide **po paketu**: prvo pitanje je koji paket instalirate (Minimum, Standard ili Full), a
paket određuje koje korake vidite. Korak koji vam sada ne treba možete odgoditi („Podesi kasnije“) — a ono što
odgodite poslije instalacije vas čeka na kontrolnoj listi na dashboardu.

## Kome je namijenjen

Stranica je namijenjena **administratoru/operativi koja postavlja aplikaciju**, ne krajnjim korisnicima.

## Kako doći

Instalacija se otvara na adresi `/install` neposredno nakon prvog deploya. Dok nije završena, pristup bilo kojoj
drugoj stranici se preusmjerava na čarobnjak. Prvo što se pojavi je ekran **„Instalacijski token“**, pa se
čarobnjak otključava tek kad je token ispravan.

### Prije početka

1. **Token za otključavanje.** U Coolify → Environment postavite `INSTALL_TOKEN` (najmanje 16 znakova). Bez njega
   je čarobnjak zatvoren: ekran prikazuje poruku da token nije podešen. Token se ne čuva u bazi i ne treba ga
   ostavljati trajno uključenog.
2. **Deploy** po `ops/COOLIFY.md` (frontend, backend koji radi migracije, worker, Redis, PostgreSQL).
3. **Odluka o paketu.** Minimum je jezgro za rad jednog tima, Standard dodaje tim, e-mail i katalog iz predloška,
   a Full dodaje module (baza znanja, status stranica, dežurstva, najave, privatnost, ITSM). Paket se poslije
   završetka može **samo nadograditi** (Minimum → Standard → Full).
4. **SMTP je opcion** i može se odgoditi. Ako ga preskočite, e-mail kanal ostaje isključen i ne može se uključiti
   dok se SMTP ne podesi (kasnije u Admin → Postavke).

### Otključavanje

Na `/install` se prvo pojavljuje ekran **„Instalacijski token“** sa poljem za token i dugmetom **Otključaj**.
Unesite vrijednost iz `INSTALL_TOKEN`. Ako token nije ispravan, prikazuje se „Token nije ispravan.“; ako u
okruženju nije ni postavljen, prikazuje se poruka da token nije podešen. Token se pamti **samo za taj tab**
(sessionStorage) i šalje uz svaki instalacijski zahtjev.

## Korak po korak

Iznad sadržaja stoji uvijek isti okvir: naslov koraka, kratko objašnjenje i traka **„Korak x od y“** s lijeve
strane, uz listu koraka vašeg paketa (završeno / trenutno / odgođeno). Na dnu su **Nazad** (pregled već
odgovorenog koraka), **Podesi kasnije** (samo za korake koji to dozvoljavaju) i **Nastavi** (izlaz iz pregleda).
Glavno dugme uvijek je u samom koraku („Sačuvaj“, „Kreiraj strukturu“, „Dalje“).

### 1. Paket instalacije (uvijek prvo)

- Tri kartice: **Minimum**, **Standard** (**Preporučeno**) i **Full**, svaka s procjenom trajanja i popisom šta
  donosi; „Prikaži sve“ otvara punu listu s oznakom obaveznog i opcionog sadržaja.
- **„Prilagodi paket“** prikazuje korake izabranog paketa. Prekidač ima samo korak koji se smije odgoditi; obavezni
  koraci su zaključani uz objašnjenje.
- Paket se pamti tek na **„Nastavi s paketom“**. Ako se vratite i promijenite paket, koraci koje novi paket
  **traži** a stari ih je samo nudio vraćaju se u tok, a iznad njih stoji jedna informativna rečenica zašto.
- Nakon prvog koraka „Struktura i prvi servis“ paket se može samo **nadograditi**.

### 2. SuperAdmin nalog

- Polja: **Email**, **Ime i prezime**, **Lozinka**, **Potvrda lozinke**.
- Lozinka: najmanje `private.auth.password.minLength` znakova (zadano 12, najviše 128), ne smije biti prazna,
  jednaka emailu, među najčešćim lozinkama, sadržavati naziv organizacije ni dio email adrese.
- Ispod polja stoji uputa s važećom granicom; ako server odbije lozinku, ispisuje se spisak prekršenih pravila.
- Ovaj nalog je **uvijek lokalni** i ostaje dostupan kao „break-glass“ prijava i kada se poslije izabere Entra AD.
- Poruke: „Podaci za SuperAdmin nisu ispravni…“, „Početni SuperAdmin već postoji ili je email zauzet.“,
  „SuperAdmin nalog trenutno nije moguće sačuvati.“

### 3. Identitet instalacije

- **Naziv organizacije** (obavezno), naziv aplikacije, jezik sistema (bosanski/engleski), vremenska zona,
  logo, e-mail i link podrške.
- Isti podaci se odmah vide na prijavnoj stranici, a kasnije se uređuju u **Admin → Postavke → Brending**.
- Korak je završen kad je naziv organizacije sačuvan; polje koje ostavite prazno **ne** briše postojeću vrijednost.

### 4. Način prijave

- Prekidač: **Lokalni nalozi** ili **Microsoft Entra AD**.
- Za Entra: tenant i client ID, ili kompletni LDAPS bind podaci (URL-ovi, bind DN, lozinka).
- SuperAdmin ostaje lokalni break-glass nalog i kad je izabran Entra.

### 5. SMTP

- Prekidač **SMTP omogućen**; ako je uključen: host, port, TLS, korisnik, lozinka, from adresa.
- **Test e-mail** šalje probnu poruku (prazno polje = adresa SuperAdmina) i odmah pokaže da li je server prihvatio
  poruku. Neuspjeh testa ne mijenja sačuvanu konfiguraciju.
- U paketu Minimum korak je ponuđen, ali se može odgoditi. Ako je SMTP isključen, e-mail dodatak ostaje ugašen.

### 6. Struktura i prvi servis

Polja: **Organizacijska jedinica**, **Grupa koja prima tikete**, **Kategorija**, **Servis**. Živi pregled ispod
polja pokazuje kako će tiket završiti („Tiket za *Servis* ide grupi *Grupa* u OU *OU*“).

- Nastaju: OU, grupa koja prima tikete (minimalno jedna, fallback za neusmjerene), kategorija i servis s formom,
  uz routing pravilo i standardni SLA profil servisa.
- SuperAdmin je član grupe, pa je grupa odmah „aktivna“.
- Ponovno snimanje **ne** preimenuje postojeće zapise; pored sažetka se prikaže šta je već sačuvano (preimenovanje
  je posao administratorskih stranica, ne čarobnjaka).

### 7. Tim

- Do 25 redova (ime, e-mail, uloga **Agent** ili **Administrator**). Svaki red postaje stvarni nalog i član grupe
  koja prima tikete.
- Bez SMTP-a se **privremena lozinka prikazuje jednom**, u dijalogu koji možete kopirati — poslije se ne može
  ponovo pročitati.
- Ako tim dodajete kasnije, koristite „Podesi kasnije“: SuperAdmin ostaje član grupe, a kontrolna lista će vas
  podsjetiti.

### 8. Katalog iz predloška (Standard i Full)

- Predložak **IT service desk** postavlja kategorije i servise (Hardver, Softver, Pristup i nalozi, Mreža, Opšte)
  i po želji tier grupe **nivo-1**/**nivo-2**.
- Stablo „Kategorija → Servisi“ ima prekidač po servisu; primjena je atomska i dokazuje da se svaki servis
  usmjerava tačno (nema tihog fallbacka).
- Ponovna primjena ne duplira zapise.

### 9. Paket prava (Standard i Full)

- Paketi iz registra (npr. **IT Standard**, HR Restricted, Finance Restricted) postavljaju uloge, dozvole i
  pravila servisa.
- Ovaj korak se **ne može odgoditi**: paket nosi prava koja paket instalacije obećava.

### 10. Radno vrijeme i prioriteti (Standard i Full)

- Prikazuje se radni kalendar (zadano **BH_STANDARD**), matrica prioriteta i broj praznika.
- **„Potvrđujem podrazumijevano“** samo potvrđuje pregled i ne mijenja podatke; izmjene radnog vremena se snimaju
  dugmetom **„Sačuvaj izmjene“**.
- Matrica prioriteta se ovdje prikazuje **samo za čitanje** — mijenja se na SLA stranici, gdje izmjena traži razlog.

### 11. Sekcije paketa Full

Full prikazuje po jedan korak za svaku grupu podešavanja (dolazni e-mail, direktorij, baza znanja, status
stranica, dežurstva, najave, sigurnost, privatnost, audit webhook, ITSM, integracije). Svaka sekcija se može
odgoditi, a unutar nje su **samo ključevi koje ta sekcija smije mijenjati** — polja pokazuju zadane vrijednosti i
kratko objašnjenje. „Potvrdi zadane vrijednosti“ je dovoljno da korak bude odgovoren.

### 12. Preporuke za produkciju (Standard i Full)

- One klik: MFA **obavezan za administratore** (ostalima dostupan), provjera procurjelih lozinki uključena, a
  captcha ostaje isključena dok ne unesete Turnstile ključeve.
- Trajanje neaktivne sesije se postavlja na 30 minuta ako je to unutar dozvoljenih granica; ako nije, vrijednost
  ostaje nepromijenjena i to je napisano uz stavku.
- Stavka koja se ne može primijeniti s ovim ključevima je označena kao **ručna** i korak se time i dalje smatra
  odgovorenim.

### 13. Dodaci

- Uključuju/isključuju se opcioni moduli. Jezgro (tiketi, usmjeravanje, inbox, RBAC, audit, in-app obavijesti,
  prilozi) ostaje uvijek uključeno.
- Zadano uključeni: CSAT, odobrenja, povjerljivi tiketi, KB intercept, razdvajanje tiketa, grupne akcije,
  sačuvani pogledi, izvještaji. U paketu Full su uključeni i CMDB, problemi i promjene.
- Zadano isključeni: **Email** (traži uključen SMTP), **Edge**, **Microsoft Teams**.
- Korak je odgovoren tek kad kliknete „Dalje“ — osvježavanje stranice ne prihvata zadanu postavku umjesto vas.

### 14. Provjera spremnosti

Ovo je posljednji ekran prije kraja i **jedino mjesto** s kojeg se instalacija završava. Lista pokazuje, jednu po
jednu, provjere iz `GET /install/readiness`: SuperAdmin, način prijave, organizacijska jedinica, grupa koja prima
tikete, servis s formom, routing, SLA profil, sistemske uloge i koraci paketa.

- Zeleno = spremno. Crveno = nedostaje i **ne može se završiti** — uz crvenu stavku stoji **„Idi na korak“** koji
  vas vodi na korak koji je rješava (npr. SLA profil → „Radno vrijeme i prioriteti“).
- Sistemske uloge su izuzetak: njih ne postavlja nijedan korak, pa crvena stavka nema dugme i to je znak da se
  javite operativi.
- **„Provjeri ponovo“** ponovo čita stanje (npr. poslije promjene u drugoj sesiji).
- Kad je sve zeleno, pojavljuje se **„Završi instalaciju“**. Ono zaključava čarobnjak; odgovor servera je
  `409 INSTALL_NOT_READY` ako nešto ipak nije spremno, i tada se prikaže spisak onoga što nedostaje.

### 15. „Sistem je spreman“

- Sažetak: paket, organizacija, broj organizacijskih jedinica, servisa, grupa i članova tima, uključeni dodaci i
  ono što je ostavljeno za kasnije.
- Tri prva koraka: **Kreiraj prvi tiket** (portal), **Pozovi tim** (ako ste tim odgodili) i **Otvori podešavanja**.
- Prijava se **ne** obavlja automatski: kliknite **Prijavite se** i prijavite se SuperAdmin nalogom na `/login`.

## Poslije instalacije

- Instalacijske rute su zaključane (`INSTALL_LOCKED`); sve izmjene idu kroz **Admin → Postavke** i
  administratorske stranice.
- Ako ste neki korak odgodili, na dashboardu vas čeka kartica **„Završite podešavanje“** sa tačno tim stavkama.
  Svaka stavka vodi na ekran koji je rješava i **nestaje sama** kad stvar iza nje postoji (SMTP je podešen, tim je
  pozvan, preporuke su primijenjene). Dugme **Sakrij** sklanja karticu; stanje se vraća brisanjem postavke
  `private.install.checklistDismissedAt` u Admin → Postavke.
- Uklonite `INSTALL_TOKEN` iz okruženja nakon završetka.

## Polja, validacije i statusi

| Korak | Ključna polja | Validacija / pravilo |
|---|---|---|
| 1. Paket | kartice Minimum / Standard / Full, „Prilagodi paket“ | Paket se pamti na „Nastavi s paketom“; poslije prvog seeda samo nadogradnja |
| 2. SuperAdmin | **Email**, **Ime i prezime**, **Lozinka**, **Potvrda lozinke** | Politika lozinke iz **Sigurnost naloga** (`private.auth.password.minLength`, zadano 12, najviše 128); nalog je **uvijek lokalni** |
| 3. Identitet | **Naziv organizacije**, naziv aplikacije, jezik, vremenska zona, logo, kontakt podrške | Naziv organizacije obavezan; prazno polje zadržava postojeću vrijednost |
| 4. Način prijave | provajder, **Entra tenant ID**, **Entra client ID** ili **LDAPS URL-ovi (CSV)**, bind DN i lozinka | Tačno jedan provajder; za Entra oba ID-a ili kompletni LDAPS podaci |
| 5. SMTP | **SMTP omogućen**, host, port (zadano 587), TLS, korisnik, lozinka, from adresa, **Test e-mail** | Ako je prekidač isključen, polja nisu obavezna i e-mail dodatak ostaje ugašen; test ne mijenja sačuvanu konfiguraciju |
| 6. Struktura | **OU**, **grupa**, **kategorija**, **servis** | Naziv do 120 znakova, bez zareza i znaka jednakosti; ponovno snimanje ne preimenuje zapise |
| 7. Tim | ime, e-mail, uloga (Agent/Administrator) | Najviše 25 redova; bez SMTP-a se privremena lozinka prikazuje jednom |
| 8. Katalog | predložak, servisi, tier grupe | Atomska primjena; svaki servis mora imati tačnu rutu |
| 9. Paket prava | paket (npr. IT Standard) | Korak se ne može odgoditi; isključen paket daje `PACK_DISABLED` |
| 10. Radno vrijeme | kalendar, matrica, praznici | Prazna izmjena daje `SLA_REVIEW_EMPTY_ADJUSTMENT` |
| 11. Sekcije (Full) | polja po sekciji | Samo ključevi te sekcije; „Potvrdi zadane vrijednosti“ je dovoljno |
| 12. Preporuke | MFA, provjera lozinki, captcha, trajanje sesije | Primjena je idempotentna; nepodržana vrijednost ostaje nepromijenjena i piše se kao „ručno“ |
| 13. Dodaci | prekidači po modulu | Jezgro je uvijek uključeno; **Email** traži podešen SMTP |
| 14. Provjera spremnosti | lista provjera, **Provjeri ponovo**, **Završi instalaciju** | Završavanje je moguće samo kad su sve provjere zelene ili odgođene |
| 15. Sistem je spreman | sažetak i prva tri koraka | Ništa se ne šalje; prijava ide na `/login` |

**Statusi instalacije:** dok traje — zahtjevi van `/install` dobijaju `SETUP_REQUIRED` (HTTP 503); poslije
**Završi instalaciju** — instalacijski koraci vraćaju `INSTALL_LOCKED`.

**Šta se ne provjerava:** veza prema SMTP-u (osim kad sami pošaljete test), LDAPS-u i Entra-u se **ne testira** u
čarobnjaku; greška u vezi vidi se tek pri prvoj upotrebi. Vidi *Poznata ograničenja*.

## Česta pitanja i greške

- **„Moram li ponovo unositi SMTP lozinku?“** — Ne. Sačuvane tajne se ne prikazuju; prazno polje zadržava
  postojeću vrijednost.
- **„Kreiraju li se demo tiketi?“** — Ne; kreiraju se samo struktura, servis, forma i routing pravilo.
- **„Odgodio sam korak, gdje ga poslije nađem?“** — Na dashboardu, u kartici „Završite podešavanje“. Stavka
  nestaje sama kad je posao obavljen; **Sakrij** sklanja samo karticu.
- **„Zašto ne mogu promijeniti paket na manji?“** — Poslije prvog seeda paket se može samo nadograditi. Vraćanje
  na manji paket bi ugasilo module na kojima podaci već postoje.
- **„Zašto korak koji sam odgodio ponovo traži odgovor?“** — Zato što ste u međuvremenu odabrali paket koji ga
  **traži** (npr. Standard traži tim). Iznad koraka stoji objašnjenje, a korak možete ponovo odgoditi.
- **„Ostavio sam `INSTALL_TOKEN` u okruženju.“** — Uklonite ga nakon završetka. Rute su zaključane
  (`INSTALL_LOCKED`), ali token ne treba stajati trajno.
- **„Kako ponovo pokrenuti instalaciju?“** — Čarobnjak se poslije završetka zaključava (`INSTALL_LOCKED`) i u
  aplikaciji nema dugme za povratak: to je **ops akcija**. Na backendu se uključi `INSTALL_ALLOW_RERUN=true`
  (i vrati `INSTALL_TOKEN`, jer se čarobnjak bez njega ne može ni otvoriti ni zatvoriti), pa se pozove
  `POST /install/restart` ili pokrene `npm run cli:install-rerun`. Dok je čarobnjak otvoren, aplikacija je
  nedostupna (`SETUP_REQUIRED`) osim instalacijskih ruta. Recept i opoziv prekidača:
  `ops/runbook/ponovno-pokretanje-instalacije.md`.
- **„Prekinuo sam instalaciju poslije koraka 4.“** — Osvježavanje vraća na prvi neodgovoreni korak vašeg paketa;
  već sačuvane vrijednosti ostaju (vidi *Poznata ograničenja*).

| Situacija | Šta korisnik vidi / dobija |
|---|---|
| Token nije postavljen u okruženju | poruka da token nije podešen (`INSTALL_TOKEN_NOT_CONFIGURED`) |
| Token je pogrešan | „Token nije ispravan.“ (`INSTALL_TOKEN_INVALID`) |
| Aplikacija nije instalirana, a pristupa joj se van `/install` | „Instalacija još nije završena.“ (`SETUP_REQUIRED`, HTTP 503) |
| Instalacija je završena, a poziva se instalacijski korak | `INSTALL_LOCKED` |
| Završavanje prije nego su provjere zelene | `INSTALL_NOT_READY` uz spisak onoga što nedostaje |
| Korak se pokušava odgoditi, a ne dozvoljava odgodu | `INSTALL_STEP_NOT_SKIPPABLE` |
| Ponovno pokretanje instalacije nije uključeno u okruženju | `INSTALL_RERUN_NOT_ALLOWED` (HTTP 403) |
| Lozinka SuperAdmina ne prolazi politiku | `PASSWORD_POLICY_VIOLATIONS` uz spisak pravila (`TOO_SHORT`, `COMMON_PASSWORD`, …) |
| Korak traži SuperAdmina prije njegovog kreiranja | „Prvo kreirajte SuperAdmin nalog.“ (`SUPER_ADMIN_REQUIRED`) |
| Seed ne može razriješiti rutu | `SEED_ROUTING_UNRESOLVED` (instalacija se ne završava) |

## Poznata ograničenja

- **Nema test-konekcije za LDAPS i Entra.** Testira se samo SMTP (i to kad sami pošaljete test e-mail); greška u
  ostalim vezama vidi se pri prvoj upotrebi.
- **Nastavak instalacije.** Osvježavanje vas vraća na prvi **neodgovoreni** korak paketa; sačuvane vrijednosti
  ostaju i ne moraju se unositi ponovo.
- **Kontrolna lista je pojednostavljena.** Prikazuje odgođene korake i nekoliko preporuka (SMTP, tim, katalog, SLA
  pregled, preporuke, dodaci); ne prati svaku pojedinačnu postavku iz Settingsa.
- **Stanje dodataka** je nakon završetka instalacije čitljivo i bez prijave (tehnički detalj; ne unosi nikakve
  tajne u nazive dodataka).

## Povezani moduli

- Postavljanje infrastrukture: `ops/COOLIFY.md`, `docs/ops/staging-checklist.md`
- Ponovno pokretanje instalacije: `ops/runbook/ponovno-pokretanje-instalacije.md`
- Sigurnost naloga (MFA, promjena lozinke): *Sigurnost naloga* i `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md`
- Teze: **T15**, **T16**, **T17**
- Analiza modula: `REVIEW_ANALIZA.md` §M1
