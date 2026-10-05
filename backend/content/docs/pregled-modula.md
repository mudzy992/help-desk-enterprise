
# Pregled modula

## Čemu služi ovaj modul

Mapa cijele dokumentacije: koji modul čemu služi i na kojoj je stranici opisan. Služi za brzo pronalaženje
stranice kad znate šta tražite, ali ne i gdje je opisano.

## Kome je namijenjen

**Svim korisnicima.** Administratorima koristi kao kontrolna lista pokrivenosti: svaki modul iz audita
(M1–M15) ima svoju stranicu.

## Kako doći

- **Dokumentacija → Početak → Pregled modula.**
- **Lijevi nav** u Dokumentaciji prikazuje istu strukturu (dijelovi i stranice) i poštuje vašu rolu.

## Korak po korak

1. Nađite modul u tabeli **Moduli iz audita** (M1–M15).
2. Kliknite naslov stranice u koloni **Stranica**.
3. Ako modul nije u prvom dijelu tabele, pogledajte **Ostale stranice** (moduli izvan audita i referentne
   stranice).
4. Unutar stranice koristite desni sadržaj (TOC) za skok na sekciju; pretraga Dokumentacije pokriva i naslove
   i tekst.

## Polja, validacije i statusi

**Moduli iz audita (M1–M15):**

| Modul | Čemu služi | Stranica |
|---|---|---|
| M1 | Prvi start: SuperAdmin nalog, način prijave, SMTP i minimalni podaci. | [Instalacija (prvi start)](/docs/instalacija) |
| M2 | Prijava, potvrda u dva koraka, sesije i sigurnost naloga. | [Prijava i potvrda u dva koraka (MFA)](/docs/prijava-i-mfa) |
| M3 | Nalozi, organizacione jedinice i grupe, uz sinhronizaciju s direktorijem. | [Korisnici, organizacione jedinice i grupe](/docs/korisnici-oj-i-grupe) |
| M4 | Role, permisije, OU/servis scope i read-only režim. | [Uloge i permisije (RBAC)](/docs/uloge-i-permisije) |
| M5 | Paketi konfiguracije koji dodjeljuju role i permisije. | [Policy paketi](/docs/policy-paketi) |
| M6 | Kategorije, usluge, forme i verzije formi. | [Katalog usluga i forme](/docs/katalog-usluga-i-forme) |
| M7 | Pravila usmjeravanja, matrica prioriteta i neusmjereni red. | [Usmjeravanje i prioritet](/docs/usmjeravanje-i-prioritet) |
| M8 | Životni ciklus tiketa, grupni inbox, spajanje i skupne akcije. | [Tiketi](/docs/tiketi) |
| M9 | Odluka o zahtjevu (odobrenje) i ocjena zadovoljstva (CSAT). | [Odobrenja i CSAT](/docs/odobrenja-i-csat) |
| M10 | Rokovi, kalendari, pravila i eskalacije. | [SLA](/docs/sla) |
| M11 | Obavještenja u aplikaciji i veza u realnom vremenu. | [Realtime i obavještenja](/docs/realtime-i-obavjestenja) |
| M12 | E-mail kanal, šabloni, dolazna pošta i masovna obavještenja. | [Pošta (e-mail)](/docs/posta) |
| M13 | Gotovi odgovori i tokovi rješavanja s koracima. | [Šabloni i playbooks](/docs/sabloni-i-playbooks) |
| M14 | Članci, portal znanja, ocjene i ciklus pregleda. | [Baza znanja](/docs/baza-znanja) |
| M15 | Nadzorna ploča, izvještaji, trendovi i zakazani izvještaji. | [Nadzorna ploča i izvještaji](/docs/nadzorna-ploca-i-izvjestaji) |

**Ostale stranice** (moduli izvan audita i referentne stranice):

| Dio | Stranica | Čemu služi |
|---|---|---|
| Početak | [Početak rada](/docs/pocetak-rad) | prvi koraci: prijava, meni, otvaranje i praćenje tiketa |
| Početak | [Prečice na tastaturi i pristupačnost](/docs/precice-i-pristupacnost) | rad tastaturom, čitač ekrana, uvećanje i prečice |
| Korisnik | [Status servisa: incident ili zakazani prekid?](/docs/status-incidenti-i-planirani-prekidi) | razlika između najavljenog prekida i incidenta |
| Korisnik | [Najave](/docs/najave) | obavještenja organizacije i potvrda čitanja |
| Agent | [Prosljeđivanje tiketa](/docs/prosljedjivanje-tiketa) | slanje tiketa drugoj grupi i vraćanje |
| Agent | [Dežurstva (on-call)](/docs/dezurstva) | raspored smjena grupe, zamjene i rupe |
| Administracija | [Imovina (CMDB)](/docs/imovina) | oprema, prenosnice, licence i ugovori |
| Administracija | [Problemi](/docs/problemi) | više tiketa s istim uzrokom i grupno rješavanje |
| Administracija | [Promjene](/docs/promjene) | planirane izmjene, CAB, konflikti i zamrzavanje |
| Referenca | [Uloge i dozvole](/docs/uloge-i-dozvole) | kratak pregled ko šta smije |
| Referenca | [Česta pitanja](/docs/cesta-pitanja) | najčešća pitanja i poruke grešaka |
| Referenca | [Rječnik](/docs/rjecnik) | pojmovi koji se koriste u aplikaciji |
| Referenca | [Šta je novo](/docs/sta-je-novo) | izmjene koje korisnik osjeti |

## Česta pitanja i greške

- **„Ne vidim stranicu koju tražim.“** — Lijevi nav prikazuje samo stranice koje vaša rola smije otvoriti;
  tehničke stranice (npr. instalacija) i administratorski moduli traže odgovarajuću rolu.
- **„Modul nije u tabeli.“** — Tabela **Moduli iz audita** pokriva M1–M15; moduli izvan audita su u tabeli
  **Ostale stranice**.
- **„Odakle početi?“** — Otvorite [Početak rada](/docs/pocetak-rad).
- **„Gdje je tehnički opis?“** — Tehničke teze (`TEZE-ZA-DOKUMENTACIJU.md`) i dizajn paketa
  (`docs/plans/modules/**`) nisu dio korisničke dokumentacije u aplikaciji.

## Poznata ograničenja

- **Prikaz zavisi od role i modula**: stranica modula se ne prikazuje ako vaša rola nema pristup njenim
  ekranima (npr. `uloge-i-permisije.md` je za ADMIN/SUPER_ADMIN).
- **Tabele u ovom pregledu su ručno održavane** — kad nastane nova stranica, dodaje se u ovu tabelu.
- **Tehnička dokumentacija (teze, planovi, runbook-ovi) namjerno nije u aplikaciji** — ona je za razvoj i
  operativu i živi u repozitoriju.

## Povezani moduli

- Početak rada: `pocetak-rad.md`
- Rječnik pojmova: `rjecnik.md`
- Česta pitanja: `cesta-pitanja.md`
- Šta je novo: `sta-je-novo.md`
