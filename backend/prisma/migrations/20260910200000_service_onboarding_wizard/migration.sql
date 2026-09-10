-- CreateEnum
CREATE TYPE "ServiceOnboardingStatus" AS ENUM ('IN_PROGRESS', 'READY_FOR_FINALIZATION', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ServiceOnboardingStep" AS ENUM ('SERVICE', 'FORM', 'ROUTING', 'SLA', 'APPROVALS');

-- CreateTable
CREATE TABLE "ServiceOnboarding" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "ServiceOnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" "ServiceOnboardingStep" NOT NULL DEFAULT 'SERVICE',
    "formVersionRef" TEXT,
    "routingConfigurationRef" TEXT,
    "slaConfigurationRef" TEXT,
    "approvalsConfigurationRef" TEXT,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "lastValidationErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOnboarding_serviceId_key" ON "ServiceOnboarding"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceOnboarding_status_idx" ON "ServiceOnboarding"("status");

-- CreateIndex
CREATE INDEX "ServiceOnboarding_formVersionRef_idx" ON "ServiceOnboarding"("formVersionRef");

-- AddForeignKey
ALTER TABLE "ServiceOnboarding" ADD CONSTRAINT "ServiceOnboarding_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOnboarding" ADD CONSTRAINT "ServiceOnboarding_formVersionRef_fkey" FOREIGN KEY ("formVersionRef") REFERENCES "FormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
