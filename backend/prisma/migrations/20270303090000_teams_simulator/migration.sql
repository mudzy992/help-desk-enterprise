-- Paket 3.1 (T2): simulator transcript.
CREATE TYPE "TeamsSimulatorDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "TeamsSimulatorMessage" (
    "id" TEXT NOT NULL,
    "conversationId" VARCHAR(512) NOT NULL,
    "activityId" VARCHAR(512) NOT NULL,
    "direction" "TeamsSimulatorDirection" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsSimulatorMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamsSimulatorMessage_activityId_key" ON "TeamsSimulatorMessage"("activityId");
CREATE INDEX "TeamsSimulatorMessage_conversationId_createdAt_idx" ON "TeamsSimulatorMessage"("conversationId", "createdAt");
CREATE INDEX "TeamsSimulatorMessage_createdAt_idx" ON "TeamsSimulatorMessage"("createdAt");
