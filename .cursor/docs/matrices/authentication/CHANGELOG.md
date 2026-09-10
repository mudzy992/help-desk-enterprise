# CHANGELOG — authentication

## 2026-09-10
- Entra/MSAL ID token verifikacija iza postojeće provider granice: Settings tenant/client, issuer/audience/signature/claims, isti principal/session tok, SuperAdmin ostaje `isLocalOnly`.
- Inicijalna matrica: `local` | `entra_ad` provider granica, normalizirani principal, SuperAdmin `isLocalOnly` invariant, JWT session preko postojećeg Settings secret-a, Socket.IO verifier integracija.
- OU CRUD je izdvojen iz authentication scope-a u `organizational-units` modul.
