# CHANGELOG — authorization

## 2026-09-10
- Shadow permission check: isti `evaluateAuthorizationRequest` tok za `authorize` i `ShadowAuthorizationService.evaluate`; report je ne-enforcing (`ALLOW`/`DENY` + reason) i ne mijenja guard enforcement.
- Inicijalna matrica: provider-neutral principal, granular permissions, OU nasljeđivanje naniže, service scope, `RoleGuard` / `OuAccessGuard`, SuperAdmin global + `isLocalOnly`, fail closed na nedostajući identitet/permission/scope.
