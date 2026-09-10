# CHANGELOG — permissions-shadow-check

## 2026-09-10
- Policy pack apply koristi isti shadow tok za compatibility provjeru; shadow i dalje nije enforcing.
- Inicijalna matrica: ne-enforcing `ShadowAuthorizationService` preko postojećeg authorization decision toka; structured ALLOW/DENY report; SuperAdmin + `isLocalOnly`; fail closed; provider-neutral za local i Entra identitete.
