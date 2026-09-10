# MATRIX — policy-packs

## Cilj
Default policy packovi (`PACK_IT_STANDARD`, `PACK_HR_RESTRICTED`, `PACK_FINANCE_RESTRICTED`) standardizuju RBAC grantove preko postojećih `Role` / `Permission` / `UserRole` (OU/service scope). Nema drugog authorization evaluatora. `local` i `entra_ad` korisnici dobijaju iste grantove.

## Registry
Source of truth je code registry. Prisma `PolicyPack` je persistencija identiteta paketa i veze na OU/service (`policyPackId`). Grant template živi u registry-ju, ne kao drugi permission engine.

| Pack | Role | Permissions | OU scope | Service scope |
|---|---|---|---|---|
| `PACK_IT_STANDARD` | `AGENT`, `ADMIN` | default AGENT / ADMIN katalog (bez `confidential.break_glass`) | target OU | none |
| `PACK_HR_RESTRICTED` | `AGENT` | attachments upload/download | target OU | target service |
| `PACK_FINANCE_RESTRICTED` | `AGENT`, `ADMIN` | AGENT: attachments + merge; ADMIN: `audit.export`, `sla.write`, `routing.write` | target OU | target service |

Packovi nikad ne grantuju `SUPER_ADMIN`. Referencirani role/permission keyevi moraju postojati u authorization katalogu, a permission mora biti u `defaultRolePermissionKeys[role]`.

## Apply
Deterministički i idempotentan:

1. Validate pack + target OU/service/user (fail closed).
2. Upsert `PolicyPack` iz registry-ja.
3. Additive ensure `Role` / `Permission` / `RolePermission` za pack grantove (nikad delete).
4. Bind `OrganizationalUnit.policyPackId` i/ili `Service.policyPackId`.
5. Additive create `UserRole` `(userId, roleId, organizationalUnitId, serviceId)` ako ne postoji.

Ručno dodijeljeni `UserRole` i extra `RolePermission` ostaju. Ponovni apply ne duplicira grantove. Promjena packa na OU/service ne skida prethodne UserRole zapise.

## Authorization reuse
Nakon apply, `AuthorizationContextLoader` čita iste `UserRole` + `RolePermission` zapise. `RoleGuard`, `OuAccessGuard` i `ShadowAuthorizationService` koriste isti `evaluateAuthorizationRequest` tok. Shadow ALLOW nije grant.

HTTP: `GET /policy-packs` (`RoleGuard`, `ADMIN` + `settings.write`). `POST /policy-packs/validate` i `POST /policy-packs/apply` (`OuAccessGuard`, isti role/permission + OU iz body). Session guard na svim rutama. Shadow se koristi za compatibility, ne kao grant.

## Namjerno NIJE implementirano
Read-only admin mode, frontend UI, SLA/required-fields/classification enforcement izvan pack metadata, config versioning/rollback, settings `private.policyPacks.*`, brisanje grantova pri reassign packa.
