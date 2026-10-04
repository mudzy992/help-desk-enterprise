# Problemi (problem management)

## Čemu služi ovaj modul

Problem okuplja više tiketa s istim uzrokom. Modul je zadano isključen.

## Kome je namijenjen

- **Agentima** — pregledavaju probleme svoje OJ i povezuju tikete s problemom.
- **Upraviteljima problema** (članovi problem-grupe) — preuzimaju problem, vode analizu uzroka, workaround i
  status, zatvaraju/otkazuju i grupno rješavaju povezane tikete.
- **Administratorima** — uključuju modul, označavaju grupe kao **Problem-grupa** i dodjeljuju ulogu
  **Upravitelj problema**.

## Kako doći

- **Problemi:** meni → **Problemi**; prečica **g p**.
- **Prijava problema:** iz tiketa ili masovno s liste tiketa → **Kreiraj problem**.
- **Podešavanje:** **Postavke** (uključivanje modula) i **Grupe** (oznaka **Problem-grupa**, članovi).

## Korak po korak

### Podešavanje (administrator)

1. Uključite modul problema u postavkama.
2. U **Grupe** uredite grupu (npr. „Radne stanice“) i označite **Problem-grupa**.
3. U grupu dodajte korisnike s ulogom **Upravitelj problema**.

Dok ne postoji bar jedna problem-grupa, stranica Problemi prikazuje poruku da modul čeka podešavanje.

### Prijava

Iz tiketa ili masovno iz liste: **Kreiraj problem**, upišite naslov i opis i izaberite **problem-grupu**.
Upravitelji problema iz grupe dobiju obavijest.

### Preuzimanje i rješavanje

Upravitelj problema otvara problem i klikne **Preuzmi** – postaje vlasnik. Vodi analizu, postavlja poznatu
grešku i rješava problem. Nakon rješenja može grupno riješiti povezane tikete (uz pregled i potvrdu);
nepreuzeti tiketi se automatski dodjeljuju njemu, a korisnici dobijaju poruku.

### Registar

Lista se filtrira po statusu, prioritetu, vlasniku, grupi, servisu, roku i kategoriji uzroka. Kolona „Tiketi“
prikazuje otvorene i ukupne povezane tikete, a „Starost“ broj dana od otvaranja. Prečica **g p** otvara
Probleme.

### Veze (servisi, oprema, incidenti)

Tab **Veze** na problemu prikazuje:

- **Servisi** – glavni servis i dodatni zahvaćeni servisi.
- **Zahvaćena oprema** (kad je evidencija imovine uključena) – aplikacija predlaže opremu prikačenu na
  povezane tikete; može se dodati pojedinačno ili sve odjednom, ili pronaći pretragom.
- **Incidenti na status stranici** (kad je status stranica uključena) – prekidi čiji je uzrok ovaj problem.

Veze uređuje upravitelj problema iz grupe dok problem nije zatvoren. Na kartici opreme pojavljuje se tab
**Problemi**, a na incidentu napomena „Ovaj prekid je posljedica problema …“.

### Izvještaji

Dok je modul uključen, u **Izvještajima** se pojavljuje pet paketa: problemi s najviše povezanih tiketa,
vrijeme do poznate greške, vrijeme do rješenja (medijan i 90. percentil po prioritetu i grupi), otvoreni
problemi po starosti s probijenim rokovima, te ponavljanja nakon rješenja. Mogu se izvesti i zakazati kao i
ostali paketi.

## Polja, validacije i statusi

| Radnja | Agent | Upravitelj problema (član grupe) | Administrator |
|---|---|---|---|
| Pregled problema | ✓ (svoja OJ) | ✓ (sve OJ) | ✓ |
| Prijava problema, povezivanje tiketa | ✓ | ✓ | ✓ |
| Preuzimanje, analiza uzroka, workaround, status | – | ✓ | ✓ |
| Zatvaranje, otkazivanje, grupno rješavanje tiketa | – | ✓ | ✓ |

**Obavijesti:**

- novi problem bez vlasnika → upravitelji grupe;
- rok (ako su rokovi uključeni) → vlasnik, inače grupa;
- ponavljanje riješenog problema → vlasnik i grupa.

**Lični podaci:** izvoz ličnih podataka sadrži `problems.json`. Anonimizacija osobe uklanja njeno ime iz
teksta problema.

**Filteri registra:** status, prioritet, vlasnik, grupa, servis, rok, kategorija uzroka.

## Česta pitanja i greške

- **„Stranica Problemi kaže da modul čeka podešavanje.“** — Ne postoji nijedna **problem-grupa**; označite
  grupu u **Grupe** i dodajte joj upravitelje problema.
- **„Ne mogu preuzeti problem.“** — Preuzimanje, analizu i zatvaranje radi samo **upravitelj problema** iz
  grupe; agent može prijaviti problem i povezati tikete.
- **„Agent ne vidi problem u ‚Dodaj u problem‘.“** — Agent vidi samo probleme svoje organizacione jedinice
  (poznato ograničenje).
- **„Povezani tiketi su ostali otvoreni poslije rješenja.“** — Rješavanje tiketa je posebna radnja uz pregled
  i potvrdu; pokrenite je s problema.
- **„Nepreuzeti tiketi su dodijeljeni upravitelju.“** — Tako je predviđeno: pri rješavanju se nepreuzeti
  povezani tiketi automatski dodjeljuju upravitelju, a korisnici dobijaju poruku.

## Poznata ograničenja

- **Modul je zadano isključen** i traži podešavanje (bar jedna problem-grupa s upraviteljima).
- **Agent u „Dodaj u problem“ vidi samo probleme svoje organizacione jedinice.**
- **Rokovi zavise od postavke** — ako rokovi nisu uključeni, obavijest o roku se ne šalje (ide vlasniku, a
  inače grupi, kad su uključeni).
- **Veze uređuje samo upravitelj problema iz grupe i to dok problem nije zatvoren.**
- **Izvještaji se pojavljuju samo dok je modul uključen.**

## Povezani moduli

- Tiketi (prijava problema, povezivanje tiketa, grupno rješavanje): `tiketi.md`
- Imovina (zahvaćena oprema, tab **Problemi** na opremi): `imovina.md`
- Status servisa i incidenti (incident kao posljedica problema): `status-incidenti-i-planirani-prekidi.md`
- Promjene (neuspješna promjena javlja vlasniku problema): `promjene.md`
- Nadzorna ploča i izvještaji (paketi o problemima): `nadzorna-ploca-i-izvjestaji.md`
- Dizajn paketa: `docs/plans/modules/3.3-problem-management.md`
