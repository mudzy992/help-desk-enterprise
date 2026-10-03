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

### T31 — Default mapping rola → permisije postoji u kodu, ali nije upisan pri instalaciji

- **Modul / paket:** RBAC
- **Publika:** SUPER_ADMIN / instalater
- **Tip:** Ograničenje
- **Teza:** Standardni mapping iz zadatka (USER/AGENT/ADMIN) definisan je u kodu
  (`defaultRolePermissionKeys`), ali se **ne upisuje** u bazu pri instalaciji niti pri kreiranju role; tabele
  `Permission`/`RolePermission` pune se tek kada SUPER_ADMIN sačuva permisije na ekranu **Permisije** ili kad se
  primijeni policy paket. Do tada ADMIN i AGENT ne mogu izvršavati akcije koje traže permisiju.
- **Zašto:** dokumentacija ne smije tvrditi da su defaulti aktivni odmah.
- **Primjer:** Nakon instalacije, ADMIN klikom na **Grupe** → **Nova grupa** dobija 403 dok SuperAdmin ne
  sačuva permisije role ADMIN.
- **Postavke / permisije:** `defaultRolePermissionKeys`, `permissionKeys.groupManage`, `settings.write`.
- **Ekran:** Administracija → **Permisije**.
- **Izvori:** `backend/src/modules/authorization/authorization.constants.ts:205–217`;
  `backend/src/modules/rbac/replace-role-permissions.ts:36–44`;
  `backend/src/modules/policy-packs/ensure-policy-pack-catalog.ts:83–95`;
  odsustvo upisa u `backend/prisma/migrations/20260909180000_init_enterprise_schema` i u `modules/install`.
- **Status:** Privremeno (nalaz B1, `REVIEW_ANALIZA.md` §M4)
- **Wiki stranica:** Administracija → Uloge i permisije

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
