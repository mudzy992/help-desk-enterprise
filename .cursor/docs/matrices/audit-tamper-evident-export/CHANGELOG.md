# CHANGELOG — audit-tamper-evident-export

## 2026-09-14
- Writer `support_bundle.export` (global, nakon snapshot-a u observability bundleu). Zip format ostaje u `observability-support-bundle`.
- Inicijalna matrica: `AuditLog` hash chain (`canonicalizeJson` reuse), nullable `organizationalUnitId`, writers za policy pack / confidential / bulk / audit export / config-versioning, CSV/JSON export sa OU scoping-om, verify first-mismatch.
