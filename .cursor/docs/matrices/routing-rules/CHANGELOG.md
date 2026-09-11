# CHANGELOG — routing-rules

## 2026-09-11
- Create rule zahtijeva `reason` i piše `ChangeLog` sa effective routing snapshotom (before/after rezolucija, fallback, unrouted). Rezolucija se ne mijenja. Nema versioning/rollback.
- Inicijalna matrica: unique `(originUnit + service) → group`, validacija OU/servis/grupa, postojeći `routing.write` + OU/service scope. Parent fallback i UNROUTED su u `routing-fallback-and-coverage`.
