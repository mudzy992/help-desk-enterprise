# Runbook: aktivacija modula Imovina (CMDB, paket 3.2)

Modul je zadano isključen. Dok je isključen, sve `/assets` rute vraćaju 404 `ASSETS_DISABLED`, a poslovi
(podsjetnici, uvoz, AD sinhronizacija) ništa ne rade. Uključivanje i isključivanje ne briše podatke.

Sve komande se izvršavaju na serveru, jedna po jedna. Naziv backend kontejnera:
`docker ps --format '{{.Names}}' | grep '^backend-'`.

## 1. Provjera prije aktivacije
1. Migracije su primijenjene pri deployu (`20270112090000_cmdb_assets`, `20270119090000_cmdb_transfers`,
   `20270126090000_cmdb_type_routing`).
2. Redis ACL korisnik backend-a mora imati pristup redovima `asset-reminders`, `asset-import` i
   `asset-directory-sync`. Uz `+@all` i `~*` nema dodatnog posla.
3. ClamAV je dostupan, jer se potpisane prenosnice i šabloni skeniraju.

## 2. Uključivanje
Probni prolaz (ništa se ne upisuje):

```bash
read -rp "Backend kontejner: " BACKEND && echo '{"private.addons.cmdb": true}' | docker exec -i "$BACKEND" node dist/src/cli/apply-settings.js --reason "Aktivacija modula Imovina" --dry-run
```

Upis:

```bash
read -rp "Backend kontejner: " BACKEND && echo '{"private.addons.cmdb": true}' | docker exec -i "$BACKEND" node dist/src/cli/apply-settings.js --reason "Aktivacija modula Imovina"
```

Meniji „Imovina“ i „Moja oprema“ pojavljuju se nakon osvježavanja stranice.

## 3. Prve postavke (Postavke → Imovina)
- `private.assets.tag.prefix` (zadano `INV-`) i `private.assets.currency` (zadano `BAM`).
- `private.assets.locations.enabled`: zadano isključeno. Kao mjesto se tada prikazuje putanja OJ.
- Prenosnice: `private.assets.transfer.place` (mjesto na dokumentu), `.warehouseLabel`, `.numberFormat`
  (`{MM}-{NNNN}-{YYYY}`), `.defaultSignatoryUserId` i `.required` (zadano isključeno).
- Potpisnici: **Administracija → Organizacija → odabrana OJ → „Potpisnik prenosnica“**. Postavlja se na
  najvišoj OJ, a niže jedinice ga nasljeđuju.
- Šablon prenosnice: **Imovina → Tipovi i lokacije → Šablon prenosnice**. Preuzmite zadani šablon,
  prilagodite zaglavlje i logo u Wordu i ponovo ga učitajte.
- Uloga „Upravitelj imovine“ (`ASSET_MANAGER`) dodjeljuje se korisnicima iz nabavke ili IT-a, po OJ.

## 4. Početni podaci
Demo inventar, samo za staging (uklanja se s `--remove`):

```bash
read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" node dist/src/cli/assets-seed-demo.js
```

Uvoz iz Excela, prvo probni prolaz:

```bash
read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" node dist/src/cli/assets-import.js --type laptop --file - --name laptopi.xlsx --dry-run --reason "početni uvoz" < laptopi.xlsx
```

Izlazni kod 3 znači da pregled ima greške.

AD računari, prvo probni prolaz, pa upis:

```bash
read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" node dist/src/cli/assets-directory-sync.js --dry-run
```

```bash
read -rp "Backend kontejner: " BACKEND && docker exec -i "$BACKEND" node dist/src/cli/assets-directory-sync.js --apply --reason "prvi sync"
```

Prije toga treba postaviti `private.assets.directorySync.baseDn` (OU s računarima). Automatsku
sinhronizaciju uključuje `private.assets.directorySync.enabled`.

## 5. Provjera nakon aktivacije
- **Moja oprema** se otvara za običnog korisnika. Registar za njega vraća 403.
- Probno zaduženje daje prenosnicu s brojem u formatu `MM-NNNN-GGGG`, a DOCX se otvara u Wordu.
- **Izvještaji** nude pet paketa „Imovina: …“, a **Imovina → Pregled** se otvara upravitelju s
  `asset.report.read`.
- Opterećenje (opcionalno): `perf/assets-list.js` (vidi `perf/README.md`), uz budžet p95 < 200 ms za
  registar.

## 6. Isključivanje
Isti postupak s vrijednošću `false`. Podaci ostaju i vraćaju se kad se modul ponovo uključi. Paketi
izvještaja o imovini tada nestaju iz liste, a zakazani izvještaji koji ih sadrže izostavljaju te pakete (razlog „paket isključen“ u historiji slanja).
