# Upitnik za službenika za zaštitu ličnih podataka (DPO)

**Sistem:** Service Desk (servisni centar za prijavu i rješavanje zahtjeva zaposlenih)
**Pravni okvir:** Zakon o zaštiti ličnih podataka BiH (Sl. glasnik BiH 12/25), primjena od 4.10.2025.
**Svrha dokumenta:** prije puštanja u produkciju DPO potvrđuje tekstove i rokove čuvanja. Sistem nudi
alate, a odluke donosi institucija. Dok DPO ne odgovori, sistem radi s bezbjednim zadanim
vrijednostima: ne briše poslovni sadržaj, a tekstovi su označeni kao **NACRT**.

Upute za popunjavanje: uz svako pitanje upišite odgovor u polje **Odluka DPO**. Kod rokova je dovoljan
broj dana ili „ne brisati“. Tehnički dio (§6) popunjava administrator.

---

## 1. Podaci o rukovaocu (prikazuju se korisnicima u obavještenju o obradi)

| # | Pitanje | Odluka DPO |
|---|---|---|
| 1.1 | Puni naziv rukovaoca (institucije) | |
| 1.2 | Adresa i opšti kontakt | |
| 1.3 | Ime i prezime DPO-a | |
| 1.4 | E-mail DPO-a (na njega korisnici šalju zahtjeve) | |
| 1.5 | **Svrha obrade** u help-desku. Prijedlog: *„Evidentiranje, usmjeravanje i rješavanje zahtjeva zaposlenih za IT i druge interne usluge, praćenje rokova (SLA) i izvještavanje o kvalitetu usluge.“* | ☐ prihvatam ☐ izmjena: |
| 1.6 | **Pravni osnov.** Prijedlog: *legitimni interes rukovaoca i izvršavanje obaveza iz radnog odnosa* (pozvati se na odgovarajući član zakona prema procjeni DPO-a). | ☐ prihvatam ☐ izmjena: |

## 2. Obavještenje o obradi (tekst za sve korisnike)

Sistem iz podataka iz §1 automatski sastavlja **nacrt obavještenja**. Nacrt sadrži prava iz čl. 17–24,
rok odgovora od 30 dana, kontakt DPO-a i pravo na prigovor Agenciji. Obavještenje je dostupno bez
prijave, preko linka na ekranu za prijavu. Dok ga DPO ne potvrdi, prikazuje se oznaka „NACRT“.

| # | Pitanje | Odluka DPO |
|---|---|---|
| 2.1 | Da li nacrt (dostavlja administrator kao PDF ili ispis) odgovara? | ☐ da ☐ izmjene u prilogu |
| 2.2 | Da li je potrebna i engleska verzija? | ☐ da ☐ ne |

## 3. Rokovi čuvanja (retencija)

Nakon isteka roka sistem **uklanja sadržaj**. Brojčana metrika ostaje (npr. „tiket zatvoren za 3 h“), bez
ličnih podataka. Brisanje se radi noću, prvo se pokreće probni prolaz koji ništa ne briše, a legal hold
ga blokira (§5). „Ne brisati“ znači da kategorija ostaje isključena.

| # | Kategorija | Šta se uklanja | Zadano sada | Minimum | Prijedlog | Odluka DPO |
|---|---|---|---|---|---|---|
| 3.1 | Prilozi zatvorenih tiketa | fajl i zapis o prilogu; u poruci ostaje „prilog uklonjen“ | ne briše se | 90 d | 1095 d (3 god.) | |
| 3.2 | Sadržaj zatvorenih tiketa | tekst opisa i poruka; tiket i metrika ostaju | ne briše se | 180 d | 1825 d (5 god.) | |
| 3.3 | Revizijski zapis (audit) | stari zapisi, uz kontrolnu tačku lanca integriteta | ne briše se | 365 d | 3650 d (10 god.) | |
| 3.4 | Završene sesije (IP adresa, preglednik) | cijeli zapis | **90 d** | 30 d | 90 d | |
| 3.5 | Evidencija isporuke e-maila (adresa primaoca) | cijeli zapis | **180 d** | 30 d | 180 d | |
| 3.6 | Zatvoreni zahtjevi nosilaca podataka | zapis zahtjeva | **1825 d** | 365 d | 1825 d | |

Napomene za DPO:
- Rokovi 3.1–3.3 zavise od internih pravila o arhivskoj građi i o rokovima zastare. Molimo da ih
  uskladite s tim pravilima.
- Stara postavka od 365 dana (iz prethodne verzije sistema) **nije prenesena** i ništa se ne briše
  automatski dok ne odlučite.

## 4. Anonimizacija i izvoz podataka

| # | Pitanje | Zadano | Odluka DPO |
|---|---|---|---|
| 4.1 | Nakon koliko dana od deaktivacije se korisnik predlaže za anonimizaciju? (30–3650) Anonimizacija je uvijek ručna radnja SUPER_ADMIN-a. | 180 d | |
| 4.2 | Da li anonimizacija traži odobrenje **drugog** SUPER_ADMIN-a („četiri oka“)? | ne | ☐ da ☐ ne |
| 4.3 | Pri anonimizaciji: da li zadano brisati i priloge koje je osoba sama postavila? Priloge često dijele i drugi učesnici tiketa. | ne (zadržavaju se) | ☐ brisati ☐ zadržati |
| 4.4 | Izvoz podataka (pravo na pristup i prenosivost): da li zadano uključiti priloge osobe? | da | ☐ da ☐ ne |
| 4.5 | Koliko dana je gotov izvoz dostupan za preuzimanje prije automatskog brisanja? (1–30) | 7 d | |
| 4.6 | Podsjetnik o roku za zahtjev nosioca podataka: koliko dana prije isteka roka? (npr. 7 i 1) | 7, 1 | |

## 5. Ostala pitanja

| # | Pitanje | Odluka DPO |
|---|---|---|
| 5.1 | **Tekst uz odbijanje zahtjeva** (pravo na prigovor Agenciji u roku od 30 dana, čl. 14 st. 4). Prijedlog: *„Protiv ove odluke možete podnijeti prigovor Agenciji za zaštitu ličnih podataka u BiH u roku od 30 dana od prijema.“* | ☐ prihvatam ☐ izmjena: |
| 5.2 | Ko smije staviti **legal hold** (zabrana brisanja zbog spora ili istrage)? Trenutno: ADMIN i SUPER_ADMIN. | ☐ ostaje ☐ izmjena: |
| 5.3 | Ko u instituciji preuzima izvoz i predaje ga nosiocu podataka? (DPO ili administrator) | |
| 5.4 | Postoji li procedura za prijavu povrede podataka Agenciji u roku od 72 h (čl. 35)? Sistem daje audit i logove, a procedura je organizaciona. | ☐ postoji ☐ treba je izraditi |

---

## 6. Za administratora: primjena odgovora

Svaki odgovor se upisuje kao postavka, prvo s `--dry-run`. Ključevi:

| Pitanje | Ključ | Tip |
|---|---|---|
| 1.1–1.4 | `private.privacy.controller.name`, `.address`, `.dpoName`, `.dpoEmail` | tekst |
| 1.5, 1.6 | `private.privacy.controller.purpose`, `.legalBasis` | tekst |
| 2 | `private.privacy.notice.bs`, `private.privacy.notice.en` | Markdown; prazno = automatski nacrt |
| 3.1–3.6 | `private.privacy.retention.attachmentsDays`, `ticketContentDays`, `auditDays`, `sessionDays`, `emailDeliveryDays`, `requestRegisterDays` | broj dana; `0` = ne brisati |
| 4.1 | `private.privacy.anonymization.candidateAfterDays` | broj |
| 4.2 | `private.privacy.anonymization.requireSecondApprover` | da/ne |
| 4.3 | `private.privacy.anonymization.deleteOwnAttachmentsDefault` | da/ne |
| 4.4 | `private.privacy.export.includeAttachmentsDefault` | da/ne |
| 4.5 | `private.privacy.export.linkValidDays` | broj |
| 4.6 | `private.privacy.requests.reminderDaysCsv` | npr. `7,1` |
| 5.1 | `private.privacy.requests.rejectionNotice.bs`, `.en` | tekst |

Redoslijed kod uključivanja retencije (3.1–3.3), prema `ops/runbook/privatnost.md`:

1. upisati rok;
2. u **Privatnost → Retencija** pokrenuti probni prolaz za tu kategoriju i pregledati broj zapisa;
3. tek tada pustiti noćni prolaz.

Prije produkcije u sef spremiti `PRIVACY_TOMBSTONE_KEY` i `PRIVACY_EXPORT_KEY` (svaki najmanje 16
znakova).
