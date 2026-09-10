# CHANGELOG — authorization

## 2026-09-10
- Service catalog koristi postojeći `RoleGuard` / `service.catalog.write` / service scope; lifecycle ostaje izvan authorization lookup-a.
- Admin read-only mode: centralni interceptor iznad postojećeg `RoleGuard` / `OuAccessGuard` / shadow toka; `authorize` ostaje nepromijenjen.
- Policy packovi konzumiraju postojeći evaluator preko `UserRole` assignmenta; authorization modul ostaje jedini decision tok.
- Shadow permission check: isti `evaluateAuthorizationRequest` tok za `authorize` i `ShadowAuthorizationService.evaluate`; report je ne-enforcing (`ALLOW`/`DENY` + reason) i ne mijenja guard enforcement.
- Inicijalna matrica: provider-neutral principal, granular permissions, OU nasljeđivanje naniže, service scope, `RoleGuard` / `OuAccessGuard`, SuperAdmin global + `isLocalOnly`, fail closed na nedostajući identitet/permission/scope.
