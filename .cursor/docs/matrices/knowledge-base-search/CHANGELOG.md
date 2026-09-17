# CHANGELOG — knowledge-base-search

## 2026-09-17
- Introduced FTS list path via `searchVector` + GIN; in-memory harness keeps substring fallback. `staleOnly` filters after freshness on read.
