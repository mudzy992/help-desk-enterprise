-- Paket 2.7: pouzdanost i monitoring (alarmi, statusna stranica s incidentima).

CREATE TABLE "OpsAlert" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "severity" VARCHAR(10) NOT NULL,
    "status" VARCHAR(14) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "notifyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpsAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OpsAlert_status_idx" ON "OpsAlert"("status");
CREATE INDEX "OpsAlert_resolvedAt_idx" ON "OpsAlert"("resolvedAt");
CREATE INDEX "OpsAlert_key_firstSeenAt_idx" ON "OpsAlert"("key", "firstSeenAt");
-- At most one open alarm per key (design §5.1); a race between two evaluators fails here.
CREATE UNIQUE INDEX "OpsAlert_open_key_key" ON "OpsAlert"("key") WHERE "status" <> 'RESOLVED';

CREATE TABLE "ServiceIncident" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "titleEn" VARCHAR(200),
    "impact" VARCHAR(12) NOT NULL,
    "status" VARCHAR(14) NOT NULL,
    "visibility" VARCHAR(12) NOT NULL DEFAULT 'ALL_USERS',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceIncident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceIncident_status_idx" ON "ServiceIncident"("status");
CREATE INDEX "ServiceIncident_resolvedAt_idx" ON "ServiceIncident"("resolvedAt");
CREATE INDEX "ServiceIncident_startedAt_idx" ON "ServiceIncident"("startedAt");

CREATE TABLE "ServiceIncidentService" (
    "incidentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    CONSTRAINT "ServiceIncidentService_pkey" PRIMARY KEY ("incidentId", "serviceId")
);
CREATE INDEX "ServiceIncidentService_serviceId_idx" ON "ServiceIncidentService"("serviceId");
ALTER TABLE "ServiceIncidentService" ADD CONSTRAINT "ServiceIncidentService_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "ServiceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceIncidentService" ADD CONSTRAINT "ServiceIncidentService_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServiceIncidentUpdate" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" VARCHAR(14) NOT NULL,
    "message" VARCHAR(4000) NOT NULL,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceIncidentUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceIncidentUpdate_incidentId_createdAt_idx" ON "ServiceIncidentUpdate"("incidentId", "createdAt");
ALTER TABLE "ServiceIncidentUpdate" ADD CONSTRAINT "ServiceIncidentUpdate_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "ServiceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServiceIncidentSubscription" (
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    CONSTRAINT "ServiceIncidentSubscription_pkey" PRIMARY KEY ("incidentId", "userId")
);
CREATE INDEX "ServiceIncidentSubscription_userId_idx" ON "ServiceIncidentSubscription"("userId");
ALTER TABLE "ServiceIncidentSubscription" ADD CONSTRAINT "ServiceIncidentSubscription_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "ServiceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceIncidentSubscription" ADD CONSTRAINT "ServiceIncidentSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketIncidentLink" (
    "ticketId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketIncidentLink_pkey" PRIMARY KEY ("ticketId", "incidentId")
);
CREATE INDEX "TicketIncidentLink_incidentId_idx" ON "TicketIncidentLink"("incidentId");
ALTER TABLE "TicketIncidentLink" ADD CONSTRAINT "TicketIncidentLink_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketIncidentLink" ADD CONSTRAINT "TicketIncidentLink_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "ServiceIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
