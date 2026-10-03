---
title: Uloge i permisije (RBAC)
slug: uloge-i-permisije
module: M4
part: administrator
audience: [Administrator, SUPER_ADMIN]
roles: [ADMIN, SUPER_ADMIN]
order: 50
tags: [rbac, uloge, permisije, scope, read-only, preview]
---
# Uloge i permisije (RBAC)

> **Namjena:** stranica objašnjava kako sistem odlučuje šta korisnik smije: koje role postoje, šta su
> permisije, kako se mijenja mapping rola → permisije i šta radi **read-only režim**. Ekran **Permisije**
> dostupan je samo **SUPER_ADMIN** nalogu.

## Čemu služi ovaj modul

Sistem ima dva sloja dozvola:

1. **Rolu** (USER, AGENT, ADMIN, SUPER_ADMIN i paketske role kao `ASSET_MANAGER`, `PROBLEM_MANAGER`,
   `CHANGE_MANAGER`) — ona daje osnovni pristup ekranima i meniju.
2. **Permisiju** — pojedinačnu dozvolu za akciju (npr. `group.manage`, `settings.write`, `routing.write`,
   `ticket.merge`, `audit.export`). U sistemu postoji **63** permisije, a ekran Permisije ih prikazuje
   grupisane po kategorijama (Tiketi, Servisi, Usmjeravanje, Grupe, SLA, Postavke, Integracije, Audit,
   Izvještaji, Nadzor, Povjerljivo, Baza znanja, Edge, Privatnost, Imovina).

Osim role i permisije, svaka dodjela može imati **OU scope** (organizacionu jedinicu) i **service scope**
(servis). Pravilo: *permisija ne otključava podatke van svog scope-a*.

## Kome je namijenjen

- **SUPER_ADMIN** — jedini može otvoriti ekran **Permisije** i mijenjati mapping rola → permisije.
- **ADMIN** — koristi role i permisije koje mu je SuperAdmin dodijelio; ne može ih mijenjati.
- **Svi korisnici** — preko sesije (`/auth/session`) aplikacija dobija listu svojih rola i permisija i po tome
  prikazuje ili skriva dugmad; server uvijek provjerava ponovo.

## Kako doći

1. Prijavite se kao **SUPER_ADMIN**.
2. Otvorite **Administracija** (`/admin`) → tab **Permisije**
   (direktna putanja `/permissions`).
3. Ako niste SuperAdmin, prikazuje se poruka *„Samo SuperAdmin može uređivati permisije uloga.“*

## Korak po korak

### Promjena permisija jedne role

1. Na ekranu **Permisije uloga** izaberite rolu u padajućoj listi **Odaberi ulogu** (uz naziv role piše i broj
   permisija koje trenutno ima).
2. U katalogu **Permisije po ulozi** uključite/isključite permisije; katalog je grupisan po kategorijama.
3. Kliknite **Pregled uticaja**. Prikazuje se **Pregled uticaja** s brojem pogođenih korisnika, koliko je
   permisija dodano/uklonjeno i uzorkom korisnika s promjenom odluke (`prije → poslije`).
4. Ako je pregled očekivan, kliknite **Potvrdi i sačuvaj**; dugme **Odustani** zatvara pregled bez izmjene.
5. Promjena važi za **sve korisnike s tom rolom** i keš dozvola im se invalidira odmah; svaka promjena ulazi u
   audit log s listom dodanih/uklonjenih permisija (diff).

**Važno:** ako želite da promjena važi samo za jednu OU ili servis, to se ne radi ovdje — radi se kroz
**dodjelu role korisniku** s OU/service scope-om (Administracija → tab **Korisnici** → **Dodijeli rolu**).

### Dodjela role s OU/service scope-om

1. Tab **Korisnici** → **Upravljaj ulogama** kod korisnika.
2. Izaberite **Odaberi ulogu**, **Scope organizacione jedinice** (ili **Bilo koja OJ**) i **Scope servisa**
   (ili **Bilo koji servis**).
3. **Dodijeli rolu**. Ako dodjela nema OU scope, prikazuje se upozorenje da ta dodjela neće dati pristup
   nijednom tiketu po OJ. Ako korisnik nije član nijedne grupe koja pokriva tu OJ, prikazuje se upozorenje s
   linkom na ekran **Grupe**.
4. Ulogu možete ukloniti dugmetom **Ukloni**; **SUPER_ADMIN** rolu može dodijeliti samo SuperAdmin.

### Read-only režim

- SuperAdmin može u postavkama uključiti read-only režim za module **admin**, **settings**, **routing**,
  **service_catalog**, **service_forms** i **sla**. Dok je režim aktivan, sve **izmene** (POST/PUT/PATCH/DELETE)
  na tim rutama se odbijaju uz grešku `READ_ONLY_MODE`, a čitanje i dalje radi.
- Izuzetak su akcije koje su po prirodi čitanje, iako koriste POST: **Probni prolaz** direktorija
  (`/directory-sync/read`) i validacija policy paketa (`/policy-packs/validate`).
- Role navedene u postavci `private.readOnlyMode.bypassRoles` (po defaultu **SUPER_ADMIN**) mogu i dalje
  mijenjati podatke.

## Polja, validacije i statusi

| Polje / radnja | Validacija / pravilo | Poruka ili efekat |
|---|---|---|
| Izbor role | mora postojati | bez odabrane role **Pregled uticaja** ne radi |
| Permisije | moraju biti poznati ključevi iz kataloga | nepoznat ključ → odbijeno (`INVALID_PERMISSION_KEY`, 404) |
| Pregled uticaja | prikazuje broj korisnika, dodano/uklonjeno i do 3 uzorka | „Nema uzoraka promjene odluke za pogođene korisnike.“ |
| Potvrda | dugme postoji samo u pregledu | **Potvrdi i sačuvaj** / **Odustani** |
| SuperAdmin pristup | `isSuperAdmin` ili rola SUPER_ADMIN | „Potreban SuperAdmin pristup“, 403 na API-ju |
| SuperAdmin bypass | vrijedi samo za **lokalni** (break-glass) nalog | nelokalni nosilac SUPER_ADMIN role je odbijen (`SUPER_ADMIN_NOT_LOCAL_ONLY`) |
| Scoped dodjela | ne zadovoljava provjeru bez OU scope-a | izuzetak je samo `oncall.read` |
| Read-only režim | aktivni modul + mutirajuća metoda | `403 READ_ONLY_MODE` |

## Česta pitanja i greške

- **„Zašto ADMIN ne vidi neku akciju iako ima rolu ADMIN?“** — Role i permisije su odvojeni. Rola otvara meni,
  a akcije traže permisiju. Provjerite u **Permisije** šta rola stvarno ima; meni se prilagođava sesiji.
- **„Nakon instalacije ADMIN ne može otvoriti Grupe/Postavke.“** — Na svježoj instalaciji role dobijaju svoje
  default permisije odmah (korak 4, *Početni podaci*). Ako je instalacija starija, default mapping nije bio
  upisan: pokrenite seed (`npm run cli:seed-role-permissions --dry-run`, pa bez `--dry-run`) ili neka
  SuperAdmin sačuva permisije na ekranu **Permisije**. Vidi *Poznata ograničenja*.
- **„Uklonio sam permisiju roli, a poslije je opet tu.“** — Seed default mappinga je **aditivan**: nikad ne
  briše, ali vraća ono što nedostaje. Ako permisija ne treba da se vrati, ne pokrećite seed (prvo `--dry-run`
  ispiše šta bi bilo dodato).
- **„Ne mogu sačuvati permisije.“** — Dugme **Potvrdi i sačuvaj** postoji samo nakon **Pregled uticaja**; prvo
  pokrenite pregled.
- **„Promjena nije vidljiva odmah.“** — Za nove zahtjeve je vidljiva odmah (keš nosioca role se invalidira);
  korisnik možda treba osvježiti stranicu da ponovo učita sesiju.
- **„SuperAdmin ne može da se prijavi posle promjene.“** — Provjerite da je SuperAdmin nalog **lokalan**
  (bez AD/Entra veze); nelokalni SuperAdmin se odbija namjerno.
- **„Zašto je akcija odbijena sa READ_ONLY_MODE?“** — Uključen je read-only režim za taj modul; isključite ga u
  postavkama ili se obratite SuperAdminu koji ima bypass.

## Poznata ograničenja

- **Default mapping se upisuje pri instalaciji, ali je aditivan.** Od vala 0 (2026-10-03) korak 4 upisuje
  sistemske role s default permisijama (USER 4, AGENT 22, ADMIN 58, SUPER_ADMIN 63, ASSET_MANAGER 6,
  PROBLEM_MANAGER 4, CHANGE_MANAGER 4). Postupak **nikad ne briše**, pa ponovno pokretanje seeda (instalacija
  ili CLI na starijim instalacijama) može vratiti permisiju koju je administrator svjesno uklonio — zato prvo
  `--dry-run`. (Bivši nalaz B1 iz `REVIEW_ANALIZA.md` §M4.)
- **Preview uticaja nije obavezan na serveru** — UI ne dopušta čuvanje bez pregleda, ali API to ne provjerava.
  (Nalaz B2.)
- **Razlog promjene se ne pamti**; u audit logu je samo diff dodanih/uklonjenih permisija. (Nalaz B2.)
- **`@RequirePermissions` s više ključeva znači „bilo koja“**, ne „sve“ — trenutno se koristi samo na izvozu
  izvještaja. (Nalaz B3.)
- **`group.manage` se provjerava bez OU scope-a**, pa OU-scoped ADMIN ne može upravljati grupama, a nescoped
  dodjela dozvoljava grupe u svim OJ. (Nalaz B4.)
- **SuperAdmin bypass se ne bilježi u audit logu.** (Nalaz B5.)

## Povezani moduli

- **Korisnici, organizacione jedinice i grupe** (`korisnici-oj-i-grupe.md`) — dodjela rola korisnicima i
  scope.
- **Prijava i MFA** (`prijava-i-mfa.md`) — break-glass priroda lokalnog SuperAdmin naloga.
- Administracija → **Postavke** (`private.readOnlyMode.*`, `private.auth.roleSource`) i **Ops** → audit log.

---

*Ažurirano: 2026-10-03 · Modul: RBAC (M4)*
