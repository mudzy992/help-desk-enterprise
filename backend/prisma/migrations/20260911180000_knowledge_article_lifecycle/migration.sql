-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- AlterTable KnowledgeArticle
ALTER TABLE "KnowledgeArticle" ADD COLUMN "status" "KnowledgeArticleStatus";
ALTER TABLE "KnowledgeArticle" ADD COLUMN "classification" "DataClassification";
ALTER TABLE "KnowledgeArticle" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeArticle" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeArticle" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeArticle" ADD COLUMN "reviewerUserId" TEXT;

UPDATE "KnowledgeArticle"
SET "status" = CASE
  WHEN "isPublished" THEN 'PUBLISHED'::"KnowledgeArticleStatus"
  ELSE 'DRAFT'::"KnowledgeArticleStatus"
END;

UPDATE "KnowledgeArticle"
SET "classification" = 'INTERNAL'::"DataClassification"
WHERE "classification" IS NULL;

UPDATE "KnowledgeArticle"
SET "publishedAt" = "updatedAt"
WHERE "isPublished" = true AND "publishedAt" IS NULL;

DELETE FROM "KnowledgeArticle"
WHERE "serviceId" IS NULL OR "organizationalUnitId" IS NULL;

ALTER TABLE "KnowledgeArticle" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "classification" SET NOT NULL;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "classification" SET DEFAULT 'INTERNAL';
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "organizationalUnitId" SET NOT NULL;

ALTER TABLE "KnowledgeArticle" DROP COLUMN "isPublished";

ALTER TABLE "KnowledgeArticle" DROP CONSTRAINT "KnowledgeArticle_serviceId_fkey";
ALTER TABLE "KnowledgeArticle" DROP CONSTRAINT "KnowledgeArticle_organizationalUnitId_fkey";

ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "KnowledgeArticle_reviewerUserId_idx" ON "KnowledgeArticle"("reviewerUserId");
CREATE INDEX "KnowledgeArticle_status_idx" ON "KnowledgeArticle"("status");
CREATE INDEX "KnowledgeArticle_classification_idx" ON "KnowledgeArticle"("classification");

-- AlterTable KnowledgeFeedback
ALTER TABLE "KnowledgeFeedback" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "KnowledgeFeedback_articleId_idx" ON "KnowledgeFeedback"("articleId");
CREATE INDEX "KnowledgeFeedback_userId_idx" ON "KnowledgeFeedback"("userId");

CREATE OR REPLACE FUNCTION knowledge_article_search_vector_refresh()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector(
    'simple',
    coalesce(NEW."title", '') || ' ' || coalesce(NEW."body", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_article_search_vector_refresh ON "KnowledgeArticle";
CREATE TRIGGER knowledge_article_search_vector_refresh
BEFORE INSERT OR UPDATE OF "title", "body" ON "KnowledgeArticle"
FOR EACH ROW EXECUTE FUNCTION knowledge_article_search_vector_refresh();

UPDATE "KnowledgeArticle"
SET "searchVector" = to_tsvector(
  'simple',
  coalesce("title", '') || ' ' || coalesce("body", '')
);
