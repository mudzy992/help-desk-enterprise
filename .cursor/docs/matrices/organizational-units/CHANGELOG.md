# CHANGELOG — organizational units

## 2026-09-10
- Admin read-only interceptor pokriva OU mutacije; RoleGuard/OuAccessGuard i dalje nisu vezani na ove CRUD rute.
- `OuAccessGuard` / `RoleGuard` izdvojeni u `authorization` modul; OU CRUD rute ostaju bez guardova u ovom tasku.
- Inicijalna matrica: DN vs `ouPath` vs `name`, self-referencing tree, CRUD + nested tree query, User → OU mapping sa Restrict delete, provider-neutral domain (bez AD/Entra sync i bez RBAC).
## 2026-10-06
- M3 B1–B4: OU brisanje vraća tipizirane blocker countove; manual-catalog delete atomarno uklanja katalog i live OU bez brisanja naloga, sa `UserRole` audit/warning/cache invalidation. Mutacije korisnika/OJ/grupa pišu audit u transakciji bez credential secrets; ne-lokalni reset lozinke vraća 409 i auditira odbijanje.
