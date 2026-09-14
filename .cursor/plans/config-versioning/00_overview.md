# Config versioning — overview

Backend-only Faza 8: snapshot settings/routing/SLA/catalog/forms u `ConfigVersion`, dry-run validate, shadow diff, auditovani activate/rollback.

Šema se **ne mijenja**. Enum `ConfigVersionStatus` ostaje `DRAFT | VALIDATED | SHADOW | ACTIVE | ROLLED_BACK`.

## Odluke (potvrda)

1. **Guards:** `SessionAuthenticationGuard` + `RoleGuard` (`ADMIN`) kao `SettingsController`. `OuAccessGuard` se **ne** stavlja — resurs je globalan; guard zahtijeva `organizationalUnitId` i fail-close-uje i SuperAdmina ako OU fali.
2. **Permission:** reuse `settings.write` (RAW nema `config.version.*`). Rollback dodatno gleda `private.configVersioning.allowRollback`.
3. **Activate restore:** `create` snima live snapshot. `activate`/`rollback` **primjenjuju** snapshot na live (transaction u ovom modulu) da tagged verzija = running config. Routing nema update/delete API — restore ostaje u `config-versioning` Prisma sloju, bez izmjene routing/SLA algoritama.
4. **Demote previous ACTIVE:** status `VALIDATED` (nema `ARCHIVED` u enumu). `ROLLED_BACK` samo za verziju s koje se rollback radi.
5. **Rollback:** nova `ConfigVersion` kopira prethodni snapshot + `rollbackOfVersion` u snapshot meta; stara ACTIVE → `ROLLED_BACK`.
6. **Secrets:** snapshot ne čuva secret vrijednosti (omit). Restore ne dira secret keys.
7. **Shadow:** READ-ONLY over recent tickets; ne mijenja `ConfigVersion.status`, ne persistuje diff (nema tabele; `storeDiffDays` se ne implementira).
8. **AuditLog:** minimalni append (sha256 chain na postojećim kolonama) iz ovog modula. Nije audit-export task.

## Van scope

Frontend UI, Audit export, support bundle, WS event za config versions, `shadowMode.storeDiffDays`, schema izmjene, AI/advanced routing.
