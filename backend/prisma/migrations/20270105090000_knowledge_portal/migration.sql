-- Paket 2.9 (K1): knowledge portal (categories, FAQ, 1-5 ratings, views, article from a reply).
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "nameBs" VARCHAR(80) NOT NULL,
    "nameEn" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeCategory_key_key" ON "KnowledgeCategory"("key");
CREATE INDEX "KnowledgeCategory_parentId_idx" ON "KnowledgeCategory"("parentId");
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KnowledgeArticle"
    ADD COLUMN "categoryId" TEXT,
    ADD COLUMN "isFaq" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "faqOrder" INTEGER,
    ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastViewedAt" TIMESTAMP(3),
    ADD COLUMN "sourceTicketId" TEXT,
    ADD COLUMN "sourceMessageId" TEXT;
CREATE INDEX "KnowledgeArticle_categoryId_idx" ON "KnowledgeArticle"("categoryId");
CREATE INDEX "KnowledgeArticle_isFaq_idx" ON "KnowledgeArticle"("isFaq");
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeFeedback"
    ADD COLUMN "rating" SMALLINT,
    ADD COLUMN "comment" VARCHAR(500),
    ADD COLUMN "commentResolvedAt" TIMESTAMP(3);

CREATE TABLE "KnowledgeArticleView" (
    "articleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "KnowledgeArticleView_pkey" PRIMARY KEY ("articleId", "day")
);
CREATE INDEX "KnowledgeArticleView_day_idx" ON "KnowledgeArticleView"("day");
ALTER TABLE "KnowledgeArticleView" ADD CONSTRAINT "KnowledgeArticleView_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission: knowledge.category.manage (ADMIN; SUPER_ADMIN implicitly).
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, 'knowledge.category.manage', 'knowledge.category.manage'
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON r."key" = 'ADMIN' AND p."key" = 'knowledge.category.manage'
WHERE NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
);
