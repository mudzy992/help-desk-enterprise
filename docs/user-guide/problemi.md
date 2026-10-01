# Problemi (problem management)

Problem okuplja više tiketa s istim uzrokom. Modul je zadano isključen.

## Podešavanje (administrator)
1. Uključite modul problema u postavkama.
2. U **Grupe** uredite grupu (npr. „Radne stanice“) i označite **Problem-grupa**.
3. U grupu dodajte korisnike s ulogom **Upravitelj problema**.

Dok ne postoji bar jedna problem-grupa, stranica Problemi prikazuje poruku da modul čeka podešavanje.

## Ko šta radi
| Radnja | Agent | Upravitelj problema (član grupe) | Administrator |
|---|---|---|---|
| Pregled problema | ✓ (svoja OJ) | ✓ (sve OJ) | ✓ |
| Prijava problema, povezivanje tiketa | ✓ | ✓ | ✓ |
| Preuzimanje, analiza uzroka, workaround, status | – | ✓ | ✓ |
| Zatvaranje, otkazivanje, grupno rješavanje tiketa | – | ✓ | ✓ |

## Prijava
Iz tiketa ili masovno iz liste: **Kreiraj problem**, upišite naslov i opis i izaberite **problem-grupu**. Upravitelji problema iz grupe dobiju obavijest.

## Preuzimanje i rješavanje
Upravitelj problema otvara problem i klikne **Preuzmi** – postaje vlasnik. Vodi analizu, postavlja poznatu grešku i rješava problem. Nakon rješenja može grupno riješiti povezane tikete (uz pregled i potvrdu); nepreuzeti tiketi se automatski dodjeljuju njemu, a korisnici dobijaju poruku.

## Obavijesti
- novi problem bez vlasnika → upravitelji grupe;
- rok (ako su rokovi uključeni) → vlasnik, inače grupa;
- ponavljanje riješenog problema → vlasnik i grupa.

## Poznato ograničenje
Agent u „Dodaj u problem“ vidi samo probleme svoje organizacione jedinice.

## Registar
Lista se filtrira po statusu, prioritetu, vlasniku, grupi, servisu, roku i kategoriji uzroka. Kolona „Tiketi“ prikazuje otvorene i ukupne povezane tikete, a „Starost“ broj dana od otvaranja. Prečica **g p** otvara Probleme.

## Veze (servisi, oprema, incidenti)
Tab **Veze** na problemu prikazuje:
- **Servisi** – glavni servis i dodatni zahvaćeni servisi.
- **Zahvaćena oprema** (kad je evidencija imovine uključena) – aplikacija predlaže opremu prikačenu na povezane tikete; može se dodati pojedinačno ili sve odjednom, ili pronaći pretragom.
- **Incidenti na status stranici** (kad je status stranica uključena) – prekidi čiji je uzrok ovaj problem.

Veze uređuje upravitelj problema iz grupe dok problem nije zatvoren. Na kartici opreme pojavljuje se tab **Problemi**, a na incidentu napomena „Ovaj prekid je posljedica problema …“.

## Izvještaji
Dok je modul uključen, u **Izvještajima** se pojavljuje pet paketa: problemi s najviše povezanih tiketa, vrijeme do poznate greške, vrijeme do rješenja (medijan i 90. percentil po prioritetu i grupi), otvoreni problemi po starosti s probijenim rokovima, te ponavljanja nakon rješenja. Mogu se izvesti i zakazati kao i ostali paketi.

## Lični podaci
Izvoz ličnih podataka sadrži `problems.json`. Anonimizacija osobe uklanja njeno ime iz teksta problema.
