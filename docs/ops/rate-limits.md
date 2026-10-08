# Rate limit i sigurnosni pragovi — uputstvo za staging/produkciju

> Paket 5.2.1 (M2 #3, OD-2). Kod je implementiran; ova stranica objašnjava
> defaultne pragove i kako ih kalibrirati na stvarnom prometu.

Aplikacija štiti autentikacijske endpoint-e od brute-force i enumeracije
napada s dva odvojena "bucketa" (brojača): **po izvornoj IP adresi** i **po
korisničkom računu**. Ključevi su pseudonimizirani HMAC-SHA256 (ne čuvaju se
plaintext e-mail ni IP u Redis-u), a limiteri koriste Redis tako da su
konzistentni preko svih replika backenda.

## 1. Pregled endpoint-a i pragova

### 1.1 `POST /auth/login` (lokalni password login)

Odvojeni IP i account bucketi (datoteka `backend/src/modules/authentication/login-attempt-limiter.ts`, konstanta `passwordLoginLimits`):

| Bucket | Trenutni default | Ponašanje |
|---|---|---|
| **Account** | 3 pokušaja bez odgode, zatim eksponencijalni delay 250 ms → 500 ms → 1 s → maks. 2 s, u prozoru 30 min | Nakon treće greške korisnik osjeti usporenje, ali se **nikada ne zaključava** — ispravna lozinka u svakom trenutku prolazi prvi sljedeći pokušaj (samo nakon sačekanog delay-a). Ne postoji account-wide lockout (sprječava "lock-out Boba" denial of service napad). |
| **IP** | 40 pogrešnih pokušaja u 5 min | Nakon toga izvor dobija HTTP `429 TOO_MANY_LOGIN_ATTEMPTS` sa `Retry-After` headerom. Ovo štiti password-spray s jedne IP; napad s više IP ostaje na account delay-u. |

Uspješan login resetira account stanje za tog korisnika.

### 1.2 `POST /auth/change-password` (lozinka sa temporary tokenom)

- 5 pokušaja u 15 min, ključ po IP-u (`auth:change-password-fail:<ip>`).
- Nakon limita: `429 TOO_MANY_LOGIN_ATTEMPTS`.

### 1.3 `POST /auth/entra` (Entra ID token exchange) i ostali legacy

- 5 pokušaja u 15 min, kombinirani ključ `email:ip`.
- Vrijedi i za nevažeće Entra ID tokene (odbijeni tokeni se broje u isti prozor).

### 1.4 `POST /auth/mfa/verify` (drugi faktor)

- 5 nevažećih kodova po accountu u 15 min (`mfa.service.ts`).
- TOTP ima replay zaštitu: prihvaćaju se samo kodovi iz tekućeg i ±1 30-sekundnog perioda, te korak u kojem je kod uspješno iskorišten ne može se ponoviti.

### 1.5 Zaključavanje instalacijskog wiza

Nakon završene instalacije (`/install/complete`), svi `POST/PUT/DELETE` endpoint-i
ispod `/install/*` vraćaju `423 INSTALL_LOCKED`. Jedino što ostaje javno je
`GET /install/status` i `GET /install/addons` (katalog, ne konfigurirane
vrijednosti).

## 2. Redis ključevi i TTL

Svi limiteri koriste instancu `Redis` prikačenu na `redisTokens.default`; za
lokalni razvoj bez Redis-a postoji in-memory fallback (samo za testove).
Pseudonimizacija:

```
auth:login-fail:account-state:v2:<hmac-sha256(email)>      (TTL 30 min)
auth:login-fail:ip:<hmac-sha256(ip)>                       (TTL 5 min)
auth:change-password-fail:<ip>                             (TTL 15 min)
auth:mfa-fail:<user-id>                                    (TTL 15 min)
auth:revoked-sid:<sid>                                     (TTL = session TTL = 1 h)
auth:sessions-valid-after:<sub>                            (TTL = session TTL)
```

## 3. Kalibracija na stagingu (obavezna prije produkcije!)

Defaultni pragovi odabrani su konzervativno za očekivano opterećenje male
instalacije (desetine agenata, stotine krajnjih korisnika). Staging mora
potvrditi da se normalni saobraćaj (zaboravljene lozinke, krivi TOTP kodovi,
mobile retry, password manageri koji pogrešno popunjavaju) ne sudara s
pragovima.

Preporučena procedura:

1. **Podigni staging sa stvarnom šemom korisnika** (ili njenim podskupom) i
   pusti ga dan-dva. Promet nek uključuje i normalne neuspjele pokušaje:
   korisnike koji zaborave lozinku, ukucaju pogrešan TOTP, imaju stari
   password manager, itd.

2. **Pratiti sljedeće metrike** (mogu se izvući iz Redis `INFO commandstats`
   i aplikacijskih logova na razini `warn`):

   - Broj `429 TOO_MANY_LOGIN_ATTEMPTS` odgovora po satu na `/auth/login`,
     razbijeno po tome da li je okidač bio IP ili account limit.
   - Distribucija broja neuspjelih pokušaja po account-u (50-ti, 95-ti,
     99-ti percentil) za uspješne logine — koliko prosječan korisnik mora
     puta ukucati lozinku.
   - Učestalost "password sprayed" IP-eva (izvana, javne IP često dijele
     NAT za više korisnika u firmi).

3. **Podesiti konstante** u `passwordLoginLimits` / `loginAttemptLimits`
   (trenutno hardkodirane) ako se na mjerenjima pokaže:

   - Da veliki NAT/squid proxy pokreće 429 za čitavu kancelariju → povisi
     `ipMaxFailures` ili povećaj `ipWindowSeconds`.
   - Da korisnici redovno prave 4-5 grešaka u lozinki → pomjeri
     `accountDelayStartsAfterFailures` ili smanji `accountDelayBaseMilliseconds`.
   - Da je 2 sekunde max delay-a previše/previse malo → podesi
     `accountDelayMaxMilliseconds`.

4. **Produkcija:** na prvih sedam dana nastavi pratiti; pogotovo prve dane
   ponedjeljkom ujutro kad dolazi do prometa zaboravljenih lozinki nakon
   vikenda. Ako nema pritužbi i 429-ova, pragovi su OK.

> ⚠️ Nemoj stavljati `ipMaxFailures` jako visoko bez drugih zaštita (npr. CAPTCHA).
> Bez IP limita password-spray sa 10k pokušaja/sajta je izvediv protiv jednog
> account-a, a account delay od 2s je prespor za 10k pokušaja.

## 4. Poznata ograničenja (otvoreno za budućnost)

- **Pragovi nisu env-konfigurabilni.** Trenutno se mijenjaju samo izmjenom
  konstanti u kodu i restartom. Planirano u 5.4 (Security hardening paket):
  učitati ih iz `private.security.rateLimits.*` konfiguracije i dodati admin
  graf koji prati 429 i odgađanja.
- **Nema CAPTCHA/turnstile.** Nakon N neuspjelih pokušaja danas se samo
  usporava/429, ne traži se ljudski dokaz. Dodat će se u 5.4.
- **Session TTL je fiksan na 60 minuta** (`sessionTtlSeconds`), sa
  client-side keep-alive dok je tab aktivan. Produžetak konfigurabilnog
  TTL-a ("remember me") je također planiran za 5.4.
