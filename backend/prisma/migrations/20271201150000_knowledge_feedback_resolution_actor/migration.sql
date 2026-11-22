-- W7.91 / BA-knowledge-base-18 (P3): resolving a reader's "what is missing" comment wrote only a
-- timestamp, so the row could not answer *who* handled it — and two parallel clicks overwrote each
-- other without a trace. The actor is now part of the fact, and the update is conditional on
-- `commentResolvedAt IS NULL`, so the first click wins and the second one learns it was already done.
--
-- The audit entry (`knowledge.feedback.comment_resolved`) carries the same two values, so the proof
-- survives even if the row is later re-resolved or the user is deleted: `ON DELETE SET NULL` keeps
-- the row (the comment still belongs to its author) while the audit keeps the actor id.
ALTER TABLE "KnowledgeFeedback" ADD COLUMN "commentResolvedByUserId" TEXT;

ALTER TABLE "KnowledgeFeedback"
  ADD CONSTRAINT "KnowledgeFeedback_commentResolvedByUserId_fkey"
  FOREIGN KEY ("commentResolvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "KnowledgeFeedback_commentResolvedByUserId_idx"
  ON "KnowledgeFeedback"("commentResolvedByUserId");
