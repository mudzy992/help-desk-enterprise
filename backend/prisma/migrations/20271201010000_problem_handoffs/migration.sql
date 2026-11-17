-- W7.28 / BA-problems-10: a problem changes hands only through a recorded handoff.
--
-- Before this table `PATCH /problems/:id` changed `groupId` as an ordinary field:
-- authority was checked over the *current* group only, so a manager of the old
-- group could push the problem into any problem group (and, with the owner reset,
-- hand the work to people who never agreed to take it). The target group's
-- authority and its acceptance were never checked.
--
-- Every transfer is now a row: who asked, from which group/OU to which
-- group/OU, why, and who decided. A transfer that stays inside the current
-- organizational unit is accepted immediately by the requester (who must be a
-- manager of the target group anyway, so no second party is needed). A transfer
-- into another OU waits as PENDING until a manager of the target group accepts
-- or rejects it; until then the problem keeps its group, its OU and its scope.
--
-- The table starts empty: existing problems keep their current group, and no
-- backfill is possible or needed.
BEGIN;

CREATE TYPE "ProblemHandoffStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ProblemHandoff" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "status" "ProblemHandoffStatus" NOT NULL DEFAULT 'PENDING',
    "fromGroupId" TEXT,
    "toGroupId" TEXT NOT NULL,
    "fromOrganizationalUnitId" TEXT NOT NULL,
    "toOrganizationalUnitId" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "requestedByUserId" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemHandoff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProblemHandoff_reason_check" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "ProblemHandoff_decided_check" CHECK (
      ("status" = 'PENDING' AND "decidedAt" IS NULL)
      OR ("status" <> 'PENDING' AND "decidedAt" IS NOT NULL)
    )
);

-- One live request per problem: the loser of a race gets a unique violation and
-- the service reports the request that is already waiting.
CREATE UNIQUE INDEX "ProblemHandoff_problemId_pending_key"
  ON "ProblemHandoff"("problemId") WHERE "status" = 'PENDING';
CREATE INDEX "ProblemHandoff_problemId_status_idx"
  ON "ProblemHandoff"("problemId", "status");
CREATE INDEX "ProblemHandoff_problemId_createdAt_idx"
  ON "ProblemHandoff"("problemId", "createdAt");
CREATE INDEX "ProblemHandoff_status_createdAt_idx"
  ON "ProblemHandoff"("status", "createdAt");
CREATE INDEX "ProblemHandoff_toGroupId_status_idx"
  ON "ProblemHandoff"("toGroupId", "status");
CREATE INDEX "ProblemHandoff_toOrganizationalUnitId_status_idx"
  ON "ProblemHandoff"("toOrganizationalUnitId", "status");

ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_fromGroupId_fkey"
  FOREIGN KEY ("fromGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_toGroupId_fkey"
  FOREIGN KEY ("toGroupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_fromOrganizationalUnitId_fkey"
  FOREIGN KEY ("fromOrganizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_toOrganizationalUnitId_fkey"
  FOREIGN KEY ("toOrganizationalUnitId") REFERENCES "OrganizationalUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProblemHandoff"
  ADD CONSTRAINT "ProblemHandoff_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
