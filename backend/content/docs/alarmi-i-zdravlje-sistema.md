# Alarmi i zdravlje sistema

> **Namjena:** ova stranica objašnjava šta znače alarmi koje aplikacija prikazuje i šalje, kako se otvaraju i
> zatvaraju, šta administrator radi kad se alarm pojavi i gdje se mijenjaju pragovi. Prikazuje se na ekranu
> **Administracija → Red poslova i audit**.

## Čemu služi ovaj modul

- **Zdravlje sistema** pokazuje stanje komponenti (worker, baza, Redis, API), zakazanih poslova i redova, te
  listu aktivnih alarma.
- **Alarm** je jasno definisano stanje koje traži pažnju: npr. worker ne radi, disk za priloge se puni ili je
  previše neuspjelih prijava. Za svaki alarm postoji naslov, kratko uputstvo šta prvo provjeriti i nivo
  **upozorenje** ili **kritično**.
- **Sigurnosne metrike (zadnji sat)** broje blokirane prijave (429), odbijene i preskočene CAPTCHA provjere,
  neuspjehe drugog faktora i preskočene provjere lozinki. Brojevi su agregirani i ne sadrže lične podatke.

## Kome je namijenjen

- **Administratorima** s pravom **ops.health.view** (pregled Zdravlja sistema) i s pravom
  **ops.alerts.manage** (preuzimanje i utišavanje alarma, slanje testnog alarma).
- **SUPER_ADMIN** vidi sve, uključujući karticu **Sigurnosne metrike**.
- Primaoci alarma su korisnici s pravom **ops.alerts.receive** i dodatne adrese iz postavki.

## Kako doći

- **Administracija → Red poslova i audit** — kartice **Zdravlje sistema** (komponente, zakazani poslovi, redovi,
  aktivni alarmi) i **Sigurnosne metrike (zadnji sat)** (samo SUPER_ADMIN).
- **Postavke → Operativa** — kanali za alarme (`private.ops.alerts.*`) i pragovi (`private.ops.thresholds.*`).

## Korak po korak

### Kako alarm nastaje i prestaje

1. Aplikacija provjerava stanje **svake minute**.
2. Alarm se **otvara** tek kad uslov traje dvije uzastopne provjere (za neke alarme, kao *Worker ne radi*,
   jedna provjera je dovoljna). Tako se izbjegavaju lažni alarmi zbog jednog lošeg trenutka.
3. Alarm se **zatvara** kad uslov nestane u dvije uzastopne provjere.
4. Dok je alarm otvoren, primaoci dobijaju **podsjetnik** svakih **4 sata** (zadano; podesivo od 1 do 48 sati u
   `private.ops.alerts.reminderHours`), sve dok ga neko ne preuzme.

### Šta uraditi kad se alarm pojavi

1. Otvorite karticu **Zdravlje sistema** i kliknite alarm. Uputstvo pod naslovom kaže šta prvo provjeriti.
2. Ako radite na problemu, kliknite **Preuzimam**. Zapisuje se ko je preuzeo alarm, a podsjetnici se zaustavljaju.
3. Ako su u toku planirani radovi, koristite **Utišaj alarme**: unesite trajanje i razlog (obavezno). Provjere i
   historija rade dalje, ali se poruke ne šalju. Akcija se bilježi u revizijski dnevnik.
4. Kad se uzrok otkloni, alarm se sam zatvara kad se stanje vrati u normalu.

### Provjera kanala za alarme

**Pošalji testni alarm** šalje poruku svim podešenim kanalima i prikazuje ishod po kanalu. Ako kanal nije
isporučio poruku, ishod kaže razlog: nema primalaca (nedostaje **ops.alerts.receive** ili dodatna adresa),
kanal nije podešen, ili je e-mail kanal isključen u postavkama.

### Sigurnosni alarmi

Tri alarma dolaze iz brojača sigurnosnih metrika. Brojač se računa za zadnji sat, a alarm se otvara kad
**broj dostigne prag** (ne samo kad ga premaši):

| Alarm | Šta znači | Upozorenje od | Kritično od | Prvi korak |
|---|---|---|---|---|
| **Blokirane prijave (429) prelaze prag** | Mnogo prijava je blokirano zbog neuspjelih pokušaja. | 50 po satu | 200 po satu | Provjerite metrike, izvor u odgovoru 429 (`Retry-After`) i po potrebi `ipMaxFailures` / `ipWindowSeconds`. Ako je izvor NAT ili proxy, povećajte prag ili izuzmite izvor na mreži. Ako je riječ o pogađanju lozinki, blokirajte izvor. |
| **CAPTCHA provjere se često odbijaju** | Klijent šalje rješenja koja Cloudflare ne prihvata: istekla rješenja, pogrešan site key ili automatizovani klijent. | 50 po satu | 200 po satu | Pogledajte metapodatke prijava u sigurnosnom dnevniku i karticu **Sigurnosne metrike**. Ako brojevi rastu bez stvarnih korisnika, riječ je o automatizovanom klijentu. Prag ne snižavajte bez analize. |
| **CAPTCHA provjera se preskače (Cloudflare nedostupan)** | Server ne može da pita Cloudflare Turnstile (timeout, mreža ili neuspješan odgovor), pa prijave prolaze samo uz ograničenja. | 50 po satu | 200 po satu | Provjerite izlazni pristup servera prema Cloudflare-u. Ako instalacija po projektu nema internet, vratite provajder CAPTCHA-e na `none`. |

Detalji o CAPTCHA provjeri su na stranici [Provjera da niste robot (CAPTCHA)](/docs/captcha-provjera).

### Gdje se mijenjaju pragovi

Pragovi su u **Postavke → Operativa**:

- `private.ops.thresholds.login429WarnPerHour` i `…login429CriticalPerHour` — blokirane prijave (zadano 50 i 200);
- `private.ops.thresholds.captchaFailedWarnPerHour` i `…captchaFailedCriticalPerHour` — odbijene CAPTCHA provjere
  (zadano 50 i 200);
- `private.ops.thresholds.captchaSkippedWarnPerHour` i `…captchaSkippedCriticalPerHour` — preskočene CAPTCHA
  provjere (zadano 50 i 200).

Upozorenje može biti od 1, a kritično od 2 naviše. Prag podižite ili spuštajte samo na osnovu mjerenja u kartici
**Sigurnosne metrike**, ne unaprijed.

## Polja, validacije i statusi

| Pojam | Značenje |
|---|---|
| **Upozorenje** | Uslov je prisutan, ali nije kritičan. Ide primaocima kao i kritični alarm. |
| **Kritično** | Brojač je dostigao kritični prag. Traži odmah reakciju. |
| **Preuzeto** | Neko je preuzeo alarm; podsjetnici su zaustavljeni. Prikazuje se ime i vrijeme. |
| **Utišano** | Slanje poruka je privremeno zaustavljeno (npr. za planirane radove) uz obavezan razlog. |
| **Podsjetnik** | Ponovna poruka dok je alarm otvoren i nije preuzet (zadano svakih 4 sata). |

## Česta pitanja i greške

- **„Alarm je otvoren, a nisam dobio poruku.“** — Pokrenite **Pošalji testni alarm**. Ishod kaže da li nedostaje
  primalac, kanal ili je e-mail isključen.
- **„Vidim alarm, ali nema šta da se uradi.“** — Alarm se zatvara sam kad se uslov vrati u normalu. Ako ostane
  otvoren, provjerite karticu **Zdravlje sistema** i uputstvo uz alarm.
- **„Alarm za 429 se stalno pali iz iste kancelarije.“** — Mnogi korisnici iza jedne IP adrese (NAT) broje se
  zajedno. Vidi uputstvo uz alarm; ne popuštajte prag bez provjere izvora.
- **„Ne vidim karticu Sigurnosne metrike.“** — Kartica je samo za SUPER_ADMIN.

## Poznata ograničenja

- Sigurnosni alarmi rade na brojačima po satu, pa reagiraju sa zakašnjenjem od do jedne minute i ne pokazuju
  pojedinačne pokušaje.
- Sigurnosne metrike broje događaje po IP adresi, a ne po nalogu.
- Podsjetnici se šalju samo dok je alarm otvoren i nije preuzet.

## Povezani moduli

- [Provjera da niste robot (CAPTCHA)](/docs/captcha-provjera) — uključivanje provjere i njeni alarmi.
- [Izvoz sigurnosnog dnevnika na webhook](/docs/webhook-izvoz-dnevnika) — slanje sigurnosnih događaja na vanjski sistem.
- [Prijava i potvrda u dva koraka (MFA)](/docs/prijava-i-mfa) — šta korisnik vidi kad prijava bude blokirana.
- [Uloge i permisije (RBAC)](/docs/uloge-i-permisije) — prava za pregled i upravljanje alarmima.
