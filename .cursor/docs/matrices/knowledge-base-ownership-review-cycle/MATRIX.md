# MATRIX — knowledge-base-ownership-review-cycle

## Cilj
Knowledge article CRUD, ownership, review i publish lifecycle. Koristi postojeći RBAC (`knowledge.article.write|review|publish` + OU/service scope), `ChangeLog` i Settings registry. Nije paralelni ACL niti notifikacijski engine.

## Model
`KnowledgeArticle`: `title`, `body`, `slug`, `status` (`DRAFT` / `IN_REVIEW` / `PUBLISHED` / `ARCHIVED`), `classification`, required `serviceId` + `organizationalUnitId`, owner user XOR owner group, `reviewerUserId`, `reviewDueAt`, `lastReviewedAt`, `publishedAt`, `archivedAt`, `isStale`.

## Lifecycle
| From | Action | To |
|---|---|---|
| (create) | write + scope | `DRAFT` |
| `DRAFT` | submit-review (reviewer required) | `IN_REVIEW` |
| `IN_REVIEW` | reject-review | `DRAFT` |
| `IN_REVIEW` | approve-review | `IN_REVIEW` + `lastReviewedAt` / `reviewDueAt` |
| `IN_REVIEW` | publish (requires `lastReviewedAt`) | `PUBLISHED` |
| `PUBLISHED` | content edit | `IN_REVIEW` or `DRAFT`; `lastReviewedAt` cleared |
| `PUBLISHED` | approve-review | stays published; refresh review dates; `isStale=false` |
| `PUBLISHED` | archive | `ARCHIVED` |

## Ownership / review
- Owner (user ili član owner grupe) može editovati i submit-review.
- Assigned reviewer ili `knowledge.article.review` u scope-u: approve/reject.
- `knowledge.article.publish` u scope-u: publish/archive. Owner/reviewer bez publish permissiona ne mogu publish.

## Stale
`private.knowledgeBase.reviewCycle.*`. Stale samo za `PUBLISHED` kad je `now >= reviewDueAt` ili origin (`lastReviewedAt` / `publishedAt`) stariji od `staleAfterDays`. Računa se na read.

## Change log
Uspješne create/update/lifecycle mutacije pišu postojeći `ChangeLog` (`entityType=knowledge_article`, obavezan `reason`). Feedback nije change log.

## Namjerno NIJE
Podsjetnici/notifikacije, full KB UI, SLA, confidential ACL/break-glass, semantic search.
