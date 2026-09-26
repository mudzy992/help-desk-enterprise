# Runbook: MFA reset i ključ za TOTP tajne (paket 2.1)

## 1. Korisnik izgubio telefon (postoji drugi administrator)

1. Korisnik se prvo prijavljuje **rezervnim kodom** („Nemam pristup aplikaciji"),
   ako ga ima. Poslije prijave: *Moj profil → Sigurnost naloga*, isključi/ponovo postavi MFA.
2. Bez rezervnih kodova: administrator otvara *Administracija → Korisnici → korisnik →
   Sigurnost naloga → Resetuj potvrdu u dva koraka* i upisuje razlog.
   - ADMIN ne može resetovati SUPER_ADMIN-a; to radi drugi SUPER_ADMIN.
   - Reset odjavljuje sve prijave korisnika i bilježi `auth.mfa_reset` u audit.
3. Pri sljedećoj prijavi korisnik ponovo skenira QR kod (za ADMIN/SUPER_ADMIN to je obavezno).

## 2. Jedini SUPER_ADMIN bez telefona i bez rezervnih kodova

Potreban je shell pristup backend kontejneru (to je granica povjerenja).

```bash
# Coolify → backend → Terminal (ili docker exec -it <backend> sh)
node dist/src/cli/reset-mfa.js --email admin@epbih.ba --reason "izgubljen telefon, potvrđeno lično"
```

- Briše MFA i rezervne kodove, opoziva sve sesije (baza + Redis), upisuje audit `auth.mfa_reset` s `via: server`.
- Ako Redis nije dostupan, sesije su opozvane u bazi, a postojeći tokeni ističu najkasnije za 1 h.
- Izlazni kodovi: `0` uspjeh, `1` korisnik ne postoji / greška, `2` pogrešni argumenti.

## 3. `MFA_ENCRYPTION_KEY`

- Generisanje: `openssl rand -base64 32` (tačno 32 bajta). Postaviti na **backend** servisu u Coolify.
- Ključ ide u backup tajni zajedno s `INSTALL_TOKEN` i lozinkama baze (vidi `ops/DR.md`).
- **Gubitak ili promjena ključa:** postojeće TOTP tajne se ne mogu dešifrovati. Svakom korisniku s MFA
  uradite reset (tačka 1 ili CLI) — pri sljedećoj prijavi ponovo postavlja MFA.
- Bez ključa: prijava korisnika bez MFA radi normalno; uključivanje MFA vraća `MFA_UNAVAILABLE`, a
  obavezni MFA (SUPER_ADMIN/ADMIN) ne može završiti postavljanje — zato ključ postaviti **prije**
  deploya paketa 2.1.

## 4. Sat servera

TOTP dozvoljava ±30 s. Ako korisnici masovno dobijaju „kod nije ispravan", provjeriti NTP
na hostu (`timedatectl status` → `System clock synchronized: yes`).
