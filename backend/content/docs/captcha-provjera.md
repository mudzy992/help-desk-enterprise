# Provjera da niste robot (CAPTCHA)

> **Namjena:** ova stranica objašnjava kako uključiti, podesiti i isključiti **Cloudflare Turnstile** provjeru
> pri prijavi, šta ona tačno štiti, kako se ponaša kad Cloudflare nije dostupan i kako se čita njen alarm.
> Postavka je na ekranu **Administracija → Sigurnost → Sigurnosne postavke**, red **Provjera da niste robot
> (CAPTCHA)**.

## Čemu služi ovaj modul

- Provjera štiti prijavu od **automatizovanih pokušaja** (pogađanje lozinki iz više adresa ili botovi).
- Ona **ne zamjenjuje** ograničenja prijava: limiter i dalje broji neuspjehe i privremeno blokira adresu. CAPTCHA
  se dodaje uz njega.
- Podrazumijevano je **isključena** (`none`). Instalacija bez ključeva ili bez pristupa internetu radi tačno kao
  i prije: nijedan zahtjev ne ide prema Cloudflare-u.

## Kome je namijenjen

- **SUPER_ADMIN**, jer samo on mijenja sigurnosne postavke.
- Administratorima koji rade na alarmima, jer dva alarma prate ovu provjeru (vidi
  [Alarmi i zdravlje sistema](/docs/alarmi-i-zdravlje-sistema)).

## Kako doći

**Administracija → Sigurnost → Sigurnosne postavke → Provjera da niste robot (CAPTCHA).** Red pokazuje stanje
(uključeno ili isključeno) i otvara dijalog sa postavkama. Ostale sigurnosne postavke (sesije, provjera
procurjelih lozinki) su u istoj kartici.

## Korak po korak

### Uključivanje

1. U **Cloudflare** panelu napravite **Turnstile widget** za domenu aplikacije.
2. Iz widgeta kopirajte **Site key** (javni) i **Secret key** (tajni).
3. U dijalogu **Provjera da niste robot (CAPTCHA)** izaberite provajder **turnstile**, unesite **site key** i
   **secret key**, pa sačuvajte.
4. Ključevi su **zavisni** od provajdera: dok je provajder `none`, ne mogu se sačuvati. Ako pokušate, aplikacija
   odbija izmjenu i kaže šta prvo treba uključiti.
5. Provjerite: prijavite se pet puta uzastopno pogrešnom lozinkom s jedne adrese i na šestom pokušaju treba da se
   pojavi provjera. Ako se ne pojavi, provjerite da li je provajder zaista `turnstile` i da su oba ključa
   popunjena.

### Isključivanje

1. U dijalogu izaberite provajder **none** i sačuvajte.
2. Aplikacija nudi **Isključi i vrati zavisne**. Ovim se **site key** vraća na prazno, a **tajni ključ se briše**.
   Ako CAPTCHA kasnije ponovo uključite, tajni ključ morate ponovo unijeti.

### Zamjena ključeva

Ako Cloudflare zamijeni widget, uključite provajder `turnstile` i unesite nove ključeve u istom dijalogu. Stari
tajni ključ se ne može pročitati; unosi se novi.

## Kada se provjera traži

| Tok prijave | Provjera | Napomena |
|---|---|---|
| **Lozinka** (prijava e-mailom i lozinkom) | Da | Poslije **pet uzastopnih neuspjeha** s iste IP adrese. Ako je ograničenje adrese strože (npr. blokada već poslije tri neuspjeha), provjera se traži ranije, prije blokade. |
| **Drugi korak: kod iz aplikacije ili rezervni kod** | Da | Poslije **pet uzastopnih neuspjelih unosa koda** za taj nalog. Provjera se pojavljuje iznad polja za kod. |
| **Passkey (FIDO2) — prijava uređajem** | Ne | Provjera se traži samo za lozinku i za kod drugog koraka, ne za prijavu passkey-em. |
| **Microsoft prijava (Entra)** | Ne | Prijava preko Microsoft naloga nije uključena. |
| **Promjena lozinke i sigurnosne radnje** | Ne | Ne traži se CAPTCHA. |

Rješenje provjere važi za **jedan pokušaj**. Ako je isteklo ili je već iskorišteno, provjera se resetuje i traži se
ponovo.

## Polja, validacije i statusi

| Postavka | Vrijednost | Napomena |
|---|---|---|
| `private.security.captcha.provider` | `none` (zadano) ili `turnstile` | `none` isključuje provjeru; `turnstile` je uključuje. |
| `private.security.captcha.siteKey` | tekst | Javni ključ, prikazuje se na stranici prijave. Prazan dok je provajder `none`. |
| `private.security.captcha.secretKey` | tajna | Nikad se ne prikazuje u pregledniku, ne šalje klijentu i ne upisuje u dnevnik. Zadnja vrijednost se ne može pročitati. |

Statusi na prijavi:

- `CAPTCHA_REQUIRED` — traži se rješenje provjere. Korisnik vidi „Provjera da niste robot“.
- `CAPTCHA_FAILED` — rješenje nije prihvaćeno (isteklo, već iskorišteno ili neispravno).

Detalji za korisnika su na stranici [Prijava i potvrda u dva koraka (MFA)](/docs/prijava-i-mfa).

## Česta pitanja i greške

- **„Uključio sam provjeru, a na prijavi je nema.“** — Provjera se pojavljuje tek poslije pet neuspjeha. Provjerite
  da je provajder `turnstile` i da su site key i secret key sačuvani.
- **„Korisnik vidi „Provjera se nije učitala“.“** — Browser ili server ne može da dođe do Cloudflare-a. Provjerite
  mrežu i izlazni pristup servera. Ako instalacija nema internet po projektu, provajder vratite na `none`.
- **„Alarm: CAPTCHA provjera se preskače.“** — Server ne dobija odgovor od Cloudflare-a. Prijave tada prolaze samo uz
  ograničenja prijava, ne blokiraju se. Provjerite izlaz servera prema Cloudflare-u.
- **„Alarm: CAPTCHA provjere se često odbijaju.“** — Klijent šalje neprihvatljiva rješenja. Ako nema stvarnih
  korisnika, riječ je o automatizovanom klijentu. Vidi uputstvo uz alarm.
- **„Iz iste kancelarije svi vide provjeru.“** — Provjera se broji po IP adresi. Mnogo korisnika iza jedne adrese
  (NAT ili proxy) dijeli brojač.

## Poznata ograničenja

- Provjera se broji **po IP adresi**, ne po nalogu.
- Nema provjere za Microsoft prijavu, passkey, promjenu lozinke i sigurnosne radnje.
- Tajni ključ se ne može pročitati ni nakon snimanja; mijenja se unosom novog.
- Ako server nema pristup Cloudflare-u, provjera se **preskače**, a ne blokira prijavu. Ovo je namjerno.

## Povezani moduli

- [Prijava i potvrda u dva koraka (MFA)](/docs/prijava-i-mfa) — šta korisnik vidi i radi na prijavi.
- [Alarmi i zdravlje sistema](/docs/alarmi-i-zdravlje-sistema) — alarmi za odbijene i preskočene provjere.
- [Uloge i permisije (RBAC)](/docs/uloge-i-permisije) — ko može mijenjati sigurnosne postavke.
