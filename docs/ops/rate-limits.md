# Ograničenja prijava (rate limits) — podešavanje, nadzor i runbook

> Paket 5.4.0-b (M2) + 5.4.0-d/e + 5.4.1 (CAPTCHA/Turnstile): pragovi su **konfiguracija** (`private.security.rateLimits.*`),
> mijenjaju se iz admin panela bez restarta, a svaka promjena ima razlog i trag u dnevniku.
> Ova stranica je operativno uputstvo: šta je pokriveno, koje su granice, kako se prag mijenja,
> kako se prati učinak i šta raditi kad 429 krene u pogrešnu stranu.

Aplikacija štiti autentikacijske tokove s tri odvojena brojača („bucket-a"):

| Bucket | Ključ (Redis) | Šta pokriva |
|---|---|---|
| **Account** | `auth:login-fail:account-state:v2:<hmac-sha256(email)>` | neuspjesi lozinke po računu → **progresivna odgoda** (nikad lockout) |
| **IP** | `auth:login-fail:ip:<hmac-sha256(ip)>` | neuspjesi lozinke po izvoru → **429** |
| **Other** | `auth:change-password-fail:<ip>`, `auth:mfa-fail:<user-id>` | change-password, MFA potvrde, Entra token exchange → **429** |

Ključevi su pseudonimizirani (HMAC-SHA256 za account i IP); plaintext e-mail ili IP se nikad ne
upisuju u Redis. Bez Redisa limiter radi s in-memory fallbackom (samo za testove i jednoprocesni
razvoj — tada brojači nisu dijeljeni između replika).

---

## 1. Pragovi, granice i ponašanje

Vrijednosti žive u settings registru (`private.security.rateLimits.*`) i čitaju se **po zahtjevu**
(`SecurityRateLimitConfigLoader` u `backend/src/modules/authentication/security/`), pa promjena
važi od sljedećeg pokušaja — bez restarta i bez redeploya.

| Ključ (skraćeno) | Polje | Default | Dozvoljeno (min–max) |
|---|---|---|---|
| `passwordLogin.accountWindowSeconds` | prozor account bucket-a | 1800 (30 min) | 60 – 86400 |
| `passwordLogin.accountDelayStartsAfterFailures` | odgoda počinje nakon | 3 | 1 – 20 |
| `passwordLogin.accountDelayBaseMilliseconds` | prva odgoda | 250 ms | 0 – 5000 |
| `passwordLogin.accountDelayMaxMilliseconds` | gornja granica odgode | 2000 ms | 0 – 10000 |
| `passwordLogin.ipMaxFailures` | neuspjesi po IP-u do 429 | 40 | 10 – 500 |
| `passwordLogin.ipWindowSeconds` | prozor IP bucket-a | 300 (5 min) | 10 – 3600 |
| `other.maxFailures` | neuspjesi (MFA/change-password/Entra) | 5 | 3 – 100 |
| `other.windowSeconds` | prozor „other" bucket-a | 900 (15 min) | 10 – 86400 |

Cross-pravilo koje server provjerava pri snimanju: `accountDelayStartsAfterFailures` ne smije biti
veći od `ipMaxFailures` (IP bucket bi inače uvijek otvorio prvi), a
`accountDelayMaxMilliseconds` ne smije biti manji od `accountDelayBaseMilliseconds`.

**Namjerno nema account lockout-a.** Račun se nikad ne zaključava; neuspjesi samo dodaju ograničenu
odgodu (bounded backoff), pa ispravna lozinka prolazi i nakon pogrešnog unosa („lock-out Boba"
DoS nije moguć). 429 dobija isključivo izvor (IP) i „other" bucket.

Ostali, i dalje fiksni pragovi:

- **TOTP replay zaštita** (`mfa.service.ts`): prihvataju se samo kodovi tekućeg i ±1 perioda (30 s),
  a iskorišteni korak se ne može ponoviti.
- **Install wizard**: nakon `/install/complete` svi `POST/PUT/DELETE` ispod `/install/*` vraćaju
  `423 INSTALL_LOCKED`; javno ostaju samo `GET /install/status` i `GET /install/addons`.

### 1.1 Odgovor kada je prag prekoračen

```http
HTTP/1.1 429 Too Many Requests
{ "code": "TOO_MANY_LOGIN_ATTEMPTS",
  "message": "Too many failed sign-in attempts, try again later",
  "details": { "retryAfterSeconds": 300 } }
```

`retryAfterSeconds` je **prozor koji je tada bio konfigurisan** — nakon promjene pragova se mijenja
i taj broj (spec 47 upravo to provjerava). Blokada je privremena: bucket ističe s TTL-om prozora.

---

## 2. Kako se prag mijenja (admin panel + API)

**Panel:** *Administracija → Sigurnost* (SuperAdmin) → kartica **„Ograničenja prijava"**.
Kartica prikazuje tri grupe s trenutnim vrijednostima; klik na grupu otvara dijalog
(`admin-rate-limits-dialog`) u kojem se svi pragovi mijenjaju **zajedno**, uz obavezan razlog
(najmanje 5 znakova) i potvrdu identiteta — trenutni TOTP kod ili passkey step-up za radnju
„rate-limits-change". Polja prikazuju granice koje server provjerava (`Dozvoljeno: min–max`), a
dugme za snimanje je onemogućeno dok je vrijednost izvan granica ili razlog prekratak.

**API:**

Zajednička adresa API-ja je `API_PUBLIC_URL` (u web klijentu `VITE_API_BASE_URL`); na instalaciji
bez prefiksa i sa portom backend-a to je npr. `http://localhost:10001`.

```bash
API="${API_PUBLIC_URL:-http://localhost:10001}"

# čitanje (SUPER_ADMIN)
curl -s -H "Authorization: Bearer $TOKEN" "$API/security/rate-limits"
# → { "config": { … }, "bounds": { … } }

# promjena: jedan batch, jedan razlog, jedan dokaz identiteta
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"config":{"accountWindowSeconds":1800,"accountDelayStartsAfterFailures":3,
        "accountDelayBaseMilliseconds":250,"accountDelayMaxMilliseconds":2000,
        "ipMaxFailures":60,"ipWindowSeconds":300,
        "otherMaxFailures":5,"otherWindowSeconds":900},
       "reason":"kalibracija: veliki NAT proxy u sjedištu","code":"123456"}' \
  "$API/security/rate-limits"
```

Oba endpointa su **samo SUPER_ADMIN** (`@RequireRoles`); sve ostale role dobijaju `403`.

Šta se upisuje:

- **change-log**: po jedan zapis za svaki promijenjeni ključ (`setting.update`, with reason) —
  jedan batch, jedna transakcija (all-or-nothing);
- **sigurnosni dnevnik**: `auth.rate_limits_changed` s novim pragovima (`ipMaxFailures`,
  `ipWindowSeconds`, `accountDelayStartsAfterFailures`, `otherMaxFailures`) — bez PII;
- **dnevnik promjena** je vidljiv i u panelu (kartica „Sigurnosni dnevnik" na istoj stranici).

Odbijanja: `400 RATE_LIMITS_INVALID` (vrijednost izvan granica ili cross-pravilo),
`400` validacijska greška (razlog kraći od 5 znakova), `401 MFA_INVALID_CODE` (pogrešan kod),
`403 FORBIDDEN` (nije SuperAdmin).

---

## 3. Nadzor: metrike i dnevnik

Metrike su agregatni brojači po minuti (`LoginSecurityMetricsService`), ključ
`security:metrics:<event>:<minute>` s TTL-om **2 h**; endpoint agregira zadnjih **60 minuta**:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$API/security/metrics/last-hour"
```

```json
{ "generatedAt": "…", "windowSeconds": 3600,
  "metrics": {
    "login-429":              { "total": 12, "peakPerMinute": 4, "points": [ … ] },
    "login-account-delays":   { "total": 31, "peakPerMinute": 9, "points": [ … ] },
    "mfa-failures":           { "total": 3,  "peakPerMinute": 1, "points": [ … ] },
    "hibp-skipped":           { "total": 0,  "peakPerMinute": 0, "points": [ … ] },
    "captcha-skipped":        { "total": 0,  "peakPerMinute": 0, "points": [ … ] },
    "captcha-failed":         { "total": 0,  "peakPerMinute": 0, "points": [ … ] } } }
```

Isti brojevi se crtaju na *Administracija → Sigurnost* (kartica „Sigurnosne metrike (zadnji sat)"),
a kartica „Ograničenja prijava" prikazuje trenutne pragove uz njih — pa se odluka o kalibraciji
donosi na jednom ekranu.

| Signal | Značenje | Tipična radnja |
|---|---|---|
| `login-429` raste | IP bucket se puni; često NAT/proxy, password spray ili pokvaren klijent | provjeri izvor (`Retry-After` u odgovoru), podesi `ipMaxFailures`/`ipWindowSeconds` |
| `login-account-delays` raste bez `login-429` | korisnici griješe lozinku; odgoda radi kako treba | ako je odgoda preduga za normalan rad, smanji `accountDelayBaseMilliseconds` |
| `mfa-failures` raste | pogrešni TOTP/recovery kodovi (ili napad na drugi faktor) | provjeri sigurnosni dnevnik (`auth.mfa_failed`), kontaktiraj korisnika |
| `hibp-skipped` raste | Pwned Passwords provjera nije mogla proći (timeout/mreža) → lozinka je **prihvaćena** (fail-open) | provjeri izlazni pristup; nije blokada, ali je smanjena zaštita |
| `captcha-skipped` raste | Cloudflare Turnstile nije odgovorio (timeout/mreža/ne-2xx) → dokaz nije prihvaćen, pragovi ostaju jedina zaštita | provjeri izlazni pristup servera; ako internet nije predviđen, vrati `provider` na `none` (§5) |
| `captcha-failed` raste | klijent je poslao rješenje koje Cloudflare nije prihvatio (isteklo, pogrešan site key, skripta u petlji) | pogledaj metapodatke prijave u dnevniku; ako raste bez korisnika, to je automatizovani klijent |

### 3.1 Alarm na 429 prag (automatizovan)

`login-429` je od dopune vala f i **ops alarm** — ne samo graf. Worker (red `ops-health`,
provjera svake minute) sabira zadnjih **60 kompletnih minuta** iste metrike i poredi ih s dva praga:

| Postavka | Zadano | Težina | Granice |
|---|---|---|---|
| `private.ops.thresholds.login429WarnPerHour` | **50** blokada/h | UPOZORENJE | 1 – 100000 |
| `private.ops.thresholds.login429CriticalPerHour` | **200** blokada/h | KRITIČNO | 2 – 200000 |

Alarm `auth.login429.high` otvara se nakon **dvije** uzastopne provjere iznad praga (histereza protiv
flappinga) i zatvara nakon dvije ispod; broj, pragovi i prozor stoje u detaljima poruke. Ako Redis
nije čitljiv, metrika je **nepoznata** i alarm se ne otvara — to stanje pokriva `redis.unavailable`.
Pragovi se mijenjaju kroz **Administracija → Postavke i dodaci → Opservabilnost i podrška**
(isti registry kao ostali ops pragovi), a postupak i prve radnje su u [`ops/runbook/ALERTS.md#login-429`](../runbook/ALERTS.md#login-429).

> **Zašto 50/h i 200/h?** Blokira se samo izvor (IP), nikad nalog, pa je i nekoliko desetina blokada
> na sat normalno iza velikog NAT-a gdje ljudi griješe lozinku. Zadano **50/h** dolazi iz plana paketa 5.4 (M2: „alarm kad satna stopa 429 pređe prag (default 50)"),
> a kritično **200/h** je četverostruki prag upozorenja — isti odnos kao kod WebSocket alarma (600/3000).
> Kritična razina opisuje burst koji znači napad probanja lozinki ili klijent u petlji. Pragovi su namjerno **podesivi**: kalibriraj ih
> nakon prve sedmice rada (vidi §4) i upiši razlog u dnevnik izmjena.

### 3.2 Alarmi na CAPTCHA metrike (automatizovani)

Dvije metrike iz §2 imaju istu logiku kao `login-429`: worker sabira zadnjih **60 kompletnih
minuta** i poredi s pragovima. Svaki alarm ima vlastite pragove; oba su u istom registru.

| Alarm | Metrika | Postavka (upozorenje / kritično) | Zadano |
|---|---|---|---|
| `auth.captchaFailed.high` | `captcha-failed` | `private.ops.thresholds.captchaFailedWarnPerHour` / `…CriticalPerHour` | 50 / 200 po satu |
| `auth.captchaSkipped.high` | `captcha-skipped` | `private.ops.thresholds.captchaSkippedWarnPerHour` / `…CriticalPerHour` | 50 / 200 po satu |

Oba alarma se otvaraju nakon dvije uzastopne provjere iznad praga i zatvaraju nakon dvije ispod.
Ako Redis nije čitljiv, metrika je nepoznata i alarm se ne otvara. Postupak je u
[`ops/runbook/ALERTS.md`](../../ops/runbook/ALERTS.md#captcha-failed) (odbijanja) i
[`#captcha-skipped`](../../ops/runbook/ALERTS.md#captcha-skipped) (preskakanja). Pločice na kartici
*Sigurnosne metrike* prikazuju iste brojeve.

### 3.3 Dnevnik (audit)

U sigurnosnom dnevniku (`GET /security/audit-log`, kartica na istoj stranici):

- `auth.rate_limits_changed` — pragovi promijenjeni (metapodaci: četiri broja, bez PII);
- `auth.login_failed` — **samo** stvarno odbijene vjerodajnice (pseudonimizirani e-mail/IP);
- `auth.mfa_failed`, `auth.mfa_disabled`, `auth.mfa_passkey_*` — promjene faktora.

---

## 4. Kalibracija i vraćanje (runbook)

Procedura koja se koristi i u E2E specifikaciji 47 (snimi → promijeni → dokaži → vrati):

1. **Snimi trenutno stanje** — `GET /security/rate-limits` (ili pogledaj karticu). Bez ovog koraka
   nema pouzdanog vraćanja.
2. **Promijeni jedan prag odjednom** i upiši razlog koji opisuje mjerenje (npr. „kalibracija nakon
   lažnih blokada u sjedištu"). Jedan batch mijenja sve, ali razlog treba biti jedna rečenica.
3. **Dokaži učinak**: pričekaj promet ili, u testu, izazovi neuspjehe i provjeri da
   `login-429` poraste i da 429 nosi novi `retryAfterSeconds`.
4. **Vrati izvorne vrijednosti** (isti endpoint, novi razlog: „vraćanje nakon mjerenja"). Lozinke se
   ne mijenjaju; ako je IP bucket pun, sam ističe kroz prozor.

Simptom → podešavanje:

- **Veliki NAT/proxy dijeljeni između ureda** → povisi `ipMaxFailures` (do 500) ili
  `ipWindowSeconds`; ne diraj account odgodu.
- **Korisnici redovno griješe 4–5 puta** → `accountDelayStartsAfterFailures` gore i/ili
  `accountDelayBaseMilliseconds` dolje (odgoda je osjetna, ne kaznena).
- **Client-side retry (mobile) udara u „other" bucket** → povisi `other.maxFailures` /
  `other.windowSeconds`, ne `ipMaxFailures`.
- **Pravi password spray** → **ne** spuštaj account odgodu; drži IP limit i razmotri dodatnu zaštitu:
  ugrađeni **CAPTCHA/Turnstile** (§5) ili WAF na rubu mreže.

> ⚠️ Ne postavljaj `ipMaxFailures` na maksimum bez druge zaštite. Bez IP limita password spray s
> jedne adrese je izvediv, a account odgoda od 2 s je za takav napad preblaga.

---

## 5. CAPTCHA / Turnstile (paket 5.4.1)

Od paketa 5.4.1 uz pragove može stajati i **ljudski dokaz**: Cloudflare Turnstile. Nije zamjena za
ograničenja — limiter i dalje broji i odgađa — nego dodatni uslov za pokušaj koji dolazi s IP adrese
koja je već prikupila **pet** neuspjeha, ili prag blokade ako je on **niži od pet** (`ipMaxFailures`
u §1). Tako se izazov uvijek pokaže prije privremenog `429`, a ne poslije njega.

| Ključ | Značenje | Zadano |
|---|---|---|
| `private.security.captcha.provider` | `'none'` (isključeno) ili `'turnstile'` | `'none'` |
| `private.security.captcha.siteKey` | javni site key koji stranica prijave prikazuje | prazno |
| `private.security.captcha.secretKey` | tajni ključ za provjeru na serveru (**tajna postavka**, nikad se ne prikazuje) | prazno |

**Uključivanje:** *Administracija → Sigurnost* → kartica **Sigurnosne postavke** → red **Provjera da
niste robot (CAPTCHA)** → dijalog (razlog, zavisnosti, trag u dnevniku izmjena). Dok je `provider` na
`none`, a to je zadano, ponašanje je **isto kao prije ovog paketa**: nijedan zahtjev ne ide
Cloudflareu i nijedna prijava ne traži dokaz.

**Kako radi** (server: `LoginCaptchaService` unutar `LoginAttemptLimiter`-a):

1. Nakon **pet neuspjelih prijava s iste IP adrese** (isti IP bucket iz §1; ili prag blokade ako je
   niži) svaki sljedeći pokušaj mora nositi **svježe rješenje izazova**. Bez njega server vraća `400 CAPTCHA_REQUIRED`, a stranica
   prijave tada prikaže widget i šalje pokušaj ponovo tek s rješenjem.
2. **Rješenje važi za jedan pokušaj.** Ako je adresa već prešla i prag blokade, rješenje odblokira
   **tačno taj jedan pokušaj** — brojači se dalje pune, pa automatizovani klijent plaća dokaz po
   pokušaju (a to je i svrha provjere).
3. **Pogrešno ili isteklo rješenje** vraća `400 CAPTCHA_FAILED`; widget se resetuje i traži novo
   rješenje (Turnstile token je jednokratan).
4. **Cloudflare nedostupan** (timeout 3 s, mrežna greška, ne-2xx odgovor) ili **tajni ključ nije
   upisan** ne pušta dokaz kao ispravan: neblokirana adresa nastavlja po pragovima kao i prije, a
   blokirana ostaje blokirana do isteka prozora. Svaki takav poziv ostavlja **jedan sanitizovani
   `warn`** u logu (bez tokena i bez ključa) i diže metriku `captcha-skipped`.
5. **Tajni ključ ne izlazi iz procesa**: čita se samo za internu upotrebu, šalje isključivo
   Cloudflareovom `siteverify` endpointu, ne vraća se kroz API (`GET /auth/providers` nosi samo
   `provider`, `siteKey` i `afterFailures`) i nikad se ne loguje.
6. **MFA korak pri prijavi** (kod iz aplikacije ili rezervni kod, poslije lozinke): isto pravilo, ali
   brojanje ide **po nalogu** — napadač već zna lozinku, pa je meta kod. Izazov se traži nakon pet
   neuspjelih kodova za taj nalog (ili prag `other` bucketa ako je niži). Stranica prikaže provjeru iznad
   polja za kod i drži dugme dok je ne riješi. Jedan riješeni izazov dozvoljava **jedan** pokušaj koda, a
   svaki pokušaj s rješenjem — tačan ili pogrešan — troši ga. **Passkey se ne provjerava**: nije
   pogodljiv (kriptografski potpis, ne šestocifreni kod).

> **Za NAT/proxy:** dokaz se traži po **IP adresi**, pa iza zajedničke adrese cijeli ured dobije
> provjeru nakon pet zajedničkih neuspjeha. Ako je to neugodno, lijek je isti kao kod pragova:
> `ipMaxFailures`/`ipWindowSeconds` gore, ili `provider` na `none` (provjere tada nema).

**Kada uključiti:** kao drugi sloj kad IP blokada sama ne uspijeva (spray s mnogo adresa) — i samo na
instalaciji koja ima izlaz na internet **i sa servera i iz preglednika korisnika**. Instalacija bez
interneta ostavlja `provider` na `none`: widget bi korisnicima samo prikazao poruku da se provjera
nije učitala.

> **E2E/CI:** dok se vrti E2E suite, `provider` mora biti `none`. Suite se prijavljuje desetinama puta s jedne IP
> adrese, pa bi uključena provjera odgovarala `400 CAPTCHA_REQUIRED` i tamo gdje spec čeka svoj odgovor — prvi
> takav run (38296071922, 2026-10-12) srušio je spec 47 tačno tako. Spec 48 zato **ne dira** prekidač: provjerava da
> je isključen i traži od operatera da ga isključi, a polovinu u pregledniku provjerava stagiranim odgovorima
> (`page.route`), bez stvarnog Cloudflare poziva.

**Isključivanje provjere:** kad se `private.security.captcha.provider` vrati na `none`, sistem prije snimanja
nudi potvrdu sa spiskom zavisnih postavki: `siteKey` se vraća na prazno, a `secretKey` se **briše** (tajna se ne
čuva ni kao skrivena vrijednost). Ponovno uključivanje traži ponovni unos oba ključa. Bez potvrde snimanje se
odbija (`SETTING_DEPENDENCY_UNMET`), jer bi ostavilo zavisne ključeve aktivne uz isključenu provjeru.

**Nadzor:** dva nova brojača u istom agregatu kao u §3 — `captcha-skipped` i `captcha-failed`. Kartica
**Sigurnosne metrike (zadnji sat)** i dalje crta četiri serije iz §3, pa se ova dva brojača za sada čitaju
preko `GET /security/metrics/last-hour` (alarm na njih ne postoji).

---

## 6. Poznata ograničenja

- **CAPTCHA pokriva prijavu lokalnim nalogom i MFA korak pri prijavi** (§5, tačka 6). Microsoft tok,
  promjena lozinke i MFA potvrde iz sigurnosnih radnji (npr. uključivanje MFA-e dok je korisnik prijavljen)
  nemaju provjeru i ostaju pod „other" bucketom (§1).
- **Metrike CAPTCHA-e imaju pločice i alarme** (5.4.2, §3.2): `captcha-failed` i `captcha-skipped` se broje
  kao `login-429`, a pragovi su odvojeni. Podrazumijevano su 50/h i 200/h kao i kod 429; kalibracija
  na živom saobraćaju još nije urađena.
- **„Other" bucket dijeli ključ po IP-u** za change-password i po računu za MFA potvrde; ako se
  pokaže potreba za odvojenim pragovima, to je nova stavka u settings registru.
- Metrike traže Redis da bi bile dijeljene između replika; bez njega su per-proces (vrijednosti i
  dalje rade, ali ne agregiraju preko replika).
