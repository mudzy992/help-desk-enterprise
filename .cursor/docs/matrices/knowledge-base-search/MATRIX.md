# MATRIX — knowledge-base-search

## Cilj
List/search koristi Postgres `tsvector` + GIN (`searchVector`) kad je `q` postavljen. Semantic search ostaje OUT.

## Endpoint
`GET /knowledge-base/articles?q=&status=&serviceId=&organizationalUnitId=&staleOnly=`

## Query
- Prazan/odsutan `q`: `findMany` + `orderBy updatedAt DESC, id ASC`.
- Neprazan `q`: `searchVector @@ plainto_tsquery('simple', q)` + `ORDER BY ts_rank … DESC`, zatim visibility filter.
- In-memory / bez `$queryRaw`: fallback substring match na title/body/slug (test harness).

## Authorization
Isti `isKnowledgeArticleVisibleTo` kao CRUD. FTS ne smije curiti članke van classification/scope.

## `staleOnly`
Primjenjuje se nakon freshness evaluacije na read (ne samo DB `isStale` kolona).

## Namjerno NIJE
Semantic/AI search, ranking po feedbacku na listi (to je intercept-only).
