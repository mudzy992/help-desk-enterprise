# Ograničenja prijava (rate limits) — podešavanje, nadzor i runbook

> Paket 5.4.0-b (M2) + 5.4.0-d/e: pragovi su **konfiguracija** (`private.security.rateLimits.*`),
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
    "hibp-skipped":           { "total": 0,  "peakPerMinute": 0, "points": [ … ] } } }
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

> **Alarm za 429 još nije automatizovan.** Katalog ops alarma (`ops-alert-catalog.ts`) ne sadrži
> signal za `login-429`; nadzor je zato **ručni** (kartica metrika + ovaj runbook). Ako želite
> automatsko upozorenje, to je zasebna stavka (novi signal + prag + `ops/runbook/ALERTS.md`), ne
> konfiguracija limita.

### 3.1 Dnevnik (audit)

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
- **Pravi password spray** → **ne** spuštaj account odgodu; drži IP limit i razmotri dodatnu zaštitu
  na rubu mreže (WAF/CAPTCHA).

> ⚠️ Ne postavljaj `ipMaxFailures` na maksimum bez druge zaštite. Bez IP limita password spray s
> jedne adrese je izvediv, a account odgoda od 2 s je za takav napad preblaga.

---

## 5. Poznata ograničenja

- **Nema CAPTCHA/turnstile** — nakon N neuspjeha slijedi odgoda ili 429, nikad ljudski dokaz.
- **429 alarm nije u ops katalogu** (vidi §3): nadzor metrika je ručni.
- **„Other" bucket dijeli ključ po IP-u** za change-password i po računu za MFA potvrde; ako se
  pokaže potreba za odvojenim pragovima, to je nova stavka u settings registru.
- Metrike traže Redis da bi bile dijeljene između replika; bez njega su per-proces (vrijednosti i
  dalje rade, ali ne agregiraju preko replika).
