# CHANGELOG — policy-packs

## 2026-09-10
- `POST /policy-packs/validate` je admin read; `POST /policy-packs/apply` je mutacija pod read-only mode-om. RoleGuard/OuAccessGuard ostaju.
- Inicijalna matrica: IT/HR/Finance registry, additive idempotent apply preko postojećeg `UserRole` / scope modela, validacija role/permission/OU/service, bez SuperAdmin grantova, provider-neutral za local i Entra.
