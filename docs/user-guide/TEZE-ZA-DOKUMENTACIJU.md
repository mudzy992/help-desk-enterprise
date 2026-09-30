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
- **Primjer:** <konkretna situacija, po mogućnosti iz EPBiH prakse>
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
  `index.html` i `/assets/`)
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
- **Primjer:** interna `epbih.ba`, pojedinačne `test.user@gmail.com, test.agent@gmail.com` →
  ti testni nalozi dobijaju e-mail, ostale gmail adrese ne.
- **Zamka:** ograničena dostava s praznim listama (i bez interne domene) ne šalje **nikome**. Kartica
  SMTP u postavkama tada prikazuje upozorenje.
- **Postavke / permisije:** `private.notifications.email.internalOnly` (zadano uključeno),
  `…internalDomainsCsv` (instalacija upisuje domenu super admina; postojeće instalacije dobijaju
  `epbih.ba` migracijom), `…allowedExternalDomainsCsv`, `…allowedExternalEmailsCsv` (zadano prazno).
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

- Lokacije su stablo, npr. Direkcija → ED Zenica → Zenica, Visoko, Kakanj.
- Pri svakom kretanju opreme generiše se prenosnica po DOCX šablonu organizacije.
- Scenariji kretanja: skladište → korisnik, korisnik → korisnik i korisnik → skladište.
- Polja na prenosnici su: ko predaje, ko preuzima, naziv opreme, inventarni broj i potpisnik.
- Potpisnik se definiše po organizacionoj jedinici i nasljeđuje se na sve jedinice ispod nje, dok niža jedinica ne definiše svog (Direkcija → ED Zenica → Snabdijevanje).
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
