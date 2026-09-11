# MATRIX — knowledge-base-feedback-ranking

## Cilj
Jedan trenutni “pomoglo / nije pomoglo” glas po useru po članku. Feedback utiče na intercept ranking kroz jednu server-side funkciju.

## Persist
`KnowledgeFeedback` unique `(articleId, userId)`. `private.knowledgeBase.feedback.enabled` (default true). `oneVotePerUserPerArticle` (default true) → upsert trenutnog glasa; duplikat ne kreira drugi red.

Glas zahteva `canReadKnowledgeArticle`. Feedback nije ChangeLog.

## Ranking
`rankKnowledgeArticles` je jedini ranking implementation.

`score = textScore * 100 + (useFeedbackWeight ? (helpful - notHelpful) * 10 : 0)`

`textScore`: title token hit = 2, body hit = 1. Prazan query → 0.

Tie-break: `publishedAt` DESC, zatim `id` ASC.

`private.knowledgeBase.ranking.useFeedbackWeight` (default true). Isključeno: feedback net se ne dodaje.

## Namjerno NIJE
Višestruki istorijski glasovi, AI/semantic ranking, dupli ranking u kontrolerima.
