---
title: Rječnik
slug: rjecnik
module: —
part: referenca
audience: [Svi korisnici, Agent, Administrator]
roles: []
order: 30
tags: [rjecnik, pojmovi, tiket, sla, csat, cmdb]
---

# Rječnik

## Čemu služi ovaj modul

Pojmovi koji se koriste u aplikaciji i u ovim vodičima, sa najkraćim objašnjenjem i linkom na stranicu na
kojoj je detalj. Ako u vodiču sretnete nepoznat pojam, potražite ga ovdje.

## Kome je namijenjen

**Svim korisnicima.** Agentima i administratorima služi kao podsjetnik na razliku između sličnih pojmova
(npr. **incident** i **zakazani prekid**, **problem** i **promjena**).

## Kako doći

- **Dokumentacija → Referenca → Rječnik.**
- **Pretraga:** u Dokumentaciji ukucajte pojam (npr. „CSAT“) — pretraga pokriva i ovu stranicu.

## Korak po korak

1. Pojmovi su poredani **abecedno** u tabeli ispod.
2. Kolona **Vidi** upućuje na stranicu ili ekran gdje se pojam koristi.
3. Ako pojma nema, pretražite Dokumentaciju ili pogledajte stranicu modula (sekcija **Polja, validacije i
   statusi** često definiše pojmove tog modula).

## Polja, validacije i statusi

| Pojam | Značenje | Vidi |
|---|---|---|
| **Agent** | Rola koja radi na tiketima: grupni inbox, preuzimanje, promjena statusa, poruke, prilozi, mjerenje vremena. | `tiketi.md` |
| **CAB** | Grupa koja glasanjem odobrava promjene; kvorum je 2 za normalnu i 1 za hitnu promjenu. | `promjene.md` |
| **CMDB** | Evidencija imovine: oprema, licence, ugovori, zaduženja i historija. | `imovina.md` |
| **CSAT** | Kratka ocjena zadovoljstva koju naručilac daje poslije rješenja tiketa. | `odobrenja-i-csat.md` |
| **Dežurstvo (on-call)** | Raspored smjena po grupi, izračunat iz početnog datuma, dužine smjene i redoslijeda članova. | `dezurstva.md` |
| **Eskalacija** | Automatsko obavještavanje mete iz pravila nakon prekoračenja SLA roka; bilježi se u tiketu. | `sla.md` |
| **Forma** | Skup polja koja korisnik popunjava pri prijavi; pripada usluzi i ima verzije. | `katalog-usluga-i-forme.md` |
| **Grupa** | Tim koji radi na tiketima; tiket dobija grupu preko pravila usmjeravanja ili grupe tipa opreme. | `korisnici-oj-i-grupe.md` |
| **Incident** | Neplanirani prekid usluge s tokom (Istražujemo → Uzrok utvrđen → Pratimo → Riješeno). | `status-incidenti-i-planirani-prekidi.md` |
| **Kalendar (SLA)** | Radno vrijeme po danima koje određuje kada SLA rok teče, a kada miruje. | `sla.md` |
| **Kategorija** | Grupa usluga u stablu (npr. „IT“ → „Oprema“). | `katalog-usluga-i-forme.md` |
| **MFA / TOTP** | Potvrda u dva koraka aplikacijom na telefonu (šestocifreni kod), uz jednokratne rezervne kodove. | `prijava-i-mfa.md` |
| **Neusmjereni red (UNROUTED)** | Tiketi za koje nema pravila usmjeravanja; prate ih administratori i dodjeljuju ručno. | `usmjeravanje-i-prioritet.md` |
| **Obavještenje (in-app)** | Zapis u zvonu aplikacije; kanali i tihi sati se podešavaju po korisniku. | `realtime-i-obavjestenja.md` |
| **Organizaciona jedinica (OJ)** | Čvor hijerarhije organizacije; koristi se za scope, vidljivost i rutiranje. | `korisnici-oj-i-grupe.md` |
| **Permisija** | Pojedinačna dozvola za akciju (npr. `ticket.merge`, `settings.write`); rola je nosi. | `uloge-i-permisije.md` |
| **Playbook** | Interni tok rješavanja s koracima koji se veže na tiket; korisnik ga ne vidi. | `sabloni-i-playbooks.md` |
| **Policy paket** | Paket konfiguracije koji odjednom dodjeljuje role i permisije, scoped na OJ ili servis. | `policy-paketi.md` |
| **Povjerljiv tiket** | Tiket s posebnom vidljivošću; SuperAdmin nema automatski pristup. | `tiketi.md` |
| **Prioritet** | Ozbiljnost tiketa; određuje se iz uticaja i hitnosti (matrica prioriteta). | `usmjeravanje-i-prioritet.md` |
| **Prenosnica** | Dokument o zaduženju/vraćanju opreme s brojem `MM-NNNN-GGGG`. | `imovina.md` |
| **Problem** | Skup tiketa s istim uzrokom; vodi ga upravitelj problema iz problem-grupe. | `problemi.md` |
| **Promjena** | Planirana izmjena IT okruženja koja prolazi procjenu, odobrenje (CAB), realizaciju i pregled. | `promjene.md` |
| **Read-only režim** | Zaključavanje modula za izmjene; SuperAdmin ga zaobilazi po postavci. | `uloge-i-permisije.md` |
| **Routing pravilo** | Par (origin OJ + usluga) → ciljna grupa; određuje ko dobija tiket. | `usmjeravanje-i-prioritet.md` |
| **Rola** | Skup dozvola (USER, AGENT, ADMIN, SUPER_ADMIN i paketske role). | `uloge-i-permisije.md` |
| **Scope** | Ograničenje dodjele na organizacionu jedinicu ili servis; permisija ne otključava podatke van scope-a. | `uloge-i-permisije.md` |
| **Servis** | Ono što korisnik bira pri prijavi tiketa; ima životni ciklus, dostupnost i formu. | `katalog-usluga-i-forme.md` |
| **SLA** | Rokovi za prvi odgovor i rješenje, s kalendarima, pravilima i eskalacijama. | `sla.md` |
| **Status tiketa** | Stanje u toku (npr. Nerutiran, Dodijeljen, U radu, Čeka korisnika, Riješeno, Zatvoreno). | `tiketi.md` |
| **Šablon odgovora** | Unaprijed napisan tekst odgovora s varijablama, lični ili zajednički. | `sabloni-i-playbooks.md` |
| **Zakazani prekid** | Najavljeni prekid (npr. održavanje) bez toka; ne umanjuje dostupnost i ne ulazi u historiju incidenata. | `status-incidenti-i-planirani-prekidi.md` |

## Česta pitanja i greške

- **„Pojam nije u rječniku.“** — Pretražite Dokumentaciju po tom pojmu; često je objašnjen u tabeli polja i
  statusa stranice modula.
- **„Koja je razlika između incidenta i zakazanog prekida?“** — Vidi red **Incident** i **Zakazani prekid**;
  detaljno poređenje je u `status-incidenti-i-planirani-prekidi.md`.
- **„Koja je razlika između problema i promjene?“** — **Problem** objašnjava uzrok više tiketa, a **promjena**
  je planirana izmjena okruženja; vidi `problemi.md` i `promjene.md`.
- **„Šta znači `private.…` u tekstu?“** — To je ključ postavke u **Admin → Postavke** (za administratore).

## Poznata ograničenja

- **Rječnik pokriva pojmove iz vodiča**, ne cijeli tehnički model; pojmovi koji se tiču samo interne
  implementacije (nazivi tabela, događaja) nisu ovdje.
- **Definicije su najkraće moguće** — potpuno pravilo je uvijek na stranici modula.
- **Rječnik se ne prevodi automatski**; nazivi dugmadi i ključevi postavki ostaju u izvornom obliku.

## Povezani moduli

- Pregled svih stranica: `pregled-modula.md`
- Česta pitanja i poruke grešaka: `cesta-pitanja.md`
- Uloge i dozvole: `uloge-i-dozvole.md`
