# MATRIX — changelog-settings-and-routing

## Cilj
Trajni, auditable change log za uspješne mutacije **settings** i **routing** konfiguracije. Reuses postojeći `ChangeLog` model, session identity i RBAC. Nije drugi audit engine, nije config versioning, rollback ili audit export.

## Zapis
Postojeći `ChangeLog` red:

| Polje | Izvor |
|---|---|
| `entityType` | `setting` ili `routing_rule` |
| `entityId` | setting key ili `RoutingRule.id` |
| `reason` | eksplicitni caller input (trim, 1–512) |
| `actorUserId` | session principal `subjectId` |
| `createdAt` | vrijeme upisa |
| `diff` | deterministički JSON payload |

`diff` format (kanonski, sortirani ključevi):

```
{
  action: "create" | "update" | "delete",
  resourceType: "setting" | "routing_rule",
  resourceId: string,
  before: object,
  after: object,
  changes: [{ path: "dot.path", before, after }]
}
```

`changes` je path-sorted, samo izmijenjena polja. Isti before/after uvijek daju isti `JSON.stringify`.

## Reason
Obavezan za svaku settings/routing mutaciju. Prazan/whitespace/preko 512 → `REASON_REQUIRED`. Nema fallback reason-a. Validacija je prije persist-a.

## Settings
`SettingsService.setSettingValue(key, value, { reason, actorUserId })`.
HTTP: `PUT /settings` (`ADMIN` + `settings.write`). Nema OU/service scope (globalni registry).
Effective value = stored overlay default. Secret vrijednosti se redactaju (`[REDACTED]`) u `before`/`after`/`changes`; plaintext se nikad ne upisuje.

## Routing
`POST /routing/rules` i dalje `ADMIN` + `routing.write` + OU/service scope.
`reason` je obavezan na DTO/servisu. Snapshot hvata effective rezoluciju **prije i poslije** mutacije: `originUnit`, `service`, target group, `outcome`, fallback path/depth, `unrouted` + queue metadata. Rezolucija, parent fallback i UNROUTED ponašanje se ne mijenjaju.

## Transakcija
Change-log se piše u istoj Prisma `$transaction` kao mutacija. Neuspjeh/deny (guard, validacija, missing target, duplicate) ne ostavlja uspješan zapis.

Registry ključevi `private.changeLog.*` postoje (default `true`). U ovoj fazi reason je uvijek obavezan i diff se uvijek upisuje; ključevi nisu runtime gate za versioning.

## Namjerno NIJE
Config versioning, dry-run, rollback, audit export/hash chain, auto-assign, SLA changelog, UI lista change logova.
