# DOCS_CHANGELOG — šta se mijenja u dokumentaciji i zašto

> Vodi se **modul po modulu**, uporedo sa `REVIEW_ANALIZA.md` (dokaz u kodu) i izmjenama samih dokumenata.
> Jedan unos = jedan modul: **dodato / izmijenjeno / uklonjeno / ostaje otvoreno**, sa razlogom.
>
> Pravilo: dokumentacija opisuje samo ono što stvarno postoji i radi. Ono što nije provjereno nosi `[NEJASNO]`.
> Nalazi u `docs/plans/**` se **ne ispravljaju** u ovoj fazi; ovdje se samo evidentiraju (odluka vlasnika,
> 2026-10-03).

## Pregled

| # | Datum | Modul | Dokumenti | Sažetak |
|---|---|---|---|---|
| M1 | 2026-10-03 | Instalacija (prvi start) | `user-guide/instalacija.md` (nov), `TEZE` (+T15–T17) | Instalacija prvi put dokumentovana |
| M2 | 2026-10-03 | Prijava i MFA | `user-guide/prijava-i-mfa.md` (nov), `TEZE` (+T18–T22) | Prijava, drugi faktor i sesije prvi put dokumentovani |
| — | 2026-10-03 | Opšti nalazi | ovaj dokument | Zastarjeli navodi u `docs/plans/**` evidentirani, ne dirani |

---

## M1 — Instalacija (prvi start) · 2026-10-03

**Zašto:** modul uopšte nije bio dokumentovan, a jedini je korak bez kojeg se aplikacija ne može pokrenuti. RAW ga
izričito traži (`RAW_PROJECT.md:1063`). Analiza: `REVIEW_ANALIZA.md` §M1.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/instalacija.md` (novo) | Cijela stranica: kome je namijenjena, preduslovi (`INSTALL_TOKEN`), šest koraka sa tačnim nazivima dugmadi, polja i validacije, kodovi grešaka, poznata ograničenja, veze na `ops/COOLIFY.md` | `install.controller.ts:45,64–129`; `install-token.ts:13,19,44–60`; `validate-install-super-admin-credentials.ts:16–29`; `validate-install-smtp.ts`; `install-seed.constants.ts:3–11`; `addon-catalog.ts`; `install-page.tsx:27–33`; i18n `install.*` (bs) |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T15** — prvi SuperAdmin je uvijek lokalni (break-glass), i kad je izabran Entra; **T16** — wizard se otvara samo uz `INSTALL_TOKEN`; **T17** — nakon „Završi“ koraci instalacije su zaključani i mijenjaju se kroz Settings | `create-install-super-admin.ts:46–70`; `install-token.ts`; `is-install-wizard-mutation-locked.ts:7–10,35` |

### Izmijenjeno

- Ništa. Nijedan postojeći dokument nije tvrdio nešto netačno o instalaciji (teme nije bilo), pa nije bilo
  ispravki. Postojeći fajlovi `docs/user-guide/*` nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW upućuje na `.cursor/docs/04-install-wizard.md`; taj fajl ne postoji u repou (`.cursor/docs/` sadrži
   `theme.md`). Ako postoji kod izvornog šablona, vrijedi ga uvesti u `docs/` — odluka vlasnika.
2. Polja za AD u wizardu upisuju vezu, ali stvarno čitanje iz AD-a zavisi od `private.auth.adRead.*` postavki;
   tačan tok se potvrđuje u M3 (Korisnici/OJ/grupe) i tada se dopunjuje stranica.

---

## Opšti nalazi — zastarjeli navodi u `docs/plans/**` (evidentirano, ne dirano)

Odluka vlasnika (2026-10-03): ove tvrdnje ostaju kakve jesu; ne mijenjaju se u Fazi 2. Zapisujem ih ovdje da se ne
izgube i da se riješe kad bude vrijeme za `docs/plans/**`.

| Fajl : linija | Tvrdnja | Stvarno stanje (dokaz) |
|---|---|---|
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:99` | 1.8: „LDAPS provider i Entra login tok ne postoje“ | Postoje `backend/src/modules/directory-sync/ldaps/` (24 fajla, uključujući `directory-full-sync.service.ts`) i `authentication/entra-*.ts`; dizajn 1.8 ih i opisuje kao implementirane |
| `docs/plans/modules/3.3-analiza-stanja-2026-10-01.md:59` | „korisnički vodič `docs/user-guide/problemi.md` ❌ ne postoji“ | `docs/user-guide/problemi.md` postoji (49 linija) |
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:222` | 4.1 „čeka odobrenje“ | 4.1 implementiran i deployan; A9 prelazak u toku (handoff `docs/plans/HANDOFF-4.1-A9.md`) |

---

## M2 — Prijava i potvrda u dva koraka (MFA) · 2026-10-03

**Zašto:** najvažniji korisnički tok (ulaz u aplikaciju) nije bio dokumentovan nijednim fajlom, iako je RAW
izričito traži (`RAW_PROJECT.md:894–902`) i iako paket 2.1 dodaje TOTP, rezervne kodove i registar sesija.
Analiza: `REVIEW_ANALIZA.md` §M2.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/prijava-i-mfa.md` (novo) | Prijava (lokalna i Microsoft), prisilna promjena lozinke, upis i verifikacija potvrde u dva koraka, rezervni kodovi, stranica **Sigurnost naloga**, administratorski **Reset MFA** i **Odjavi sve sesije**, tabela politike iz Admin → Postavke, poruke grešaka i poznata ograničenja | `authentication.controller.ts:64–182`; `authentication.service.ts:204–271`; `security/mfa.service.ts`; `security/totp.ts:8–13`; `settings/definitions/account-security-settings.ts`; `pages/login-page.tsx:30–48`; `pages/account-security-page.tsx`; `i18n` `session.*`, `auth.*`, `account.security.*` |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T18** obavezan drugi faktor (SUPER_ADMIN uvijek, ADMIN po postavci); **T19** redoslijed lozinka → promjena → MFA i rokovi međukoraka; **T20** rezervni kodovi se prikazuju jednom i jednokratni su; **T21** Entra nalozi koriste Microsoftov drugi faktor; **T22** brojač neuspjelih prijava | `security/account-security-rules.ts:16–22`; `authentication.service.ts:204–271`; `authentication.constants.ts:7,11`; `security/recovery-codes.ts`; `login-attempt-limiter.ts:17–30` |
| `REVIEW_ANALIZA.md` §M2 | Nalazi (detalji i dokazi u fajlu) | isto |

### Izmijenjeno

- Ništa. Postojeći fajlovi `docs/user-guide/*` nisu tvrdili ništa o prijavi, pa nije bilo ispravki; `user-guide`
   fajlovi drugih modula nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. Entra režim **uvijek** nudi i lokalnu formu (link „Prijavi se lokalnim nalogom“) — to je break-glass odluka
   iz RAW-a, ali treba potvrditi da nijedan klijent ne traži isključivo SSO.
2. Nalaz #1 iz §M2 (gašenje `mfa.allowOptional` tiho preskače verifikaciju postojećim korisnicima) mijenja
   ponašanje; dokumentacija ga zasad opisuje kao **poznato ograničenje**, a ne kao pravilo. Kad se kod popravi,
   i ovaj tekst treba uskladiti.
