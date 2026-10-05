---
title: Šta je novo
slug: sta-je-novo
module: —
part: referenca
audience: [Svi korisnici, Agent, Administrator]
roles: []
order: 40
tags: [novo, promjene, izdanja, changelog]
---

# Šta je novo

## Čemu služi ovaj modul

Kratak spisak izmjena u **dokumentaciji i ponašanju aplikacije** koje korisnik osjeti. Tehnički zapis svih
izmjena (uključujući one koje se tiču samo koda) je u `DOCS_CHANGELOG.md` u repozitoriju.

## Kome je namijenjen

**Svim korisnicima** — da vide šta se promijenilo od zadnjeg čitanja vodiča. Administratorima i operativi
koristi kao podsjetnik na izmjene koje traže akciju (npr. pokretanje alata na starijoj instalaciji).

## Kako doći

- **Dokumentacija → Referenca → Šta je novo.**
- **Izvor:** `DOCS_CHANGELOG.md` (repozitorij), gdje je svaka izmjena zapisana s datumom i razlogom.

## Korak po korak

1. Pogledajte najnoviji datum u tabeli ispod.
2. Ako se izmjena tiče vašeg rada, otvorite link na stranicu modula.
3. Ako se tiče administracije (npr. pokretanje alata), proslijedite je administratoru.

## Polja, validacije i statusi

| Datum | Šta se promijenilo | Za koga | Detalji |
|---|---|---|---|
| 2026-10-04 | **Zajednički limiti umjesto po-procesnih (Val 3).** Ograničenje masovnog broadcasta i testnog slanja e-maila sada se drži u Redisu, pa vrijedi za sve instance i ne resetuje se restartom. | Agent, Administrator | `tiketi.md`, `posta.md` |
| 2026-10-04 | **Obavijesti e-mailom pouzdanije (Val 3).** Zaglavljena isporuka se preuzima ponovo (pločica **Operativno zdravlje** prikazuje broj takvih zapisa), SMTP veza se dijeli umjesto da se otvara po e-mailu, a oznake polja u obavijesti prate jezik pošiljaoca/primaoca. | Svi, Administrator, Operativa | `posta.md` |
| 2026-10-04 | **Realtime, šabloni i baza znanja (Val 3).** Članstvo u grupnim sobama i admin rola provjeravaju se ponovo tokom veze, ulazak u sobu tiketa je ograničen na 30 poruka u minuti, ponuda šablona filtrira opseg u upitu, a lista baze znanja i presretanje rade u jednom prolazu. | Agent, Administrator | `realtime-i-obavjestenja.md`, `sabloni-i-playbooks.md`, `baza-znanja.md` |
| 2026-10-04 | **Val 2 — sigurnost i vidljivost (deset nalaza).** Provjera šablona pri slanju, zamjena ličnih podataka i pri upisu članka, redakcija broadcasta, nacrti usluga samo adminima, jedan izvor retencije priloga, obavještenje o odobrenju i kapija za `UNROUTED`, eskalacije s primaocem, satovi od `createdAt` i prvi odgovor nezavisan od SLA-a. | Svi, Administrator | `sabloni-i-playbooks.md`, `odobrenja-i-csat.md`, `sla.md`, `tiketi.md`, `posta.md`, `baza-znanja.md`, `katalog-usluga-i-forme.md` |
| 2026-10-03 | **Default permisije se upisuju pri instalaciji.** Svježa instalacija više ne daje ADMIN/AGENT naloge bez permisija; za starije instalacije postoji alat koji to dopuni. | Administrator, Operativa | `instalacija.md`, `uloge-i-permisije.md` |
| 2026-10-03 | **Poravnati vodiči `instalacija.md` i `prijava-i-mfa.md`** na istu strukturu kao ostali (dodate sekcije „Čemu služi“, „Kome je namijenjen“, „Kako doći“, „Polja, validacije i statusi“, „Česta pitanja i greške“, „Povezani moduli“). | Svi | `instalacija.md`, `prijava-i-mfa.md` |
| 2026-10-03 | **Nova stranica „Dokumentacija“ u aplikaciji** (u izradi): pregled, pretraga i navigacija kroz ove vodiče. | Svi | `pocetak-rad.md`, `pregled-modula.md` |
| 2026-10-03 | **Završena Faza 2 dokumentacije:** vodiči za 15 modula (M1–M15) i tehničke teze. | Svi | `pregled-modula.md` |

**Napomena:** tabela prikazuje samo izmjene koje korisnik osjeti; izmjene koje se tiču isključivo interne
implementacije nisu ovdje (vidi `DOCS_CHANGELOG.md`).

## Česta pitanja i greške

- **„Zašto se ponašanje promijenilo, a nema zapisa?“** — Provjerite datum u tabeli i `DOCS_CHANGELOG.md`;
  ako izmjena nije zapisana, prijavite to kao grešku u dokumentaciji.
- **„Gdje je zapis za starije verzije?“** — U `DOCS_CHANGELOG.md`, po modulima (M1–M15); ovdje su samo
  najnovije izmjene.
- **„Da li se vodiči automatski prevode?“** — Ne; sadržaj je na bosanskom, a nazivi dugmadi i ključevi
  postavki ostaju u izvornom obliku.

## Poznata ograničenja

- **Ova stranica se ne ažurira automatski** — izmjene se u nju dodaju kad se mijenja i `DOCS_CHANGELOG.md`
  (pravilo: izmjena funkcionalnosti povlači izmjenu dokumentacije u istom commitu).
- **Ne prikazuje izmjene iz `docs/plans/**`** — planovi i dizajn dokumenti nisu korisnička dokumentacija.
- **Nema filtera po datumu ili modulu** u prvoj verziji; koristite pretragu Dokumentacije.

## Povezani moduli

- Pregled svih stranica: `pregled-modula.md`
- Rječnik pojmova: `rjecnik.md`
- Česta pitanja: `cesta-pitanja.md`
