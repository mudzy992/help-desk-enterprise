# Dežurstva (on-call)

## Šta je dežurstvo
Svaka grupa može imati raspored dežurstva: rotaciju članova po smjenama (npr. sedmično).
Rotacija se **računa** iz početnog datuma, dužine smjene i redoslijeda članova — ne unosi se dan po dan.

## Za agente
- **Zaglavlje** prikazuje zelenu oznaku kad ste trenutno u smjeni (osvježava se svakih 5 minuta).
- **Stranica „Dežurstva“** (meni) prikazuje kalendar vaše grupe: ko je kada dežuran, zamjene i rupe.
- **Zamjena / odsustvo:** do 31 dana odjednom; unosi se razlog.
- **Rupa u rasporedu:** ko je popuni, postaje vlasnik te smjene.
- **Tihi sati** obavještenja ne vrijede dok ste u smjeni.
- **Kalendar u vanjskoj aplikaciji:** u *Postavke naloga → Obavještenja* možete generisati privatni
  iCal link (prikazuje se samo jednom; može se rotirati ili opozvati).

## Za administratore
- Raspored se kreira po grupi (permisija `oncall.manage`).
- SLA eskalacija može ciljati **dežurnog grupe** (kvačica u pravilu eskalacije kad je cilj grupa);
  ako dežurnog nema, eskalacija ide grupi.
- Dodjela tiketa dežurnom van radnog vremena je opcija po grupi, zadano isključena.
- Nema SMS-a, poziva ni dvosmjerne sinhronizacije s vanjskim kalendarom.
