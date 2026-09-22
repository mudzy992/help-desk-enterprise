# CHANGELOG — routing-fallback-and-coverage

## 2026-09-18
- Faza 3 housekeeping: potvrđeno da `fallbackGroupId` i `strictOuIsolation` nisu u settings registry-ju; dokumentovan `requireCoverage`; install lokalni param preimenovan u `seedHandlerGroupId`.

## 2026-09-11
- Inicijalna matrica: exact → parent `parentId` walk → UNROUTED, coverage signali (exact/inherited/missing/unrouted), unrouted queue settings bez dodjele grupe.

## 2026-09-21 (F1 sloj 6)
- `POST /tickets/routing-preview`: requester-safe preview, isti resolver kao create. Vidi sekciju iznad.
