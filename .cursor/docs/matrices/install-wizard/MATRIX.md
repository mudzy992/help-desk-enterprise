# MATRIX — install-wizard

## Cilj
Jednokratni first-run setup. Aplikacija nije upotrebljiva dok wizard nije completed.

## Stanja
- `NOT_STARTED` — nema `private.install.completedAt`
- `IN_PROGRESS` — draft koraka (server-side, da refresh ne gubi SuperAdmin kreiranje)
- `COMPLETED` — gate ugašen; `/install` zabranjen
- `RERUN_ALLOWED` — samo ako `INSTALL_ALLOW_RERUN=true` i SuperAdmin

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
