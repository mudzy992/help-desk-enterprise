-- CreateTable
CREATE TABLE "KnowledgeInterceptResolution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "organizationalUnitId" TEXT NOT NULL,
    "primaryArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeInterceptResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeInterceptResolution_createdAt_idx" ON "KnowledgeInterceptResolution"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeInterceptResolution_organizationalUnitId_createdAt_idx" ON "KnowledgeInterceptResolution"("organizationalUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeInterceptResolution_userId_idx" ON "KnowledgeInterceptResolution"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeInterceptResolution_serviceId_idx" ON "KnowledgeInterceptResolution"("serviceId");

-- CreateIndex
CREATE INDEX "KnowledgeInterceptResolution_primaryArticleId_idx" ON "KnowledgeInterceptResolution"("primaryArticleId");

-- AddForeignKey
ALTER TABLE "KnowledgeInterceptResolution" ADD CONSTRAINT "KnowledgeInterceptResolution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeInterceptResolution" ADD CONSTRAINT "KnowledgeInterceptResolution_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeInterceptResolution" ADD CONSTRAINT "KnowledgeInterceptResolution_organizationalUnitId_fkey" FOREIGN KEY ("organizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeInterceptResolution" ADD CONSTRAINT "KnowledgeInterceptResolution_primaryArticleId_fkey" FOREIGN KEY ("primaryArticleId") REFERENCES "KnowledgeArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
