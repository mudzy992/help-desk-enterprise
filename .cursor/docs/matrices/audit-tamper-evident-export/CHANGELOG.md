# CHANGELOG — audit-tamper-evident-export

## 2026-09-14
- Writer `reports.export` (OU iz query-ja, nakon snapshot-a report packa). Report pack format ostaje u `report-packs-bottleneck-search`.
- Writer `support_bundle.export` (global, nakon snapshot-a u observability bundleu). Zip format ostaje u `observability-support-bundle`.
- Inicijalna matrica: `AuditLog` hash chain (`canonicalizeJson` reuse), nullable `organizationalUnitId`, writers za policy pack / confidential / bulk / audit export / config-versioning, CSV/JSON export sa OU scoping-om, verify first-mismatch.
