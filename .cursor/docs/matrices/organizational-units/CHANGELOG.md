# CHANGELOG — organizational units

## 2026-09-10
- Admin read-only interceptor pokriva OU mutacije; RoleGuard/OuAccessGuard i dalje nisu vezani na ove CRUD rute.
- `OuAccessGuard` / `RoleGuard` izdvojeni u `authorization` modul; OU CRUD rute ostaju bez guardova u ovom tasku.
- Inicijalna matrica: DN vs `ouPath` vs `name`, self-referencing tree, CRUD + nested tree query, User → OU mapping sa Restrict delete, provider-neutral domain (bez AD/Entra sync i bez RBAC).
