# Fazni plan nadogradnje EP·HelpDesk — 2026

Osnova: `docs/PROJEKTNI-ZADATAK-GAP-2026-09-25.md` (audit usklađenosti) i odluke vlasnika:

- **Faza 1** — zatvoriti sve rupe u odnosu na projektni zadatak (RAW).
- **Faza 2** — funkcionalnosti koje help-desk ovog obima treba imati (preporuke P1–P10 + dopune).
- **Faza 3** — proširenja koja su bila „van obima": puni Teams konektor, ITIL Problem i Change
  management, CMDB (imovina/konfiguracione stavke).
- **Isključeno trajno:** mobilna aplikacija. **Na pauzi do daljnjeg:** AI (klasifikacija,
  semantička pretraga, chatbot) i SLA predikcija (zasnovana na modelu).
- Edge ekstenzija: posebna tema, nije dio ovog plana.

Plan je okvir. Svaki paket se prije implementacije razrađuje u zaseban detaljni dokument
(`docs/plans/modules/<id>-<slug>.md`: model podataka, API, UI, permisije, audit, testovi,
migracija, rizici) i tek nakon odobrenja implementira.

---

## Pravila koja važe za svaki paket

| Pravilo | Sadržaj |
|---|---|
| Definicija „gotovo" | backend + frontend + permisije + audit/change log + i18n bs/en + unit testovi + e2e za glavni tok + ažurirana dokumentacija; typecheck, lint i svi testovi zeleni |
| Sigurnost | svaka nova akcija ima permisiju iz kataloga i poštuje OU scope i confidential ACL; nijedan novi endpoint bez guarda |
| Settings | novi prekidači kroz settings registry (opis, tip, default); nova funkcionalnost ima feature flag gdje ima smisla |
| Migracije | aditivne; bez gubitka podataka; testirane na kopiji staging baze |
| Performanse | nijedan zahtjev ne prelazi kapiju DB upita (2,1 po zahtjevu u CI); liste paginirane |
| UI | Pulse dizajn sistem, postojeći t() ključevi se ne mijenjaju, kontrast audit prolazi |
| Isporuka | jedan paket = jedan ili više commitova na grani, sažetak + upute za deploy |

Procjena je u **radnim danima (RD)** za implementaciju s testovima, bez čekanja na odluke.

---

## FAZA 1 — Usklađenost s projektnim zadatkom

Cilj: nakon ove faze svaka stavka RAW-a je ✅. Paketi su grupisani po srodnosti.

### 1.1 Prosljeđivanje i eskalacija tiketa (G1)  · ~3 RD · prioritet 1
- Akcija **„Proslijedi"** na detalju tiketa: ciljna grupa (i opcionalno agent), **obavezan razlog**.
- Provjere: `ticket.forward.cross_ou` kad je ciljna grupa u drugom OU-u; ciljna grupa mora biti
  aktivna; confidential pravila ostaju.
- Participanti `FORWARDED_FROM_GROUP` / `FORWARDED_TO_GROUP`, sistemski događaj u razgovoru,
  audit + change log, notifikacija novoj grupi.
- Postavke `private.ticket.forwarding.*`: dozvola cross-OU, obavezan razlog, zadržati prethodne
  handlere kao posmatrače (watchers).
- Bulk assign dobija iste provjere (cross-OU permisija + razlog).
- Eskalacija: „Eskaliraj" = prosljeđivanje na grupu višeg nivoa definisanu po servisu/grupi.

### 1.2 Upravljanje prioritetom i merge tok (G5 + G4)  · ~2 RD · dizajn: `modules/1.2-prioritet-i-merge.md` · ✅ implementirano
- Pojedinačna promjena prioriteta na tiketu: permisija, obavezan razlog, audit, oznaka
  „ručno promijenjeno" (matrica se više ne primjenjuje automatski na taj tiket).
- Merge: promjena statusa glavnog tiketa (RESOLVED/CLOSED) propagira se na spojene tikete;
  poruka na glavnom tiketu (opcija „pošalji i povezanim") ide requesterima spojenih; prikaz
  „spojeno u T-…" i lista spojenih na glavnom tiketu; poništavanje merge-a (unmerge) s razlogom.

### 1.3 Mjerenje vremena — zaštita od zloupotrebe (G3)  · ~1,5 RD · dizajn: `modules/1.3-mjerenje-vremena.md` · ✅ implementirano
- `private.timeTracking.inactiveTabAutoPauseMinutes`, `maxSessionHours`.
- Frontend: pauza kad je tab neaktivan > X min (Page Visibility API), nastavak na povratku.
- Backend: tvrdi limit — timer stariji od `maxSessionHours` se zatvara automatski (scheduler),
  označava „automatski zaustavljeno"; jedan aktivni timer po korisniku (ne samo po tiketu).
- Ručna korekcija unosa (vlasnik ili admin) uz razlog i audit; izvještaj vremena po agentu/servisu.

### 1.4 Šabloni odgovora i playbooks (G2)  · ~4 RD · dizajn: `modules/1.4-sabloni-playbooks.md` · ✅ implementirano
- Model `ResponseTemplate` (naziv, tijelo s varijablama `{{requester.name}}`, `{{ticket.number}}`…,
  servis/kategorija/grupa scope, jezik, aktivno) i `Playbook` (koraci — checklist po servisu).
- Admin CRUD s permisijom, change log, verzije kroz config versioning.
- U composeru: izbor šablona (pretraga, filtrirano po servisu tiketa), umetanje s popunjenim
  varijablama; na tiketu: checklist playbooka s napretkom (ko je štiklirao i kad).
- Settings `private.ticket.templates.enabled`.

### 1.5 E-mail notifikacije — profesionalni nivo (G7)  · ~3 RD · ✅ implementirano (dizajn: `modules/1.5-email-notifikacije.md`)
- HTML šablon (brendiran, responzivan) + plain-text alternativa.
- **Link na tiket** (`APP_PUBLIC_URL`) u svakoj poruci; dugme „Otvori tiket".
- Jezik po korisniku (bs default, en fallback) — polje `preferredLocale` na korisniku.
- Confidential/restricted: bez naslova i sadržaja u e-mailu, samo broj tiketa i link.
- Admin: pregled i uređivanje šablona u UI-ju s previewom i test slanjem.
- Threading (`Message-ID`, `In-Reply-To`) da e-mailovi istog tiketa idu u isti razgovor
  (priprema za 2.3 odgovor e-mailom).

### 1.6 Izvještaji u UI-ju (G6)  · ~2 RD  · ✅ (docs/plans/modules/1.6-izvjestaji-ui.md)
- Stranica Izvještaji → „Paketi izvještaja": Monthly KPI, Overdue by service, Top close codes,
  KB helpfulness; filter perioda i OU-a; preuzimanje CSV/JSON; pregled u tabeli prije preuzimanja.
- Audit svakog izvoza (ko, šta, period).
- Preneseno iz 1.1 (odluka 2026-09-25):
  - na listi tiketa indikator „proslijeđen" i filter „proslijeđeni u moju grupu";
  - brojač prosljeđivanja na tiketu;
  - izvještaj „tiketi s ≥ 3 prosljeđivanja" (ping-pong).

  Izvor podataka je `TicketForwardEvent`. Lista je pod query-count kapijom.

### 1.7 Workflow, nerutirani tiketi, realtime dopune (G8 + G9 + G10)  · ~2 RD · dizajn: `modules/1.7-workflow-unrouted-realtime.md` · ✅ implementirano
- Admin: read-only prikaz toka statusa (dijagram dozvoljenih prelaza i ko ih smije raditi).
  Odluka: prelazi se ne uređuju iz UI-ja (sigurnost konzistentnosti SLA/approvals) — dokumentovati.
- Nerutirani: `targetGroupId` (tiketi bez pravila idu u tu grupu) i `cleanupSlaHours`
  (upozorenje owneru kad tiket stoji duže; brojač na dashboardu).
- Realtime `routing.rules.updated` (i ostali admin eventi iz RAW §7) → osvježavanje admin ekrana.

### 1.8 Verifikacija na EPBiH infrastrukturi (V1–V3)  · zavisi od IT-a EPBiH · dizajn: `modules/1.8-verifikacija-epbih.md` (~7 RD razvoja: LDAPS provider i Entra login tok ne postoje — nalaz N1–N5)
- V1 Entra SSO na pravom tenantu — checklist, test nalozi, mapiranje uloga.
- V2 LDAPS sync na pravim DC-ovima — dry-run, broj korisnika po OU, izuzeci.
- V3 Restore drill po `ops/DR.md` — izvesti i zapisati rezultat (RPO/RTO).
- Isporuka: zapisnik verifikacije; popravke ako se pojave.

**Faza 1 ukupno: ~17,5 RD** (+ verifikacija po dogovoru s IT-om).

---

## FAZA 2 — Funkcionalnosti help-deska ovog obima

### 2.1 Sigurnost naloga  · ~3 RD
- **MFA (TOTP)** obavezno za SUPER_ADMIN, opcionalno za ostale lokalne naloge; recovery kodovi;
  reset MFA samo od drugog SUPER_ADMIN-a uz audit.
- Pregled aktivnih sesija korisnika + „odjavi sve uređaje" (nadogradnja na opoziv iz reviewa).
- Politika lozinki za lokalne naloge (dužina, historija, istek za break-glass nalog).

### 2.2 Notifikacije po mjeri korisnika  · ~2 RD
- Lične postavke: koji događaji e-mailom / in-app, „tihi sati", dnevni sažetak (digest) umjesto
  pojedinačnih e-mailova za agente.
- Admin može zaključati obavezne notifikacije (npr. odobrenja).

### 2.2a Sedmični pregled tiketa agentima (e-mail)  · ~1,5 RD · dizajn: `modules/2.2a-sedmicni-pregled-tiketa-agentima.md`
- Pojašnjenje klijenta (2026-09-27): sedmično agentu lista otvorenih tiketa u kojima je učesnik (dodijeljen/gost), sa statusom — podsjetnik šta treba riješiti.

### 2.3 Odgovor e-mailom (inbound)  · ~5,5 RD · dizajn: `modules/2.3-odgovor-emailom.md` · **implementirano**
- Poštanski sandučić (IMAP/Graph) koji worker čita; odgovor na notifikaciju postaje poruka na
  tiketu (prepoznavanje po threading zaglavljima + tokenu u adresi/predmetu).
- Opcionalno: novi e-mail na adresu podrške kreira tiket (servis „Opšti upit", routing po
  pošiljaocu).
- Zaštite: samo poznati pošiljaoci (domena `epbih.ba`), uklanjanje citiranog teksta i potpisa,
  prilozi kroz iste provjere (ClamAV), anti-loop (auto-reply, bounce), redaction.

### 2.4 Saradnja agenata  · ~3 RD

> **Status:** implementirano (dizajn 18a6ae8, backend 4b502ac, frontend 2026-09-27). Detalji i odstupanja: `modules/2.4-saradnja-agenata.md` §12.
- Indikator „X gleda / X piše odgovor" na tiketu (Socket.IO prisutnost).
- @spominjanje kolege u internoj bilješci → notifikacija, participant „watcher".
- Posmatrači (watchers): agent ili korisnik se može pretplatiti na tiket.
- Povezani tiketi (related) pored parent/child.

### 2.5 Izvještavanje i analitika  · ~3 RD

> **Status:** završeno i verifikovano na stagingu 2026-09-28 (dizajn d23d849, backend 04ab8f6, sanacija 68b6d26 + 768ef71, frontend 2fdf5af; k6 budžeti ispunjeni; E2E 12, 17, 18 i 19 prolaze nakon ispravki 42070fb i ed912bd). Detalji i odstupanja: `modules/2.5-izvjestavanje-i-analitika.md` §13.
- Zakazani izvještaji e-mailom (sedmično/mjesečno, primaoci, OU scope).
- Dashboard trendova: dolazni vs. riješeni, backlog kroz vrijeme, SLA usklađenost po mjesecu,
  CSAT trend, top servisi.
- Izvoz dashboarda u PDF.

### 2.6 Zaštita ličnih podataka (ZZLP BiH)  · ~2 RD (stvarno ~5 RD) · ✅ (otvoreno samo: odgovori DPO-a, `docs/privacy/DPO-UPITNIK.md`)

> **Status:** ✅ završeno i verifikovano na stagingu 2026-09-28 (dizajn ada739f/2b50b9e; koraci 6aa57f0, a9a0106, 6fb40e7, 7289fb2, eab41d1, a2e8f12, d93c55f; MFA ispravke 837abe1, 90fd41e, 46060a1; E2E 20 prolazi 5/5 nakon 7d5db6c). Operativa: `ops/runbook/privatnost.md`. Detalji i odstupanja: `modules/2.6-zastita-licnih-podataka.md` §17.

- Anonimizacija bivšeg zaposlenika (ime/e-mail → pseudonim u tiketima, porukama, auditu uz
  očuvan hash lanac); zahtjev za izvoz podataka korisnika.
- Politike zadržavanja: poruke, prilozi, audit (settings), s izvještajem šta je obrisano.

### 2.7 Pouzdanost i monitoring  · ~2 RD

> **Status:** ✅ implementirano (dizajn `modules/2.7-pouzdanost-i-monitoring.md`, §8.5–8.6). Runbook: `ops/runbook/ALERTS.md`, eksterni nadzor: `ops/monitoring/uptime-kuma.md`.
- Eksterni uptime monitoring (`/health`, frontend) — upute i konfiguracija (npr. Uptime Kuma).
- Alarmi: DLQ > 0, worker heartbeat izgubljen, SLA skener kasni, disk za priloge > 80 %,
  ClamAV nedostupan, greške 5xx > prag → e-mail/Teams administratorima.
- Status stranica za korisnike (dostupnost servisa već postoji — javni prikaz + historija incidenata).

### 2.8 Pristupačnost i UX kvalitet  · ~3 RD (dizajn: ~4,5 RD)

> **Status:** ✅ završeno i verifikovano na stagingu 2026-09-29 (dizajn c2e8956; koraci e1b644b, 032df93, a308c0a, 5a5226b; axe popravke 41e91ef, 9e9a0d7, 678f4ba, 76fe658, 5a14cc5). E2E 22 prolazi 12/12. Uputstvo: `docs/user-guide/precice-i-pristupacnost.md`; odstupanja: `modules/2.8-pristupacnost-i-ux.md` §11.2.
- WCAG 2.1 AA: navigacija tastaturom, focus stanja, ARIA oznake, screen reader na ključnim
  tokovima (kreiranje tiketa, razgovor, lista); automatski axe test u CI-ju.
- Prečice na tastaturi za agente (sljedeći tiket, odgovori, preuzmi).

### 2.9 Dodatne nadogradnje (prijedlog, po odluci)  · ~4 RD (dizajn: ~7 RD) · ✅ implementirano

> **Status:** dizajn `modules/2.9-dodatne-nadogradnje.md` odobren 2026-09-29 (P1–P11). Implementacija: ✅ sve završeno i potvrđeno na stagingu 2026-09-29 — K4 izvoz/uvoz konfiguracije, K3 dežurstva, K2/K2b najave (e-mail, Teams pripremljen), K1 portal znanja (ocjene 1–5, uvidi, kategorije/FAQ, članak iz odgovora). Obim (odluka 2026-09-29): sve četiri stavke; kod najava samo najave s potvrdom čitanja, bez anketa.

- **Portal znanja za korisnike**: kategorije, „najčešća pitanja", ocjene, članci iz riješenih
  tiketa („pretvori odgovor u članak").
- **Ankete / najave** za korisnike (planirani radovi, nova usluga) uz potvrdu čitanja.
- **Kalendar dežurstava** (on-call) po grupi — SLA eskalacije idu dežurnom.
- **Import/export konfiguracije** između okruženja (staging → produkcija) kao paket.

**Faza 2 ukupno: ~27 RD** (bez 2.9 ~23 RD).

---

## FAZA 3 — Proširenja (ranije van obima)

### 3.1 Microsoft Teams konektor (pun)  · ~6 RD · dizajn: `modules/3.1-teams-konektor.md` · čeka odobrenje (cilj: spremno za aktivaciju, simulator dok tenant ne bude dostupan)
- Teams app / bot (Azure Bot Service ili Graph): notifikacije u kanal grupe i lično korisniku,
  adaptive cards (preuzmi, odgovori, odobri), kreiranje tiketa iz Teamsa.
- Postojeći stub i durable queue su osnova; SSO preko istog Entra tenanta.
- Zavisi od: registracija aplikacije u EPBiH tenantu (IT EPBiH).

### 3.2 CMDB — imovina i konfiguracione stavke  · ~8 RD (dizajn: ~12 RD, pun obim) · dizajn: `modules/3.2-cmdb.md` · ✅ implementirano (E2E 23–28, k6 `assets-list.js`)
- Model: tipovi stavki (računar, štampač, server, aplikacija, licenca…), atributi po tipu,
  vlasnik/korisnik, lokacija/OU, status životnog ciklusa, veze između stavki (zavisi od, instaliran na).
- Veza tiketa sa stavkom (na kreiranju: „moj računar"), historija incidenata po stavci.
- Import (CSV; kasnije sync iz AD računara / Intune ako postoji).
- Permisije i OU scope isto kao za tikete.

### 3.3 Problem management (ITIL)  · ~5 RD · dizajn: `modules/3.3-problem-management.md` · ✅ implementirano (E2E 29–30, k6 `problems-list.js`)
- Problem zapis: povezani incidenti (tiketi), analiza uzroka, workaround, poznata greška
  (Known Error) → KB članak, status i vlasnik, SLA po želji.
- Iz liste tiketa: „kreiraj problem od odabranih".
- Izvještaji: najčešći problemi, vrijeme do rješenja uzroka.

### 3.4 Change management (ITIL)  · ~7 RD · dizajn: `modules/3.4-change-management.md` · odobreno (preporuke prihvaćene) · ✅ implementirano i verifikovano na stagingu 2026-10-02 (E2E 31–32, k6 `changes-list.js`, uputstvo `user-guide/promjene.md`)
- Zahtjev za promjenu: tip (standardna / normalna / hitna), rizik i uticaj, plan implementacije i
  povrata, zahvaćene CMDB stavke i servisi, termin.
- Odobravanje (CAB) — koristi postojeći approvals mehanizam s više odobravalaca.
- Kalendar promjena, konflikti s downtime prozorima servisa (automatsko planiranje
  MAINTENANCE statusa), post-implementacijski pregled.

**Faza 3 ukupno: ~26 RD** (3.1 zavisi od EPBiH tenanta; 3.4 zavisi od 3.2).

---

## Zavisnosti i redoslijed

```
1.1 ─┬─> 1.2 ─> (2.4)
     └─> 1.7
1.5 ─> 2.2 ─> 2.3
1.6 ─> 2.5
1.3, 1.4, 2.1, 2.6, 2.7, 2.8 — nezavisni
3.2 ─> 3.3, 3.4 ;  3.1 — nezavisan (zahtijeva Entra app)
```

Preporučeni tok: 1.1 → 1.5 → 1.6 → 1.2 → 1.3 → 1.7 → 1.4 → (1.8 paralelno s IT-om) →
2.1 → 2.7 → 2.2 → 2.4 → 2.3 → 2.5 → 2.6 → 2.8 → 2.9 → 3.2 → 3.3 → 3.4 → 3.1.

| Faza | Paketi | Procjena |
|---|---|---|
| 1 | 1.1–1.8 | ~17,5 RD |
| 2 | 2.1–2.9 | ~27 RD |
| 3 | 3.1–3.4 | ~26 RD |
| **Ukupno** | 21 paket | **~70 RD** |

## Otvorena pitanja (odgovoriti prije razrade pojedinog paketa)

1. (1.1) Da li „eskalacija" znači samo prosljeđivanje višem nivou ili i automatsku eskalaciju
   (već postoji kroz SLA eskalacije)? Ko definiše „viši nivo" — po grupi ili po servisu?
2. (1.5 / 2.3) ~~Koji sandučić~~ — odlučeno 2026-09-25: oba načina (bez odgovora / zajednički
   sandučić) biraju se u postavkama, provajderi su modularni (O365, Gmail, vlastiti SMTP).
   Otvoreno za 2.3: pristup sandučiću (IMAP ili Microsoft Graph) i ko registruje aplikaciju u tenantu.
3. (2.1) MFA samo za SUPER_ADMIN ili i za ADMIN? (Entra korisnici već imaju MFA kroz Microsoft.)
4. (2.6) Rokovi zadržavanja podataka prema internom pravilniku EPBiH?
5. (3.2) Postoji li postojeći popis imovine (Excel, drugi sistem, Intune) za početni import?
6. (3.4) Postoji li CAB (odbor za promjene) i ko su članovi?
