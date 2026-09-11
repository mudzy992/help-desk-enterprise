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
- Zadnji local SuperAdmin se ne smije deaktivirati.
- `entra_ad` ne uklanja local break-glass login.
- SMTP OFF ⇒ `private.addons.email=false` (forsirano).
- Core moduli nisu addoni (vidi `04-install-wizard.md`).
- Seed: min 1 OU, 1 fallback grupa, 1 servis + routing na tu grupu.
- Completed wizard piše change log (reason=`install_wizard`).

## Zabranjeno
- Preskakanje SuperAdmin koraka.
- Seed demo tiketa.
- Ponovni javni wizard nakon COMPLETED.
- Čuvanje SuperAdmin lozinke u settings JSON.

## UI
Constitution: linear steps, primary CTA “Dalje” / “Završi”, bez dekoracije.
Dok wizard koraci nisu implementirani, `/install` je first-run ekran bez application shell-a.
