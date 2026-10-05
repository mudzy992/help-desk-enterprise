# Teze za dokumentaciju

Ovaj dokument je **sirovina za buduću kompletnu dokumentaciju aplikacije**: wiki za korisnike,
agente i administratore, sa svim modulima, funkcionalnostima i uputama. Dok taj wiki ne napišemo,
ovdje bilježimo sve što se ne vidi iz samog ekrana, a mora biti objašnjeno. Tu spadaju razlike
između sličnih opcija, pravila koja sistem provodi, zamke i odgovori na pitanja koja su se već
pojavila.

Kad budemo pisali wiki, svaka teza postaje dio jedne ili više stranica. Tezu je zato važnije
napisati tačno nego lijepo.

---

## 1. Kada se dodaje teza

Tezu dodajemo kada se desi jedno od ovoga:

1. Korisnik ili tester postavi pitanje tipa „nije li to ista opcija?“ ili „zašto ovo ne radi kako
   očekujem?“.
2. Sistem provodi pravilo koje korisnik ne vidi, npr. „status ide samo naprijed“ ili „razlog vide
   samo agenti“.
3. Implementacija odstupa od dizajna ili od uobičajenog ponašanja sličnih aplikacija.
4. Postoji zamka, nešto što se lako pogrešno uradi, uz posljedicu.
5. Ponašanje zavisi od postavke, permisije ili uloge, pa različiti ljudi vide različito.
6. Operativna situacija utiče na korisnika, npr. šta se desi nakon redeploya.

Teza se piše **u istom commitu** u kojem nastaje funkcionalnost ili ispravka, a ne naknadno.

## 2. Kako se teza piše

Svaka teza je jedan odjeljak u §4, sa sljedećim poljima. Obavezna polja su označena sa \*.

```markdown
### T<n> — <kratak naslov u obliku pitanja ili tvrdnje> *

- **Modul / paket:** <npr. Status servisa · 2.7> *
- **Publika:** Korisnik | Agent | Administrator | Operativa (jedna ili više) *
- **Tip:** Razlika | Pravilo | Zamka | Postavka | Operativa | Odstupanje *
- **Teza:** <1–3 rečenice: šta je istina, bez „možda“> *
- **Zašto:** <razlog odluke; korisnik lakše prihvati pravilo kad zna razlog>
- **Primjer:** <konkretna situacija, po mogućnosti iz prakse klijenta>
- **Postavke / permisije:** <ključ postavke (`private.…`) ili permisija (`status.incidents.manage`) i zadana vrijednost>
- **Ekran:** <putanja u meniju, npr. Usluge → (usluga) → Zakaži prekid>
- **Izvori:** <dizajn §, fajl u kodu, commit> *
- **Status:** Važi | Zamijenjena s T<m> | Planirano *
- **Wiki stranica:** <buduća stranica ili stranice; vidi §3>
```

Pravila pisanja:

- **Jezik:** bosanski. Nazivi dugmadi i menija pišu se **tačno kao na ekranu**, podebljano. Ključevi
  postavki i permisija idu u `code`.
- **Jedna teza = jedna tvrdnja.** Ako se tvrdnja grana, pravimo dvije teze i povežemo ih.
- **Bez privremenih detalja:** nema brojeva commita u samoj tezi (oni idu u *Izvori*), nema imena
  test naloga, lozinki ni URL-ova stagingu.
- **Tabela umjesto proze** kada se porede dvije ili više opcija.
- **Zadane vrijednosti se navode uvijek**, jer ih wiki mora prikazati.
- Ako se ponašanje promijeni, teza se **ne briše**. Staroj tezi se stavi `Status: Zamijenjena s T<m>`
  i dopiše nova, pa historija ostaje vidljiva.
- Duži objašnjenja idu u zaseban fajl u `docs/user-guide/`, a teza u *Izvori* upućuje na njega.
- Numeracija je trajna (T1, T2, …) i nikad se ne ponavlja.

## 3. Buduća struktura wikija (cilj)

Teze se raspoređuju u ovu strukturu. Polje *Wiki stranica* koristi ove nazive.

| Dio | Publika | Primjeri stranica |
|---|---|---|
| **1. Početak** | svi | Prijava i MFA, jezik i tema, obavještenja, lična podešavanja |
| **2. Korisnik** | Korisnik | Novi tiket, praćenje tiketa, odgovor i prilozi, ocjena (CSAT), Status servisa, Baza znanja, zaštita podataka (moja prava) |
| **3. Agent** | Agent | Inbox i liste, preuzimanje i prosljeđivanje, mjerenje vremena, šabloni i playbooks, interne bilješke, spajanje i razdvajanje, grupne akcije, incidenti na tiketu |
| **4. Administrator** | Administrator | Korisnici, uloge i permisije, OJ i grupe, katalog usluga i prekidi, SLA i tok statusa, e-mail (sandučići i šabloni), izvještaji, zaštita podataka (zahtjevi, retencija, anonimizacija), Zdravlje sistema i alarmi, Status servisa i incidenti, postavke |
| **5. Operativa** | Operativa | Instalacija i Coolify, backup i DR, monitoring (Uptime Kuma), runbook alarma, ažuriranje verzije, tajne i rotacija |
| **6. Referenca** | svi | Pojmovnik, sve postavke, sve permisije, statusi tiketa, česta pitanja |

Kad wiki bude pisan, **svaka teza sa statusom „Važi“ mora biti pokrivena** barem na jednoj stranici.
To je kriterij kompletnosti.

## 4. Teze

### T1 — „Zakaži prekid“ i „Incident“ nisu ista opcija

- **Modul / paket:** Status servisa, katalog usluga · 2.7
- **Publika:** Administrator, Agent
- **Tip:** Razlika
- **Teza:** Zakazani prekid je **planiran**: ima poznat početak i kraj, nema toka ni obavijesti i ne
  umanjuje dostupnost. Incident je **neplaniran**: ima tok (Istražujemo → Uzrok utvrđen → Pratimo →
  Riješeno), povezuje tikete, šalje obavijesti i, ako mu je uticaj „Prekid rada“, umanjuje dostupnost.
  Incident s uticajem „Održavanje“ koristi se samo za hitno, nenajavljeno održavanje.
- **Zašto:** korisnici trebaju unaprijed vidjeti najavljene radove, a za kvar im treba tok i obavijest
  o rješenju. Kad bi se to miješalo, historija incidenata i procenat dostupnosti bili bi netačni.
- **Primjer:** obnova certifikata u subotu 22–24 h se unosi kroz **Zakaži prekid**. VPN koji je
  iznenada pao ide kroz **Novi incident**.
- **Postavke / permisije:** incidenti traže `status.incidents.manage` (zadano ADMIN, SUPER_ADMIN);
  prekidi traže pravo na katalog usluga; `private.statusPage.enabled` (zadano uključeno).
- **Ekran:** **Usluge → (usluga) → Zakaži prekid**; **Status servisa → Novi incident**.
- **Izvori:** [status-incidenti-i-planirani-prekidi.md](status-incidenti-i-planirani-prekidi.md),
  dizajn [2.7 §8.5](../plans/modules/2.7-pouzdanost-i-monitoring.md)
- **Status:** Važi
- **Wiki stranica:** Administrator → Status servisa i incidenti; Administrator → Katalog usluga i
  prekidi; Korisnik → Status servisa

### T2 — Nakon ažuriranja aplikacije otvoren tab se sam osvježi

- **Modul / paket:** Aplikacija (frontend) · ispravka uz 2.7
- **Publika:** Korisnik, Agent, Administrator, Operativa
- **Tip:** Operativa
- **Teza:** Nakon ažuriranja servera, tab koji je bio otvoren se pri prvom prelasku na drugu stranicu
  **jednom sam osvježi** i učita novu verziju. Ako to ne pomogne (npr. server je nedostupan), prikaže
  se poruka „Dostupna je nova verzija aplikacije“ ili „Stranica se nije mogla učitati“, s dugmetom
  **Osvježi stranicu**. Podaci se ne gube, jer je sve spremljeno na serveru. Izuzetak je tekst koji je
  bio upisan, a nije poslan.
- **Zašto:** svako izdanje ima nove nazive fajlova, a stari se brišu. Bez ovoga je korisnik vidio bijeli
  ekran.
- **Postavke / permisije:** nema. Osigurač: ako se greška ponovi u roku od 30 s, stranica se ne
  osvježava ponovo sama.
- **Izvori:** `frontend/src/lib/app/chunk-reload.ts`, `frontend/nginx.conf` (keširanje
  `index.html` i `/static/`; build folder nije `/assets/` jer je to ruta modula Imovina)
- **Status:** Važi
- **Wiki stranica:** Početak → Česta pitanja; Operativa → Ažuriranje verzije

### T3 — „Zdravlje sistema“ i Uptime Kuma nisu duplikat

- **Modul / paket:** Zdravlje sistema, eksterni monitoring · 2.7
- **Publika:** Administrator, Operativa
- **Tip:** Razlika
- **Teza:** **Zdravlje sistema** je nadzor iznutra. Aplikacija sama provjerava worker, redove, disk,
  ClamAV, 5xx greške i LDAPS, pa javlja alarme e-mailom, u Teams i in-app. **Uptime Kuma** je nadzor
  izvana, na drugom serveru. Javlja kad aplikacija ne može ništa javiti: ugašen server, pao Redis ili
  mreža, istekao certifikat. Potrebna su oba nadzora.
- **Zašto:** alarm ne može poslati sistem koji je ugašen. Kuma na istom serveru pala bi zajedno s njim.
- **Primjer:** nestane struje u server sali. Zdravlje sistema ne javi ništa, a Kuma za 2 min javi da
  su Frontend, API i Worker push nedostupni.
- **Postavke / permisije:** `ops.alerts.receive` (zadano ADMIN, SUPER_ADMIN); env
  `OPS_UPTIME_PUSH_URL` na workeru (zadano prazno, push isključen).
- **Ekran:** **Administracija → Zdravlje sistema**; Uptime Kuma (zaseban URL).
- **Izvori:** `ops/monitoring/uptime-kuma.md`, `ops/runbook/ALERTS.md`, dizajn 2.7 §7 i §8.6
- **Status:** Važi
- **Wiki stranica:** Operativa → Monitoring (Uptime Kuma); Administrator → Zdravlje sistema i alarmi

### T4 — SMTP, dodatak E-mail i „E-mail obavijesti“ nisu isti prekidač

- **Modul / paket:** E-mail obavijesti · 1.5
- **Publika:** Administrator
- **Tip:** Razlika
- **Teza:** E-mail o tiketu se šalje samo kad su uključena **sva tri**: SMTP (`private.smtp.enabled`,
  veza prema mail serveru), dodatak E-mail (`private.addons.email`) i **E-mail obavijesti**
  (`private.notifications.email.enabled`, glavni prekidač za obavijesti o tiketima). SMTP i dodatak
  samo omogućavaju slanje; obavijesti pali tek treći prekidač.
- **Zašto:** SMTP koriste i druge funkcije (reset lozinke, test veze), pa se može uključiti bez
  masovnih obavijesti o tiketima.
- **Primjer:** na stagingu su SMTP i dodatak bili uključeni, a `…email.enabled = false`, pa novi
  tiket nije poslao e-mail agentu, a u tabeli isporuka nije bilo nijednog pokušaja.
- **Postavke / permisije:** `private.notifications.email.enabled` (zadano isključeno).
- **Ekran:** **Postavke → Notifikacije → E-mail**
- **Izvori:** `backend/src/modules/notifications/email/resolve-email-channel-enabled.ts`
- **Status:** Važi
- **Wiki stranica:** Administrator → E-mail (sandučići i šabloni); Referenca → Česta pitanja

### T5 — Kome ide e-mail: interne domene, ograničena dostava i liste izuzetaka

- **Modul / paket:** E-mail obavijesti · ispravka 2026-09
- **Publika:** Administrator, Operativa
- **Tip:** Pravilo
- **Teza:**

  | `internalOnly` („Ograničena isporuka“) | Ko dobija e-mail |
  |---|---|
  | uključeno (zadano) | adrese na **internim domenama** + **dodatne domene** + **pojedinačne adrese** |
  | isključeno | svaka ispravna adresa; liste se ne koriste |

  Interne domene (`internalDomainsCsv`) su postavka, nisu upisane u kod. Dodatna domena otvara
  **svaku** adresu na toj domeni; pojedinačna adresa otvara samo nju. Ista pravila važe za
  provjeru **pošiljaoca dolaznog e-maila** (zajednički sandučić).
- **Zašto:** aplikacija nije vezana za jednog klijenta; ograničenje je zadano uključeno da e-mail
  (koji napušta sistem) ne ode na neplanirane adrese.
- **Primjer:** interna `example.com`, pojedinačne `test.user@gmail.com, test.agent@gmail.com` →
  ti testni nalozi dobijaju e-mail, ostale gmail adrese ne.
- **Zamka:** ograničena dostava s praznim listama (i bez interne domene) ne šalje **nikome**. Kartica
  SMTP u postavkama tada prikazuje upozorenje.
- **Postavke / permisije:** `private.notifications.email.internalOnly` (zadano uključeno),
  `…internalDomainsCsv` (instalacija upisuje domenu super admina; postojeće instalacije dobijaju
  `example.com` migracijom), `…allowedExternalDomainsCsv`, `…allowedExternalEmailsCsv` (zadano prazno).
- **Izvori:** `is-allowed-notification-email-address.ts`, migracija `20261201090000_email_internal_domains`,
  `seed-install-internal-email-domain.ts`
- **Status:** Važi
- **Wiki stranica:** Administrator → E-mail (sandučići i šabloni); Referenca → Sve postavke

### T6 — Gdje stiže privremena lozinka novog korisnika

- **Modul / paket:** Korisnici · 2.1 (ispravka 2026-09)
- **Publika:** Administrator
- **Tip:** Pravilo
- **Teza:** Privremena lozinka se šalje e-mailom samo kada je SMTP podešen **i** adresa prolazi
  pravila o primaocima (T5). U suprotnom se **jednom** prikaže administratoru u UI-ju, da je preda
  korisniku. Pri prvoj prijavi korisnik mora postaviti svoju lozinku.
- **Zašto:** lozinka ne smije otići na adresu izvan dozvoljenih; ranije je išla na bilo koju adresu.
- **Zamka:** kod korisnika s nepostojećom adresom na dozvoljenoj domeni lozinka ode u prazno i ne
  prikaže se. Rješenje je **Resetuj lozinku** nakon ispravke adrese.
- **Izvori:** `backend/src/modules/users/send-temporary-password-email.ts`
- **Status:** Važi
- **Wiki stranica:** Administrator → Korisnici, uloge i permisije

### T7 — Prečice od jednog slova i ko ih ima zadano

- **Modul / paket:** Pristupačnost · 2.8
- **Publika:** Krajnji korisnik, Agent, Administrator
- **Tip:** Pravilo
- **Teza:** Prečice od jednog slova (`N`, `J`, `R`, `G` pa `T`…) su zadano **uključene za agente i
  administratore**, a **isključene za krajnje korisnike**. Svako ih može promijeniti u **Izgled →
  Pristupačnost**; izbor je vezan za nalog. Prečice s `Ctrl` rade uvijek.
- **Zašto:** WCAG 2.1.4 traži da se jednoslovne prečice mogu isključiti (govorni unos, slučajni
  pritisci). Krajnji korisnik ih rijetko treba, a `N` usred rada ga zbuni.
- **Zamka:** prečice ne rade dok je fokus u polju ili je otvoren dijalog. To je namjerno: inače bi
  tipkanje pokretalo radnje.
- **Postavke / permisije:** kolona `User.keyboardShortcuts` (`null` = zadano po ulozi),
  `GET/PATCH /users/me/preferences`. Nije postavka administratora.
- **Izvori:** `frontend/src/lib/shortcuts/catalog.ts`, `backend/src/modules/users/resolve-keyboard-shortcuts.ts`
- **Status:** Važi
- **Wiki stranica:** Korisnik → Prečice i pristupačnost

### T8 — „Sljedeći tiket“ radi unutar stranice liste

- **Modul / paket:** Pristupačnost · 2.8
- **Publika:** Agent
- **Tip:** Ponašanje
- **Teza:** `]` / `[` na detalju tiketa prelaze na susjedni tiket sa **stranice liste koju je agent
  zadnju otvorio** (pamti se samo redoslijed ID-eva u sesiji preglednika). Na kraju stranice
  aplikacija najavi „Kraj stranice liste“; sljedeća stranica se otvara na listi.
- **Zašto:** filteri i stranica liste nisu u adresi (URL), pa detalj ne može sam učitati sljedeću
  stranicu s istim filterima. Automatski prelazak na sljedeći tiket nakon rješavanja nije uveden,
  jer lako preskoči tiket (odluka P7).
- **Zamka:** tiket otvoren direktnim linkom (e-mail, obavijest) nema listu za kretanje.
- **Izvori:** `frontend/src/lib/shortcuts/ticket-list-context.ts`
- **Status:** Važi
- **Wiki stranica:** Agent → Rad na tiketima

### T9 — Rupa u rasporedu dežurstva nema vlasnika dok je neko ne popuni

- **Modul / paket:** Dežurstva · 2.9 (K3)
- **Publika:** Admin, Agent
- **Tip:** Ponašanje
- **Teza:** kad dežurni odustane od smjene bez zamjene, nastaje rupa (gap) i grupa dobija upozorenje.
  Ko rupu popuni (preuzme smjenu), postaje njen vlasnik — nema automatske dodjele.
- **Zašto:** ne smije se desiti da sistem tiho „izabere“ nekoga ko nije dostupan.
- **Zamka:** dok je rupa otvorena, eskalacija „na dežurnog grupe“ pada na samu grupu.
- **Izvori:** `backend/src/modules/on-call/`
- **Status:** Važi
- **Wiki stranica:** Agent → Dežurstva

### T10 — Ograničenja raspona kod zamjene i pregleda dežurstava

- **Modul / paket:** Dežurstva · 2.9 (K3)
- **Publika:** Admin, Agent
- **Tip:** Ograničenje
- **Teza:** zamjena (swap) ili odsustvo se može unijeti za najviše 31 dan odjednom; pregled
  kalendara i računanje rotacije idu najviše 366 dana unaprijed.
- **Zašto:** rotacija se računa, a ne čuva; velike raspone treba razbiti da greška ne pregazi
  mjesecima unaprijed.
- **Izvori:** `docs/plans/modules/2.9-dodatne-nadogradnje.md` §4
- **Status:** Važi
- **Wiki stranica:** Agent → Dežurstva

### T11 — Objavljena najava ne mijenja publiku

- **Modul / paket:** Najave · 2.9 (K2)
- **Publika:** Admin
- **Tip:** Ograničenje
- **Teza:** nakon objave publika, potvrda čitanja i (kad je najava već počela) početak se ne mijenjaju.
  Tekst, težina, prikaz, kraj i usluga se mogu mijenjati; izmjena teksta čuva prethodnu verziju.
- **Zašto:** izvještaj „potvrdilo X od Y“ računa Y u trenutku objave; promjena publike bi ga učinila netačnim.
  Za drugu publiku napravite novu najavu (i po potrebi povucite staru).
- **Izvori:** `backend/src/modules/announcements/announcements.service.ts` (`update`)
- **Status:** Važi
- **Wiki stranica:** Admin → Najave

### T12 — Modal najave se vraća najviše 3 puta

- **Modul / paket:** Najave · 2.9 (K2)
- **Publika:** Svi
- **Tip:** Ponašanje
- **Teza:** prozor najave koja traži potvrdu može se zatvoriti (Esc/„Kasnije“) i vraća se pri sljedećoj
  navigaciji najviše 3 puta u istoj sesiji preglednika; zatim ostaje samo traka. Izmijenjen tekst (nova
  verzija) ponovo pokreće brojanje.
- **Zašto:** WCAG — prozor ne smije zarobiti korisnika niti blokirati prijavu tiketa (odluka P4).
- **Izvori:** `frontend/src/lib/announcements/announcement-view.ts`
- **Status:** Važi
- **Wiki stranica:** Korisnik → Najave

### T13 — E-mail najave poštuje lične postavke, osim za kritične

- **Modul / paket:** Najave · 2.9 (K2b)
- **Publika:** Svi / Administratori
- **Tip:** Ponašanje
- **Teza:** najava ide e-mailom samo ako je autor odabrao „Pošalji i e-mailom“. Korisnik koji je e-mail za
  „Najave“ isključio ga ne dobija nikad. Ko ima sažetak ili tihe sate dobija e-mailom samo **kritične** najave
  (odmah); ostale vidi u aplikaciji. Ako je e-mail kanal isključen kad slanje krene, slanje se prekida i ne
  nastavlja se kasnije.
- **Zašto:** sažetak prikazuje samo tikete; kritična najava (npr. ispad) mora stići odmah. Korisnik je
  tražio da e-mail za najave bude urađen u potpunosti (2026-09-29).
- **Izvori:** `backend/src/modules/announcements/announcement-delivery.service.ts`
- **Status:** Važi
- **Wiki stranica:** Korisnik → Najave; Admin → Najave

### T14 — Teams za najave je pripremljen, a uključuje se postavkom

- **Modul / paket:** Najave · 2.9 (K2b)
- **Publika:** Administratori
- **Tip:** Konfiguracija
- **Teza:** opcija „Objavi i u Teams kanal“ pojavljuje se tek kad je `private.announcements.teamsEnabled`
  uključen i postoji webhook (vlastiti ili onaj od alarma). Kartica ide jednom, kad najava počne; kanal je vide
  svi njegovi članovi, bez obzira na publiku najave.
- **Zašto:** korisnik je tražio da Teams bude spreman za aktivaciju kad Teams bude aktivan (2026-09-29).
- **Izvori:** `backend/src/modules/announcements/announcement-teams-card.ts`, `announcement-teams-url.ts`
- **Status:** Važi
- **Wiki stranica:** Admin → Najave

### T15 — Prvi SuperAdmin je uvijek lokalni nalog

- **Modul / paket:** Instalacija · M1
- **Publika:** Administrator | Operativa
- **Tip:** Pravilo
- **Teza:** Nalog kreiran u instalacijskom koraku 1 je **lokalni** (email + lozinka) i takav ostaje i kada se kao
  način prijave izabere Microsoft Entra AD. Služi kao „break-glass“ ulaz ako vanjski provajder ne radi.
- **Zašto:** sistem mora imati put u aplikaciju koji ne zavisi od Entra/AD dostupnosti; isti razlog je i
  obavezni MFA za administratorske naloge.
- **Primjer:** Nakon instalacije sa Entra prijavom, prekid u federaciji ne zaključava SuperAdmina — on se i dalje
  prijavljuje lokalnom lozinkom.
- **Postavke / permisije:** bez postavke; invarijanta se provodi u kodu (`isLocalOnly`, `applySuperAdminLocalOnlyInvariant`).
- **Ekran:** Instalacija → korak 1 (**SuperAdmin nalog**); kasnije *Sigurnost naloga*.
- **Izvori:** `backend/src/modules/install/create-install-super-admin.ts:46–70`,
  `backend/src/modules/authentication/apply-super-admin-local-only-invariant.ts`
- **Status:** Važi
- **Wiki stranica:** Početak → Instalacija; Početak → Prijava i MFA

### T16 — Instalacijski wizard se otvara samo uz `INSTALL_TOKEN`

- **Modul / paket:** Instalacija · M1
- **Publika:** Operativa
- **Tip:** Zamka
- **Teza:** Dok instalacija nije završena, svaki instalacijski poziv osim javne provjere stanja traži token iz
  okruženja (`INSTALL_TOKEN`, najmanje 16 znakova) u zaglavlju `X-Install-Token`. Ako token nije postavljen,
  wizard je zatvoren — prvi koji dođe na adresu **ne** može sam sebi napraviti SuperAdmina.
- **Zašto:** između deploya i instalacije aplikacija nema nijedan nalog; bez tokena bi svako ko zna adresu mogao
  preuzeti sistem.
- **Primjer:** Svjež staging deploy bez `INSTALL_TOKEN` → ekran prikazuje da token nije podešen; nijedan korak se
  ne može izvršiti dok se vrijednost ne doda u okruženje.
- **Postavke / permisije:** env `INSTALL_TOKEN` (nije postavka u bazi); zaglavlje `X-Install-Token`; token se u
  pregledniku pamti samo za tab.
- **Ekran:** `/install` → **Instalacijski token** → dugme **Otključaj**.
- **Izvori:** `backend/src/modules/install/install-token.ts:13,19,44–60`; `.env.example:28`
- **Status:** Važi
- **Wiki stranica:** Operativa → Instalacija

### T17 — Poslije „Završi“ instalacijski koraci su zaključani

- **Modul / paket:** Instalacija · M1
- **Publika:** Administrator | Operativa
- **Tip:** Pravilo
- **Teza:** Čim se instalacija završi (dugme **Završi**), instalacijski koraci se više ne mogu mijenjati; ostaju
  dostupni samo provjera stanja i katalog dodataka. Sve kasnije izmjene (način prijave, SMTP, dodaci) idu kroz
  administratorske stranice i bilježe se u change log.
- **Zašto:** wizard je neautentifikovan po dizajnu; da ostane otvoren i poslije instalacije, bio bi trajni ulaz za
  preuzimanje sistema.
- **Primjer:** Poslije završene instalacije poziv na korak za SuperAdmina vraća `INSTALL_LOCKED`, a SMTP se mijenja
  u **Admin → Postavke**.
- **Postavke / permisije:** `private.install.completedAt` (postavlja se u koraku 6).
- **Ekran:** Instalacija → korak 6 (**Završi podešavanje**); kasnije Admin → Postavke.
- **Izvori:** `backend/src/modules/install/is-install-wizard-mutation-locked.ts:7–10,35`;
  `backend/src/modules/install/persist-install-completion.ts:21–85`
- **Status:** Važi
- **Wiki stranica:** Operativa → Instalacija

### T18 — SUPER_ADMIN uvijek ima drugi faktor, ADMIN po postavci

- **Modul / paket:** Prijava i MFA · 2.1
- **Publika:** Administrator | Svi korisnici
- **Tip:** Pravilo
- **Teza:** Nalog `SUPER_ADMIN` mora imati upisanu potvrdu u dva koraka (TOTP) — ne može je isključiti. Nalog
  `ADMIN` je obavezan samo dok je uključena postavka za administratore; ostali lokalni nalozi je uključuju sami.
  Nalozi bez lokalne lozinke (Entra) ovdje nemaju obavezu jer drugi faktor vodi Microsoft.
- **Zašto:** najprivilegovaniji nalog je i break-glass ulaz u sistem, pa je drugi faktor na njemu obavezan.
- **Primjer:** ADMIN pokuša isključiti potvrdu u dva koraka → dugme je skriveno, a server vraća
  `MFA_REQUIRED_CANNOT_DISABLE`.
- **Postavke / permisije:** `private.auth.mfa.requiredForAdmins`, `private.auth.mfa.allowOptional`.
- **Ekran:** Prijava → **Potvrda u dva koraka**; Moj profil → **Sigurnost naloga**.
- **Izvori:** `backend/src/modules/authentication/security/account-security-rules.ts:16–22`,
  `security/mfa.service.ts:182–190`
- **Status:** Važi
- **Wiki stranica:** Početak → Prijava i MFA

### T19 — Redoslijed prijave: lozinka → promjena lozinke → drugi faktor

- **Modul / paket:** Prijava i MFA · 2.1
- **Publika:** Svi korisnici
- **Tip:** Pravilo
- **Teza:** Poslije ispravne lozinke prvo ide prisilna promjena lozinke (ako je privremena ili istekla), pa
  potvrda u dva koraka. Međukorak promjene lozinke traje 15 minuta, a međukorak drugog faktora 5 minuta i
  jednokratan je; istekom se vraća na početak prijave.
- **Zašto:** korisnik koji mora promijeniti lozinku ne dobija sesiju prije nego što to uradi, a kratki tokeni
  ograničavaju prozor zloupotrebe.
- **Primjer:** Korisnik sa privremenom lozinkom i uključenom potvrdom prolazi oba koraka prije nego što vidi
  aplikaciju.
- **Postavke / permisije:** bez postavke (konstante u kodu).
- **Ekran:** `/login` — **Promijenite lozinku**, zatim **Potvrda u dva koraka**.
- **Izvori:** `backend/src/modules/authentication/authentication.service.ts:204–271`,
  `authentication.constants.ts:7,11`
- **Status:** Važi
- **Wiki stranica:** Početak → Prijava i MFA

### T20 — Rezervni kodovi se prikazuju jednom i vrijede jednokratno

- **Modul / paket:** Prijava i MFA · 2.1
- **Publika:** Svi korisnici
- **Tip:** Zamka
- **Teza:** Poslije upisa potvrde u dva koraka dobija se 10 rezervnih kodova formata `xxxxx-xxxxx`. Prikazuju se
  samo tada; svaki je jednokratan. Novi kodovi se generišu uz potvrdu kodom iz aplikacije i time stari prestaju
  važiti.
- **Zašto:** rezervni kodovi su jedini ulaz kad telefon nije dostupan; ako se ne sačuvaju, ostaje samo reset kod
  administratora.
- **Primjer:** Korisnik iskoristi jedan rezervni kod pri prijavi — taj kod više ne radi, a preostali broj se vidi
  na **Sigurnost naloga**.
- **Postavke / permisije:** bez postavke; koristi se kod upisa, prijave i regeneracije.
- **Ekran:** Prijava → **Rezervni kodovi** (**Kopiraj**, **Preuzmi .txt**); Moj profil → **Sigurnost naloga** →
  **Novi rezervni kodovi**.
- **Izvori:** `backend/src/modules/authentication/security/recovery-codes.ts:3–26`,
  `security/mfa.service.ts:216–228`
- **Status:** Važi
- **Wiki stranica:** Početak → Prijava i MFA

### T21 — Entra nalozi: drugi faktor vodi Microsoft

- **Modul / paket:** Prijava i MFA · 1.8 / 2.1
- **Publika:** Svi korisnici | Administratori
- **Tip:** Pravilo
- **Teza:** Kada je način prijave `entra_ad`, korisnici se prijavljuju Microsoft nalogom, a pravila pristupa i
  drugi faktor podešava Microsoft; naš TOTP se za te naloge ne primjenjuje (na stranici **Sigurnost naloga** to
  piše umjesto polja za lozinku). Lokalni SuperAdmin ostaje break-glass ulaz.
- **Zašto:** dupliranje drugog faktora bi zbunilo korisnike i oslabilo jedinstvenu politiku pristupa.
- **Primjer:** Korisnik bez lokalne lozinke na **Sigurnost naloga** vidi „Vaš nalog nema lokalnu lozinku —
  lozinkom upravlja Microsoft.“ i nema dugme za upis potvrde.
- **Postavke / permisije:** `private.auth.mode`; `private.auth.entra.*`.
- **Ekran:** `/login` — **Prijava preko Microsoft naloga**; Moj profil → **Sigurnost naloga**.
- **Izvori:** `backend/src/modules/authentication/authentication.service.ts:215–218`,
  `authentication-providers.service.ts:30–59`, `frontend/src/components/account-security/mfa-section.tsx:33–35`
- **Status:** Važi
- **Wiki stranica:** Početak → Prijava i MFA

### T22 — Neuspjela prijava: 5 pokušaja u 15 minuta, bez otkrivanja naloga

- **Modul / paket:** Prijava i MFA · 2.1
- **Publika:** Svi korisnici
- **Tip:** Pravilo
- **Teza:** Neuspjeli pokušaji prijave broje se 15 minuta (5 pokušaja), a poruka je uvijek ista bez obzira na to
  postoji li email adresa. Poslije prekoračenja prijava se odbija 15 minuta; uspješna prijava poništava brojač.
- **Zašto:** sprječava pogađanje lozinke i ne otkriva postoji li nalog.
- **Primjer:** Pet pogrešnih lozinki za isti email daje **429** i poruku o previše pokušaja; tačna lozinka poslije
  toga ne prolazi dok prozor ne istekne.
- **Postavke / permisije:** nije postavka (konstanta); brojač živi u Redisu.
- **Ekran:** `/login` — poruka ispod forme.
- **Izvori:** `backend/src/modules/authentication/login-attempt-limiter.ts:17–30`,
  `frontend/src/i18n/locales/bs/common.json` (`session.errorRateLimited`)
- **Status:** Važi
- **Wiki stranica:** Početak → Prijava i MFA

### T23 — Nalog ima jedan identitet; veza s katalogom je eksplicitna SuperAdmin akcija

- **Modul / paket:** Korisnici, OU i grupe
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Nalog je ili **lokalan** ili **AD-praćen**. Veza s katalogom se uspostavlja isključivo ručno
  (**Poveži sa AD nalogom**, samo SUPER_ADMIN) i nikad automatski po e-mail adresi; **Raskini AD vezu** vraća
  nalog u lokalni i izdaje mu privremenu lozinku koju mora promijeniti pri sljedećoj prijavi.
- **Zašto:** sprječava da nalog s istim e-mailom preuzme historiju tuđeg naloga.
- **Primjer:** Dijalog **Poveži sa katalog identitetom** prikazuje uporedo **Lokalni nalog** i **Katalog
  (AD/manual)** i traži potvrdu oba identiteta.
- **Postavke / permisije:** veza/raskid su SUPER_ADMIN-only (`user-directory-identity.controller.ts:24`).
- **Ekran:** Administracija → **Korisnici** → **Poveži sa AD nalogom** / **Raskini AD vezu**.
- **Izvori:** `backend/src/modules/users/link-user-directory-identity.ts:32–60`,
  `unlink-user-directory-identity.ts:35–52`, i18n `users.linkDirectory*`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Korisnici, OU i grupe

### T24 — OU se ne može obrisati dok ima podređene jedinice ili korisnike

- **Modul / paket:** Korisnici, OU i grupe
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Brisanje organizacione jedinice je blokirano ako jedinica ima podređenih OU-a ili mapiranih
  korisnika. Ostale zavisnosti (grupe, imovina, KB, routing/SLA pravila) u kodu se **ne** provjeravaju — vidi
  poznata ograničenja.
- **Zašto:** čuva integritet stabla i vidljivost tiketa po OU-u.
- **Primjer:** OU s podređenom službom vraća „Organizational unit still has child units“; OU s korisnicima
  „Organizational unit still has mapped users“.
- **Postavke / permisije:** nije postavka; brisanje traži ADMIN ili SUPER_ADMIN.
- **Ekran:** Administracija → **Org. jedinice** → **Obriši**.
- **Izvori:** `backend/src/modules/organizational-units/delete-organizational-unit.ts:20–25`,
  `map-organizational-unit-error.ts:17–31`.
- **Status:** Važi (uz ograničenje B1 iz `REVIEW_ANALIZA.md` §M3)
- **Wiki stranica:** Administracija → Korisnici, OU i grupe

### T25 — Fallback grupa je jedna po OU-u; problemi i promjene se aktiviraju svojom grupom

- **Modul / paket:** Korisnici, OU i grupe
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Grupa može biti **fallback** (najviše jedna po OU-u), **problem-grupa** ili **CAB grupa**. Modul
  problema aktivan je tek kad postoji bar jedna problem-grupa, a modul promjena tek kad postoji bar jedna CAB
  grupa; tiketi iz OJ se dodjeljuju grupama, pa korisnik koji nije u nijednoj grupi te OJ ne dobija te tikete.
- **Zašto:** sprječava „izgubljene“ tikete bez grupe i jasno označava vlasništvo nad problemima/promjenama.
- **Primjer:** Prva grupa s uključenim **Fallback grupa za ovu OJ** gasi fallback na prethodnoj grupi iste OJ;
  brisanje posljednje fallback grupe odbija se porukom `SOLE_FALLBACK_GROUP`.
- **Postavke / permisije:** mutacije traže permisiju `group.manage`.
- **Ekran:** Administracija → **Grupe**.
- **Izvori:** `backend/src/modules/groups/create-group.ts:18–35`, `update-group.ts:18–30`,
  `assert-group-deletable.ts:10–20`, i18n `groups.form.problemGroupHint`/`cabGroupHint`,
  `users.roleGroupCoverageWarning`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Korisnici, OU i grupe

### T26 — Audit trenutno pokriva samo dodjelu i uklanjanje uloga

- **Modul / paket:** Korisnici, OU i grupe
- **Publika:** Administratori
- **Tip:** Ograničenje
- **Teza:** U audit log ulaze `userRoleAssign` i `userRoleRemove`. Kreiranje, izmjena i brisanje korisnika,
  izmjene organizacionih jedinica i izmjene grupa se **ne** bilježe, iako RAW traži audit svih akcija
  (`RAW_PROJECT.md:173`). Dokumentacija zato ne smije tvrditi da su te radnje auditovane.
- **Zašto:** forenzičko istraživanje („ko je obrisao nalog / promijenio OU“) zasad nije moguće iz aplikacije.
- **Primjer:** Nakon brisanja korisnika u audit logu nema zapisa; zapis postoji samo ako mu je prije toga
  dodijeljena/uklonjena rola.
- **Postavke / permisije:** nije postavka.
- **Ekran:** Administracija → **Ops** → audit (nema zapisa za ove radnje).
- **Izvori:** `backend/src/modules/users/assign-user-role.ts:92`, `remove-user-role.ts:35`; prazan `grep`
  `appendAuditLog` u `modules/organizational-units/` i `modules/groups/`.
- **Status:** Privremeno (nalaz B3, `REVIEW_ANALIZA.md` §M3) — mijenja se kad kod dobije audit.
- **Wiki stranica:** Administracija → Korisnici, OU i grupe

### T27 — SuperAdmin ima sve permisije i zaobilazi provjere, ali mora biti lokalni nalog

- **Modul / paket:** RBAC
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Nosilac role **SUPER_ADMIN** prolazi svaku provjeru dozvola (nema potrebe da mu se dodjeljuju
  permisije), ali samo ako je nalog **lokalan** (`isLocalOnly` i bez `entraObjectId`). Za nelokalni nalog
  odluka je odbijena s razlogom `SUPER_ADMIN_NOT_LOCAL_ONLY`, a prijava je već odbijena ranije.
- **Zašto:** SuperAdmin je break-glass nalog; federacija bi ga učinila zavisnim od vanjskog identiteta.
- **Primjer:** Sesija SuperAdmin-a vraća svih 63 permisije; ADMIN bez dodijeljenih permisija vraća 403 na
  rutama koje traže permisiju.
- **Postavke / permisije:** nije postavka.
- **Ekran:** Administracija → **Permisije** (vidljivo samo SuperAdmin-u).
- **Izvori:** `backend/src/modules/authorization/evaluate-authorization-access.ts:120–125`,
  `to-current-session-response.ts:29–35`, `authorization/is-super-admin-authorization.ts:4–18`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Uloge i permisije

### T28 — Scoped dodjela ne zadovoljava provjeru bez scope-a; izuzetak je samo `oncall.read`

- **Modul / paket:** RBAC
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Ako dodjela role ima OU scope, ona **ne može** zadovoljiti rutu koja traži permisiju bez OU scope-a —
  sistem je „fail-closed“. Jedina permisija koja je svjesno izuzeta je `oncall.read` (kalendar dežurstava je
  zajednički).
- **Zašto:** sprječava da permisija dodijeljena za jednu OJ otključa akciju globalno.
- **Primjer:** ADMIN s dodjelom `group.manage` scoped na jednu OJ dobija 403 na `POST /groups` (ruta nema OU
  scope), dok nescoped dodjela prolazi u svim OJ.
- **Postavke / permisije:** `permissionKeys.groupManage`, `scopeAgnosticPermissionKeys`.
- **Ekran:** Administracija → **Grupe** / **Korisnici**.
- **Izvori:** `backend/src/modules/authorization/evaluate-authorization-access.ts:50–68`,
  `authorization.constants.ts:101`.
- **Status:** Važi (posljedice za `group.manage` = nalaz B4, §M4)
- **Wiki stranica:** Administracija → Uloge i permisije

### T29 — Preview uticaja: UI ne dopušta čuvanje bez pregleda, server to još ne zahtijeva

- **Modul / paket:** RBAC
- **Publika:** SUPER_ADMIN
- **Tip:** Pravilo (uz ograničenje)
- **Teza:** Prije promjene permisija role prikazuje se **Pregled uticaja**: broj pogođenih korisnika,
  dodane/uklonjene permisije i uzorak promjena odluke `prije → poslije`. Dugme **Potvrdi i sačuvaj** postoji
  samo u pregledu, a u audit log ulazi diff (`previousPermissionKeys` → `nextPermissionKeys`). Razlog promjene
  se još ne unosi.
- **Zašto:** promjena važi za sve nosioce role i teško se „vidi“ bez simulacije.
- **Primjer:** Isključivanje `routing.write` na roli ADMIN prikazuje koliko korisnika gubi pristup i za njih do
  tri primjera odluke.
- **Postavke / permisije:** nije postavka (ekran je SUPER_ADMIN-only).
- **Ekran:** Administracija → **Permisije** → **Pregled uticaja**.
- **Izvori:** `backend/src/modules/rbac/preview-role-permission-impact.ts:25–70`,
  `replace-role-permissions.ts:46–57`, `frontend/src/components/rbac/permissions-preview-panel.tsx:54–60`.
- **Status:** Važi (uz ograničenje B2: server ne provjerava da je pregled izvršen)
- **Wiki stranica:** Administracija → Uloge i permisije

### T30 — Read-only režim zaključava module; SuperAdmin ga zaobilazi po postavci

- **Modul / paket:** RBAC / pouzdanost
- **Publika:** Administratori
- **Tip:** Pravilo
- **Teza:** Kad je read-only režim aktivan za modul (admin, settings, routing, service\_catalog,
  service\_forms, sla), svaka mutirajuća metoda na tim rutama se odbija uz `READ_ONLY_MODE`; čitanje radi.
  Izuzetak su POST rute koje su po prirodi čitanje (`/directory-sync/read`, `/policy-packs/validate`). Role iz
  postavke `private.readOnlyMode.bypassRoles` (default SUPER_ADMIN) nisu blokirane.
- **Zašto:** dozvoljava „zamrzavanje“ konfiguracije bez prekidanja rada.
- **Primjer:** Dok je zaključan modul **settings**, čuvanje izmjena u Postavkama vraća 403 s kodom
  `READ_ONLY_MODE`.
- **Postavke / permisije:** `private.readOnlyMode.enabled`, `private.readOnlyMode.modulesCsv`,
  `private.readOnlyMode.activeModulesCsv`, `private.readOnlyMode.bypassRolesCsv`.
- **Ekran:** Administracija → **Postavke**.
- **Izvori:** `backend/src/modules/authorization/read-only-mode.constants.ts:3–89`,
  `evaluate-admin-read-only-access.ts:11–58`, `authorization.module.ts:25–28`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Uloge i permisije

### T31 — Default mapping rola → permisije upisuje se pri instalaciji, a seed je aditivan

- **Modul / paket:** RBAC
- **Publika:** SUPER_ADMIN / instalater
- **Tip:** Pravilo
- **Teza:** U instalacijskom koraku 4 (*Početni podaci*) sistem upisuje sedam sistemskih rola i njihove default
  permisije iz `defaultRolePermissionKeys` (USER 4, AGENT 22, ADMIN 58, SUPER_ADMIN 63, ASSET_MANAGER 6,
  PROBLEM_MANAGER 4, CHANGE_MANAGER 4 — ukupno 161 veza). Isti seed se poziva i pri ponovljenom koraku
  čarobnjaka. Postupak je **aditivan i idempotentan**: dodaje role, `Permission` redove i `RolePermission` veze
  koje nedostaju, a **nikad ne briše**. Zato permisija koju je administrator svjesno uklonio može biti vraćena
  ako se seed ponovo pokrene — zato CLI ima `--dry-run` koji ispiše spisak prije upisa.
- **Zašto:** dokumentacija mora pokazati i da su defaulti aktivni odmah i da seed ne „poštuje“ ručno uklonjene
  permisije; to je cijena idempotencije i korisnik je mora znati prije nego pokrene alat.
- **Primjer:** Svježa instalacija — rola ADMIN odmah nosi `group.manage` i `settings.write` (akcija prolazi
  ako dodjela role nije ograničena OU scope-om — vidi T28), rola USER nosi `ticket.message.send`. Postojeća instalacija bez permisija — `npm run cli:seed-role-permissions --dry-run`
  ispiše npr. `ADMIN: existing 0, would add 58`, pa se bez `--dry-run` upiše i ostavlja audit zapis.
- **Postavke / permisije:** `defaultRolePermissionKeys`, `authorizationRoleNames`, `permissionKeys.groupManage`,
  `settings.write`.
- **Ekran:** Instalacija → korak 4 (**Početni podaci**); Administracija → **Permisije**.
- **Izvori:** `backend/src/modules/install/seed-install-minimum.ts:27–31`;
  `backend/src/modules/rbac/seed-default-role-permissions.ts:52–133`;
  `backend/src/cli/seed-default-role-permissions.ts:26–75`;
  `backend/src/modules/authorization/authorization.constants.ts:21–30`;
  `backend/src/modules/users/ensure-system-role.ts:2–14`.
- **Status:** Riješeno (val 0, nalaz B1 iz `REVIEW_ANALIZA.md` §M4 — prije popravke mapping se nije upisivao)
- **Wiki stranica:** Administracija → Uloge i permisije

### T32 — Paket politika dodjeljuje role i permisije scoped na ciljnu OJ/servis, uz idempotenciju i audit

- **Modul / paket:** Policy paketi
- **Publika:** SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Primjena paketa je transakciona i idempotentna: osigurava zapis paketa, role i permisije
  (`RolePermission`), veže `policyPackId` na organizacionu jedinicu (i na servis ako je izabran) i za prosleđene
  korisnike kreira dodjele rola sa scope-om iz definicije paketa. Ponovna primjena ne pravi duplikate; sve ulazi
  u audit (`policy_pack.apply`), a keš dozvola pogođenih korisnika se invalidira odmah nakon commita.
- **Zašto:** standardizacija pristupa između službi bez ručnog rada i bez duplih zapisa.
- **Primjer:** Primjena **IT Standard** na OJ kreira/upotpuni permisije rola ADMIN i AGENT i veže paket na OJ;
  drugi klik prijavljuje postojeće zapise, bez novih duplikata.
- **Postavke / permisije:** `permissionKeys.settingsWrite` (API); UI: samo SuperAdmin.
- **Ekran:** Administracija → **Korisnici** → **Paketi politika** → **Primijeni paket**.
- **Izvori:** `backend/src/modules/policy-packs/apply-policy-pack.ts:19–79`,
  `apply-policy-pack-user-grants.ts:16–57`, `bind-policy-pack-targets.ts:5–22`,
  `ensure-policy-pack-catalog.ts:48–104`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Policy paketi

### T33 — Tri default paketa nose samo permisije; SLA, obavezna polja i odobrenja još nisu dio primjene

- **Modul / paket:** Policy paketi
- **Publika:** SUPERADMIN / administratori
- **Tip:** Ograničenje
- **Teza:** `PACK_IT_STANDARD`, `PACK_HR_RESTRICTED` i `PACK_FINANCE_RESTRICTED` postoje, ali njihov sadržaj su
  **isključivo** grantovi (rola + permisije + OU/servis scope). Polja `defaultClassification` i
  `requiresApproval` se zapisuju na paket, a `slaProfileId` u šemi se ne postavlja; nijedan tok tiketa, servisa
  ili SLA ih ne čita. Dokumentacija ne smije tvrditi da paket mijenja SLA, obavezna polja ili odobrenja.
- **Zašto:** sprječava pogrešna očekivanja administratora.
- **Primjer:** Nakon primjene **HR Restricted**, novi tiketi u toj OJ nemaju automatski drukčiju SLA politiku ni
  obavezna polja.
- **Postavke / permisije:** `defaultRolePermissionKeys` (sadržaj grantova).
- **Ekran:** Administracija → **Korisnici** → **Paketi politika**.
- **Izvori:** `backend/src/modules/policy-packs/policy-pack.types.ts:14–21`,
  `policy-pack.registry.ts:14–92`, `backend/prisma/schema/identity.prisma:212–225`.
- **Status:** Privremeno (nalaz B1, `REVIEW_ANALIZA.md` §M5)
- **Wiki stranica:** Administracija → Policy paketi

### T34 — Primjena paketa je jednosmjerna; povlačenje ne postoji

- **Modul / paket:** Policy paketi
- **Publika:** SUPERADMIN
- **Tip:** Ograničenje
- **Teza:** Ne postoji `unapply`: paket se može primijeniti, ali ne i povući. `policyPackId` na OJ/servisu se
  postavlja, a dodjele kreirane paketom su obični `UserRole` zapisi koji se ne razlikuju od ručnih. Jedini način
  da se efekat ukloni je ručno uklanjanje dodjela (**Korisnici → Upravljaj ulogama → Ukloni**) i ručna izmjena
  permisija role (**Permisije**).
- **Zašto:** administrator mora znati da greška pri primjeni ostaje trajno.
- **Primjer:** Paket primijenjen na pogrešnu OJ ostavlja role i permisije na toj OJ dok se ručno ne uklone.
- **Postavke / permisije:** `policyPackId` na `OrganizationalUnit`/`Service`.
- **Ekran:** Administracija → **Korisnici** → **Paketi politika** (nema akcije povlačenja).
- **Izvori:** `bind-policy-pack-targets.ts:10–22`, `apply-policy-pack-user-grants.ts:42–49`,
  `policy-packs.controller.ts:40–69` (nema DELETE rute).
- **Status:** Privremeno (nalaz B5, `REVIEW_ANALIZA.md` §M5)
- **Wiki stranica:** Administracija → Policy paketi

### T35 — Paket ne može dodijeliti SUPER_ADMIN ni permisiju van default mappinga role

- **Modul / paket:** Policy paketi
- **Publika:** SUPERADMIN
- **Tip:** Pravilo
- **Teza:** Definicija paketa se provjerava prije primjene: grant za `SUPER_ADMIN` je zabranjen
  (`SUPER_ADMIN_GRANT_FORBIDDEN`), dozvoljene su samo role USER/AGENT/ADMIN, a svaka permisija mora postojati u
  katalogu i biti u `defaultRolePermissionKeys` te role (`PERMISSION_NOT_ALLOWED_FOR_ROLE`). Paket zato ne može
  biti put da rola dobije dozvolu koju joj standardni mapping ne predviđa.
- **Zašto:** čuva granicu između paketa i SuperAdmin ovlaštenja.
- **Primjer:** Paket koji bi roli AGENT dodijelio `audit.export` odbija se s
  `PERMISSION_NOT_ALLOWED_FOR_ROLE`.
- **Postavke / permisije:** `defaultRolePermissionKeys`, `allPermissionKeys`.
- **Ekran:** Administracija → **Korisnici** → **Paketi politika**.
- **Izvori:** `backend/src/modules/policy-packs/assert-policy-pack-definition.ts:29–71`,
  `map-policy-pack-error.ts:9–29`.
- **Status:** Važi
- **Wiki stranica:** Administracija → Policy paketi

### T36 — Životni ciklus usluge: Nacrt, Aktivna, Ukinuta — i vidljivost

- **Modul / paket:** Katalog usluga i forme
- **Publika:** ADMIN / SUPER_ADMIN (uređivanje), svi (prijava tiketa)
- **Tip:** Pravilo
- **Teza:** Usluga ima lifecycle `DRAFT|ACTIVE|DEPRECATED`; dozvoljeni su samo prelazi Nacrt → Aktivna,
  Aktivna → Ukinuta i Ukinuta → Aktivna. Korisnicima se nude isključivo **Aktivne** usluge; Nacrt je predviđen
  da bude vidljiv samo adminima, a Ukinuta ostaje u administraciji i izvještajima. Brisanje je moguće samo za
  Nacrt bez zavisnih zapisa (tiketi, verzije forme, routing pravila, dodjele rola).
- **Zašto:** jasno razdvaja pripremu, upotrebu i ukidanje usluge.
- **Primjer:** Nacrt se ne pojavljuje korisniku u izboru usluga; poslije **Aktiviraj** pojavljuje se, a poslije
  **Označi zastarjelim** nestaje iz izbora, ali stari tiketi ostaju.
- **Postavke / permisije:** `service.catalog.write`; `private.services.lifecycle.*`.
- **Ekran:** **Katalog usluga** → kartica usluge → **Aktiviraj** / **Označi zastarjelim** / **Vrati u aktivno** /
  **Obriši nacrt**.
- **Izvori:** `backend/src/modules/service-catalog/service-catalog.constants.ts:4–16`,
  `assert-service-lifecycle-transition.ts:6–34`, `transition-service-lifecycle.ts:114–158`,
  `delete-service.ts:56–98`.
- **Status:** Važi (uz ograničenje B2: serverski filter vidljivosti nacrta ne postoji)
- **Wiki stranica:** Katalog usluga → Životni ciklus

### T37 — Jedna forma po usluzi, s verzijama; stari tiketi čuvaju svoju verziju

- **Modul / paket:** Katalog usluga i forme
- **Publika:** ADMIN
- **Tip:** Pravilo
- **Teza:** Usluga ima najviše jednu formu (drugi `POST .../form` se odbija), a forma ima verzije
  `DRAFT|ACTIVE|RETIRED` numerisane redom. Novi tiketi koriste najnoviju **aktivnu** verziju; svaki tiket trajno
  pamti verziju s kojom je kreiran. Verzija koja nije Nacrt ili ima bar jedan tiket je **nepromjenjiva**; izmjena
  se radi kroz novu verziju (**Nova verzija iz odabrane**). Aktivacija nacrta penzioniše prethodne aktivne verzije
  osim ako postavka dozvoljava više aktivnih.
- **Zašto:** izmjena forme ne smije mijenjati značenje istorijskih tiketa.
- **Primjer:** Poslije aktivacije verzije 2, tiket kreiran uz verziju 1 i dalje prikazuje broj verzije 1 i svoja
  polja; uređivanje verzije 1 je odbijeno.
- **Postavke / permisije:** `service.forms.write`; `private.ticket.forms.versioning.*`.
- **Ekran:** **Katalog usluga** → **Uredi formu** → **Verzije forme** → **Kreiraj formu**, **Sačuvaj nacrt**,
  **Aktiviraj verziju**, **Nova verzija iz odabrane**.
- **Izvori:** `backend/src/modules/service-catalog/create-service-form.ts:24–57`,
  `create-service-form-version.ts:120–140`, `is-form-version-immutable.ts:32–37`,
  `activate-service-form-version.ts:57–97`, `select-active-form-version-ref.ts:4–17`,
  `backend/prisma/schema/catalog.prisma:79–94`.
- **Status:** Važi
- **Wiki stranica:** Katalog usluga → Forme i verzije

### T38 — Šema forme: tipovi polja, ograničenja i gdje se šta validira

- **Modul / paket:** Katalog usluga i forme
- **Publika:** ADMIN
- **Tip:** Pravilo
- **Teza:** Šema forme je `schemaVersion: 1` s najviše 64 polja; tipovi su tekst, dugi tekst, broj, da/ne, izbor,
  višestruki izbor, datum, datum i vrijeme i email. Identifikator polja prati `^[a-z][a-z0-9_]{0,63}$`, oznaka
  (do 128) i redoslijed su obavezni, redoslijed i identifikatori moraju biti jedinstveni, a tipovi izbora
  zahtijevaju opcije (do 64). **Server validira šemu** pri kreiranju i izmjeni nacrta, ali **ne validira
  vrijednosti** koje korisnik pošalje uz tiket — to radi samo ekran za prijavu (vidi ograničenje B1).
- **Zašto:** sprječava neispravne šeme i objašnjava granicu odgovornosti.
- **Primjer:** Polje s identifikatorom `Dodatne Informacije` se odbija; `dodatne_informacije` prolazi.
- **Postavke / permisije:** `service.forms.write`; `private.ticket.forms.enabled`, `requireStructuredFields`.
- **Ekran:** **Uredi formu** → **Dodaj polje** (Identifikator, Oznaka, Tip, Obavezno, Placeholder, Pomoćni
  tekst, Opcije, Gore/Dolje, Ukloni).
- **Izvori:** `backend/src/modules/service-catalog/form-schema.constants.ts:1–23`,
  `parse-form-schema.ts:11–32`, `parse-form-field.ts:13–84`, `parse-form-field-validation.ts:14–105`,
  `backend/src/modules/tickets/to-ticket-form-data-input.ts:3–8`.
- **Status:** Važi (uz ograničenje B1)
- **Wiki stranica:** Katalog usluga → Forme i verzije

### T39 — Obavezna polja se provjeravaju pri rješavanju/zatvaranju, ne pri kreiranju tiketa

- **Modul / paket:** Katalog usluga i forme
- **Publika:** AGENT / ADMIN
- **Tip:** Pravilo
- **Teza:** Pri prelasku tiketa u **Riješeno** ili **Zatvoreno** backend provjerava: close code (ako je
  konfigurisan), resolution note, globalnu listu obaveznih polja, listu po usluzi (`byService`) i — ako je
  `enforceSchemaRequiredFields` uključen — `required` polja iz šeme vezane za tiket. Ako nešto nedostaje, tiket
  se **ne** može zatvoriti; greška sadrži listu polja. Pri **kreiranju** tiketa obaveznost iz forme provjerava
  samo ekran za prijavu.
- **Zašto:** podaci ne smiju ostati nepotpuni u trenutku zatvaranja, a korisnik ne smije biti blokiran u
  prijavi.
- **Primjer:** Ako je polje `asset_tag` obavezno, agent ne može preći u Riješeno dok ga ne popuni.
- **Postavke / permisije:** `private.workflow.requiredFields.*`, `private.ticket.forms.requireStructuredFields`.
- **Ekran:** detalj tiketa → promjena statusa u **Riješeno**/**Zatvoreno**.
- **Izvori:** `backend/src/modules/tickets/required-fields/collect-missing-required-fields.ts:11–66`,
  `read-form-schema-fields.ts:4–10`, `backend/src/modules/tickets/close-codes/apply-ticket-resolution.ts:34–53`.
- **Status:** Važi
- **Wiki stranica:** Katalog usluga → Obavezna polja

### T40 — Onboarding čarobnjak: pet koraka i šta finalizacija postavlja

- **Modul / paket:** Katalog usluga i forme
- **Publika:** ADMIN
- **Tip:** Pravilo
- **Teza:** Novoizgrađena usluga (Nacrt) prolazi kroz korake **Servis → Forma → Usmjeravanje → SLA → Odobrenja**.
  Koraci se popunjavaju redom, a finalizacija zahtijeva da su svi završeni i da je forma aktivna
  (`INVALID_FORM_VERSION_REF` inače). Kod uspjeha usluga prelazi u **Aktivna**, dobija izabrani **SLA profil** i
  usklađeno „Zahtijeva odobrenje“, a ako nema routing pravila vraća se upozorenje o nepokrivenom usmjeravanju.
- **Zašto:** usluga ne ulazi u upotrebu polupripremljena.
- **Primjer:** Bez aktivne forme finalizacija prijavljuje listu problema i usluga ostaje Nacrt.
- **Postavke / permisije:** `service.catalog.write`; `private.serviceOnboarding.*`.
- **Ekran:** **Usluge i znanje → Katalog usluga → Onboarding čarobnjak**.
- **Izvori:** `backend/src/modules/service-onboarding/service-onboarding.constants.ts:7–28`,
  `validate-onboarding-steps.ts:85–108`, `finalize-service-onboarding.ts:37–135`.
- **Status:** Važi
- **Wiki stranica:** Katalog usluga → Onboarding čarobnjak

### T41 — Status dostupnosti i prekidi ne blokiraju prijavu tiketa

- **Modul / paket:** Katalog usluga i forme
- **Publika:** svi korisnici (informacija), ADMIN (uređivanje)
- **Tip:** Pravilo
- **Teza:** Usluga ima status `OPERATIONAL|DEGRADED|DOWN|MAINTENANCE` i opciono zakazane prozore prekida.
  Efektivna dostupnost se računa u trenutku čitanja (aktivni prozor može podići status na Održavanje), a
  kreiranje tiketa je **uvijek dozvoljeno** — status je informativan i prikazuje se uz uslugu. Prozori se ne
  smiju preklapati, a promjena statusa i otkazivanje prozora zahtijevaju razlog ako je tako konfigurisano.
- **Zašto:** korisnik mora biti obaviješten, ali ne spriječen da prijavi problem.
- **Primjer:** Tokom zakazanog prekida kartica usluge pokazuje „Održavanje“ i napomenu da prijava nije
  blokirana; tiket se kreira normalno.
- **Postavke / permisije:** `service.availability.write`; `private.services.availability.*`,
  `private.services.downtimeScheduling.*`.
- **Ekran:** **Katalog usluga** → **Zakaži prekid** / izmjena statusa (**Dostupno**, **Smanjena**,
  **Nedostupno**, **Održavanje**).
- **Izvori:** `backend/src/modules/service-catalog/evaluate-service-runtime-availability.ts:48–80`,
  `service-availability.service.ts:26–60`, `create-service-downtime-window.ts:32–40`,
  `normalize-change-reason.ts:4–19`, `backend/prisma/schema/catalog.prisma:62–77`.
- **Status:** Važi
- **Wiki stranica:** Katalog usluga → Dostupnost i prekidi

### T42 — Rutanje je deterministička odluka iz para (origin OU + usluga)

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** ADMIN / SUPER_ADMIN (uređivanje), svi (posljedica pri kreiranju tiketa)
- **Tip:** Pravilo
- **Teza:** Novi tiket dobija **grupu** (nikad agenta) na osnovu para *organizacijska jedinica porijekla +
  usluga*. Motor hoda lanac od OU-a prema korijenu: prvi pogođeni predak daje grupu; pogodak na samoj OU je
  ishod **Tačno**, pogodak na pretku **Naslijeđeno**, a bez pogotka tiket je **UNROUTED**. Isti ulaz uvijek daje
  isti ishod, a uz odluku uvijek idu `fallbackDepth`, `fallbackPath` i `matchedRuleId` (bez njih admin ne bi
  mogao objasniti zašto je tiket otišao baš tamo).
- **Zašto:** rutanje ne smije zavisiti od trenutka, opterećenja ni od agenta na dužnosti.
- **Primjer:** Usluga „VPN“ ima pravilo za OU „Zenica“. Tiket korisnika iz podjedinice Zenice ide toj grupi s
  ishodom **Naslijeđeno**; tiket iz OU-a bez pravila u lancu ide u neusmjereni red.
- **Postavke / permisije:** `private.ticket.unroutedQueue.*`, `private.ticket.routing.requireCoverage`; čitanje
  ruta traži rolu ADMIN, izmjene i `routing.write`.
- **Ekran:** **Administracija → Usmjeravanje** → tab **Test rezolucije**.
- **Izvori:** `backend/src/modules/routing/resolve-ticket-routing.ts:11–89`,
  `load-organizational-unit-ancestors.ts:5–38`, `routing.constants.ts:1–5`,
  `backend/src/modules/tickets/apply-create-ticket-routing.ts:7–37`.
- **Status:** Važi
- **Wiki stranica:** Usmjeravanje → Kako se odlučuje grupa

### T43 — Pravilo usmjeravanja: jedinstven par (OU + servis), obavezan razlog, before/after zapis

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Za jedan par (origin OU + usluga) postoji **najviše jedno** pravilo; drugi unos se odbija kao
  duplikat. Svaka izmjena i brisanje traže **razlog izmjene**, izvode se u transakciji i ostavljaju zapis u
  change logu s akterom i **before/after rezolucijom**; brisanje se prije potvrde može provjeriti kroz prikaz
  „prije → poslije“ (koja bi grupa tada preuzela tiket).
- **Zašto:** promjena rutanja je operativno osjetljiva — mora biti objašnjiva i provjerljiva unaprijed.
- **Primjer:** Brisanje pravila za (OU Finansije + usluga Računi) prikazuje da bi tiket poslije brisanja pao na
  pravilo matične OU ili u neusmjereni red.
- **Postavke / permisije:** `routing.write` + OU scope (`originUnitId`) + service scope (`serviceId`).
- **Ekran:** **Administracija → Usmjeravanje** → **Pravila** (**Novo pravilo**, **Uredi**, **Obriši**).
- **Izvori:** `backend/prisma/schema/catalog.prisma:116–130`, `create-routing-rule.ts:9–28`,
  `persist-routing-rule-change.ts:20–59`, `update-routing-rule.ts:21–79`, `delete-routing-rule.ts:27–94`,
  `assert-routing-rule-scope.ts:4–20`, `assert-routing-targets-exist.ts:4–48`,
  `read-required-routing-reason.ts:8–20`.
- **Status:** Važi
- **Wiki stranica:** Usmjeravanje → Pravila

### T44 — Matrica pokrivanja i blokada aktivacije bez pokrića

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Matrica pokrivanja prikazuje sve kombinacije (usluga × OU) i za svaku označava da li pravilo postoji
  **tačno**, da li je **naslijeđeno** ili je kombinacija **neusmjereno** (rupa), uz statistiku i detalj putanje
  fallbacka. Ako je postavka `requireCoverage` uključena, usluga se **ne može aktivirati** bez ijednog pravila;
  ako je isključena, dobija se samo meko upozorenje `ROUTING_COVERAGE_MISSING`.
- **Zašto:** aktivacija usluge bez rutanja proizvodi neusmjerene tikete od prvog dana.
- **Primjer:** Usluga bez pravila pri prelasku u **Aktivna** vraća grešku i ostaje u nacrtu.
- **Postavke / permisije:** `private.ticket.routing.requireCoverage`; rola ADMIN za pregled.
- **Ekran:** **Administracija → Usmjeravanje** → tab **Matrica pokrivanja**.
- **Izvori:** `backend/src/modules/routing/compute-routing-coverage.ts:12–54`,
  `evaluate-service-routing-coverage.ts:12–34`, `service-catalog.service.ts:154–155`,
  `config-versioning/validate-routing-snapshot.ts:57–58`.
- **Status:** Važi (uz ograničenje B1: matrica nema filtere i uključuje neaktivne usluge)
- **Wiki stranica:** Usmjeravanje → Matrica pokrivanja

### T45 — Neusmjereni red: ciljna grupa, vlasnik, rok i digest

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** ADMIN / SUPER_ADMIN (podešavanje), SUPER_ADMIN (vlasnik reda po pravilu)
- **Tip:** Pravilo
- **Teza:** Tiket bez pronađenog pravila **nikad se ne izgubi**: ili ostaje u statusu `UNROUTED`, ili — ako je
  podešena **ciljna grupa** — dobija status `PENDING` u toj grupi s oznakom da je preusmjeren. Red ima
  **vlasničku rolu**, **rok obrade** (`cleanupSlaHours`, 0 isključuje upozorenja) i opciju **sedmičnog digest-a**;
  prekoračenje roka šalje jedno upozorenje po tiketu (bez ponavljanja) i ponedjeljkom u 08:00 zbirni pregled.
- **Zašto:** „rupa u rutanju“ mora biti vidljiva i imati vlasnika, a ne tiho izgubljena.
- **Primjer:** Tiket iz OU-a bez pravila stoji 9 sati u neusmjerenom redu (rok je 8 h) → vlasnička rola dobija
  upozorenje; ponedjeljak u 08:00 dobija i zbirni pregled svih takvih tiketa.
- **Postavke / permisije:** `private.ticket.unroutedQueue.enabled|ownerRole|targetGroupId|cleanupSlaHours|weeklyDigest`.
- **Ekran:** **Grupni inbox** → tab **Neusmjereni red**; filter **Nerutirani preko roka** u listi tiketa; bedž na
  nadzornoj ploči.
- **Izvori:** `backend/src/modules/tickets/unrouted/build-unrouted-overdue-where.ts:8–26`,
  `unrouted-sweep.job.constants.ts:6–18`, `unrouted-sweep.service.ts:40–95`, `counts/counts.types.ts:22–33`,
  `list/build-ticket-list-filters.ts:81–88`.
- **Status:** Važi (uz B4: tab prikazuje samo status `UNROUTED`, dok upozorenja uključuju i preusmjerene tikete)
- **Wiki stranica:** Usmjeravanje → Neusmjereni red

### T46 — Prioritet: matrica uticaj × hitnost, ručni override s auditom

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** svi (izračun), AGENT/ADMIN (override uz permisiju)
- **Tip:** Pravilo
- **Teza:** Prioritet tiketa se izvodi iz para **uticaj × hitnost** po matrici koju admin uređuje; ako ćelija
  nije podešena, koristi se ugrađena formula (zbir rangova). Ručna promjena zamjenjuje matricu, traži
  **razlog**, upisuje se u change log i audit (`from`, `to`, `resetToMatrix`) i **preračunava SLA rokove**;
  dugme **Vrati na matricu** vraća izračunatu vrijednost. Matrica se ponovo primjenjuje samo kad se promijeni
  uticaj ili hitnost i tiket nije ručno postavljen.
- **Zašto:** prioritet mora biti predvidiv, a svako odstupanje objašnjivo i popravljivo.
- **Primjer:** Agent podigne hitnost s Niske na Kritičnu: prioritet skoči iz matrice; prethodno ručno postavljen
  prioritet ostaje nepromijenjen dok ga agent eksplicitno ne vrati na matricu.
- **Postavke / permisije:** `ticket.priority.override`; izmjena matrice traži `sla.write` (ekran **SLA**).
- **Ekran:** detalj tiketa → **Promjena prioriteta**; **Administracija → SLA → Matrica prioriteta**.
- **Izvori:** `backend/src/modules/tickets/resolve-ticket-priority.ts:22–34`,
  `calculate-ticket-priority.ts:8–23`, `priority/override-ticket-priority.ts:41–134`,
  `update-ticket.ts:139–164`, `backend/src/modules/sla/list-priority-matrix.ts:24–50`,
  `sla/patch-priority-matrix.ts:30–60`, `backend/prisma/schema/catalog.prisma:132–141`.
- **Status:** Važi (uz B5: nema prekidača za matricu)
- **Wiki stranica:** Usmjeravanje → Prioritet i matrica

### T47 — Konfiguracija rutanja: žive postavke, validacija snapshot-a, realtime i read-only

- **Modul / paket:** Usmjeravanje i prioritet
- **Publika:** ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Rutanje čita šest živih postavki (pet za neusmjereni red i `requireCoverage`); loader je strog i
  neispravnu vrijednost pretvara u grešku `UNAVAILABLE`, dok je loader neusmjerenog reda tolerantan i pada na
  zadate vrijednosti. Rutanje i matrica prioriteta ulaze u konfiguracioni snapshot i prolaze validaciju bez
  side-effecta; promjena kroz administraciju šalje adminima realtime događaj `admin.config.updated`, a modul se
  može zaključati režimom samo za čitanje. Postavke `private.ticket.routing.fallbackGroupId` i
  `private.routing.strictOuIsolation` **namjerno ne postoje** (zamijenjene su ciljnom grupom i scope
  dekoratorima).
- **Zašto:** konfiguracija mora biti provjerljiva prije primjene, a neispravna vrijednost ne smije srušiti
  kreiranje tiketa.
- **Primjer:** Neispravna vrijednost `requireCoverage` daje `RoutingError UNAVAILABLE` i kreiranje tiketa se
  zaustavlja s `ROUTING_UNAVAILABLE`, umjesto da tiket tiho prođe bez rutanja.
- **Postavke / permisije:** `private.ticket.unroutedQueue.*`, `private.ticket.routing.requireCoverage`,
  `private.readOnlyMode.modulesCsv`, `private.configVersioning.scopesCsv`.
- **Ekran:** **Administracija → Postavke** (kartica neusmjerenog reda) i **Administracija → Verzije konfiguracije**.
- **Izvori:** `backend/src/modules/settings/setting-keys.ts:103–108`,
  `settings/definitions/ticket-routing-settings.ts:7–60`, `settings/routing-dead-settings.spec.ts:7–33`,
  `routing/routing-configuration.loader.ts:12–45`, `unrouted/unrouted-queue-configuration.loader.ts:9–53`,
  `common/admin-realtime/admin-config-domain.decorator.ts:7–16`,
  `config-versioning/validate-routing-snapshot.ts:57–58`.
- **Status:** Važi (B2 zatvoren 2026-10-05: postavke `private.changeLog.*` bez potrošača su uklonjene iz registra, a dnevnik izmjena se i dalje upisuje — razlog se traži u kodu toka)
- **Wiki stranica:** Usmjeravanje → Postavke i konfiguracija

### T48 — Tok statusa tiketa je podatak, a ne niz uslova

- **Modul / paket:** Tiketi
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Dozvoljeni prelasci statusa definisani su kao tabela s akterom (`STAFF|REQUESTER|APPROVER|SYSTEM`),
  okidačem (`status_change|claim|forward|approval|reopen|automation`) i čuvarima (`close_code`,
  `required_fields`, `resolution_note`, `reopen_window`, `waiting_auto_close`, `archive_after`, `group_required`,
  `playbook_steps`). Iz te tabele se izvodi lista dozvoljenih prelazaka koju koriste i serverske provjere i
  administratorski ekran **Tok statusa**. Prelaz iz `PENDING_APPROVAL` traži odluku odobrenja, prelaz **u**
  `PENDING_APPROVAL` je zabranjen, a povratak iz Riješeno/Zatvoreno u obradu ide isključivo kroz ponovno
  otvaranje.
- **Zašto:** tok mora biti jedinstven za sve ulaze (UI, automatika, integracije) i čitljiv adminu bez čitanja koda.
- **Primjer:** `PENDING → RESOLVED` nije dozvoljen; agent mora prvo preuzeti tiket.
- **Postavke / permisije:** promjena statusa traži AGENT/ADMIN rolu; pojedina polja i čuvari zavise od postavki.
- **Ekran:** detalj tiketa → izbor statusa; **Administracija → Tok statusa**.
- **Izvori:** `backend/src/modules/tickets/workflow/ticket-workflow-definition.ts:32–92`,
  `assert-ticket-status-transition.ts:5–21`, `assert-patch-ticket-status.ts:7–34`,
  `tickets.constants.ts:49–52`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Tok statusa

### T49 — Vidljivost tiketa se izvodi iz aktera, nikad iz upita

- **Modul / paket:** Tiketi
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Ko vidi tiket određuju OU/servis scope, **članstvo u trenutnoj handler grupi** i učesništvo (pratilac
  ne dobija pristup), a povjerljivi tiketi imaju dodatnu matricu pristupa (naručilac, dodijeljeni, handler grupa,
  učesnik, izričit grant, dozvoljena rola/grupa u scope-u ili aktivan break-glass). SuperAdmin **nema**
  automatski pristup povjerljivim tiketima. Liste koriste istu logiku, izraženu kao `WHERE` uslov, pa lista i
  detalj ne mogu prikazati različite skupove; grupni inbox ne prikazuje naručiocu njegove vlastite tikete, jer je
  to radni red grupe.
- **Zašto:** sigurnost ne smije zavisiti od toga koji je ekran otvoren ni od filtera u URL-u.
- **Primjer:** Agent iz OU Zenica, član grupe u OU Direkcija, radi na tiketu proslijeđenom u tu grupu; kada tiket
  ode dalje, to pravo prestaje.
- **Postavke / permisije:** `private.ticket.confidential.*`, OU/servis scope iz RBAC-a.
- **Ekran:** **Tiketi** (pogledi) i detalj tiketa.
- **Izvori:** `backend/src/modules/tickets/authorize-ticket-actor.ts:8–111`,
  `resolve-ticket-actor-access.ts:24–67`, `list/build-ticket-visibility-where.ts:23–50`,
  `confidential/assert-confidential-ticket-access.ts`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Ko vidi koji tiket

### T50 — Zatvaranje provjerava close code, napomenu i obavezna polja

- **Modul / paket:** Tiketi
- **Publika:** AGENT / ADMIN
- **Tip:** Pravilo
- **Teza:** Pri prelasku u **Riješeno** ili **Zatvoreno** provjeravaju se, po redu: close code (ako je
  konfigurisan), napomena o rješenju, globalna i po-servisu obavezna polja, te obavezna polja iz šeme forme kada je
  `enforceSchemaRequiredFields` uključen. Ako nešto nedostaje, prelaz se odbija i vraća se lista polja koja
  nedostaju.
- **Zašto:** podaci ne smiju ostati nepotpuni, a odbijanje mora biti objašnjivo.
- **Primjer:** Agent ne može zatvoriti tiket bez ispravnog close code-a i napomene.
- **Postavke / permisije:** `private.ticket.closeCodes.*`, `private.workflow.requiredFields.*`,
  `private.ticket.forms.requireStructuredFields`.
- **Ekran:** detalj tiketa → promjena statusa u **Riješeno** / **Zatvoreno**.
- **Izvori:** `backend/src/modules/tickets/close-codes/apply-ticket-resolution.ts:34–53`,
  `required-fields/collect-missing-required-fields.ts:11–66`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Zatvaranje tiketa

### T51 — Spajanje i razdvajanje tiketa (merge/unmerge)

- **Modul / paket:** Tiketi
- **Publika:** AGENT / ADMIN
- **Tip:** Pravilo
- **Teza:** Merge povezuje do 50 djece u parent tiket uz obavezan razlog (3–500 znakova) i najviše 10 kandidata u
  izboru; nije dozvoljeno spojiti tiket sa samim sobom, ni tiket u `CLOSED|ARCHIVED`, niti miješati povjerljiv i
  nepovjerljiv tiket. Djeca preuzimaju status roditelja i postaju **samo za čitanje** (izmjena se odbija porukom da
  je tiket spojen), a **unmerge** vraća dijete u samostalan tiket.
- **Zašto:** duplikati ne smiju stvarati paralelne tokove, ali spajanje mora biti reverzibilno.
- **Primjer:** Incident s deset prijava spaja se u jedan parent tiket; sve odluke i poruke vode se na jednom mjestu.
- **Postavke / permisije:** staff rola (AGENT/ADMIN) + pristup tiketima.
- **Ekran:** detalj tiketa → **Spoji** / **Razdvoji**.
- **Izvori:** `backend/src/modules/tickets/merge/merge.constants.ts:4–22`,
  `merge/assert-merge-allowed.ts:29–61`, `merge/propagate-merged-status.ts`, `merge/unmerge-ticket.ts`,
  `merge/assert-ticket-editable.ts:13–20`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Spajanje i razdvajanje

### T52 — Dijeljenje tiketa u pod-tikete (split)

- **Modul / paket:** Tiketi
- **Publika:** AGENT / ADMIN
- **Tip:** Pravilo
- **Teza:** Split pravi 2–10 pod-tiketa uz obavezan razlog (do 2000 znakova). Svako dijete može dobiti vlastiti
  naslov, opis, servis i grupu, a iz originala se **prenose samo eksplicitno odabrane poruke i prilozi** (bez
  odabira dijete dobija samo referencu). Događaj se auditira kao sistemski zapis s razlogom i listom kreirane
  djece, a svako dijete dobija svoju grupu po rutanju ili ručno.
- **Zašto:** jedan tiket s više tema mora se razdvojiti bez gubitka konteksta i bez slučajnog prenošenja sadržaja.
- **Primjer:** Tiket „Novi laptop + VPN + pristup štampi“ dijeli se na tri zahtjeva, svaki u svoju grupu.
- **Postavke / permisije:** `private.ticket.split.*` (`allowMessageCopy`, `allowAttachmentMove`, `requireReason`).
- **Ekran:** detalj tiketa → **Podijeli tiket**.
- **Izvori:** `backend/src/modules/tickets/split/split.constants.ts:1–12`,
  `split/split-ticket.ts:22–…`, `split/create-split-child-ticket.ts:13–…`,
  `split/dto/split-ticket-child.dto.ts:23–33`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Dijeljenje tiketa

### T53 — Skupne akcije: ista OU i grupa, bez zatvaranja, uz pregled i limit

- **Modul / paket:** Tiketi
- **Publika:** AGENT (u svojoj grupi), ADMIN, SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Skupna akcija obuhvata najviše 100 tiketa i zahtijeva da svi tiketi budu u **istoj OU i istoj grupi**;
  SuperAdmin smije preko OU granica ako je to dozvoljeno postavkom. **Zatvaranje tiketa skupno nije dozvoljeno.**
  Dozvoljene akcije su na allow-listi (dodjela grupe/agenta, promjena statusa, promjena prioriteta, strukturirani
  broadcast i spajanje u parent), svaka akcija traži razlog, a broadcast ima obavezna polja, pregled broja
  primalaca i ograničenje slanja. Svaka izmjena se auditira s identifikatorom serije.
- **Zašto:** skupna akcija je najbrži način da se napravi šteta u više tiketa odjednom.
- **Primjer:** Odabir 12 tiketa iz dvije različite grupe se odbija; isto tako i pokušaj skupnog zatvaranja.
- **Postavke / permisije:** `private.ticket.bulkActions.*`.
- **Ekran:** **Tiketi** → izbor redova → panel skupnih akcija.
- **Izvori:** `backend/src/modules/tickets/bulk/bulk.constants.ts:4–25`,
  `bulk/assert-bulk-ticket-scope.ts:6–29`, `bulk/apply-bulk-broadcast.ts`,
  `bulk/bulk-broadcast-rate-limiter.ts:1–18`, `bulk/tickets-bulk.controller.ts:39–47`.
- **Status:** Važi (uz B2: rate limit je po procesu)
- **Wiki stranica:** Tiketi → Skupne akcije

### T54 — Sačuvani pogledi su lični, s limitom i opcionim defaultom

- **Modul / paket:** Tiketi
- **Publika:** AGENT / ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Agent ili admin može sačuvati filtere, sort i izbor kolona kao **lični** pogled; najviše 20 po
  korisniku, jedan može biti **podrazumijevani**. Pogledi **ne mijenjaju sigurnost** — vidljivost se i dalje
  računa iz aktera. Dijeljenje pogleda je isključeno.
- **Zašto:** brz pristup čestim kombinacijama filtera bez globalnih, dijeljenih „pametnih“ pogleda.
- **Primjer:** Pogled „Moja grupa + Visok prioritet + Prekoračeno“ otvara se jednim klikom.
- **Postavke / permisije:** `private.ticket.savedViews.*` (`enabled`, `maxPerUser`, `allowDefaultView`).
- **Ekran:** **Tiketi** → meni sačuvanih pogleda (**Sačuvaj pogled**).
- **Izvori:** `backend/src/modules/tickets/saved-views/saved-views.constants.ts:1–18`,
  `saved-views/tickets-saved-views.controller.ts:43–65`,
  `saved-views/parse-ticket-saved-views-configuration.ts:15–27`.
- **Status:** Važi (B3 zatvoren 2026-10-05: uklonjena je neiskorištena postavka `allowSharing` — prikazi su lični)
- **Wiki stranica:** Tiketi → Sačuvani pogledi

### T55 — Mjerenje vremena s automatskom pauzom i sweep-om

- **Modul / paket:** Tiketi
- **Publika:** AGENT / ADMIN
- **Tip:** Pravilo
- **Teza:** Tajmer se pokreće i zaustavlja na tiketu, jedan je aktivan po korisniku, a rad se potvrđuje
  **heartbeatom** (minimalni razmak 20 s). Ako nema heartbeatova, sweep zatvara tajmer na zadnjem otkucaju uz
  dodatnu toleranciju od 2 minute; dodatno postoje ograničenje dužine sesije, automatsko nastavljanje i pravila za
  ručni unos (dozvoljeno backdatiranje i maksimalno trajanje). Tajmeri ne rade na riješenim, zatvorenim i
  arhiviranim tiketima.
- **Zašto:** mjerenje mora odražavati stvarni rad i ne smije se moći „pustiti u beskonačno“.
- **Primjer:** Agent zatvori tab; nakon isteka idle roka tajmer se sam zaustavlja i vrijeme se knjiži do zadnjeg
  otkucaja.
- **Postavke / permisije:** `private.ticket.timeTracking.*` (`idleAutoPauseMinutes`, `autoResume`,
  `maxSessionHours`, `manualEntryEnabled`, `maxBackdateDays`, `manualMaxMinutes`).
- **Ekran:** detalj tiketa → panel **Vrijeme**; indikator aktivnog tajmera u zaglavlju aplikacije.
- **Izvori:** `backend/src/modules/tickets/time-tracking/time-tracking.constants.ts:6–34`,
  `heartbeat-ticket-time-log.ts:16–40`, `sweep-time-logs.ts:9–45`,
  `time-tracking/tickets-time-tracking.controller.ts:53–140`.
- **Status:** Važi
- **Wiki stranica:** Tiketi → Mjerenje vremena

### T56 — Prilozi: politika, klasifikacija i skeniranje

- **Modul / paket:** Tiketi
- **Publika:** svi (upload), ADMIN (politika)
- **Tip:** Pravilo
- **Teza:** Prilog se prihvata samo ako prolazi politiku: uključeni prilozi, dozvoljeni MIME tipovi i ekstenzije,
  veličina (podrazumijevano 25 MB), broj po tiketu i po poruci, te lista opasnih ekstenzija. Klasifikacija priloga
  se **nasljeđuje od tiketa** i ne može se spustiti na nižu razinu; fajl se provjerava i skenira prije nego postane
  dostupan. Skidanje priloga prolazi istu provjeru pristupa kao i tiket.
- **Zašto:** prilog je najčešći kanal za iznošenje podataka i za zlonamjerne fajlove.
- **Primjer:** `.exe` se odbija bez obzira na MIME; PDF naslijeđuje klasu tiketa „Interno“.
- **Postavke / permisije:** `private.ticket.attachments.*`.
- **Ekran:** detalj tiketa → **Prilozi**.
- **Izvori:** `backend/src/modules/tickets/attachments/attachments.constants.ts:3–46`,
  `validate-ticket-attachment.ts:19–53`, `inherit-attachment-classification.ts:5–19`,
  `scan-attachment-with-clamav.ts`, `download-ticket-attachment.ts`.
- **Status:** Važi (uz B1: `retentionDays` nema efekta; brisanjem upravlja modul Privatnost)
- **Wiki stranica:** Tiketi → Prilozi

### T57 — Odobrenje je blokirajuće stanje s obaveznim razlogom

- **Modul / paket:** Odobrenja i CSAT
- **Publika:** ADMIN / SUPER_ADMIN (odluka), korisnik (naručilac)
- **Tip:** Pravilo
- **Teza:** Ako usluga zahtijeva odobrenje, tiket se otvara u statusu **Čeka odobrenje** (`PENDING_APPROVAL`) i
  dobija jedan zapis odobrenja sa statusom **Na čekanju**. Odluka ide s **obaveznim razlogom**: **Odobri** vodi
  tiket u **Na čekanju** (odobreni zahtjev ulazi u radni red grupe), a **Odbij** ga **zatvara**. Svaka odluka
  ostavlja tri traga — change log s razlogom `ticket_approval_approved`/`ticket_approval_rejected`, sistemski
  događaj i poruku tipa *odluka o odobrenju* — i dodaje odlučioca kao učesnika s ulogom odobravaoca.
- **Zašto:** osjetljivi zahtjevi ne smiju ući u obradu bez odluke, a odluka mora biti objašnjiva i dokaziva.
- **Primjer:** Zahtjev za novu opremu stoji u **Čeka odobrenje**; admin odbija uz razlog „nije u budžetu ovog
  kvartala“ — tiket je **Zatvoreno**, a razlog stoji u panelu **Odobrenja**.
- **Postavke / permisije:** `private.ticket.approvals.enabled`, `requiredByServiceJson`, `defaultApproverRole`;
  polje **Zahtijeva odobrenje** na usluzi.
- **Ekran:** detalj tiketa → **Odobrenja** (dugmad **Odobri** / **Odbij**), nadzorna ploča → pločica **Čeka
  odobrenje**.
- **Izvori:** `backend/src/modules/tickets/write-created-ticket-follow-up.ts:59–69`,
  `approvals/create-pending-ticket-approval.ts:6–17`, `approvals/decide-ticket-approval.ts:57–137`,
  `approvals/approvals.constants.ts:17–26`, `workflow/ticket-workflow-definition.ts:58–59`,
  `backend/prisma/schema/ticketing-support.prisma:67–82`.
- **Status:** Važi
- **Wiki stranica:** Odobrenja i CSAT → Tok odobrenja

### T58 — Ko smije odlučiti o odobrenju

- **Modul / paket:** Odobrenja i CSAT
- **Publika:** ADMIN / SUPER_ADMIN / (AGENT ako je tako podešeno)
- **Tip:** Pravilo
- **Teza:** O odobrenju odlučuje akter koji **nije naručilac** i koji ima rolu iz postavke
  `defaultApproverRole` **unutar OU i servis scope-a tiketa**; SUPER_ADMIN može uvijek. Ako je modul isključen,
  tiket nije u statusu **Čeka odobrenje** ili je odluka već donesena, zahtjev se odbija jasnim kodom
  (`APPROVALS_DISABLED`, `APPROVAL_NOT_PENDING`, `APPROVAL_SELF_FORBIDDEN`, `FORBIDDEN`). Rola odobravaoca se
  nikad ne dodjeljuje automatski pojedincu — pravo dolazi iz role i scope-a.
- **Zašto:** sprječava samoodobrenje i „odobrenje izvan nadležnosti“.
- **Primjer:** Agent iz druge organizacijske jedinice vidi tiket, ali ne dobija dugmad **Odobri**/**Odbij**.
- **Postavke / permisije:** `private.ticket.approvals.defaultApproverRole`, OU/servis scope iz RBAC-a.
- **Ekran:** detalj tiketa → **Odobrenja** (dugmad se prikazuju samo kad polje `canDecide` dođe kao `true`).
- **Izvori:** `backend/src/modules/tickets/approvals/assert-can-decide-ticket-approval.ts:9–73`,
  `approvals/approvals.constants.ts:28–38`, `approvals/list-ticket-approvals.ts:38–48`.
- **Status:** Važi
- **Wiki stranica:** Odobrenja i CSAT → Pravo odluke

### T59 — SLA je pauziran dok tiket čeka odobrenje

- **Modul / paket:** Odobrenja i CSAT
- **Publika:** svi (posljedica), ADMIN (postavka)
- **Tip:** Pravilo
- **Teza:** Dok je tiket u statusu **Čeka odobrenje**, SLA tajmeri (odgovor i rješavanje) su **pauzirani** ako je
  uključena postavka `private.ticket.sla.pauseOnPendingApproval` (podrazumijevano uključena); nakon odluke
  tajmeri se ponovo pokreću, a kod odbijanja tiket prelazi u **Zatvoreno**. Isto pravilo postoji i za status
  **Čeka korisnika**.
- **Zašto:** čekanje na tuđu odluku ne smije se pripisati agentu kao prekoračenje roka.
- **Primjer:** Tiket otvoren u 09:00 ulazi u odobrenje; odobren je u 15:00 — šest sati čekanja ne ulazi u SLA.
- **Postavke / permisije:** `private.ticket.sla.pauseOnPendingApproval`, `private.ticket.sla.pauseOnWaitingForUser`.
- **Ekran:** detalj tiketa (napomena u zaglavlju) i SLA panel tiketa.
- **Izvori:** `backend/src/modules/sla/is-sla-pause-status.ts:4–15`,
  `settings/definitions/ticket-sla-settings.ts:31–46`, `sla/start-ticket-sla-timers.ts:48`,
  `sla/sync-ticket-sla-timers.ts:116,136`, `tickets/approvals/decide-ticket-approval.ts:130–135`.
- **Status:** Važi
- **Wiki stranica:** Odobrenja i CSAT → SLA i odobrenja

### T60 — CSAT: jedna ocjena po tiketu, samo od naručioca, u prozoru nakon rješavanja

- **Modul / paket:** Odobrenja i CSAT
- **Publika:** korisnik (naručilac), AGENT/ADMIN (pregled)
- **Tip:** Pravilo
- **Teza:** Ocjenu šalje **isključivo naručilac**, **jednom po tiketu**, dok je tiket **Riješeno** (podrazumijevano)
  ili **Zatvoreno** (isključeno po defaultu), i to samo ako je tiket prošao **deterministički uzorak**
  (`samplingRate`, 0–1). Ocjena je cijeli broj od 1 do podešene skale (podrazumijevano 5, dozvoljeno 2–10), a
  komentar je opcionalan i prolazi provjeru osjetljivog sadržaja. Ocjena se **ne može** mijenjati ni brisati.
- **Zašto:** ocjena mora biti vjerodostojna (samo naručilac, samo jednom) i ne smije opteretiti sve tikete ako je
  uzorak smanjen.
- **Primjer:** Naručilac na riješenom tiketu daje 4 zvjezdice i komentar „Brzo rješeno“; tiket nema više formu za
  ocjenu.
- **Postavke / permisije:** `private.csat.enabled`, `scaleMax`, `askOnResolved`, `askOnClosed`, `samplingRate`;
  modul mora biti uključen i u katalogu dodataka (`private.addons.csat`).
- **Ekran:** detalj tiketa → traka **CSAT ocjena** (**Pošalji ocjenu**).
- **Izvori:** `backend/src/modules/tickets/csat/can-submit-ticket-csat.ts:5–32`,
  `csat/is-ticket-csat-sampled.ts:1–21`, `csat/submit-ticket-csat.ts:32–148`,
  `csat/csat.constants.ts:1–23`, `csat/parse-ticket-csat-configuration.ts:8–54`,
  `frontend/src/components/tickets/ticket-csat-panel.tsx:24–55`.
- **Status:** Važi
- **Wiki stranica:** Odobrenja i CSAT → CSAT ocjena

### T61 — CSAT agregacija: prosjek po jedinici, servisu i grupi

- **Modul / paket:** Odobrenja i CSAT
- **Publika:** AGENT / ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Server računa ukupan broj ocjena, prosjek i **korpe po organizacijskoj jedinici, servisu i handler
  grupi** (`GET /tickets/csat/summary`), uz gornju granicu od 20.000 tiketa s ocjenom i vidljivost koja dolazi iz
  pravila liste tiketa (ne može se vidjeti agregat za tikete koje akter ne smije vidjeti).
- **Zašto:** CSAT je KPI menadžmenta i mora biti vezan za organizaciju, ne samo za pojedinačni tiket.
- **Primjer:** Prosjek po servisu pokazuje da „Pristup mreži“ ima nižu ocjenu od „Opreme“.
- **Postavke / permisije:** rola `agent|admin|superAdmin`; vidljivost iz OU/servis scope-a i povjerljivosti.
- **Ekran:** **Izvještaji → CSAT** (kartice prosjek/uzorak/prag + razrez po jedinici, servisu i grupi); KPI
  kartica **CSAT** na tabu **Pregled** nosi ukupan prosjek. Skala i prag dolaze iz postavke
  (`private.csat.scaleMax`, prag = 80 % skale).
- Svaka korpa odgovora ima **`label`** (naziv iz šifarnika) uz `key`; ako zapis ne postoji, labela je ključ —
  nikad prazno (dopuna vala 1, 2026-10-03).
- **Izvori:** `backend/src/modules/tickets/csat/summarize-visible-ticket-csat.ts:11–38`,
  `csat/aggregate-ticket-csat.ts:4–43`, `csat/csat.types.ts:34–48`,
  `csat/tickets-csat-summary.controller.ts:20–42`, `reports/load-report-lookups.ts`.
- **Status:** Važi; korpe su prikazane od vala 1 (2026-10-03) sa nazivima iste večeri. Ostaje da serije na tabu
  **Trendovi** koriste konstantu 5 / prag 4 (preostali dio nalaza B3).
- **Wiki stranica:** Odobrenja i CSAT → CSAT u izvještajima

### T62 — SLA rok se računa u radnom vremenu i od kreiranja tiketa

- **Modul / paket:** SLA
- **Publika:** agent, admin
- **Tip:** Pravilo
- **Teza:** Rok za **prvi odgovor** i rok za **rješenje** računaju se u **minutama radnog vremena** kalendara
  koji nosi SLA profil servisa, a sat počinje u trenutku **kreiranja tiketa** (`createdAt`). Praznici i dani bez
  intervala ne troše vrijeme; vrijeme se računa u vremenskoj zoni kalendara.
- **Zašto:** rok od 4 sata u 17:00 ne smije isteći u 21:00, nego tek sljedećeg radnog dana.
- **Primjer:** `INCIDENT`/P1 s rokom prvog odgovora 10 min, tiket otvoren petak u 15:55 → rok je u ponedjeljak
  u 08:05 (10 radnih minuta), a ne u 16:05.
- **Postavke / permisije:** `private.ticket.sla.enabled`; kalendar/profil/pravilo se uređuju na **SLA pravila**.
- **Ekran:** detalj tiketa → **SLA tajmeri**; **SLA pravila** → **Profili**/**Pravila**.
- **Izvori:** `backend/src/modules/sla/add-business-minutes.ts:14–55`,
  `count-business-minutes.ts:13–59`, `start-ticket-sla-timers.ts:13–92`,
  `resolve-matching-sla-rule.ts:11–60`, `business-hours-civil-time.ts`, `parse-weekly-hours.ts:8–86`.
- **Status:** Važi
- **Wiki stranica:** SLA → Rokovi i kalendari

### T63 — Pauza satova u statusima „Čeka korisnika“ i „Čeka odobrenje“

- **Modul / paket:** SLA
- **Publika:** agent, admin
- **Tip:** Pravilo
- **Teza:** Dok je tiket u statusu **Čeka korisnika** ili **Čeka odobrenje**, satovi **stoje** (ako je
  odgovarajuća postavka uključena, što je podrazumijevano). Pri povratku u obradu rok se **pomjera** za
  preostalo radno vrijeme, a ukupno vrijeme pauze se pamti u minutama radnog vremena. Tiket na čekanju nije
  „prekoračen“.
- **Zašto:** čekanje na korisnika ili odobrenje nije odgovornost agenta i ne smije mu se pripisati kao
  prekoračenje.
- **Primjer:** tiket otvoren u 09:00, u 09:30 prešao u **Čeka korisnika**, vraćen u obradu u 11:00 → sat je
  stajao 30 radnih minuta, pa se rok pomjera za 30 minuta od trenutka vraćanja.
- **Postavke / permisije:** `private.ticket.sla.pauseOnWaitingForUser`, `private.ticket.sla.pauseOnPendingApproval`.
- **Ekran:** detalj tiketa → **SLA tajmeri** (oznaka **pauza**).
- **Izvori:** `backend/src/modules/sla/is-sla-pause-status.ts:4–15`, `apply-ticket-sla-pause.ts:3–11`,
  `apply-ticket-sla-resume.ts:6–42`, `sync-ticket-sla-timers.ts:109–152`.
- **Status:** Važi
- **Wiki stranica:** SLA → Pauze

### T64 — Kako se bira SLA pravilo i čemu služi matrica prioriteta

- **Modul / paket:** SLA
- **Publika:** admin
- **Tip:** Pravilo
- **Teza:** U profilu se prvo bira pravilo sa istim **prioritetom**, a onda ono koje odgovara **servisu** i
  **organizacionoj jedinici** tiketa; red bez servisa i OU je **default** i koristi se kao fallback. Redoslijed
  odlučivanja: **Redoslijed** (manji prvi) → **specifičnost** (servis je specifičniji od OU) → redoslijed
  zapisa. Prioritet tiketa dolazi iz **Matrice prioriteta** (Uticaj × Hitnost), osim ako je zadat ručno.
- **Zašto:** jedno mjesto (profil) mora pokriti sve prioritete, a izuzeci (servis/OU) ne smiju „pobjeći“ od
  defaulta.
- **Primjer:** profil `STANDARD_REQUEST` ima default P3 rok 4h, a override za servis „Pristup mreži“ 2h;
  tiket na tom servisu dobija 2h, svi ostali 4h.
- **Postavke / permisije:** `private.ticket.sla.allowServiceOverrides`, `allowOuOverrides`; izmjena traži
  permisiju **`sla.write`** i razlog.
- **Ekran:** **SLA pravila** → profil → **Pravila**, **Override pravila**, dugme **Matrica prioriteta**.
- **Izvori:** `backend/src/modules/sla/resolve-matching-sla-rule.ts:4–60`,
  `normalize-sla-rule-values.ts:56–60`, `default-priority-matrix.ts`,
  `backend/src/modules/sla/patch-priority-matrix.ts:25–72`,
  `starting-sla.constants.ts:74–126`.
- **Status:** Važi
- **Wiki stranica:** SLA → Pravila i prioriteti

### T65 — Eskalacije nakon prekoračenja roka

- **Modul / paket:** SLA
- **Publika:** admin (podešavanje), agent (posljedica)
- **Tip:** Pravilo
- **Teza:** Kada sat prekorači rok, pokreću se eskalacije čiji je **Trigger offset** istekao (0 = odmah, pa
  rastući nivoi, podrazumijevano 0/30/120 min nakon prekoračenja, najviše koliko dozvoljava postavka);
  svaka eskalacija se bilježi **jednom** (ključ `sat:pravilo`) i obavještava **jednu** metu — grupu, rolu,
  korisnika ili **dežurnog grupe** (ako niko nije dežuran, obavještava se cijela grupa). Eskalacija ide u
  vremensku liniju tiketa i u change log, a e-mail se šalje samo ako je uključena postavka.
- **Zašto:** prekoračenje koje nikoga ne pokrene je propuštena intervencija.
- **Primjer:** P1 tiket prekorači rok u 10:00; u 10:00 ide nivo 1 (voditelj grupe), u 10:30 nivo 2
  (rola ADMIN), u 12:00 nivo 3 (korisnik).
- **Postavke / permisije:** `private.ticket.sla.escalationsEnabled`, `maxEscalationLevels`,
  `private.ticket.sla.escalations.emailEnabled`; pravila se uređuju uz `sla.write`.
- **Ekran:** **SLA pravila** → profil → **Eskalacije**; detalj tiketa (vremenska linija).
- **Izvori:** `backend/src/modules/sla/select-due-sla-escalations.ts:34–114`,
  `apply-due-sla-escalations.ts:9–24`, `emit-ticket-sla-runtime-events.ts:52–84`,
  `assert-sla-escalation-constraints.ts:13–138`,
  `backend/src/modules/notifications/fan-out/resolve-sla-notification-recipients.ts:14–91`,
  `backend/src/modules/notifications/email/fan-out-email-notifications.ts:171–183`.
- **Status:** Važi, uz ograničenje: eskalacija iz **ugrađenog** pravila (profil bez eskalacionih pravila) nema
  primaoca (B1, §M10)
- **Wiki stranica:** SLA → Eskalacije

### T66 — Usklađenost, nadzor skenera i pragovi

- **Modul / paket:** SLA
- **Publika:** admin
- **Tip:** Pravilo
- **Teza:** Usklađenost po profilu računa se kao procenat završenih tiketa (zadnjih 30 dana) koji **nisu**
  prekoračili rok **prvog odgovora** odnosno **rješenja**; kartica prikazuje i trenutnu izloženost
  (otvoreni/ugroženi/prekoračeni). Pozadinski **skener** svake minute obrađuje najviše 2000 stanja čiji je
  `nextDueAt` istekao, a ops nadzor diže alarm ako nema uspješnog ciklusa duže od podešenog broja minuta
  (podrazumijevano 5).
- **Zašto:** bez nadzora skenera SLA tiho prestaje da radi i svi rokovi izgledaju „u okviru“.
- **Primjer:** `sla.compliance?days=30` vraća `sampleCount` i procenat po profilu; tab „SLA“ na izvještajima
  koristi prag `slaTargetPercent` (podrazumijevano 90%).
- **Postavke / permisije:** `private.reports.trends.slaTargetPercent`,
  `private.ops.thresholds.slaScanLateMinutes`; endpoint usklađenosti je admin-only.
- **Ekran:** **SLA pravila** → profil → **Usklađenost (30 dana)** i **Trenutno izloženih**; **Izvještaji**.
- **Izvori:** `backend/src/modules/sla/sla-compliance.controller.ts:18–37`,
  `aggregate-sla-compliance.ts:30–85`, `load-sla-compliance-rows.ts:20–57`,
  `scan-due-ticket-sla-states.ts:20–61`, `sla-scan.constants.ts:9–16`,
  `backend/src/modules/ops-health/evaluate-ops-signals.ts:143–155`,
  `backend/src/modules/reports/trends/report-trends.constants.ts:23,31`.
- **Status:** Važi, uz ograničenja: agregat je samo po profilu i samo za završene tikete (B3, §M10)
- **Wiki stranica:** SLA → Usklađenost i nadzor

### T67 — Administracija SLA konfiguracije (change log, verzije, pravo pristupa)

- **Modul / paket:** SLA
- **Publika:** ADMIN / SUPER_ADMIN
- **Tip:** Pravilo
- **Teza:** Kalendari, profili, pravila, eskalacije i matrica prioriteta uređuju se isključivo iz
  administratorske zone; svaka izmjena traži **Razlog izmjene** i upisuje se u change log sa snimkom **prije** i
  **poslije** (ko, kada, šta i zašto). Čitanje je dozvoljeno administratorskim rolama, izuzev **Matrice
  prioriteta** koja je čitljiva svim rolama jer se koristi pri kreiranju tiketa. SLA konfiguracija ulazi u
  **verzije konfiguracije**: validacija bez primjene (zone, intervali, pokrivenost prioriteta, matrica) i
  shadow poređenje koliko bi tiketa promijenilo pravilo.
- **Zašto:** promjena roka mijenja obećanje prema korisnicima i mora biti objašnjiva i provjerljiva prije
  primjene.
- **Primjer:** prije aktivacije nove verzije validacija prijavi `SLA_PRIORITY_INCOMPLETE` jer profil ne pokriva
  prioritet `LOW` default pravilom.
- **Postavke / permisije:** rola ADMIN/SUPER_ADMIN + permisija **`sla.write`** za izmjene.
- **Ekran:** **SLA pravila** (sve sekcije) i **Change log**; **Verzije konfiguracije** za aktivaciju/poređenje.
- **Izvori:** `backend/src/modules/sla/sla-profiles.controller.ts:31–52`,
  `sla-calendars.controller.ts:37–57`, `sla-rules.controller.ts:41–61`,
  `sla-escalation-rules.controller.ts:39–61`, `priority-matrix.controller.ts:27–68`,
  `backend/src/modules/config-versioning/validate-sla-snapshot.ts:15–70`,
  `apply-sla-snapshot.ts:8–40`, `compute-shadow-diff.ts:4–34,67–90`.
- **Status:** Važi
- **Wiki stranica:** SLA → Administracija

### T68 — Realtime arhitektura: jedan kanal, sobe po kontekstu

- **Modul / paket:** Realtime i obavještenja
- **Publika:** svi (posljedica), ADMIN (operacije)
- **Tip:** Arhitektura
- **Teza:** Aplikacija drži jednu vezu po tabu prema Socket.IO serveru. Isporuka se određuje **sobama**:
  `user:{userId}` (lična obavještenja i zahtjevi za udaljenu pomoć), `group:{groupId}` (jedan lagani signal
  „nešto se promijenilo u vašoj grupi“), `ticket:{ticketId}:staff` / `:public` (chat i promjene tiketa prema
  vidljivosti), `role:admins` (promjene konfiguracije). Više API instanci dijeli iste sobe preko Redis adaptera,
  a događaji koje proizvede worker prenose se kanalom do API-ja koji jedini ima Socket.IO server.
- **Zašto:** puni payload u grupnoj sobi znači jednu kopiju po članu; sobe po kontekstu drže saobraćaj
  proporcionalan događaju, a ne veličini grupe.
- **Primjer:** promjena statusa tiketa ide u sobu tiketa i u lične sobe uključenih, dok grupa dobija događaj bez
  sadržaja („tiket X se promijenio“).
- **Postavke / permisije:** nema korisničke postavke; operativno `CORS_ORIGIN` i ACL za Redis kanale adaptera.
- **Ekran:** nije vidljivo direktno; posljedica je osvježavanje liste, detalja i zvona bez reload-a.
- **Izvori:** `backend/src/modules/websocket/websocket.gateway.ts:39–191`,
  `ticket-chat.gateway.ts:42–160`, `ticket-socket-rooms.ts:1–19`, `broadcast-ticket-realtime.ts:29–113`,
  `ticket-updated-broadcast-rooms.ts:15–36`, `group-feed-change.ts:5–93`, `ws-redis-adapter.ts:37–143`,
  `backend/src/modules/tickets/ticket-realtime-bridge.constants.ts:12` + `ticket-realtime-bridge.subscriber.ts:30–69`.
- **Status:** Važi (uz B4: prelazni režim punog emit-a je uključen po defaultu)
- **Wiki stranica:** Realtime i obavještenja → Kako radi

### T69 — Autentikacija veze i pravila pristupa sobama

- **Modul / paket:** Realtime i obavještenja
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Veza se uspostavlja **samo** s važećim sesijskim tokenom u handshake-u; bez njega server odbija
  spajanje. Pri spajanju socket ulazi u svoju ličnu sobu i u sobe grupa kojima pripada (administratori i u
  `role:admins`). U sobu tiketa ulazi se posebnim zahtjevom koji **prvo provjerava pristup tiketu**, pa se
  socket pridružuje ili `:staff` ili `:public` sobi — što znači da interne bilješke nikada ne stižu u javnu
  sobu niti u grupnu sobu.
- **Zašto:** soba je sigurnosna granica; ko nije dobio tiket ne smije vidjeti ni njegov sadržaj ni interne
  bilješke.
- **Primjer:** korisnik koji nije član grupe i nema pristup tiketu neće primiti ni poruku iz tog tiketa ni
  grupni signal.
- **Postavke / permisije:** nema posebne postavke; pristup tiketu se rješava standardnim pravilima (OU/servis
  scope, povjerljivost, učesnici).
- **Ekran:** detalj tiketa (poruke i promjene stižu bez reload-a).
- **Izvori:** `backend/src/modules/websocket/socket-authentication.service.ts:15–31`,
  `backend/src/modules/authentication/jwt-socket-authentication.verifier.ts:15–27`,
  `websocket.gateway.ts:145–222`, `ticket-chat.gateway.ts:99–126`,
  `backend/src/modules/tickets/tickets-collaboration.service.ts:189–202`.
- **Status:** Važi, uz ograničenje: članstvo i rola se provjeravaju pri spajanju, ne i kasnije (B1, §M11)
- **Wiki stranica:** Realtime i obavještenja → Pristup i sigurnost

### T70 — In-app obavještenja: model vidljivosti i „pročitano“

- **Modul / paket:** Realtime i obavještenja
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Obavještenje je **lično** (vidljivo samo jednom korisniku) ili **grupno** (vidljivo članovima
  grupe, kreirano nakon što su se pridružili i osim onih koji su izuzeti). Kod grupnog reda stanje
  „pročitano“ je **lični zapis** — jedan član ne označava obavještenje pročitanim za ostale. Broj nepročitanih
  je zbir ličnih nepročitanih i grupnih bez vlastitog zapisa, ograničen na 1000.
- **Zašto:** grupa dijeli jedan red (umjesto stotina kopija), a svaki član ipak ima svoje stanje.
- **Primjer:** novi tiket u grupi „Mreža“ stvara jedan red; agent A ga pročita, agentu B i dalje stoji
  nepročitan.
- **Postavke / permisije:** lične preferencije po tipu obavještenja.
- **Ekran:** zvono i panel **Obavještenja** (filteri **Sve**/**Nepročitane**, **Označi sve**).
- **Izvori:** `backend/src/modules/notifications/notification-audience.ts:8–66`,
  `mark-notification-read.ts:15–46`, `mark-all-notifications-read.ts`,
  `count-unread-notifications.ts:7–27`, `notifications.controller.ts:22–65`.
- **Status:** Važi
- **Wiki stranica:** Realtime i obavještenja → Obavještenja

### T71 — Fan-out: koji događaj kome stiže i sa kojim sadržajem

- **Modul / paket:** Realtime i obavještenja
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Svaki događaj na tiketu mapira se u tip obavještenja (novi tiket, dodjela, poruka, rješeno,
  zatvoreno, odobrenje, SLA, prosljeđivanje, udaljena pomoć, spominjanje). Tijelo obavještenja je **naslov
  tiketa**, osim za **povjerljiv** tiket gdje se šalje **samo broj**. **Interna bilješka** ne stvara
  obavještenje grupi — obavještava isključivo spomenute kolege. Akter događaja i korisnici koji su već dobili
  lično obavještenje izuzeti su iz grupnog reda.
- **Zašto:** obavještenje mora nositi dovoljno da se zna šta se dešava, a ne više od onoga što korisnik smije
  vidjeti.
- **Primjer:** povjerljiv tiket u obavještenju prikazuje „#1042“ umjesto naslova; interna bilješka bez
  spominjanja ne šalje ništa.
- **Postavke / permisije:** lične preferencije (in-app, tiho vrijeme) po tipu.
- **Ekran:** zvono (lista) i detalj tiketa.
- **Izvori:** `backend/src/modules/notifications/fan-out/map-ticket-event-to-notification.ts:33–59`,
  `build-notification-content.ts:21–33`, `fan-out-in-app-notifications.ts:60–105`,
  `publish-created-notifications.ts:8–43`, `backend/src/modules/websocket/broadcast-user-realtime.ts:18–47`.
- **Status:** Važi
- **Wiki stranica:** Realtime i obavještenja → Tipovi obavještenja

### T72 — Pad veze: fallback i ponašanje ekrana

- **Modul / paket:** Realtime i obavještenja
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Dok veza radi, broj nepročitanih i promjene na ekranu stižu odmah i **ne** šalju periodične zahtjeve
  za brojem. Ako veza padne, broj se provjerava svakih **30 sekundi**; čim se veza vrati, broj i lista se
  odmah osvježe. Ekrani koji nisu vidljivi ne povlače podatke — događaj ih samo označi kao zastarjele.
- **Zašto:** aplikacija mora raditi i na nestabilnoj mreži, ali i štedjeti server kada nema razloga za
  saobraćaj.
- **Primjer:** korisnik na mobilnoj mreži izgubi vezu; zvono i dalje pokazuje tačan broj, a klik na obavještenje
  i dalje radi jer se oslanja na HTTP.
- **Postavke / permisije:** nema.
- **Ekran:** zvono, panel obavještenja, lista tiketa i detalj tiketa.
- **Izvori:** `frontend/src/lib/realtime/socket-health.ts:7–53`,
  `frontend/src/lib/notifications/use-inbox-notifications.ts:72–119`,
  `frontend/src/lib/realtime/invalidate-on-event.ts:22–70`,
  `frontend/src/services/helpdesk-socket.ts:15–67`.
- **Status:** Važi
- **Wiki stranica:** Realtime i obavještenja → Veza i osvježavanje

### T73 — Operativni zahtjevi: više instanci, metrike, rollout i retencija

- **Modul / paket:** Realtime i obavještenja
- **Publika:** ADMIN / SUPER_ADMIN / operacije
- **Tip:** Pravilo
- **Teza:** Realtime mora raditi sa **više API instanci**: sobe se šire Redis adapterom, a ACL mora dozvoliti
  njegove kanale — ako nije, aplikacija se diže u degradiranom režimu (jedna instanca) umjesto da padne.
  Za vrijeme nadogradnje važi runbook sa **sticky sesijama** i postupnim gašenjem instanci. Metrike
  (`ws_clients_count`, emit-i po vrsti sobe) se loguju, a obavještenja se čuvaju **90 dana** (podesivo) i brišu
  dnevno u ograničenim serijama.
- **Zašto:** bez dijeljenih soba i bez procedure, deploy ili druga instanca „tiho“ izgube događaje.
- **Primjer:** emit s instance A stiže klijentu spojenom na instancu B — to je i mjerljiv dokaz
  (`ops/ws-cross-instance-check.mjs`).
- **Postavke / permisije:** `CORS_ORIGIN`, Redis ACL (`ops/redis-acl.line`), `WS_GROUP_FEED_LEGACY_FULL_EMIT`,
  `NOTIFICATION_RETENTION_DAYS`; runbook `ops/ws-rolling-deploy.md`.
- **Ekran:** nije korisnički; logovi `ws_clients_count` i `ws_emits_*`.
- **Izvori:** `backend/src/modules/websocket/ws-redis-adapter.ts:20–50,73–143`,
  `websocket-emit-counter.ts:8–64`, `observability/metrics/websocket-client-count.reporter.ts:39–60`,
  `backend/src/modules/notifications/notification-retention.constants.ts:9–28`, `worker.module.ts:38`.
- **Status:** Važi (uz B3: metrika bez alarma)
- **Wiki stranica:** Realtime i obavještenja → Operacije

### T74 — Izlazni e-mail kanal: tri prekidača i pravilo dozvoljenih adresa

- **Modul / paket:** Pošta
- **Publika:** svi (posljedica), ADMIN (postavke)
- **Tip:** Pravilo
- **Teza:** E-mail obavještenja rade **samo** kad su uključena sva tri prekidača: addon e-mail, SMTP i sam kanal
  obavještenja. Prijemnik mora proći pravilo dozvoljenih adresa: dok je režim „samo interno“ uključen (zadano),
  e-mail ide isključivo internim domenama i izuzecima sa liste; isključen režim propušta svaku ispravnu adresu.
  Interne domene su postavka — na novoj instalaciji prva domena dolazi iz adrese superadministratora.
- **Zašto:** obavještenja sadrže poslovne podatke; zadano ponašanje mora biti „ne izlazi iz organizacije“.
- **Primjer:** na instalaciji bez upisane interne domene nijedan e-mail ne izlazi — to nije kvar nego pravilo,
  i rješava se upisom domene.
- **Postavke / permisije:** `private.smtp.*`, `private.addons.email`, `private.notifications.email.enabled`,
  `private.notifications.email.internalOnly`, `internalDomainsCsv`, `allowedExternalDomainsCsv`,
  `allowedExternalEmailsCsv`; izmjene idu kroz `settingsWrite`.
- **Ekran:** Postavke → E-mail → **SMTP i dostava**.
- **Izvori:** `backend/src/modules/notifications/email/resolve-email-channel-enabled.ts:8–13`,
  `load-email-channel-configuration.ts:69–126,131–148`,
  `is-allowed-notification-email-address.ts:14–31`, `install/seed-install-internal-email-domain.ts:16–32`.
- **Status:** Važi
- **Wiki stranica:** Pošta → Uključivanje kanala

### T75 — Sastavljanje poruke: šabloni, escape, povjerljivi režim i redakcija

- **Modul / paket:** Pošta
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Svaki e-mail se sastavlja na jednom mjestu i na jednom rendereru: tekst dolazi iz šablona (29
  događaja × bs/en), sve varijable se escapeuju, naslov je uvijek u jednom redu, linkovi moraju biti apsolutni
  `http(s)`, a tekst koji izlazi prolazi redakciju osjetljivih podataka. Kod **povjerljivog** tiketa (oznaka ili
  klasifikacija CONFIDENTIAL/RESTRICTED) e-mail sadrži **samo broj tiketa i link** — bez naslova, usluge i
  isječka poruke.
- **Zašto:** e-mail napušta aplikaciju; pravilo mora biti u kodu koji šalje, ne u tekstu šablona koji se može
  urediti.
- **Primjer:** izmjena šablona ne može iscuriti naslov povjerljivog tiketa jer renderer u tom režimu ne koristi
  polja sa podacima.
- **Postavke / permisije:** `private.notifications.email.includeMessageExcerpt`,
  `private.notifications.email.accentColor`, javni URL aplikacije; uređivanje šablona traži `settingsWrite`.
- **Ekran:** sam e-mail; pregled u **Šabloni e-mailova** → **Uredi tekstove**.
- **Izvori:** `backend/src/modules/notifications/email/compose-ticket-email.ts:37–44,64–170`,
  `render-email-message.ts:108–160,464–530`, `parse-email-template-registry.ts:24–52`,
  `default-email-templates.ts:32,247,462`, `email-template.constants.ts:1–41`.
- **Status:** Važi, uz izuzetak: bulk obavijest (broadcast) ne prolazi redakciju (B2, §M12)
- **Wiki stranica:** Pošta → Kako izgleda e-mail

### T76 — Isporuka: queue, idempotencija, DLQ i ručni retry

- **Modul / paket:** Pošta
- **Publika:** ADMIN / operacije
- **Tip:** Arhitektura
- **Teza:** Slanje e-maila je **posao**, ne sporedna radnja: ako je tip `email` u postavci reda, e-mail ide kroz
  izdržljivi red sa ponovnim pokušajima i eksponencijalnim čekanjem, a poslije iscrpljenih pokušaja u mrtvo
  slovo (DLQ) sa rokom čuvanja. Isporuka je idempotentna po ključu `(korisnik, događaj)` i stabilnom
  `Message-ID`-u, pa ponovni pokušaj ne šalje isti e-mail dvaput. Administrator može ponovo pokrenuti neuspjeli
  posao iz pregleda reda.
- **Zašto:** bez reda i idempotencije kratki prekid SMTP-a znači izgubljena ili duplirana obavještenja.
- **Primjer:** pad SMTP servera na dvije minute ne gubi obavještenja — poslovi čekaju i šalju se kad se veza
  vrati.
- **Postavke / permisije:** `private.integrations.queue.enabled`, `typesCsv`, `maxAttempts`,
  `initialBackoffSeconds`, `maxBackoffSeconds`, `deadLetterAfterAttempts`,
  `deadLetterRetentionDays`; retry traži `integrationsQueueManage`.
- **Ekran:** Postavke → Integracije → **Red integracija** (lista, ponovni pokušaj); `ops-health` prikazuje
  posljednji poslani e-mail.
- **Izvori:** `backend/src/modules/notifications/fan-out/notifications-fan-out.service.ts:143–165`,
  `backend/src/modules/integration-queue/process-email-integration-job.service.ts:17–34`,
  `parse-email-integration-job-payload.ts:3–46`, `integration-queue.controller.ts:63–68`,
  `backend/src/modules/notifications/email/deliver-notification-email.ts:24–68`.
- **Status:** Važi, uz ograničenje: zapis o isporuci nema rok, pa zaglavljen zahtjev gubi e-mail (B1)
- **Wiki stranica:** Pošta → Pouzdanost slanja

### T77 — Lične postavke, tihi sati i dnevni sažetak

- **Modul / paket:** Pošta
- **Publika:** svi
- **Tip:** Pravilo
- **Teza:** Za svaki tip događaja korisnik bira kanal (u aplikaciji / e-mail) i način (odmah / u sažetku /
  isključeno). Ako ništa ne mijenja, ponašanje je kao i prije. U tihim satima e-mail se ne šalje odmah nego se
  stavka čuva i šalje na kraju perioda; sažetak se sastavlja po tiketu (najnoviji događaj i broj događaja) i
  povjerljivi tiketi u njemu nemaju naslov. Neke kategorije su **uvijek uključene** i prikazuju se samo kao
  informacija.
- **Zašto:** agent u velikoj grupi mora moći smanjiti broj e-mailova, a sigurnosna i operativna obavještenja ne
  smiju nestati.
- **Primjer:** agent uključi „U sažetku“ za nove tikete i dobija jedan e-mail dnevno umjesto trideset.
- **Postavke / permisije:** lične postavke i raspored po korisniku; globalno `preferencesEnabled`,
  `quietHoursEnabled` i zadane vrijednosti po kategoriji.
- **Ekran:** **Moj profil** → **Obavještenja**; admin pregled kategorija.
- **Izvori:** `backend/src/modules/notifications/preferences/resolve-delivery-decisions.ts:29–70`,
  `notification-preference-catalog.ts:34–122`, `hold-for-digest.ts:24–43`,
  `notification-digest.service.ts:62–112`, `notification-digest.constants.ts:1–11`,
  `compose-digest-email.ts:28–119`.
- **Status:** Važi
- **Wiki stranica:** Pošta → Sažetak i tihi sati

### T78 — Dolazna pošta: konektori i prepoznavanje tiketa potpisanim tokenom

- **Modul / paket:** Pošta
- **Publika:** ADMIN (postavljanje), svi (korištenje)
- **Tip:** Arhitektura
- **Teza:** Worker periodično čita zajednički sandučić preko jednog od dva konektora — **Microsoft Graph**
  (aplikacijska dozvola ograničena na jedan sandučić) ili **IMAP** (lozinka ili OAuth2 sa Entra ID-om). Tiket se
  prepoznaje po **potpisanom tokenu** u zaglavljima odgovora (`Message-ID` naše poruke nosi
  `<r.<tiket>.<primalac>.<nonce>.<potpis>@domena>`), a rezervno po stabilnom korijenu razgovora i po broju
  tiketa `[T-000123]` u naslovu. Tajna se može rotirati bez gubitka starih odgovora.
- **Zašto:** naslov e-maila je korisnički tekst i ne smije biti jedini način da se pogodi na koji tiket odgovor
  ide; potpis sprječava da se odgovor pripiše tuđem tiketu.
- **Primjer:** odgovor sa „RE: [T-000123]“ i bez zaglavlja i dalje stiže na tiket, ali strože provjeren —
  pošiljalac mora biti aktivan korisnik sa pravom pisanja.
- **Postavke / permisije:** `private.inbound.*` (uključeno, provajder, adresa, interval, Entra aplikacija,
  IMAP pristup, folderi); tajna `INBOUND_EMAIL_TOKEN_SECRET` ili izvedena iz ključa za MFA.
- **Ekran:** Postavke → E-mail → **Dolazna pošta**; obrada se vidi kroz status i dnevnik.
- **Izvori:** `backend/src/modules/inbound-email/inbound-email-configuration.ts:11–29,37–48`,
  `mailbox/create-inbound-mailbox.ts:6–19`, `mailbox/graph-mailbox.ts:17–88`, `mailbox/imap-mailbox.ts:27–90`,
  `mailbox/entra-token.ts:7–34`, `notifications/email/reply-token.ts:43–109`,
  `inbound-email/resolve-inbound-target.ts:13–22`.
- **Status:** Važi (Gmail API konektor iz plana nije isporučen — koristi se IMAP)
- **Wiki stranica:** Pošta → Odgovor e-mailom

### T79 — Dolazna pošta: pravila prihvatanja, anti-loop i prilozi

- **Modul / paket:** Pošta
- **Publika:** svi (posljedica), ADMIN (nadzor)
- **Tip:** Pravilo
- **Teza:** Poruka se prihvata samo ako je pošiljalac **aktivan korisnik** čija je domena dozvoljena, ako je
  poruka prošla provjeru autentičnosti (DMARC ili SPF+DKIM, uz interni Exchange kao izuzetak) i ako nije
  prekoračila limit po satu. Automatske poruke (out-of-office, bounce, liste) se ignorišu i nikad ne dobijaju
  automatski odgovor. Tekst se čisti od citata i potpisa, prilozi prolaze iste provjere kao upload (tip,
  veličina, antivirus), a zaražen ili nedozvoljen prilog se odbija uz sistemsku bilješku na tiketu. Odgovor
  nikad ne postaje **interna bilješka** — osoblje piše javni odgovor.
- **Zašto:** e-mail je javni kanal; pogrešno prihvaćena poruka može otvoriti tiket, a pogrešno kreiran odgovor
  može poslati interni tekst napolje.
- **Primjer:** „Out of office“ odgovor ne otvara ništa i ne dobija odgovor; poruka sa zaraženim prilogom ide na
  tiket sa napomenom koji je prilog odbijen.
- **Postavke / permisije:** `requireAuthPass`, `maxPerSenderPerHour`, `maxMessagesPerRun`,
  `createTickets`, `defaultServiceId`, folderi „obrađeno“/„odbijeno“; pristup tiketu po standardnim pravilima.
- **Ekran:** detalj tiketa (poruka sa oznakom da je došla e-mailom, bilješka o odbijenom prilogu);
  Postavke → E-mail → **Dolazna pošta**.
- **Izvori:** `backend/src/modules/inbound-email/process-inbound-message.ts:85–178`,
  `detect-auto-reply.ts:17–39`, `check-sender-authentication.ts:12–24`, `extract-reply-text.ts:23–72`,
  `inbound-email.service.ts:296–371`.
- **Status:** Važi
- **Wiki stranica:** Pošta → Pravila prihvatanja

### T80 — Nadzor, retencija i operativni zahtjevi kanala

- **Modul / paket:** Pošta
- **Publika:** ADMIN / SUPER_ADMIN / operacije
- **Tip:** Pravilo
- **Teza:** Administrator ima **status konektora** (zadnji uspjeh, zadnja greška, broj uzastopnih padova),
  brojeve obrade u 24 h i dnevnik posljednjih 50 poruka **bez tijela poruke**, uz dugme za test veze. Kad
  sandučić padne tri puta zaredom, svi aktivni administratori dobijaju jedno in-app obavještenje. Original
  poruke (`.eml`) čuva se **30 dana** kompresovan, metapodaci **180 dana**, a iste redove čisti i modul
  privatnosti; sve to je podesivo. Za dolaznu poštu ne postoji „webhook“ — čita se periodično (zadano 60 s),
  pa obrada kasni najviše jedan ciklus.
- **Zašto:** e-mail kanal radi „u pozadini“ i bez vidljivosti se kvarovi otkriju tek kad korisnik prijavi da
  nikome ništa ne stiže.
- **Primjer:** tri uzastopna neuspjeha prijave na sanduče vide administratori u aplikaciji, a ne samo u logu
  workera.
- **Postavke / permisije:** `private.inbound.pollSeconds`, `rawRetentionDays`, `metadataRetentionDays`,
  `maxMessagesPerRun`; politika privatnosti za zapise o isporuci (180 dana); pristup statusu traži ADMIN rolu.
- **Ekran:** Postavke → E-mail → **Dolazna pošta** (status, brojevi, dnevnik, test konekcije);
  `ops-health` prikazuje zadnji poslani e-mail.
- **Izvori:** `backend/src/modules/inbound-email/inbound-email.constants.ts:1–10`,
  `inbound-email.scheduler.service.ts:21–37`, `inbound-email.processor.ts:45–63`,
  `inbound-email.service.ts:164–186,398–431`, `inbound-email-admin.controller.ts:20–38`,
  `inbound-email-admin.service.ts:52–118`, `inbound-raw-store.ts:15–45`,
  `privacy/retention/retention-plan.ts:81`, `privacy/retention/retention-executors.ts:97–125`.
- **Status:** Važi (uz B1: zaglavljena isporuka nije vidljiva u nadzoru)
- **Wiki stranica:** Pošta → Nadzor i čuvanje

### T81 — Šabloni odgovora: model, opseg i tip

- Šablon (`ResponseTemplate`) ima naziv, tijelo na bosanskom (obavezno) i engleskom (opcionalno), tip
  (`REPLY` / `INTERNAL` / `ANY`), oznake, aktivan/neaktivan, vlasnika i brojače upotrebe; opseg nije JSON nego
  vezne tabele prema servisu, kategoriji i grupi (`onDelete: Cascade`).
- Prazan `ownerUserId` znači **zajednički** šablon, a popunjen **lični** (vidi ga samo vlasnik).
- Šablon se nikad ne briše fizički: `deletedAt` je soft delete, a poruka koja ga je koristila čuva svoj tekst.
- **Izvori:** `backend/prisma/schema/templates.prisma:4–61`, `templates.constants.ts:8–25,32–46`,
  `response-templates.service.ts:536–562`, `record-templates-change.ts:1–42`.
- **Status:** Važi
- **Wiki stranica:** Šabloni i playbooks → Polja, validacije i statusi

### T82 — Varijable: bijela lista, pad na bosanski i prijava praznih polja

- Dozvoljeno je tačno 16 varijabli (broj i naslov tiketa, link, servis, kategorija, grupa, status, prioritet,
  ime i prvo ime podnosioca, ime i prvo ime agenta, organizaciona jedinica, SLA rok, naziv aplikacije, datum).
- Nepoznato ime se **odbija pri čuvanju** (`TEMPLATE_UNKNOWN_VARIABLES`), a ako se nađe u postojećem tekstu
  ostaje doslovno i prijavljuje se u pregledu; varijabla bez vrijednosti postaje prazna i vraća se u `missing`.
- Jezik se bira po `preferredLocale` podnosioca; ako engleski tekst ne postoji, koristi se bosanski.
- - **Izvori:** `backend/src/modules/templates/templates.constants.ts:8–30`,
  `template-placeholders.ts:10–52`, `normalize-template-input.ts:67–80`,
  `response-templates.service.ts:153–186`, `build-template-variables.ts:22–135`,
  `templates-environment.ts:34`.
- **Status:** Važi
- **Wiki stranica:** Šabloni i playbooks → Dozvoljene varijable

### T83 — Prava: lični šabloni, zajednički i ograničenje po servisima

- Korištenje u poruci traži `ticket.templates.use`; lični šablon traži `ticket.templates.personal`; izmjena
  zajedničkog traži `ticket.templates.manage`.
- Administrator ograničen na servise (`canManageSharedScope`) **ne može** praviti globalni, kategorijski ni
  grupni opseg, već samo opseg sastavljen od svojih servisa — time se ne zaobilazi OU scope.
- Tiket se uvijek čita kroz prava pristupa (`loadAccessibleTicket`), pa šabloni ne otvaraju tuđe tikete.
- - **Izvori:** `backend/src/modules/templates/template-scope.ts:31–58`,
  `response-templates.service.ts:401–408,458–487,490–503`, `authorization.constants.ts:22–24`,
  `tickets/create-ticket-message.ts:38–44`, `tickets/list-ticket-messages.ts:47`.
- **Status:** Važi (uz B1: tip i aktivnost se provjeravaju samo u pregledu)
- **Wiki stranica:** Šabloni i playbooks → Kome je namijenjen

### T84 — Playbook: snimka koraka, verzija i nadogradnja

- Playbook ima korake (`stepKey`, pozicija, obavezan, veza na članak baze znanja i šablon odgovora), opseg po
  servisu/kategoriji i `version` koji raste **samo kad se koraci promijene**.
- Vezivanje upisuje u tiket snimku koraka, naziv i verziju; izmjena playbooka ne dira tiket u toku.
- Jedan aktivan playbook po tiketu zaštićen je zaključavanjem (`FOR UPDATE`) u transakciji; nadogradnja na
  novu verziju čuva već štiklirane korake po `stepKey`, a štikliranje je idempotentno i bilježi ko i kada.
- - **Izvori:** `backend/prisma/schema/templates.prisma:63–157`, `playbooks/playbooks.service.ts:1–335`,
  `playbooks/normalize-playbook-input.ts:50–100`, `ticket-playbooks/attach-playbook-to-ticket.ts:43–100,106–132`,
  `ticket-playbook-snapshot.ts:12–60`, `ticket-playbooks.service.ts:299–403`.
- **Status:** Važi
- **Wiki stranica:** Šabloni i playbooks → Korak po korak

### T85 — Obavezni koraci pri rješavanju i automatsko vezivanje

- Postavka `private.ticket.playbooks.requiredStepsOnResolve` ima tri režima: `off`, `warn` (dijalog sa
  spiskom otvorenih obaveznih koraka) i `block` (odbijanje sa kodom `PLAYBOOK_REQUIRED_STEPS_OPEN` i spiskom
  tiketa i koraka).
- Provjera pokriva prelaz u `RESOLVED` i zatvaranje iz bilo kojeg statusa osim `RESOLVED`, i to i kod
  pojedinačne promjene i kod bulk promjene; automatsko zatvaranje i spajanje tiketa je ne diraju.
- Pri kreiranju tiketa playbook se veže automatski **samo ako tačno jedan** odgovara servisu/kategoriji, i to
  je „best effort“ — greška ne ruši kreiranje tiketa.
- - **Izvori:** `settings/definitions/ticket-templates-settings.ts:9–45`,
  `tickets/playbooks/assert-playbook-steps-complete.ts:15–56`, `tickets/update-ticket.ts:102`,
  `tickets/bulk/apply-bulk-status.ts:49`, `tickets/tickets.service.ts:154,159–178`,
  `frontend/src/pages/ticket-detail-page.tsx:506–508`.
- **Status:** Važi (uz B4: nema uvođenja na tikete koji su već u toku)
- **Wiki stranica:** Šabloni i playbooks → Režimi obaveznih koraka

### T86 — Administracija, revizija i verzije konfiguracije

- Svaka izmjena šablona i playbooka upisuje se u change log sa razlogom (3–500 znakova), prije/poslije
  vrijednostima i autorom; entity tipovi su `response_template`, `playbook` i `ticket_playbook`.
- Uključivanje modula i automatskog vezivanja te režim obaveznih koraka su postavke u grupi šablona tiketa.
- Konfiguracijski snapshot uključuje **samo zajedničke** šablone i playbookove (zaglavlja), a lični šabloni se
  ne diraju ni pri primjeni snimke.
- - **Izvori:** `backend/src/modules/templates/record-templates-change.ts:1–42`,
  `templates.constants.ts:48–52`, `settings/definitions/ticket-templates-settings.ts:1–45`,
  `settings/setting-keys.ts:148`, `config-versioning/collect-config-snapshot.ts:47–62,137`,
  `config-versioning/apply-templates-snapshot.ts:6–40`.
- **Status:** Važi
- **Wiki stranica:** Šabloni i playbooks → Korak po korak

### T87 — Ponuda šablona, statistika upotrebe i ekrani

- Ponuda (picker) filtrira po načinu pisanja (odgovor / interna bilješka), pretrazi i opsegu, rangira
  (servis 3, kategorija 2, grupa 1, globalno 0, tuđi opseg -1) i vraća do 200 šablona; „prikaži sve“ uključuje
  i one koji ne pripadaju tiketu.
- Upotreba se bilježi samo preko polja `responseTemplateId` pri upisu poruke; povećava `usageCount` i
  `lastUsedAt`, ali **ne sprječava** slanje ako šablon ne postoji ili nije dostupan.
- Ekrani su `admin/templates` (tabovi Šabloni i Playbookovi, editori) i kartica **Playbook** na detalju
  tiketa; prijevodi pokrivaju 209 ključeva na oba jezika.
- - **Izvori:** `backend/src/modules/templates/response-templates.service.ts:103–151`,
  `templates.constants.ts:45`, `tickets/create-ticket-message.ts:63–67,81–108`,
  `frontend/src/app/router.tsx:274–335`, `components/templates/ticket-playbook-panel.tsx:1–269`,
  `frontend/src/i18n/locales/{bs,en}/common.json` (grana `templates`).
- **Status:** Važi (uz B2 i B5: fiksni `take` bez redoslijeda; brojač raste prije upisa poruke)
- **Wiki stranica:** Šabloni i playbooks → Kako doći

### T88 — Model članka, statusi i klasifikacije

- Članak ima `slug`, naslov i tijelo, status `DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`, klasifikaciju
  (`INTERNAL` zadano, `CONFIDENTIAL`, `RESTRICTED`), vlasnika (korisnik **ili** grupa), recenzenta, obaveznu
  uslugu i organizacionu jedinicu, `searchVector` (tsvector + GIN) te polja portala (kategorija, FAQ,
  ocjene, pregledi, izvor iz tiketa).
- Prelasci statusa su tabela, a `ARCHIVED` je završno stanje; trajno brisanje je soft-verski ograničeno na
  SUPER_ADMIN-a i briše i ocjene članka.
- Svaka promjena (kreiranje, izmjena, status, smještaj) nosi obavezan razlog i ide u istoriju članka.
- **Izvori:** `backend/prisma/schema/knowledge.prisma:1–58,60–79`,
  `backend/src/modules/knowledge-base/knowledge-base.constants.ts:7–21,23–32,34–40`,
  `create-knowledge-article.ts:79–107`, `record-knowledge-article-change.ts`,
  `knowledge-base.service.ts:165–173`.
- **Status:** Važi
- **Wiki stranica:** Baza znanja → Polja, validacije i statusi

### T89 — Vidljivost članka: jedna odluka za sve ulaze

- Ko smije vidjeti članak računa jedna funkcija: SUPER_ADMIN uvijek; vlasnik i imenovani recenzent uvijek;
  neobjavljen članak nosioci prava pisanja/pregleda/objave u opsegu; objavljen `INTERNAL` svaki prijavljeni
  korisnik; `CONFIDENTIAL` osoblje u opsegu OU + servisa; `RESTRICTED` samo ADMIN u tom opsegu.
- Ista funkcija se koristi u listi, detalju, presretanju, ocjenama i brojanju pregleda, pa nema puta koji bi
  zaobišao pravilo.
- **Izvori:** `backend/src/modules/knowledge-base/can-read-knowledge-article.ts:27–56`,
  `load-knowledge-article-scope.ts:10–68`, `list-knowledge-articles.ts:18–27`,
  `intercept-knowledge-articles.ts:41–51`,
  `knowledge-portal.service.ts:336–355`; test `knowledge-base.authorization.spec.ts`.
- **Status:** Važi
- **Wiki stranica:** Baza znanja → Kome je namijenjen

### T90 — Presretanje pri kreiranju tiketa i rezolucija

- Pri kreiranju tiketa sistem traži objavljene i vidljive članke odabrane usluge, rangira ih (tekst, glasovi
  „pomoglo/nije pomoglo“, izglađena ocjena) i vraća **do 8** prijedloga; ako je presretanje isključeno
  postavkom, lista je prazna.
- Rezolucija se bilježi kao zaseban zapis (usluga, OJ, opcionalni članak) i nadzorna ploča je koristi kao
  broj „izbjegnutih tiketa“; sama radnja ne sprječava slanje tiketa i vezana je na prvi prijedlog (B3).
- **Izvori:** `backend/src/modules/knowledge-base/intercept-knowledge-articles.ts:30–80`,
  `rank-knowledge-articles.ts:15–27,38–103`, `resolve-knowledge-intercept.ts:19–49`,
  `backend/src/modules/reports/dashboard/build-reports-dashboard.ts:137–151`,
  `frontend/src/components/tickets/knowledge-intercept-panel.tsx:73,156–191`,
  `frontend/src/components/tickets/create-ticket-form.tsx:166–173`; RAW `RAW_PROJECT.md:71` i `:132`.
- **Status:** Važi (uz B3: ishod „pomoglo“ nije obavezujući, rezolucija bez provjere opsega)
- **Wiki stranica:** Baza znanja → Korak po korak

### T91 — Ocjene, komentari i rangiranje

- Ocjena je 1–5; `isHelpful` se izvodi kao `rating >= 4` (radi starih izvještaja), glas je jedan po korisniku
  po članku i može se promijeniti, a glas bez ocjene ne briše raniju ocjenu ni komentar.
- Komentar („Šta nedostaje?“) moguć je **samo uz ocjenu ≤ 2**, najviše 500 znakova, vidi ga vlasnik i
  recenzent, i označava se riješenim u uvidima.
- Prilikom glasa ponovno se računa zbir članka; u presretanju ocjene ulaze kroz Bayesov bonus (prior 3,5 /
  težina 5 / skala 8), a stari glasovi kroz `+10` po glasu.
- **Izvori:** `backend/src/modules/knowledge-base/submit-knowledge-feedback.ts:55–71,89–127`,
  `rank-knowledge-articles.ts:15–27`, `intercept-knowledge-articles.ts:92–105`,
  `knowledge-portal.service.ts:441–461`, i18n `knowledgeBase.portal.rating.*`; RAW `RAW_PROJECT.md:130–132`.
- **Status:** Važi
- **Wiki stranica:** Baza znanja → Korak po korak

### T92 — Pregledi: dnevni agregat bez reda po otvaranju

- Pregledi se ne pišu kao pojedinačni redovi: u Redis se po UTC danu vodi HyperLogLog jedinstvenih
  pregledača i brojač, a jednom u 15 minuta (posao podsjetnika) gotovi dani se upisuju u `KnowledgeArticleView`
  i `viewCount` u istoj transakciji; bez Redisa pregled ide direktno u bazu.
- Klijent šalje pregled čim se objavljeni članak otvori — pravilo iz plana („poslije 5 sekundi ili skrola“)
  nije primijenjeno (B4), pa brojevi uključuju i kratka otvaranja.
- **Izvori:** `backend/src/modules/knowledge-base/portal/knowledge-article-views.ts:5–31,33–97,99–122`,
  `portal/knowledge-view-flush.service.ts:47–65`, `…review-reminder.processor.ts:40–49`,
  `knowledge-portal.service.ts:336–355`,
  `frontend/src/pages/knowledge-article-detail-page.tsx:30–37`; plan 2.9 §2.3.
- **Status:** Važi (uz B4)
- **Wiki stranica:** Baza znanja → Poznata ograničenja

### T93 — Vlasništvo i ciklus pregleda

- Vlasnik je korisnik ili grupa; kad je grupa, podsjetnik dobijaju svi njeni članovi.
- Objava zahtijeva prethodni pregled (`PUBLISH_REVIEW_REQUIRED`) i ne prepisuje postojeći rok; odobrenje
  pregleda postavlja `lastReviewedAt`, novi `reviewDueAt` i skida oznaku zastarjelosti.
- Posao `knowledge-base-review-reminder-scan` ide po cronu `0 10,25,40,55 * * * *` (2 pokušaja, backoff 30 s,
  `lockDuration` 120 s) i šalje **in-app** obavještenje sa dedup ključem koji sadrži rok, pa se isti rok ne
  ponavlja. „Zastarjelo“ se računa pri čitanju (rok prošao ili više od `staleAfterDays` od pregleda/objave).
- **Izvori:** `backend/src/modules/knowledge-base/knowledge-base-review-reminder.service.ts:23–92`,
  `…job.constants.ts:19–31`, `…processor.ts:18–49`, `evaluate-knowledge-article-freshness.ts:6–35`,
  `publish-knowledge-article.ts:30–39`, `review-knowledge-article.ts:34–38`; RAW `RAW_PROJECT.md:133–135`,
  `:632–634`.
- **Status:** Važi (uz B6: kolona `isStale` se ne održava)
- **Wiki stranica:** Baza znanja → Polja, validacije i statusi

### T94 — Portal znanja i „članak iz odgovora“

- Portal je dostupan svim prijavljenim korisnicima i ima tri taba (Portal, Svi članci, Uvidi — treći samo uz
  pravo pisanja/pregleda/objave); početna prikazuje FAQ harmoniku (`<details>`), kategorije sa brojem
  vidljivih članaka i broj nekategorizovanih.
- Kategorije imaju najviše dva nivoa, arhiviraju se umjesto brisanja, a arhiviranje blokiraju samo aktivne
  podkategorije (uputa u UI tvrdi i „s člancima“ — B7).
- „Napravi članak“ stoji na javnom odgovoru agenta, nije dostupan na povjerljivom tiketu, vraća nacrt sa
  zamijenjenim ličnim podacima (ime i login učesnika, e-mail, IPv4, telefon) i upisuje `DRAFT` sa vezom na
  tiket i poruku; zamjena se ponavlja **samo u pregledu**, ne i pri upisu (B1).
- **Izvori:** `backend/src/modules/knowledge-base/portal/knowledge-portal.controller.ts:38–116`,
  `portal/knowledge-portal.service.ts:150–222,290–333,359–439,465–518,522–585`,
  `portal/knowledge-categories.ts:118–142,181–207`, `portal/scrub-reply-personal-data.ts:29–71`,
  `frontend/src/components/knowledge-base/portal/*`,
  `frontend/src/components/tickets/ticket-detail-conversation.tsx:40–47`,
  `frontend/src/lib/navigation.ts:89–94`, `frontend/src/app/router.tsx:159–162`; plan 2.9 §2.
- **Status:** Važi (uz B1 i B7)
- **Wiki stranica:** Baza znanja → Kako doći

### T95 — Nadzorna ploča: brojači sa servera, pogledi iz prve strane

- Nadzorna ploča (`/`) svakom prijavljenom korisniku prikazuje brojače (ukupno, otvoreno, kritično,
  prekoračeno, danas otvoreno, čeka korisnika/odobrenje, riješeno, zatvoreno, neusmjereno, bez izvršioca,
  dodijeljeno meni, moji zahtjevi, raspodjela po statusu i prioritetu), a osoblju dodatno **SLA nadzor**,
  **Grupni inbox** i **Aktivnost**.
- **Brojači su serverski agregati**, ne brojanje u pregledaču: `GET /reports/dashboard/summary?scope=` ide
  kroz istu funkciju vidljivosti kao lista tiketa (`buildTicketListWhere`), pa ploča ne može prikazati
  tiket koji korisnik ne smije otvoriti.
- Keš je **60 sekundi** po korisniku i opsegu (ključ nosi i vremensku zonu jer brojač „danas“ zavisi od
  nje), uz spajanje istovremenih promašaja; pad keša je promašaj, nikad greška. Plan je dozvoljavao 15–30 s,
  ali je poslije k6 mjerenja (100 000 tiketa) vlasnik odobrio 60 s.
- **Pogledi** (SLA nadzor, „Tiketi koji zahtijevaju vašu pažnju“, „Nedavni tiketi“) dolaze iz **ciljanih
  serverskih upita sa malim `take`** (8/5/8+8), pa tiket izvan prvog ekrana ne može nestati s liste
  (popravljeno u valu 1, B6). **Grafik zadnjih 14 dana** se i dalje broji u pregledaču, ali sada iz
  **stranica po 50** koliko API dozvoljava (`loadDashboardVolume`, najviše 6 stranica / 300 tiketa) i nosi
  oznaku „donja granica“ (`volumeTruncated`) kad je i zadnja stranica puna. Opseg `scope` API podržava, ali ga
  ekran uvijek šalje kao `all` (B4, otvoreno).
- Dugme **Izvještaji** u zaglavlju ploče je sada **link** na `/reports` i prikazuje se samo onima koji smiju
  otvoriti izvještaje (`canOpenReports`); mrtvi prijevodi su uklonjeni (popravljeno u valu 1, B5).
- **Izvori:** `backend/src/modules/reports/report-summary.controller.ts`,
  `report-summary.service.ts:24–34,36–47,145–153,155–181`,
  `summary/report-summary-cache.ts:2–22`, `summary/load-dashboard-summary-counts.ts:53`,
  `frontend/src/lib/dashboard/use-dashboard-summary.ts:71–90`,
  `frontend/src/lib/dashboard/build-volume-14d.ts:11–25`,
  `frontend/src/lib/dashboard/dashboard-ticket-sets.ts:13–14,28–35`,
  `frontend/src/pages/dashboard-page.tsx:39–124`, i18n `dashboard.*`.
- **Status:** Važi (uz B4; B5 i B6 zatvoreni u valu 1, 2026-10-03)
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 1

### T96 — SLA nadzor i grupni inbox na ploči

- `GET /reports/sla/summary` vraća ukupnu izloženost (otvoreno, u roku, na granici, prekoračeno) i razrez
  po SLA profilu i prioritetu, sa kešom po korisniku; koristi ga **SLA nadzor** na ploči („Najugroženiji
  tajmeri“, do 5 tiketa) i SLA ekran.
- **Grupni inbox** prikazuje nepreuzete tikete po grupama; ako postoji neusmjereni tiket stariji od roka za
  čišćenje, prikazuje se crveno upozorenje koje vodi na filtriranu listu tiketa.
- Broj prekoračenih neusmjerenih tiketa dolazi iz `GET /tickets/counts` (`unroutedOverdue`,
  `unroutedCleanupHours`), ne iz izvještaja — ista vrijednost se koristi u listi filterom
  `unroutedOverdue=true`.
- **Izvori:** `backend/src/modules/reports/summary/report-summary.types.ts:57–80`,
  `summary/load-sla-summary-counts.ts:57`, `reports/report-summary.service.ts:114–143`,
  `frontend/src/components/dashboard/dashboard-sla-watchlist.tsx:28–45`,
  `frontend/src/components/dashboard/dashboard-inbox-snapshot.tsx:29–99`,
  `frontend/src/lib/sla/use-sla-page-data.ts:67`; plan 1.7 §U3 (brojač i filter).
- **Status:** Važi
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 2

### T97 — KPI pregled izvještaja: formule, uzorci i KB stopa

- Tab **Pregled** (`GET /reports/dashboard`) prikazuje KPI kartice **Kreirano (period)**, **Prosj. prvi
  odgovor**, **Prosj. rješenje**, **CSAT (zadovoljstvo)** i **KB resolution rate**.
- Uz svaki prosjek ide **broj uzoraka**; CSAT je na skali iz `private.csat.scaleMax` (2–10, zadano 5) i KPI
  kartica prikazuje tu skalu (val 1); **KB resolution rate** je *pomoglo u interceptu / (pomoglo + kreirani
  tiketi)* sa ciljem **≥ 30 %** u opisu kartice.
- „Kreirano“ nosi promjenu prema **prethodnom periodu iste dužine**; podrazumijevani period je 30 dana i
  dolazi iz vlastite postavke `private.reports.defaultWindowDays` (val 1; prije je dijeljena s uskim grlima).
- Grafikoni pregleda: uska grla po grupi (prosječno rješenje, oznaka „usko grlo“, kartice nema kad je
  postavka isključena), obim po usluzi, **tiketi po organizacionoj jedinici** (kreirani u periodu,
  `originUnitVolume`), **opterećenje admina** (otvoreni tiketi po izvršiocu, stanje sada, `assigneeWorkload`
  — najopterećeniji nosi upozorenje), tok i starenje backloga, starost otvorenih tiketa; dugme **Izvezi PDF**
  otvara dijalog za štampu i bilježi `report.pdf.exported`.
- Period se računa u zoni instalacije (`private.reports.timeZone`, zadano `Europe/Sarajevo`), ne u zoni
  procesa ni pregledača.
- **Izvori:** `backend/src/modules/reports/dashboard/build-reports-dashboard.ts:31–40,76,121`,
  `dashboard/aggregate-report-dashboard-kpis.ts:4–18,63–87`, `reports.controller.ts:96–121,151–189`,
  `settings/definitions/reports-settings.ts:26–32`, `frontend/src/components/reports/reports-metric-grid.tsx:33–112`,
  `frontend/src/components/reports/reports-charts.tsx:42–112`; plan 2.5 §2.1, §13.3.
- **Status:** Važi (B3 zatvoren u valu 1 za period; skala CSAT-a na ovom tabu poštuje postavku)
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 3

### T98 — Trendovi: serije, granularnost i izvoz

- `GET /reports/trends` vraća **sve serije u jednom odgovoru**: dolazni, riješeni, neto, backlog (stanje na
  kraju perioda, uz napomenu da je aproksimacija za ponovno otvorene tikete), SLA odziv i rješavanje,
  medijana i p90 rješenja, medijana prvog odziva, CSAT prosjek i udio zadovoljnih (**ocjena ≥ 4**), te
  najčešći servisi (do 8 prije „Ostali“).
- Granularnost je automatska (do 31 dan dnevno, do 183 dana sedmično, inače mjesečno) uz ručni izbor i
  ograničenja po granularnosti (dan 92, sedmica 104 bucket-a, mjesec iz postavke `maxMonths`, zadano 36).
- Ostale postavke: keš 600 s, ciljna SLA linija 90 %, minimalni uzorak za CSAT 5; tekući (nepotpuni)
  period je označen isprekidano, a svaka kartica ima objašnjenje „Kako se računa?“ i tabelarni prikaz.
- Izvoz ide u CSV/JSON (`GET /reports/trends/export`, audit `report.trends.exported`), a „štampa“ kroz PDF
  prikaz (audit `report.pdf.exported`). Dugme **Zakaži ovaj izvještaj** otvara formu rasporeda s
  popunjenim filterima.
- **Izvori:** `backend/src/modules/reports/trends/report-trends.constants.ts:1–43`,
  `trends/report-trends.types.ts:72–103`, `reports.controller.ts:151–189`,
  `audit-log/audit-log.constants.ts:60–61`, `frontend/src/components/reports/trends/report-trends-panel.tsx:198–345`,
  `frontend/src/services/report-trends-api.ts:120–135`; plan 2.5 §3, §7.2, §11.1, §13.3.
- **Status:** Važi
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 4

### T99 — Paketi izvještaja: pregled, formati, limiti i audit

- Zadano je uključeno šest paketa: `monthly_kpi`, `overdue_by_service`, `top_close_codes`,
  `kb_helpfulness`, `forward_ping_pong`, `time_tracking`; uz uključene module (CMDB, problemi, promjene)
  pojavljuju se i njihovi paketi.
- Tok je **paket → period → jedinica → Prikaži** (pregled prvih redova, `truncated` sa porukom „Prikazano
  prvih …“), pa **Preuzmi CSV** ili **Preuzmi JSON**; preuzimanje sadrži sve redove dozvoljenog perioda.
- Ograničenja: period po paketu najviše 366 dana, pregled 200 redova, dozvoljeni formati `csv,json`;
  u paketu prosljeđivanja naslovi povjerljivih tiketa zamjenjuju se oznakom `[confidential]` koju pregled
  prevodi u `[povjerljivo]`.
- Svaki izvoz se bilježi u audit (akcija `reports.export`) sa formatom, brojem redova, paketom,
  organizacionom jedinicom, periodom i imenom fajla; CSV ima BOM i zaštitu od injekcije formule.
- **Izvori:** `backend/src/modules/reports/reports.constants.ts:3–63,115,117`,
  `settings/definitions/reports-settings.ts:10–20`, `reports.controller.ts:78–121`,
  `record-report-export-audit.ts:9–41`, `packs/build-forward-ping-pong-report.ts:19,38`,
  `packs/build-top-close-codes-report.ts:4–25`, `packs/build-kb-helpfulness-report.ts:4–16,43–73`,
  `audit-log/audit-log.constants.ts:31`,
  `frontend/src/components/reports/report-packs-panel.tsx:245–270`,
  `frontend/src/lib/reports/report-pack-table.ts:54–55`; plan 1.6 §3–§5.
- **Status:** Važi
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 5

### T100 — Uska grla: API postoji, ekran ne

- `GET /reports/bottlenecks` vraća brojače `PENDING_APPROVAL`, `WAITING_FOR_USER`, `UNROUTED` i
  `OVERDUE`, razrez po **organizacionoj jedinici, servisu i prioritetu** te **dnevni trend** (UTC dan,
  prema datumu kreiranja) — tačno ono što RAW traži za identifikaciju uskih grla.
- Postavka `private.dashboard.bottlenecks.enabled` poštuje se i u tom endpointu **i** u prikazu: kad je
  isključena, `GET /reports/dashboard` vraća `bottlenecksEnabled: false`, grafik „Bottleneck“ se ne
  renderuje, a tab **Uska grla** prikazuje stanje sa objašnjenjem (popravljeno u valu 1, B1). Period je
  razdvojen: `private.reports.defaultWindowDays` za pakete, `…bottlenecks.defaultWindowDays` za uska grla
  (B3 — zatvoreno).
- Frontend **ima** tab **Uska grla** u `/reports` (četiri brojača, razrez po OU/servisu/prioritetu, dnevni
  trend, isti period i OU opseg) — RAW-ova svrha je dovršena do ekrana (popravljeno u valu 1, B2).
- Razrez odgovora nosi i **naziv** uz ključ: `BottleneckBreakdownRow` je `{ key, label }`, naziv dolazi iz
  šifarnika u istom SQL upitu (`LEFT JOIN "OrganizationalUnit"`, `LEFT JOIN "Service"`, `MAX(…name)`), a
  prioritet — koji šifarnik nema — prevodi UI preko ključa za i18n. Ako zapis više ne postoji, labela je ključ
  (dopuna vala 1, 2026-10-03 — prije toga je tab pisao ID-eve).
- **Izvori:** `backend/src/modules/reports/reports.controller.ts:123–130`,
  `reports.service.ts:155–181`, `bottleneck/aggregate-bottleneck-dashboard.ts:23–41,71–116`,
  `bottleneck/sql-bottleneck-dashboard-store.ts:30–40`, `reports/load-report-lookups.ts`,
  `settings/definitions/reports-settings.ts:169–185`; RAW `:280–284`, `:1039`.
- **Status:** Važi; B1, B2 i B3 zatvoreni u valu 1 (2026-10-03), dopuna istog dana za nazive razreza
  (vidi `REVIEW_ANALIZA.md#2b1`).
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 3a (Uska grla)

### T101 — Zakazani izvještaji: raspored, primaoci i historija

- Raspored ima **naziv, učestalost** (`WEEKLY` — ponedjeljak, `MONTHLY` — 1. u mjesecu), **vrijeme slanja u
  zoni instalacije**, **sekcije e-maila** (`kpi`, `trend`, `topServices`, `overdue`), **priloge (CSV)** i
  **primaoce** (samo interni korisnici s pristupom izvještajima i opsegu jedinice, uz pretragu).
- Posao se izvršava cron-om `*/5 * * * *` i obrađuje do 20 rasporeda po prolazu; termin se preskače ako je
  raspored isključen, korisnik neaktivan, izgubio pristup ili je e-mail kanal isključen — **razlog se
  upisuje u historiju** i prikazuje u UI. Prilozi se izostavljaju iznad limita redova ili 10 MB ukupno,
  uz napomenu u e-mailu.
- Historija izvršenja prikazuje do 50 zapisa (čuvanje 180 dana), period, broj poslanih od ukupno
  primalaca i razloge; **Pošalji test meni** šalje probni izvještaj pokretaču, a **Pošalji sada** pokreće
  pravo slanje uz potvrdu.
- Zakazani se administriraju na tabu **Zakazani** (samo uz `reports.schedule.manage`), a svaka izmjena i
  slanje bilježe se u audit (`report.schedule.created/updated/deleted/sent/test_sent`).
- **Izvori:** `backend/src/modules/reports/schedules/report-schedule.constants.ts:1–65`,
  `schedules/report-schedules.controller.ts`, `schedules/report-schedules.service.ts`,
  `schedules/scheduled-report.runner.ts`, `schedules/report-schedules.processor.ts`,
  `schedules/report-schedule-calendar.ts`, `audit-log/audit-log.constants.ts:60–66`,
  `frontend/src/pages/reports-page.tsx:54–64`, i18n `reports.schedules.*`; plan 2.5 §5, §7.3, §13.1.
- **Status:** Važi
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 6

## Paket 2.9 – K1 portal znanja (implementirano)

- Baza znanja otvara se na kartici **Portal**: FAQ, kategorije (najviše dva nivoa) i članci bez kategorije. Kartica **Svi članci** zadržava dosadašnju pretragu; **Uvidi** vide samo urednici.
- Ocjena članka je 1–5 zvjezdica; komentar „šta nedostaje“ moguć je samo uz ocjenu 1 ili 2 i vide ga samo urednici (Uvidi → Otvoreni komentari).
- Pregled se broji jednom po otvaranju objavljenog članka (Redis, uz rezervni upis u bazu).
- „Napravi članak“ postoji samo na javnim odgovorima agenta, samo za korisnike s pravom pisanja članaka i nikad na povjerljivom tiketu (server vraća FORBIDDEN). Lični podaci (e-mail, imena/loginovi osoba s tiketa, IP, telefon) zamjenjuju se oznakama prije prikaza; rezultat je uvijek DRAFT, a na tiketu ostaje interni događaj.
- Kategorije uređuje permisija `knowledge.category.manage`; broj FAQ stavki je postavka `private.knowledgeBase.portal.faqMaxItems`.
- Staging: Redis ACL korisnika aplikacije treba (aditivno) `+pfadd +pfcount +sadd +smembers +srem +incr +expire +multi +exec`.
- „Pomoglo / Nije pomoglo“ u panelu pri kreiranju tiketa mijenja samo taj podatak (da li je članak riješio problem); ranija ocjena 1–5 i komentar ostaju, prosjek se ne mijenja. Ocjena 4–5 zvjezdica automatski se računa i kao „Pomoglo“, 1–3 kao „Nije pomoglo“.

## Paket 3.2 – CMDB (pojašnjenja korisnika, 2026-09-29)

- Modul imovine implementira se kompletno, ali je zadano isključen; aktivira se postavkom kad dođe pravi trenutak. Uz modul idu testni inventari.
- Uvoz imovine iz Excel tabela je dio prve verzije.
- Kada AD bude aktivan, računari iz AD-a vežu se uz korisnike.
- Imovinom upravljaju agenti IT-a, ali i drugi (npr. nabavka).
- Korisnik (USER) vidi svoju opremu i bira je pri kreiranju tiketa.
- Prva verzija obuhvata sve: stavke, veze, tikete, licence, garancije/ugovore, uvoz, AD.

## CMDB — lokacije i prenosnice (30.9.2026)

- Lokacije su stablo, npr. Direkcija → Podružnica Zenica → Zenica, Visoko, Kakanj.
- Pri svakom kretanju opreme generiše se prenosnica po DOCX šablonu organizacije.
- Scenariji kretanja: skladište → korisnik, korisnik → korisnik i korisnik → skladište.
- Polja na prenosnici su: ko predaje, ko preuzima, naziv opreme, inventarni broj i potpisnik.
- Potpisnik se definiše po organizacionoj jedinici i nasljeđuje se na sve jedinice ispod nje, dok niža jedinica ne definiše svog (Direkcija → Podružnica Zenica → Snabdijevanje).
- Broj prenosnice je mjesec-broj-godina (01-0001-2026); brojač kreće od 1 svakog mjeseca.
- Prenosnica se izdaje kao DOCX, a potpisana kopija se prilaže kao PDF ili JPG.
- Kod prvog zaduženja upisuje se ko predaje; ako se ne upiše, na prenosnici piše „Skladište“.

## CMDB — prenosnice (C9, 30.9.2026)

- Oprema se kreće kroz „Zaduži“, „Prezaduži“ i „Razduži“ na kartici opreme; uz kretanje se odmah izdaje prenosnica i nudi preuzimanje DOCX-a.
- Prenosnica se može preskočiti za pojedino kretanje; ako je uključeno „Prenosnica obavezna“, stari način zaduživanja bez prenosnice je blokiran.
- Broj se dodjeljuje u trenutku izdavanja i nikad se ne ponavlja: brojač kreće od 1 prvog dana svakog mjeseca po vremenskoj zoni instalacije; zadani oblik je MM-NNNN-GGGG (npr. 09-0007-2026), a oblik se može promijeniti u postavkama.
- Potpisnik se određuje po organizacionoj jedinici onoga ko preuzima (kod razduženja — onoga ko vraća); ako ga jedinica nema, uzima se najbliža nadređena, zatim zadani potpisnik iz postavki.
- Potpisnik ima funkciju (npr. „Rukovodilac službe“) koja se štampa ispod imena; korisnici u sistemu nemaju polje funkcije, pa je polje funkcije za onoga ko predaje/preuzima prazno.
- Prenosnica „pamti“ stanje u trenutku izdavanja (imena, OJ, oprema); kasnije promjene korisnika ili opreme ne mijenjaju već izdat dokument, a ponovno preuzimanje daje isti sadržaj.
- Organizacija oblikuje šablon u Wordu (zaglavlje, logo, fontovi) i učitava ga u Katalogu; svaka nova verzija odmah postaje aktivna, a već izdate prenosnice ostaju na verziji s kojom su izdate. Bez učitanog šablona koristi se ugrađeni zadani, koji se može preuzeti kao polazna tačka.
- Šablon s greškom ili makroima se odbija; nepoznata polja se samo upozore i ostaju prazna.
- Potpisana kopija (PDF, JPG ili PNG, do 10 MB) prilaže se u registru i prolazi antivirusnu provjeru; prenosnica tada dobija status „Potpisana“, a kopija se može zamijeniti.
- Pogrešna prenosnica se stornira uz razlog; storniranje ne vraća opremu — ispravka je novo kretanje s novom prenosnicom.
- Registar prenosnica je tab „Prenosnice“ na stranici Oprema; kartica opreme ima svoj tab, a korisnik na „Mojoj opremi“ vidi i preuzima svoje prenosnice.
- Pri anonimizaciji korisnika njegovo ime u izdatim prenosnicama zamjenjuje se pseudonimom, a e-mail, funkcija i OJ se brišu; broj i oprema ostaju.

## CMDB — potpisnik i lokacije (C9c, 30.9.2026)

- Potpisnik prenosnica se postavlja u Administracija → Organizacija, na odabranoj organizacionoj jedinici (kartica „Potpisnik prenosnica“); kartica postoji samo dok je modul Imovina uključen.
- Katalog imovine prikazuje stablo potpisnika samo za pregled i vodi na Organizaciju za izmjenu.
- Lokacije (zgrada, sprat, prostorija) su opcionalne i zadano isključene; kad su isključene, kao mjesto opreme prikazuje se puna putanja organizacione jedinice.
- Isključivanjem lokacija ništa se ne briše: ranije unesene lokacije ostaju sačuvane i ponovo se prikazuju kad se lokacije uključe.

## CMDB — pregled, izvještaji, rutiranje i masovno kretanje (C9b, 30.9.2026)

- Upravitelj imovine s pravom izvještaja vidi tab „Pregled“: opremu po statusu, šta ističe u 30 dana, prekoračene licence, pet stavki s najviše tiketa u 90 dana, stanje AD računara i opremu kod neaktivnih ili premještenih korisnika — samo za svoje organizacione jedinice.
- Dok je modul Imovina uključen, u Izvještajima postoji pet dodatnih paketa (stanje, ističe u 90 dana, usklađenost licenci, oprema s najviše tiketa, oprema kod neaktivnih korisnika); mogu se i zakazati. Samo paket „oprema s najviše tiketa“ koristi odabrani period, ostali prikazuju stanje u trenutku generisanja.
- Tip opreme može imati „Grupu za rješavanje“: kad korisnik u tiketu izabere opremu tog tipa (npr. štampač), tiket ide toj grupi umjesto grupi iz pravila rutiranja.
- U registru se može odabrati više stavki i zadužiti ih, prezadužiti ili razdužiti odjednom, s jednom prenosnicom; zajedno idu samo stavke sa skladišta ili stavke istog korisnika, najviše 50.

## CMDB — aktivacija i provjere (C10, 30.9.2026)

- Modul se uključuje jednom postavkom; isključivanje ne briše podatke, a paketi izvještaja o imovini tada nestaju iz liste.
- Redoslijed aktivacije: postavke i potpisnici, šablon prenosnice, početni uvoz ili demo podaci (samo staging), probni prolaz AD računara, pa tek onda automatska sinhronizacija.
- Vodič za korisnike i upravitelje je u `docs/user-guide/imovina.md`, a koraci za administratora servera u `ops/runbook/cmdb-aktivacija.md`.

## CMDB — licence, ugovori i podsjetnici (C6, 30.9.2026)

- Licence imaju četiri vrste: po uređaju, po korisniku, za lokaciju (bez dodjela) i pretplatu (obavezan datum isteka).
- Iskorištenost se prikazuje kao „dodijeljeno / broj mjesta“; prekoračenje je označeno, ali dodjela nije blokirana, da se stvarno stanje može evidentirati.
- Ključ licence se čuva šifrovan i prikazuje samo na klik „Prikaži ključ“; svako otkrivanje se bilježi u audit.
- Ugovori (garancija, podrška, lizing, održavanje) pokrivaju jednu ili više stavki opreme; istekli ugovori su skriveni dok se ne uključi „Prikaži istekle“.
- Podsjetnik o isteku stiže jednom dnevno (od 06:00) onima koji upravljaju tom vrstom stavke u svojoj OJ, adminima i dodatnim internim adresama iz postavki; svaki prag (zadano 60, 30 i 7 dana) šalje se samo jednom.
- Korisnik u „Mojim notifikacijama“ može isključiti e-mail ili in-app kanal za kategoriju „Istek licenci, garancija i ugovora“.

## CMDB — uvoz i izvoz (C7, 30.9.2026)

- Uvoz se radi po tipu opreme: preuzme se šablon, popuni u Excelu i pošalje; ništa se ne upisuje dok se ne potvrdi pregled.
- Kolone se prepoznaju po nazivu; pogrešno prepoznata kolona se ispravi u mapiranju i pregled se ponovi.
- „Samo nova oprema“ preskače postojeće inventarne brojeve; „Nova i izmjena postojeće“ mijenja samo popunjene ćelije, a `#PRAZNO` briše vrijednost.
- „Sve ili ništa“ ne upisuje ništa ako i jedan red ima grešku; inače se upisuju ispravni redovi, a greške se preuzimaju kao Excel fajl za ispravku.
- Pregled vrijedi 24 sata; ako se oprema u međuvremenu promijeni, taj red se ne upisuje.
- Uvoz ne izdaje prenosnice — služi za početno stanje; prenosnica se izdaje pri svakom pojedinačnom kretanju opreme.
- Izvoz (Excel ili CSV) prati filtere popisa, do 10 000 redova, bilježi se u audit i nikad ne sadrži ključeve licenci.
- Administrator može uvoziti i s komandne linije (`assets-import.js`), uključujući probni prolaz bez upisa; demo inventar se dodaje i uklanja s `assets-seed-demo.js`.

## CMDB — računari iz Active Directoryja (C8, 30.9.2026)

- Radi tek kad je AD (LDAPS) veza podešena i uključena postavka „Sinhronizacija računara iz AD-a“; do tada je moguć samo probni prolaz.
- Prvi korak aktivacije je uvijek probni prolaz (u Katalogu ili komandom `assets-directory-sync.js --dry-run`) — pokazuje šta bi se dodalo, izmijenilo i gdje ima neslaganja, bez upisa.
- Računar iz AD-a se veže uz korisnika po polju managedBy, po pravilu imena računara (npr. PC-ime.prezime) ili po opisu; to je prijedlog, označen na kartici opreme.
- Ako je agent ručno zadužio računar drugom korisniku, ručna dodjela ostaje, a razlika se prikazuje u listi „AD neslaganja“.
- Ako već postoji ručno unesena ili uvezena stavka s istim nazivom računara, sinhronizacija je poveže umjesto da napravi duplikat; njeni podaci (inventarni broj, nabavka, garancija, lokacija) ostaju.
- Računar koji nestane iz AD-a ili bude onemogućen se ne briše; dobija oznaku „nije u AD-u od …“, a otpis radi čovjek.
- Zaštita: ako bi odjednom „nestalo“ previše računara (npr. pogrešan Base DN), ništa se ne označava i izvještaj upozorava.
- Računari koji se ne mogu smjestiti u organizacionu jedinicu preskaču se dok se ne podesi rezervna jedinica.

## Dežurstva i agenti s ulogom ograničenom na OJ (ispravka 2026-10-01)

- Kalendar dežurstava je zajednički za sve grupe; vidi ga svaki nosilac `oncall.read`, uključujući agente čija je uloga AGENT dodijeljena samo za njihovu organizacionu jedinicu.
- Uređivanje rasporeda i zamjena (`oncall.manage`) i dalje traži dodjelu bez ograničenja na OJ (administrator).
- Opšte pravilo ostaje: dozvola dodijeljena za jednu OJ ne otvara globalne administratorske funkcije; izuzeci su pobrojani u `scopeAgnosticPermissionKeys`.

## Problem management (3.3) – odluke korisnika (1.10.2026)

- Problemima upravljaju agenti u potpunosti: kreiranje, analiza uzroka, zatvaranje, otkazivanje i grupno rješavanje povezanih tiketa.
- Admini se ne opterećuju operativnim poslom; njihova uloga su osjetljive radnje (npr. jedan admin na 300 korisnika i 30 agenata koji dnevno riješe ~200 tiketa).
- Kad se uzrok otkloni, aplikacija nudi grupno rješavanje otvorenih povezanih tiketa uz poruku korisniku; ništa se ne rješava automatski.
- Rokovi za probleme postoje kao postavka i zadano su isključeni.
- Modul je zadano isključen i uključuje se postavkom.
- Podnosilac tiketa ne vidi problem ni analizu uzroka.
- Kad su rokovi uključeni, vlasnik problema dobija podsjetnik radni dan prije roka, na dan roka i jednom kad rok istekne — samo radnim danima, od 07:00.
- Riješen problem se automatski zatvara nakon podešenog broja dana (0 = nikad); u historiji piše da je zatvoren automatski.
- Ako se isti kvar ponovi nakon rješenja, tiket se i dalje može povezati s riješenim problemom; vlasnik dobija obavijest o ponavljanju. Zatvoren ili otkazan problem se ne može puniti novim tiketima.
- Agenti čiji su tiketi povezani s problemom dobijaju obavijest kad problem postane poznata greška (workaround) i kad je riješen.
- Uloga „Upravitelj problema“ (PROBLEM_MANAGER) dodaje se odabranim ljudima, obično vođi tima ili servisa. Samo oni i administratori rješavaju, zatvaraju i otkazuju probleme te grupno rješavaju povezane tikete iz svih organizacionih jedinica.
- Agenti i dalje prijavljuju probleme, povezuju tikete i vode analizu uzroka, workaround i poznatu grešku.
- Ako povezani tiket još niko nije preuzeo, grupno rješavanje ga automatski dodjeljuje onome ko rješava problem pa ga rješava; to se vidi u historiji tiketa.
- **Ažurirano (problem-grupe):** probleme vode upravitelji problema kroz problem-grupe (npr. „Radne stanice“). Admin grupu označi kao problem-grupu i u nju doda upravitelje problema; dok takve grupe nema, modul čeka podešavanje.
- Agent prijavljuje problem tako što izabere problem-grupu; povezuje i odvaja tikete, ali ne uređuje analizu uzroka (uzrok, 5 zašto, workaround) i ne mijenja status.
- Vlasnik problema može biti samo upravitelj problema iz te grupe. Ako vlasnik nije određen, upravitelji grupe dobiju obavijest, a bilo ko od njih problem preuzima dugmetom „Preuzmi“ i rješava ga ili zatvara.
- Podsjetnik za rok ide vlasniku, a ako ga nema – grupi. Obavijest o ponavljanju ide i vlasniku i grupi. Grupa problema se može promijeniti; vlasnik koji nije u novoj grupi se uklanja.
- Ko je prijavio problem, uvijek ga vidi.
- Problem može navesti zahvaćenu opremu iz evidencije imovine (uz prijedlog iz povezanih tiketa), dodatne servise i incidente sa status stranice; veze uređuje upravitelj problema iz grupe, a oprema i incident pokazuju povezane probleme.

## Filteri na listama (odluka 1.10.2026.)
- Kad lista ima pretragu i više od jednog filtera, filteri su skriveni iza dugmeta **Napredna pretraga**; u redu ostaju pretraga, „Poništi filtere“ i akcije (izvoz, „Nova …“).
- Dugme prikazuje broj aktivnih naprednih filtera; panel se sam otvori kad su filteri već primijenjeni (npr. link s filterima), da suženje liste nikad nije skriveno.
- U panelu svaki filter ima vidljiv naziv; kvačice su grupisane pod „Opcije“.
- Primjenjeno na Probleme i Imovinu (registar, ugovori, licence, prenosnice); zajednička komponenta `components/ui/filter-bar.tsx` za buduće liste.

## Change management (3.4) – odluke korisnika (1.10.2026.)
- Korisnik je unaprijed prihvatio sve preporuke iz dizajna (`docs/plans/modules/3.4-change-management.md` §22).
- Modul je zadano isključen i aktivan je tek uz bar jednu CAB grupu; CAB je obična grupa označena kvačicom „CAB grupa“.
- Glasaju samo članovi CAB grupe s pravom glasa; podnosilac ne glasa o svojoj promjeni, a ni administrator ne zaobilazi članstvo. Jedno odbijanje odbija promjenu.
- Standardne promjene nastaju samo iz šablona niskog ili srednjeg rizika i ne idu na CAB.
- Rizik računa sistem (uticaj × vjerovatnoća); korisnik ga ne upisuje.
- Konflikti termina su upozorenja uz obaveznu potvrdu; periodi zamrzavanja blokiraju sve osim hitnih promjena.
- Promjena koja uzrokuje prekid automatski planira održavanje servisa na status stranici.
- Pregled nakon realizacije je obavezan za zatvaranje; neuspjela promjena vezana za problem obavještava vlasnika problema.
- Uloga „Upravitelj promjena“ (CHANGE_MANAGER) dodaje se odabranim ljudima i vidi promjene svih organizacionih jedinica; agent čita i podnosi.
- Povezane promjene su na problemu i opremi u zasebnom tabu „Promjene“ (umjesto kartice u tabu „Veze“), uz dugme „Kreiraj promjenu“ – dosljedno s tabom „Problemi“ na opremi.
- Pretraga problema pri povezivanju poštuje vidljivost problema (OJ opseg) i nudi samo otvorene probleme; oprema se traži tek od 2 znaka.

## Teams konektor (3.1) i klijenti – odluke korisnika (2.10.2026.)
- Aplikacija nije pravljena za jednog naručioca: svaki klijent je samo jedan od budućih klijenata. Svako spominjanje ili hardkodiranje bilo kojeg klijenta uklonit će se u posebnom auditu.
- Teams konektor se razvija bez ikakvih produkcijskih Microsoft resursa (tenant, registracija aplikacije, Azure pretplata). Sve se dokazuje u režimu simulatora, a produkcijski režim je pripremljen tako da ga klijent aktivira sam.
- Prihvaćene su sve preporuke iz dizajna 3.1, osim onih koje su pretpostavljale da će jedan konkretni klijent nešto obezbijediti; lista preduslova je dio dokumentacije za svakog klijenta.
- Teams konektor je addon, zadano isključen; poruke u kanalu ne sadrže opis tiketa ni poruke, a naslov samo uz postavku.
- Svaka akcija iz Teamsa (preuzmi, odgovori, odobri, CAB glas, novi tiket) radi pod istim pravima kao u aplikaciji; korisnik se prepoznaje automatski preko istog Microsoft naloga, lokalni nalozi se ne povezuju.
- Teams obavijesti prate iste preference kao obavijesti u aplikaciji; korisnik ih može isključiti po vrsti događaja. Tihi sati važe za Teams samo ako ih korisnik ima uključene i za e-mail.
- Kanal tima povezuje samo osoba koja smije upravljati grupom; ostali dobiju objašnjenje.
- Ako je kartica zastarjela (neko je već preuzeo tiket ili glasao), Teams prikaže svježe stanje i poruku „U međuvremenu je promijenjeno“ – ništa se ne izvrši dvaput.
- Iz Teamsa se tiket kreira samo za servise bez obaveznog formulara; za ostale Teams vodi u aplikaciju na isti servis.
- Tiket se može kreirati i iz bilo koje Teams poruke („Kreiraj tiket iz poruke“) – opis se popuni tekstom poruke i linkom na nju.
- Svaka akcija iz Teamsa upisuje se u audit log s oznakom kanala „teams“.
- Administracija → Operacije → Microsoft Teams: status konektora, provjera spremnosti (bez slanja poruka), preuzimanje Teams paketa i upravljanje povezanim kanalima.
- Simulator Teamsa dozvoljava da se cijeli tok (instalacija, komande, kartice, dugmad, novi tiket) isproba bez ikakvog Microsoft naloga ili pretplate.
- Na stranici „Moje obavijesti“ vidi se da li je Teams aplikacija povezana, i tu se Teams obavijesti uključuju po događaju.
- Stari „Teams (stub)“ dodatak je uklonjen iz aplikacije; Teams se uključuje isključivo dodatkom „Microsoft Teams konektor“.
- Bot u ličnom chatu odgovara i na: `tiket HD-123` (ili samo broj), `traži <tekst>`, `odobrenja` i `status`; agenti dodatno `dodijeljeni`, `red`, `sla`, `cab` (uz modul promjena) i `dežurni` (uz pravo čitanja dežurstava). Komande rade s dijakriticima i bez, na bosanskom i engleskom.
- Bot nikad ne pokazuje više nego web aplikacija: svaki odgovor ide kroz ista prava i opseg OJ; za tiket koji ne postoji i tiket koji korisniku nije dostupan odgovor je isti.
- Liste u Teamsu su kratke (5 za korisnika, 10 za agenta); ispod je „Prikazano X od Y“ i dugme „Otvori sve u aplikaciji“ s istim filterom.
- `pomoć` pokazuje samo komande koje korisnik smije koristiti.
- Kad je uključen KB intercept, Teams formular za novi tiket ima dugme „Dalje“: ako postoje članci za servis, bot prvo ponudi do 3 članka i dugmad „Riješeno, ne treba tiket“ (bilježi se kao skretanje, isto kao na webu) i „Ipak kreiraj tiket“; bez članaka tiket se kreira odmah. Isto vrijedi za „Kreiraj tiket iz poruke“.

### T102 — Tab CSAT: prosjek, uzorak i razrez po jedinici, servisu i grupi

- **Modul / paket:** Nadzorna ploča i izvještaji (M15) + Odobrenja i CSAT (M9)
- **Publika:** ADMIN / SUPER_ADMIN s pravom izvoza
- **Tip:** Pravilo
- **Teza:** Tab **CSAT** u `/reports` čita `GET /tickets/csat/summary` i prikazuje **prosječnu ocjenu na
  važećoj skali**, **broj ocjena**, **prag zadovoljan** (80 % skale; na 5 → 4, na 10 → 8) i razrez po
  **organizacionoj jedinici, servisu i grupi** — svaki red nosi **naziv razreza** (iz šifarnika; ključ samo ako
  zapis više ne postoji), prosjek, veličinu uzorka i oznaku **ispod praga** kad je prosjek ispod granice. Razrez
  poštuje vidljivost tiketa aktera, ali **ne** filtrira po periodu (API nema parametre); za serije kroz vrijeme
  služi tab **Trendovi**.
- **Zašto:** RAW traži CSAT po OU/servisu/grupi; agregacija je postojala u servisu bez ijednog ekrana, pa
  menadžment nije imao gdje vidjeti razliku između organizacionih jedinica.
- **Primjer:** Prosjek 4,2 na skali 5 uz 12 ocjena za jednu jedinicu i 2,0 uz 2 ocjene za drugu; mali uzorak
  je vidljiv kao broj, a ne skriven.
- **Postavke / permisije:** `private.csat.scaleMax`; ruta `/reports` (pravo `reports.export`/`audit.export`),
  `GET /tickets/csat/summary` traži rolu `agent|admin|superAdmin`.
- **Ekran:** **Izvještaji → CSAT**.
- **Izvori:** `backend/src/modules/tickets/csat/aggregate-ticket-csat.ts` (`satisfiedMinRating`),
  `csat/csat.types.ts`, `csat/tickets-csat-summary.controller.ts`,
  `frontend/src/components/reports/reports-csat-panel.tsx`,
  `frontend/src/lib/reports/csat-view.ts`, `frontend/src/services/tickets-csat-api.ts`.
- **Status:** Važi (isporučeno u valu 1, 2026-10-03)
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 3b (CSAT razrez)

### T103 — Tab Uska grla: brojači, razrez i dnevni trend

- **Modul / paket:** Nadzorna ploča i izvještaji (M15)
- **Publika:** ADMIN / SUPER_ADMIN s pravom izvoza
- **Tip:** Pravilo
- **Teza:** Tab **Uska grla** čita `GET /reports/bottlenecks` (rola `admin|superAdmin` + pravo izvoza) i
  prikazuje **četiri brojača** (čeka odobrenje, čeka korisnika, neusmjereno, prekoračeno), **tri razreza**
  (organizaciona jedinica, servis, prioritet) sa **nazivima** jedinica i servisa iz šifarnika (prioritet se
  prikazuje kao preveden naziv; ključ ostaje samo ako zapis više ne postoji) i **dnevni trend** (novi tiketi po
  danu i stanja zastoja), uz isti **period** i **OU opseg** kao tab Pregled. Kad je postavka
  `private.dashboard.bottlenecks.enabled` isključena, endpoint ne vraća razrez, tab prikazuje stanje sa
  objašnjenjem, a grafik „Bottleneck“ u pregledu se ne renderuje.
- **Zašto:** RAW („gdje tiketi stoje“, razrez po OU/servisu/prioritetu, trend) nije bio vidljiv nijednom
  korisniku iako je API postojao.
- **Primjer:** 14 tiketa prekoračeno, najviše u servisu „Pristup mreži“; trend pokazuje rast zastoja u
  zadnjoj sedmici.
- **Postavke / permisije:** `private.dashboard.bottlenecks.enabled`,
  `private.dashboard.bottlenecks.defaultWindowDays`; rola `admin|superAdmin` + `reports.export`/`audit.export`.
- **Ekran:** **Izvještaji → Uska grla**.
- **Izvori:** `backend/src/modules/reports/reports.controller.ts:123–130`,
  `reports/bottleneck/aggregate-bottleneck-dashboard.ts`,
  `reports/bottleneck/sql-bottleneck-dashboard-store.ts`, `reports/load-report-lookups.ts`,
  `frontend/src/components/reports/reports-bottlenecks-panel.tsx`,
  `frontend/src/lib/reports/bottleneck-view.ts`, `frontend/src/services/reports-api.ts`.
- **Status:** Važi (isporučeno u valu 1, 2026-10-03; nazivi razreza dopunjeni istog dana)
- **Wiki stranica:** Nadzorna ploča i izvještaji → Korak po korak 3a (Uska grla)
