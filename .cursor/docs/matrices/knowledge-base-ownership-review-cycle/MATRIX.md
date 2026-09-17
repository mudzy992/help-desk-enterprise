# MATRIX — knowledge-base-ownership-review-cycle

## Cilj
Knowledge article CRUD, ownership, review i publish lifecycle. Koristi postojeći RBAC (`knowledge.article.write|review|publish` + OU/service scope), `ChangeLog` i Settings registry. Nije paralelni ACL.

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
| any | hard delete (SUPER_ADMIN only) | removed + ChangeLog `delete` |

## Ownership / review
- Owner (user ili član owner grupe) može editovati i submit-review.
- Assigned reviewer ili `knowledge.article.review` u scope-u: approve/reject.
- `knowledge.article.publish` u scope-u: publish/archive. Owner/reviewer bez publish permissiona ne mogu publish.

## Stale
`private.knowledgeBase.reviewCycle.*`. Stale samo za `PUBLISHED` kad je `now >= reviewDueAt` ili origin (`lastReviewedAt` / `publishedAt`) stariji od `staleAfterDays`. Računa se na read.

## Review podsjetnici (in-app)
- Settings: `private.knowledgeBase.reviewCycle.remindDaysBefore` (default 14); gated by `reviewCycle.enabled`.
- Sweep: `@Interval` 15 min — `PUBLISHED` sa `reviewDueAt <= now + remindDaysBefore`.
- Recipients: `ownerUserId` ili članovi `ownerGroupId`.
- Notification type `knowledge.reviewDue`; dedupe `kb-review:{articleId}:{reviewDueAt}:{userId}` (jedan po due ciklusu).
- Email podsjetnici OUT.

## Change log
Uspješne create/update/lifecycle/delete mutacije pišu postojeći `ChangeLog` (`entityType=knowledge_article`, obavezan `reason`). Feedback nije change log.

## Namjerno NIJE
Email podsjetnici, full semantic search, confidential ACL/break-glass, SLA na člancima.
