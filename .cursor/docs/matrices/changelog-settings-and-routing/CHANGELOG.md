# CHANGELOG — changelog-settings-and-routing

## 2026-09-11
- SLA kalendari/profili/rules koriste isti `ChangeLog` (`business_hours_calendar`, `sla_profile`, `sla_rule`).
- KB lifecycle/ownership/review mutacije koriste isti `ChangeLog` (`entityType=knowledge_article`). Nema drugog audit sistema.
- Inicijalna matrica: reason + deterministički diff za settings i routing mutacije na postojećem `ChangeLog` modelu. Secret vrijednosti se redactaju. Nema versioning/rollback/export.
