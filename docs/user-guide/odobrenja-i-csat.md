---
title: Odobrenja i CSAT
slug: odobrenja-i-csat
module: M9
part: korisnik
audience: [Korisnik, Agent, Administrator]
roles: []
order: 20
tags: [odobrenja, csat, ocjena, komentar, nps]
---
# Odobrenja i CSAT

> **Namjena:** **odobrenje** je kapija prije obrade — za usluge koje to traže tiket se otvara u statusu
> **Čeka odobrenje** i ne ide u rad dok ovlaštena osoba ne odluči. **CSAT** je kratka ocjena zadovoljstva
> (podrazumijevano 1–5 zvjezdica, skala je podesiva) koju naručilac daje nakon rješavanja ili zatvaranja tiketa. Oba toka se vide u detalju
> tiketa.

## Čemu služi ovaj modul

- **Odobrenje** sprečava da se osjetljivi zahtjevi (nabavka, pristup, oprema) obrade bez odluke odgovorne osobe.
- Odluka je **Odobri** (tiket prelazi u obradu) ili **Odbij** (tiket se **zatvara**) — u oba slučaja s
  **razlogom** koji ostaje u tiketu.
- Dok tiket čeka odluku, **SLA tajmer je pauziran** (postavka), pa čekanje ne „troši“ rok agenata.
- **CSAT** mjeri zadovoljstvo korisnika; ocjena je **jedna po tiketu**, dobrovoljna i vezana za period
  neposredno nakon rješavanja.

## Kome je namijenjen

| Rola | Šta može |
|---|---|
| **Korisnik (naručilac)** | Vidi da tiket čeka odobrenje; **ne može** sam odobriti svoj zahtjev; nakon rješavanja daje CSAT ocjenu i komentar. |
| **Agent** | Može odlučivati **samo ako** mu je dodijeljena rola odobravaoca (podrazumijevano je to ADMIN) i **samo** za tikete u svom OU/servis scope-u. |
| **ADMIN** | Podrazumijevani odobravalac; odlučuje o tiketima u svom scope-u. |
| **SUPER_ADMIN** | Može odlučiti o svakom tiketu koji čeka odobrenje. |

Pravilo koje se lako previdi: **naručilac ne može odobriti vlastiti zahtjev**, čak i ako ima administratorsku
rolu.

## Kako doći

1. **Tiketi koji čekaju odobrenje:** **Nadzorna ploča** → pločica **Čeka odobrenje** (vodi na listu filtriranu
   po statusu).
2. **Odluka:** detalj tiketa → panel **Odobrenja** (desna kolona).
3. **CSAT:** detalj tiketa → traka **CSAT ocjena** iznad radnog prostora (vidljiva kad tiket ispunjava uslove).

## Korak po korak

### 1. Kako tiket dođe u „Čeka odobrenje“

1. Korisnik prijavi tiket na usluzi koja **zahtijeva odobrenje** (polje *Zahtijeva odobrenje* na usluzi ili
   pravilo po servisu u postavkama).
2. Tiket se otvara sa statusom **Čeka odobrenje** i, ako je pronađeno routing pravilo, odmah dobija **handler
   grupu**.
3. U tiketu se pojavljuje sistemski zapis o zahtjevu za odobrenje, a u panelu **Odobrenja** jedan korak sa
   statusom **Na čekanju**.
4. Napomena: ako za uslugu **ne postoji** routing pravilo, tiket se otvara kao **Nije usmjereno** i **ne dobija**
   zahtjev za odobrenje (vidi *Poznata ograničenja*).

### 2. Odluka o odobrenju

1. Otvorite detalj tiketa i panel **Odobrenja**.
2. Polje **Razlog odluke** je **obavezno** — bez njega dugmad ne rade.
3. Kliknite **Odobri** ili **Odbij**.
4. Ishodi:
   - **Odobri** → odobrenje postaje **Odobreno**, tiket prelazi u **Na čekanju** i dalje ga preuzima grupa;
     SLA tajmer se nastavlja.
   - **Odbij** → odobrenje postaje **Odbijeno**, a **tiket se zatvara** (status **Zatvoreno**).
5. Odluka ostaje u tiketu: razlog se prikazuje pod navodnicima u koraku, uz ime odlučioca i vrijeme, a u
   vremenskoj liniji stoji sistemski zapis i poruka tipa **odluka o odobrenju**.
6. Korak se može odlučiti **samo jednom**; nakon odluke dugmad se više ne prikazuju.

### 3. Ocjenjivanje tiketa (CSAT)

1. Kada je tiket **Riješeno** (ili **Zatvoreno**, ako je tako podešeno), a vi ste **naručilac**, u detalju se
   pojavljuje traka **CSAT ocjena**.
2. Kliknite zvjezdice (1 = najniža ocjena, do podešene skale) i, ako želite, upišite **Komentar (opcionalno)**.
3. Kliknite **Pošalji ocjenu**. Nakon slanja traka prikazuje poruku **„Ocjena je zabilježena.“**
4. Ocjena se šalje **samo jednom** i **ne može se mijenjati ni brisati**.

## Polja, validacije i statusi

### Odobrenje

| Element | Pravilo |
|---|---|
| Broj koraka | Jedan zapis po tiketu (korak 1) |
| Status odobrenja | **Na čekanju**, **Odobreno**, **Odbijeno** |
| Razlog odluke | Obavezan u formi; upisuje se uz odluku (do 2000 znakova) |
| Posljedica „Odobri“ | Tiket → **Na čekanju** (grupa je već dodijeljena) |
| Posljedica „Odbij“ | Tiket → **Zatvoreno** |
| Pravo odluke | Modul uključen, tiket u **Čeka odobrenje**, akter **nije** naručilac, rola odobravaoca u OU/servis scope-u (SUPER_ADMIN uvijek) |
| Zapisi | Change log (razlog `ticket_approval_approved` / `ticket_approval_rejected`), sistemski događaj, poruka **odluka o odobrenju**, dodavanje odlučioca kao **odobravalaca** |

### CSAT

| Element | Pravilo |
|---|---|
| Skala | Podesiva (podrazumijevano 1–5; dozvoljeno 2–10; postavka `private.csat.scaleMax`). Prag „zadovoljan“ je 80 % skale i prikazuje se uz ocjenu. |
| Ko šalje | Samo **naručilac** tiketa |
| Kada | Tiket **Riješeno** (podrazumijevano uključeno) i/ili **Zatvoreno** (podrazumijevano isključeno) |
| Uzorak | Podesiv (0–1); odabir je deterministički — isti tiket uvijek prolazi ili ne prolazi |
| Broj ocjena | **Jedna po tiketu** |
| Komentar | Opcionalan, do 2000 znakova; prolazi provjeru osjetljivog sadržaja |
| Izmjena | Nije moguća (nema izmjene ni brisanja) |
| Gdje se vidi | **Izvještaji → Pregled** (KPI kartica **CSAT**) i **Izvještaji → CSAT** (prosjek na važećoj skali, broj ocjena, prag zadovoljan i razrez po jedinici, servisu i grupi) |

### Povezani statusi tiketa

| Status | Znači |
|---|---|
| **Čeka odobrenje** (`PENDING_APPROVAL`) | odobrenje je u toku; SLA pauziran (ako je postavka uključena) |
| **Na čekanju** (`PENDING`) | odobreno — tiket je u redu svoje grupe |
| **Zatvoreno** (`CLOSED`) | odbijeno (ili zatvoreno iz drugog razloga) |
| **Riješeno** (`RESOLVED`) | period u kojem je CSAT dostupan (podrazumijevano) |

## Česta pitanja i greške

- **„Ne mogu odobriti tiket.“** — mogući razlozi: vi ste naručilac zahtjeva, nemate rolu odobravaoca, tiket je van
  vašeg OU/servis scope-a, ili tiket više nije u statusu **Čeka odobrenje**.
- **„Dugmad Odobri/Odbij su neaktivna.“** — **Razlog odluke** je obavezan; upišite ga i dugmad se aktiviraju.
- **„Tiket je zatvoren, a nisam ga rješavao.“** — odobrenje je **odbijeno**; status tiketa je **Zatvoreno**, a
  razlog odbijanja stoji u panelu **Odobrenja**.
- **„Odobrio sam, ali tiket stoji.“** — nakon odobrenja tiket ide u **Na čekanju** i čeka da ga agent preuzme iz
  grupe; odobrenje samo otvara put, ne dodjeljuje agenta.
- **„Nemamo obavještenje o tiketu koji čeka odobrenje.“** — poznato ograničenje: obavještenje tipa
  *„Čeka odobrenje“* postoji u postavkama, ali u praksi nema primaoca; tikete pratite preko nadzorne ploče i
  filtera (vidi *Poznata ograničenja*).
- **„Ne vidim CSAT traku.“** — traka se prikazuje samo naručiocu, samo za `Riješeno`/`Zatvoreno` po postavci, i
  samo ako tiket nije izostavljen uzorkovanjem.
- **„Već sam poslao ocjenu, mogu li je promijeniti?“** — ne; ocjena je konačna.
- **„Zašto je CSAT dostupan i na zatvorenom tiketu?“** — postavka *pitaj na zatvaranju* je uključena; po
  defaultu je isključena, pa je prompt vezan za **Riješeno**.

## Poznata ograničenja

- **Obavještenje „Čeka odobrenje“ u praksi ne stiže nikome:** primaoci se traže među učesnicima s ulogom
  *odobravalac*, a ta uloga nastaje tek pri odluci; pri kreiranju se dodaju samo naručilac i handler grupa.
  (Nalaz B1 iz §M9.)
- **Tiket koji počne kao „Nije usmjereno“ ne dobija zahtjev za odobrenje** čak i kad usluga traži odobrenje; ako
  se kasnije proslijedi u grupu, odobrenje se ne kreira. (Nalaz B2.)
- **CSAT po jedinici, servisu i grupi** prikazuje se na tabu **CSAT** u izvještajima (popravljeno u valu 1);
  ostaje ograničenje da taj razrez poštuje **vaše vidno polje**, a ne filtre perioda — CSAT nema period u
  API-ju. Za razrez po vremenu koristite tab **Trendovi** (serije).
- **Serije na tabu Trendovi** su i dalje vezane na skalu 5 i prag ≥ 4, bez obzira na postavku
  `private.csat.scaleMax`; **tab Pregled i tab CSAT** poštuju postavku. (Preostali dio nalaza B3.)
- **Postavka „koristi manager-a naručioca kao odobravaoca“** je vidljiva u postavkama, ali ne mijenja ponašanje.
  (Nalaz B4.)
- **Zapis u change logu za ocjenu ne pokazuje razliku** (prije i poslije su identični); sama ocjena je vidljiva u
  vremenskoj liniji. (Nalaz B5.)
- **Odobrenje je jednokoračno** — model ima redni broj koraka, ali aplikacija uvijek kreira jedan korak.

## Povezani moduli

- **Tiketi** — statusi, tok statusa, preuzimanje iz grupe i vremenska linija.
- **Katalog usluga i forme** — polje **Zahtijeva odobrenje** na usluzi i korak *Odobrenja* u onboarding
  čarobnjaku.
- **Usmjeravanje i prioritet** — grupa u koju tiket ide nakon odobrenja.
- **SLA** — pauza tajmera dok tiket čeka odobrenje.
- **Izvještaji i nadzorna ploča** — pločica **Čeka odobrenje** i CSAT prosjek u KPI panelu.
- **Uloge i permisije** — rola odobravaoca i OU/servis scope.

---

*Ažurirano: 2026-10-03 · Modul: Odobrenja i CSAT (M9)*
