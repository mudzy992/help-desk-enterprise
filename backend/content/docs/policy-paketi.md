# Policy paketi (paketi politika)

> **Namjena:** paket politika je pripremljena kombinacija rola i permisija koja se jednim klikom dodjeljuje
> organizacionoj jedinici, servisu ili oboje — šta je paketu potrebno određuju njegove dodjele. U aplikaciji se
> prikazuje samo **SUPER_ADMIN** nalogu, na vrhu taba **Korisnici i uloge** unutar ekrana **Administracija**.

## Čemu služi ovaj modul

- Standardizuje pristup između službi: umjesto ručnog dodjeljivanja desetina permisija po korisniku, primijenite
  paket i on **kreira role, permisije i dodjele** za izabrane korisnike.
- Paket se **veže na organizacionu jedinicu, na servis ili na oboje** preko `policyPackId`, a dodjele korisnika
  dobijaju tačno one scope-ove koje nosi definicija paketa: **IT Standard** traži samo OJ, a **HR Restricted** i
  **Finance Restricted** traže i servis (bez servisa vraćaju `MISSING_SERVICE`, bez OJ `MISSING_ORGANIZATIONAL_UNIT`).
- Postoje tri ugrađena paketa:

| Paket | Ključ | Šta dodjeljuje |
|---|---|---|
| **IT Standard** | `PACK_IT_STANDARD` | Rola **ADMIN** i **AGENT** s punim standardnim permisijama, scoped na ciljnu OJ; klasifikacija `INTERNAL`, bez odobrenja, SLA profil `STANDARD_REQUEST` |
| **HR Restricted** | `PACK_HR_RESTRICTED` | Rola **AGENT** s upload/download privitaka, scoped na ciljnu OJ **i** servis; klasifikacija `RESTRICTED`, uz odobrenje, SLA profil `HR` |
| **Finance Restricted** | `PACK_FINANCE_RESTRICTED` | Rola **ADMIN** (`audit.export`, `routing.write`, `sla.write`) i **AGENT** (privitci + `ticket.merge`), scoped na OJ i servis; klasifikacija `CONFIDENTIAL`, uz odobrenje, SLA profil `FINANCE` |

Kad je cilj **servis**, paket na njega upisuje i dio koji se ne vidi u dodjelama: **klasifikaciju**,
**obaveznost odobrenja** i **SLA profil**. Klasifikacija i odobrenje se prepisuju uvijek; SLA samo ako
instalacija ima profil s tim ključem (čarobnjak za instalaciju ubacuje `INCIDENT`, `ACCESS`, `STANDARD_REQUEST`,
`FINANCE` i `HR`) — ako ga nema, plan to kaže (*„profil … ne postoji u ovoj instalaciji“*), a servis zadržava
postojeći profil. Organizaciona jedinica tih polja nema, pa paket primijenjen samo na OJ ne dira nijedan servis.

## Isključivanje paketa postavkom

- Postavka **`private.policyPacks.disabledKeysCsv`** (kategorija **Services**, tip `string`, prazna po defaultu)
  prima spisak ključeva paketa odvojenih zarezom, npr. `PACK_HR_RESTRICTED,PACK_FINANCE_RESTRICTED`. Velika/mala
  slova i razmaci se ignorišu.
- Isključen paket se **ne može provjeriti ni primijeniti** — `validate` i `apply` vraćaju
  `PACK_DISABLED` (400, *„This policy pack is switched off in settings …“*), a u izboru paketa stoji oznaka
  **isključen u postavkama**.
- **Povlačenje isključenog paketa i dalje radi** — inače se paket isključen poslije primjene ne bi mogao
  očistiti.
- Paketi se time ne dodaju ni ne mijenjaju: definicije su i dalje u kodu (`policy-pack.registry.ts`).

## Kome je namijenjen

- **SUPER_ADMIN** — jedini vidi panel u aplikaciji i jedini smije zvati `POST /policy-packs/validate` i
  `POST /policy-packs/apply` (uz permisiju `settings.write`). Rola ADMIN dobija 403.
- **ADMIN i AGENT** — ne primjenjuju pakete, ali osjete njihov efekat kroz dodijeljene role i permisije.

## Kako doći

1. Prijavite se kao **SUPER_ADMIN**.
2. Otvorite **Administracija** → tab **Korisnici i uloge**.
3. Na vrhu taba je panel **Paketi politika** (kartice paketa i sklopiva sekcija **Primijeni paket na OJ i/ili
   servis**), iznad kartice sa listom korisnika. Ako niste SuperAdmin, panel se ne prikazuje.

## Korak po korak

### Pregled paketa

1. Kartice prikazuju naziv paketa, broj dozvola (`{{count}} dozvola`) i red po roli: `{{role}} → {{count}}
   dozvola`.
2. Kod svake dodjele stoji i oznaka scope-a (**— dodjela** ako paket ne veže dodjelu za cilj).

### Primjena paketa

1. Otvorite **Primijeni paket na OJ i/ili servis**.
2. Izaberite **Paket politika** (obavezno).
3. Izaberite **Organizacionu jedinicu**, **Servis** ili oboje — obavezan je **najmanje jedan** cilj
   (**Bez organizacione jedinice** i **Bez servisa** znače da taj dio scope-a nije izabran). Paket zatim sam
   kaže šta mu nedostaje.
4. Kliknite **Provjeri**. Server vraća plan i prikazuje ga iznad dugmadi (**Plan primjene**: broj korisnika,
   broj dodjela, red po roli te, kad je izabran servis, red **Servis:** s klasifikacijom, odobrenjem i SLA
   profilom). Svaka promjena paketa ili cilja briše plan.
5. Kliknite **Primijeni paket** — dugme je aktivno samo dok plan postoji. Nakon primjene prikazuje se rezultat:
   *„Kreirano uloga: {{roles}}, permisija: {{permissions}}.“*
6. Ponovna primjena istog paketa na istu OJ/servis **ne pravi duplikate**: postojeće dodjele se prebroje kao
   postojeće.

### Povlačenje paketa

1. Izaberite isti paket i isti cilj kao kod primjene, pa kliknite **Provjeri** (plan je isti kao za primjenu).
2. Kliknite **Povuci paket**. Rezultat ispisuje šta je uklonjeno:
   *„Uklonjeno dodjela: {{roles}} · veza OJ: {{unit}} · veza servis: {{service}}“*.
3. Povlačenje uklanja:
   - dodjele (**UserRole**) koje je plan predvidio za taj paket i taj cilj — po korisniku, roli, OJ-u i servisu;
   - vezu `policyPackId` na izabranoj OJ/servisu, **ali samo ako ta veza pokazuje na ovaj paket**. Ako je u
     međuvremenu vezan drugi paket, veza ostaje netaknuta (u rezultatu `nije bila vezana`).
4. Povlačenje **ne uklanja** role ni njihove permisije — to su globalni zapisi koje mogu koristiti drugi ciljevi
   istog ili drugog paketa; uklanjanje bi tiho promijenilo prava nepovezanim korisnicima. Zato se role i
   permisije, ako ih više ništa ne koristi, uklanjaju ručno na ekranu **Permisije**.
5. Povlačenje **ne vraća** ni klasifikaciju, odobrenje i SLA profil servisa na prethodne vrijednosti — te
   vrijednosti su od primjene dio konfiguracije servisa. Stare vrijednosti ostaju zapisane u auditu
   (`policy_pack.apply`, polja `servicePolicyBefore` / `servicePolicyAfter`), pa se po njima mogu ručno vratiti
   na ekranu **Servisi**.

### Šta se tačno mijenja

- **Role i permisije**: paket osigurava da rola postoji i da ima tražene permisije (upis u `RolePermission`).
- **Dodjele korisnika**: paket **ne** dodjeljuje role automatski svim korisnicima OJ — dodjele se kreiraju za
  korisnike koje prosledite uz zahtjev (u UI formi ove verzije polje za korisnike nije izloženo, pa primjena
  kroz UI ažurira role, permisije i vezu paket ↔ OJ/servis).
- **Veza paketa**: OU dobija `policyPackId` ako je izabrana, servis isto ako je izabran — dodjela samo na
  servis je dozvoljena, a dodjela bez ijednog cilja se odbija.
- **Servisna politika (bundle)**: kad je izabran servis, upisuju se klasifikacija i odobrenje iz paketa te se
  veže SLA profil paketa (ako postoji u instalaciji).
- **Audit**: svaka primjena se bilježi (`policy_pack.apply`), a svako povlačenje (`policy_pack.unapply`) — oba
  s akterom, ključem paketa, OU-om i brojevima kreiranih, odnosno uklonjenih zapisa.

## Polja, validacije i statusi

| Polje / radnja | Validacija / pravilo | Poruka ili efekat |
|---|---|---|
| Paket politika | mora postojati u registru | `UNKNOWN_POLICY_PACK` („Policy pack was not found“) |
| Organizaciona jedinica | ako je zadana, mora postojati i imati `ouPath`; obavezna je kad je traži definicija paketa (`organizationalUnitScope: target`) | `UNKNOWN_ORGANIZATIONAL_UNIT` / `MISSING_ORGANIZATIONAL_UNIT` |
| Servis | ako je zadat, mora postojati; obavezan je kad je traži definicija paketa (`serviceScope: target`) | `UNKNOWN_SERVICE` / `MISSING_SERVICE` |
| Cilj primjene | mora biti zadana OJ, servis ili oboje | `policyPacks.errorTargetRequired` u UI-u; bez cilja paket vraća `MISSING_*` |
| Provjera prije primjene | i `apply` i `unapply` se u UI-u ne mogu pokrenuti bez plana iz **Provjeri** | `policyPacks.errorValidationRequired` |
| Cilj povlačenja | `unapply` traži OJ, servis ili oboje — bez cilja nema šta da se ukloni | `MISSING_TARGET` (400) |
| Korisnici | ako su zadati, svi moraju postojati i biti jedinstveni | `UNKNOWN_USER` |
| Definicija paketa | ne smije dodijeliti **SUPER_ADMIN** | „Policy packs must not grant SuperAdmin“ |
| Permisija u paketu | mora postojati u katalogu i biti dozvoljena za tu rolu | `UNKNOWN_PERMISSION` / `PERMISSION_NOT_ALLOWED_FOR_ROLE` |
| Isključen paket | ključ je u `private.policyPacks.disabledKeysCsv` | `PACK_DISABLED` (400) — osim za povlačenje |
| Greška u modulu koji je u read-only režimu | — | `READ_ONLY_MODE` (403) |

## Česta pitanja i greške

- **„Ne vidim panel Paketi politika.“** — Panel je vidljiv samo SUPER_ADMIN nalogu.
- **„Primjena je vratila grešku `UNKNOWN_ORGANIZATIONAL_UNIT`.“** — OJ je obrisana ili ID nije iz stabla; osvježite
  listu i pokušajte ponovo.
- **„Primjenjujem paket samo na servis — šta upisujem kao OJ?“** — Ništa: ostavite **Bez organizacione jedinice**
  i izaberite servis. Dodjela se tada veže samo za servis, a OJ ostaje nepromijenjena.
- **„Dugme Primijeni paket je neaktivno.“** — Prvo pokrenite **Provjeri**; primjena je moguća tek kad je plan
  prikazan. Ako ste u međuvremenu promijenili paket ili cilj, plan se briše i provjeru treba ponoviti.
- **„Kako da poništim primijenjeni paket?“** — Izaberite paket i cilj, kliknite **Provjeri**, pa **Povuci
  paket** (vidi *Povlačenje paketa*). Ako niste naveli korisnike pri primjeni, nema dodjela za uklanjanje, pa
  povlačenje samo skida vezu `policyPackId` s cilja.
- **„Da li paket mijenja SLA ili obavezna polja?“** — SLA, klasifikaciju i odobrenje mijenja **na servisu**
  (vidi *Pregled paketa* i *Šta se tačno mijenja*). **Obavezna polja tiketa** paket još ne dira — ona žive u
  postavci `private.workflow.requiredFields.byServiceJson` i uređuju se na ekranu **Postavke** (poznato
  ograničenje).
- **„Da li se primjena može poništiti iz audita?“** — Ne; audit pamti `policy_pack.apply` i `policy_pack.unapply`,
  ali povratak se pokreće ručno kroz formu (ponovno **Provjeri** → **Povuci paket**).

## Poznata ograničenja

- **Obavezna polja tiketa nisu dio paketa.** Paket nosi role, permisije, klasifikaciju, odobrenje i SLA
  profil, ali ne i obavezna polja tiketa — ona se uređuju u postavkama (`private.workflow.requiredFields.*`).
  (Ostatak nalaza B1 iz `REVIEW_ANALIZA.md` §M5.)
- **Novi paketi se ne mogu dodati kroz postavke.** Postavka `private.policyPacks.disabledKeysCsv` može
  postojeći paket isključiti, ali sastav paketa (role, permisije, SLA profil) je i dalje u kodu i mijenja se
  izdanjem. (Ostatak nalaza B2 iz `REVIEW_ANALIZA.md` §M5.)
- **`validate` i `apply` se pozivaju odvojeno** — serverski `apply` i dalje prihvata zahtjev bez prethodne
  provjere; pravilo „prvo Provjeri“ živi u UI-u (dugme je zaključano bez plana).

## Povezani moduli

- **Uloge i permisije** (`uloge-i-permisije.md`) — šta paket dodjeljuje i kako se poslije mijenja.
- **Korisnici, organizacione jedinice i grupe** (`korisnici-oj-i-grupe.md`) — tab na kojem se panel nalazi.
- **Postavke** — read-only režim može blokirati primjenu paketa.

---

*Ažurirano: 2026-10-05 · Modul: Policy paketi (M5)*
