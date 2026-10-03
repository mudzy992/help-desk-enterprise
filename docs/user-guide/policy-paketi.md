# Policy paketi (paketi politika)

> **Namjena:** paket politika je pripremljena kombinacija rola i permisija koja se jednim klikom dodjeljuje
> organizacionoj jedinici (i opciono servisu). U aplikaciji se prikazuje samo **SUPER_ADMIN** nalogu, na vrhu
> taba **Korisnici i uloge** unutar ekrana **Administracija**.

## Čemu služi ovaj modul

- Standardizuje pristup između službi: umjesto ručnog dodjeljivanja desetina permisija po korisniku, primijenite
  paket i on **kreira role, permisije i dodjele** za izabrane korisnike.
- Paket se **veže na organizacionu jedinicu** (i opciono na servis) preko `policyPackId`, a dodjele korisnika
  dobijaju OU (i servis) scope iz definicije paketa.
- Postoje tri ugrađena paketa:

| Paket | Ključ | Šta dodjeljuje |
|---|---|---|
| **IT Standard** | `PACK_IT_STANDARD` | Rola **ADMIN** i **AGENT** s punim standardnim permisijama, scoped na ciljnu OJ; klasifikacija `INTERNAL`, bez odobrenja |
| **HR Restricted** | `PACK_HR_RESTRICTED` | Rola **AGENT** s upload/download privitaka, scoped na ciljnu OJ **i** servis; klasifikacija `RESTRICTED`, uz odobrenje |
| **Finance Restricted** | `PACK_FINANCE_RESTRICTED` | Rola **ADMIN** (`audit.export`, `routing.write`, `sla.write`) i **AGENT** (privitci + `ticket.merge`), scoped na OJ i servis; klasifikacija `CONFIDENTIAL`, uz odobrenje |

## Kome je namijenjen

- **SUPER_ADMIN** — jedini vidi panel u aplikaciji. (API trenutno dozvoljava i rolu ADMIN uz permisiju
  `settings.write`; vidi *Poznata ograničenja*.)
- **ADMIN i AGENT** — ne primjenjuju pakete, ali osjete njihov efekat kroz dodijeljene role i permisije.

## Kako doći

1. Prijavite se kao **SUPER_ADMIN**.
2. Otvorite **Administracija** → tab **Korisnici i uloge**.
3. Na vrhu taba je panel **Paketi politika** (kartice paketa i sklopiva sekcija **Primijeni paket na OJ / servis**),
   iznad kartice sa listom korisnika. Ako niste SuperAdmin, panel se ne prikazuje.

## Korak po korak

### Pregled paketa

1. Kartice prikazuju naziv paketa, broj dozvola (`{{count}} dozvola`) i red po roli: `{{role}} → {{count}}
   dozvola`.
2. Kod svake dodjele stoji i oznaka scope-a (**— dodjela** ako paket ne veže dodjelu za cilj).

### Primjena paketa

1. Otvorite **Primijeni paket na OJ / servis**.
2. Izaberite **Paket politika** (obavezno).
3. Izaberite **Organizaciona jedinica** (obavezno u ovoj verziji).
4. Opciono izaberite **Servis** (opcija **Bez servisa** znači da se dodjele vezuju samo za OJ).
5. Kliknite **Primijeni paket**. Nakon primjene prikazuje se rezultat:
   *„Kreirano uloga: {{roles}}, permisija: {{permissions}}.“*
6. Ponovna primjena istog paketa na istu OJ/servis **ne pravi duplikate**: postojeće dodjele se prebroje kao
   postojeće.

### Šta se tačno mijenja

- **Role i permisije**: paket osigurava da rola postoji i da ima tražene permisije (upis u `RolePermission`).
- **Dodjele korisnika**: paket **ne** dodjeljuje role automatski svim korisnicima OJ — dodjele se kreiraju za
  korisnike koje prosledite uz zahtjev (u UI formi ove verzije polje za korisnike nije izloženo, pa primjena
  kroz UI ažurira role, permisije i vezu paket ↔ OJ/servis).
- **Veza paketa**: OU dobija `policyPackId`, servis isto ako je izabran.
- **Audit**: svaka primjena se bilježi (`policy_pack.apply`) s akterom, ključem paketa, OU-om i brojevima
  kreiranih zapisa.

## Polja, validacije i statusi

| Polje / radnja | Validacija / pravilo | Poruka ili efekat |
|---|---|---|
| Paket politika | mora postojati u registru | `UNKNOWN_POLICY_PACK` („Policy pack was not found“) |
| Organizaciona jedinica | mora postojati i imati `ouPath`; obavezna u UI-u i DTO-u | `UNKNOWN_ORGANIZATIONAL_UNIT` / `MISSING_ORGANIZATIONAL_UNIT` |
| Servis | ako je zadat, mora postojati | `UNKNOWN_SERVICE` / `MISSING_SERVICE` (kad paket traži servis) |
| Korisnici | ako su zadati, svi moraju postojati i biti jedinstveni | `UNKNOWN_USER` |
| Definicija paketa | ne smije dodijeliti **SUPER_ADMIN** | „Policy packs must not grant SuperAdmin“ |
| Permisija u paketu | mora postojati u katalogu i biti dozvoljena za tu rolu | `UNKNOWN_PERMISSION` / `PERMISSION_NOT_ALLOWED_FOR_ROLE` |
| Greška u modulu koji je u read-only režimu | — | `READ_ONLY_MODE` (403) |

## Česta pitanja i greške

- **„Ne vidim panel Paketi politika.“** — Panel je vidljiv samo SUPER_ADMIN nalogu.
- **„Primjena je vratila grešku `UNKNOWN_ORGANIZATIONAL_UNIT`.“** — OJ je obrisana ili ID nije iz stabla; osvježite
  listu i pokušajte ponovo.
- **„Zašto moram izabrati OJ kad paket treba samo servis?“** — U trenutnoj verziji OJ je obavezna; dodjela samo
  na servis nije moguća kroz UI (poznato ograničenje).
- **„Kako da poništim primijenjeni paket?“** — Povlačenje ne postoji. Dodjele treba ručno ukloniti na ekranu
  **Korisnici** (**Upravljaj ulogama** → **Ukloni**), a permisije role promijeniti na ekranu **Permisije**;
  veza `policyPackId` ostaje na OJ/servisu.
- **„Da li paket mijenja SLA ili obavezna polja?“** — Ne. U ovoj verziji paket nosi role i permisije te vezu na
  OJ/servis; polja klasifikacije i odobrenja postoje u zapisu paketa, ali ih tokovi tiketa/SLA još ne koriste.
- **„Da li se primjena može poništiti iz audita?“** — Ne; audit pamti da je paket primijenjen, ne omogućava
  povratak.

## Poznata ograničenja

- **Paket nosi samo permisije i role**, iako je u zadatku zamišljen kao bundle (SLA profil, obavezna polja,
  klasifikacija, odobrenja). Polja `defaultClassification` i `requiresApproval` se samo zapisuju, a
  `slaProfileId` se ne postavlja. (Nalaz B1 iz `REVIEW_ANALIZA.md` §M5.)
- **Postavke `private.policyPacks.*` ne postoje**; paketi su definisani u kodu i ne mogu se isključiti ni
  dodavati bez izmjene koda. (Nalaz B2.)
- **Dodjela samo na servis nije moguća** — OJ je obavezna u formi i na API-ju. (Nalaz B3.)
- **UI kaže „Samo SuperAdmin“**, ali API dozvoljava ADMIN-u s permisijom `settings.write`. (Nalaz B4.)
- **Nema povlačenja paketa** (`unapply`). (Nalaz B5.)
- **`apply` ne zahtijeva prethodnu validaciju**; `validate` postoji i vraća plan dodjela, ali primjena ga ne
  traži. (Nalaz B6.)

## Povezani moduli

- **Uloge i permisije** (`uloge-i-permisije.md`) — šta paket dodjeljuje i kako se poslije mijenja.
- **Korisnici, organizacione jedinice i grupe** (`korisnici-oj-i-grupe.md`) — tab na kojem se panel nalazi.
- **Postavke** — read-only režim može blokirati primjenu paketa.

---

*Ažurirano: 2026-10-03 · Modul: Policy paketi (M5)*
