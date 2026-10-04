# Dežurstva (on-call)

## Čemu služi ovaj modul

Svaka grupa može imati raspored dežurstva: rotaciju članova po smjenama (npr. sedmično). Rotacija se **računa**
iz početnog datuma, dužine smjene i redoslijeda članova — ne unosi se dan po dan.

## Kome je namijenjen

- **Agentima** koji su u rotaciji: vide svoju smjenu u zaglavlju, kalendar grupe i mogu tražiti zamjenu.
- **Administratorima** (i nosiocima prava `oncall.manage`): kreiraju raspored po grupi i povezuju ga s SLA
  eskalacijom i auto-dodjelom.

## Kako doći

- **Dežurstva:** meni → **Dežurstva** (kalendar vaše grupe).
- **Status smjene:** zaglavlje aplikacije (zelena oznaka dok ste u smjeni).
- **iCal link:** *Postavke naloga → Obavještenja*.

## Korak po korak

### Za agente

- **Zaglavlje** prikazuje zelenu oznaku kad ste trenutno u smjeni (osvježava se svakih 5 minuta).
- **Stranica „Dežurstva“** (meni) prikazuje kalendar vaše grupe: ko je kada dežuran, zamjene i rupe.
- **Zamjena / odsustvo:** do 31 dana odjednom; unosi se razlog.
- **Rupa u rasporedu:** ko je popuni, postaje vlasnik te smjene.
- **Tihi sati** obavještenja ne vrijede dok ste u smjeni.
- **Kalendar u vanjskoj aplikaciji:** u *Postavke naloga → Obavještenja* možete generisati privatni
  iCal link (prikazuje se samo jednom; može se rotirati ili opozvati).

### Za administratore

- Raspored se kreira po grupi (permisija `oncall.manage`).
- SLA eskalacija može ciljati **dežurnog grupe** (kvačica u pravilu eskalacije kad je cilj grupa);
  ako dežurnog nema, eskalacija ide grupi.
- Dodjela tiketa dežurnom van radnog vremena je opcija po grupi, zadano isključena.
- Nema SMS-a, poziva ni dvosmjerne sinhronizacije s vanjskim kalendarom.

## Polja, validacije i statusi

| Polje / status | Pravilo |
|---|---|
| Zamjena / odsustvo | najviše **31 dan** odjednom; razlog je obavezan |
| Oznaka smjene u zaglavlju | zelena oznaka dok ste u smjeni; osvježava se svakih **5 minuta** |
| Rupa u rasporedu | nema vlasnika dok je neko ne popuni; onaj ko popuni postaje vlasnik smjene |
| Tihi sati obavještenja | **ne važe** dok ste u smjeni |
| iCal link | prikazuje se samo jednom; može se rotirati ili opozvati |
| Permisija | `oncall.manage` (kreiranje rasporeda po grupi) |
| Cilj SLA eskalacije | dežurni grupe ako postoji; inače grupa |

## Česta pitanja i greške

- **„Zašto dobijam obavještenja i u tihe sate?“** — Dok ste u smjeni, tihi sati ne važe; to je namjerno.
- **„Kako raspored ide u moj kalendar?“** — *Postavke naloga → Obavještenja* → generišite privatni iCal link
  (prikazuje se samo jednom).
- **„Smjena je prazna jer je kolega odsutan.“** — Rupa ostaje vidljiva u kalendaru; ko je popuni, postaje
  vlasnik te smjene — nema automatske dodjele.
- **„Eskalacija nije stigla dežurnom.“** — Ako u trenutku eskalacije nema dežurnog (rupa), eskalacija ide grupi.
- **„Vidim tuđi raspored, a ne svoj.“** — Stranica prikazuje kalendar **vaše grupe**; raspored se vodi po grupi.

## Poznata ograničenja

- **Nema SMS-a, telefonskih poziva ni dvosmjerne sinhronizacije** s vanjskim kalendarom — iCal link je samo za
  čitanje (izvoz).
- **Dodjela tiketa dežurnom van radnog vremena je zadano isključena** i uključuje se po grupi.
- **Rupa nema vlasnika**: dok traje, eskalacija „na dežurnog grupe“ pada na samu grupu (teza T9).

## Povezani moduli

- SLA — eskalacije mogu ciljati dežurnog: `sla.md`
- Realtime i obavještenja — tihi sati i kanali obavještenja: `realtime-i-obavjestenja.md`
- Korisnici, organizacione jedinice i grupe — članstvo u grupi: `korisnici-oj-i-grupe.md`
- Teze: **T9**, **T10**
- Dizajn paketa: `docs/plans/modules/2.9-dodatne-nadogradnje.md`
