
# Uloge i dozvole

## Čemu služi ovaj modul

Kratak pregled ko šta smije u aplikaciji: koje role postoje, šta znači **permisija** i **scope**, i gdje se
dozvole mijenjaju. Detaljna pravila (preview uticaja, change log, read-only režim, ograničenja) su u vodiču
`uloge-i-permisije.md`.

## Kome je namijenjen

**Svim korisnicima** — da razumiju zašto ne vide ili ne mogu izvršiti neku radnju. Administratorima služi kao
ulaz u puni vodič o permisijama.

## Kako doći

- **Svoje dozvole:** vidite kroz ono što vam meni i ekrani nude; puna lista dolazi sa sesijom.
- **Ekran Permisije:** **Administracija → Permisije** — dostupan je samo **SUPER_ADMIN** nalogu.
- **Puni vodič:** `uloge-i-permisije.md`.

## Korak po korak

1. **Rola** daje osnovni pristup ekranima i meniju (**USER**, **AGENT**, **ADMIN**, **SUPER_ADMIN**, te
   paketske role **ASSET_MANAGER**, **PROBLEM_MANAGER**, **CHANGE_MANAGER**).
2. **Permisija** je pojedinačna dozvola za akciju (npr. `group.manage`, `settings.write`, `routing.write`,
   `ticket.merge`, `audit.export`). U sistemu postoji **63** permisije.
3. Svaka dodjela može imati **OU scope** (organizacionu jedinicu) i **service scope** (servis). Pravilo:
   *permisija ne otključava podatke van svog scope-a*.
4. Ako vam neka akcija nije dostupna, najčešći razlog je nedostatak permisije (rola sama ne daje akciju).
5. Administratori mijenjaju mapping rola → permisije na ekranu **Permisije**, uz **Pregled uticaja** i
   **Potvrdi i sačuvaj**.

## Polja, validacije i statusi

| Rola | Osnovno |
|---|---|
| **USER** | Prijava tiketa, praćenje svojih zahtjeva, odgovori, CSAT, baza znanja, status servisa, najave. |
| **AGENT** | Grupni inbox i rad na tiketima u svom scope-u i svojoj grupi; šabloni, playbooks, obavještenja grupe. |
| **ADMIN** | Kao agent, uz administratorske ekrane (korisnici, OJ, grupe, katalog, SLA, usmjeravanje, pošta, izvještaji) — prema dodijeljenim permisijama. |
| **SUPER_ADMIN** | Sve navedeno, ekran **Permisije**, zaobilaženje read-only režima po postavci; jedini mijenja mapping rola → permisije. |
| **ASSET_MANAGER** | Imovina: registar, kretanja, prenosnice, licence, ugovori (u svom opsegu). |
| **PROBLEM_MANAGER** | Problemi: preuzimanje, analiza uzroka, grupno rješavanje povezanih tiketa. |
| **CHANGE_MANAGER** | Promjene: procjena, termin, realizacija, pregled i glas u CAB-u. |
| **Ostali korisnici** | Vide meni i ekrane prema roli i dodijeljenim permisijama; pojedini moduli se prikazuju samo kad su uključeni. |

**Statusi i režimi koji utiču na dozvole:** **read-only režim** zaključava modul za izmjene (mutirajuće akcije
vraćaju `403 READ_ONLY_MODE`); **SuperAdmin bypass** važi samo za lokalni (break-glass) nalog; **scoped
dodjela** ne zadovoljava provjeru bez OU scope-a (izuzetak je `oncall.read`).

## Česta pitanja i greške

- **„Zašto ne vidim akciju iako imam rolu?“** — Rola otvara meni, a akcije traže permisiju; provjerite u
  **Permisije** šta rola stvarno ima (ili pitajte SuperAdmina).
- **„Zašto je akcija odbijena sa `READ_ONLY_MODE`?“** — Uključen je read-only režim za taj modul; isključuje ga
  SuperAdmin ili se koristi bypass.
- **„SuperAdmin ne može da se prijavi posle promjene.“** — SuperAdmin nalog mora biti **lokalan** (bez
  AD/Entra veze); nelokalni se odbija namjerno.
- **„Promjena permisija nije vidljiva odmah.“** — Za nove zahtjeve je vidljiva odmah; korisnik možda treba
  osvježiti stranicu da ponovo učita sesiju.
- **„Uklonio sam permisiju roli, a poslije je opet tu.“** — Seed default mappinga je **aditivan**: nikad ne
  briše, ali vraća ono što nedostaje (detalji u vodiču).

## Poznata ograničenja

- **Ekran Permisije je samo za SUPER_ADMIN**; ADMIN koristi dodijeljeno, ali ne mijenja mapping.
- **Preview uticaja nije obavezan na serveru** — UI ne dopušta čuvanje bez pregleda, ali API to ne provjerava.
- **`group.manage` se provjerava bez OU scope-a**, pa OU-scoped ADMIN ne može upravljati grupama.
- **SuperAdmin bypass se ne bilježi u audit logu.**
- **Postoji 63 permisije** i broj raste s modulima; nove permisije ulaze u role tek kad ih SuperAdmin sačuva
  ili primijeni policy paket.

## Povezani moduli

- Puni vodič: `uloge-i-permisije.md` (RBAC, preview, change log, policy paketi)
- Korisnici, OJ i grupe: `korisnici-oj-i-grupe.md`
- Policy paketi: `policy-paketi.md`
- Česta pitanja i poruke grešaka: `cesta-pitanja.md`
