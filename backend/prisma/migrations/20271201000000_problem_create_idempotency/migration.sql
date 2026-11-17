-- W7.26 / BA-problems-08: idempotent problem creation.
--
-- Creating a problem and linking its first tickets used to be two commands:
-- the POST committed the problem (with its event, audit row and consumed
-- `ProblemSequence` number) and only then linked the tickets. A failed link, a
-- crash between the two, or a client retry after a lost response left a
-- problem without tickets, or two identical problems.
--
-- The create command is now one transaction and the caller may send a
-- `clientRequestId`; a retry with the same key and the same author replays the
-- stored problem instead of consuming another sequence number. The key is
-- optional, so existing clients (and every problem created before this
-- migration) keep `NULL`, and PostgreSQL allows many `NULL`s in a unique
-- index. The composite key is per author: two managers may pick the same UUID.
BEGIN;

ALTER TABLE "Problem" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Problem_createdByUserId_clientRequestId_key"
    ON "Problem" ("createdByUserId", "clientRequestId");

COMMIT;
