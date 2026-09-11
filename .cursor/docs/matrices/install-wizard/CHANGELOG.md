# CHANGELOG — install-wizard

## 2026-09-11
- Implementiran SuperAdmin korak: lokalni user, `isLocalOnly`, password hash u `User`, bez plaintext-a u settings/API.
- `POST /install/super-admin` odbija neispravne kredencijale i drugi početni SuperAdmin.
- `GET /install/super-admin` vraća kreirani nalog (email/displayName/isLocalOnly) da refresh ne gubi korak.
- Break-glass local login ostaje na postojećem `entra_ad` provideru.
- Implementiran first-run gate na `private.install.completedAt`.
- Neispravna/prazna vrijednost i settings read failure drže gate aktivnim (fail closed).
- Allowlist: `GET /health`, `/install` i `/install/*`; ostali HTTP zahtjevi `503 SETUP_REQUIRED`.
- UI redirect na `/install` dok setup nije completed; `/install` nije blokiran sopstvenim gate-om.
- Status endpoint `GET /install/status` izlaže samo `isCompleted` (provider-neutral).

## 2026-09-09
- Inicijalna matrica: first-run gate, local SuperAdmin, auth mode, SMTP, seed, addon flags.
- Razdvojeno od service onboarding wizard-a.
