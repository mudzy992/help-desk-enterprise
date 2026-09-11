# MATRIX — install-wizard

## Cilj
Jednokratni first-run setup. Aplikacija nije upotrebljiva dok wizard nije completed.

## Stanja
- `NOT_STARTED` — nema `private.install.completedAt`
- `IN_PROGRESS` — draft koraka (server-side, da refresh ne gubi SuperAdmin kreiranje)
- `COMPLETED` — gate ugašen; `/install` zabranjen
- `RERUN_ALLOWED` — samo ako `INSTALL_ALLOW_RERUN=true` i SuperAdmin

## Gate
Izvor: postojeći Settings Registry ključ `private.install.completedAt` (private string, default `""`). Nema paralelnog config sistema. Gate ne čita `private.auth.mode` (`local` i `entra_ad` su isti).

Completed vrijednost: non-empty ISO-8601 datetime. Prazno, whitespace, missing, ili neispravan string ⇒ gate aktivan. Greška čitanja settingsa ⇒ fail closed (gate aktivan).

Dok je gate aktivan:

- UI: sve aplikacijske rute → `/install`. `/install` ostaje dostupan (gate ne blokira sam sebe).
- API: HTTP `503` `{ code: "SETUP_REQUIRED" }` za sve osim `GET /health` i `/install` + `/install/*`.
- `GET /install/status` vraća `{ isCompleted }` (boolean). Ne izlaže `completedAt`.

Nakon validnog `completedAt`: HTTP gate je neaktivan; auth/API/aplikacija rade kao prije. Zaključavanje javnog `/install` (COMPLETED) je poseban korak wizarda, nije dio ovog gate-a.

## Pravila
- SuperAdmin iz wizarda je uvijek lokalni (`isLocalOnly`).
- Kreira se kroz `POST /install/super-admin` (`email`, `displayName`, `password`); `GET /install/super-admin` vraća postojeći nalog bez lozinke/hasha da refresh ne izgubi korak.
- Password ide u `User.localPasswordHash` (bcrypt), nikad u settings JSON ili API odgovor.
- Zadnji local SuperAdmin se ne smije deaktivirati.
- Način prijave: `POST /install/login-provider` (`mode`: `local` | `entra_ad`). `GET /install/login-provider` vraća mode i konfiguracijske flagove, nikad secret vrijednosti.
- `local` postavlja `private.auth.mode=local` bez AD/Entra polja.
- `entra_ad` zahtijeva validan Entra tenant+client **ili** LDAPS bind (URLs + bind DN + bind password) prije complete; secret polja idu kroz Settings Registry (`getSecretForInternalUse` / `isSecret`).
- `entra_ad` ne uklanja local break-glass login.
- SMTP OFF ⇒ `private.addons.email=false` (forsirano).
- Core moduli nisu addoni (vidi `04-install-wizard.md`).
- Seed: min 1 OU, 1 fallback grupa, 1 servis + routing na tu grupu.
- Completed wizard piše change log (reason=`install_wizard`).

## Zabranjeno
- Preskakanje SuperAdmin koraka.
- Preskakanje validacije AD/Entra polja kad je `entra_ad` izabran.
- Seed demo tiketa.
- Ponovni javni wizard nakon COMPLETED.
- Čuvanje SuperAdmin lozinke u settings JSON.

## UI
Constitution: linear steps, primary CTA “Dalje” / “Završi”, bez dekoracije.
SuperAdmin korak je first-run forma bez application shell-a. Nakon SuperAdmin nalog slijedi korak načina prijave (`local` | `entra_ad`). Dok kasniji koraci nisu implementirani, ostaju izvan ovog ekrana.
